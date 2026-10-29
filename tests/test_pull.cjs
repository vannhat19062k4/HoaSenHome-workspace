const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { console, Uint8Array, ArrayBuffer, Buffer, Date };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'inventory/xlsx.full.min.js'), 'utf8'), context);
const XLSX = context.XLSX;
assert.ok(XLSX);

const fields = { '#product-name': { value: 'Lưới trát tường' } };
for (const model of ['1A', '1B', '2A', '2B', '3A', '3B', 'CHTT']) {
  fields[`[data-model="${model}"]`] = { value: '', checkValidity: () => true };
}
fields['[data-model="1A"]'].value = '20';
fields['[data-model="CHTT"]'].value = '50';
context.window = { XLSX };
context.document = { querySelector: selector => fields[selector] };
const app = fs.readFileSync(path.join(root, 'pull/pull.js'), 'utf8').split("$('#rules-grid').innerHTML")[0];
vm.runInContext(`${app}\nthis.testApi = { parseReport, parsePr, matchPr, calculate, exportExcel, renderRegion, state };`, context);
const { parseReport, parsePr, matchPr, calculate, exportExcel, renderRegion, state } = context.testApi;

const grid = Array.from({ length: 8 }, () => Array(157));
grid[0][93] = 'TỒN KHO 24/09/2026';
grid[3][143] = 'Lưới trát tường';
grid[3][156] = 'Cục kê bê tông';
grid[4][0] = 'NAM.01'; grid[4][2] = 'Nam'; grid[4][3] = 'An Giang'; grid[4][4] = 'Cửa hàng Nam'; grid[4][5] = '1A'; grid[4][143] = 10; grid[4][156] = 0;
grid[5][0] = 'TRUNG.01'; grid[5][2] = 'Trung'; grid[5][3] = 'Quảng Nam'; grid[5][4] = 'Cửa hàng Trung'; grid[5][5] = 'CHTT'; grid[5][143] = 60; grid[5][156] = 0;
grid[6][0] = 'BAC.01'; grid[6][2] = 'Bắc'; grid[6][3] = 'Hà Nội'; grid[6][4] = 'Cửa hàng Bắc'; grid[6][5] = 'CHTT'; grid[6][143] = 0; grid[6][156] = 0;
grid[7][4] = 'Dòng tổng hợp'; grid[7][143] = 999;
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(grid), 'Chi tiết Cửa hàng');
const data = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
state.report = parseReport(data, 'fixture.xlsx');
assert.equal(state.report.date, '24/09/2026');
assert.equal(state.report.stores.length, 3);
assert.deepEqual(Array.from(state.report.products, product => product.name), ['Lưới trát tường', 'Cục kê bê tông']);
state.result = calculate();
assert.equal(state.result.total.target, 120);
assert.equal(state.result.total.remaining, 60);
assert.equal(state.result.total.reached, 1);
assert.equal(state.result.byRegion.nam[0].remaining, 10);
assert.equal(state.result.byRegion.trung[0].remaining, 0);
assert.equal(state.result.byRegion.bac[0].remaining, 50);

let exported;
XLSX.writeFile = output => { exported = output; };
exportExcel();
assert.deepEqual(Array.from(exported.SheetNames), ['Tổng hợp', 'Miền Nam', 'Miền Trung', 'Miền Bắc']);
assert.equal(exported.Sheets['Tổng hợp'].F20.v, 60);
assert.equal(exported.Sheets['Miền Bắc'].H2.v, 50);
assert.equal(exported.Sheets['Miền Bắc'].K2.v, 'Chưa nhập file PR');

const prBook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(prBook, XLSX.utils.aoa_to_sheet([
  ['Số chứng từ', 'Trạng thái', 'Người tạo chứng từ', 'Tên hàng'],
  ['PR-1', 'APPROVED', 'HS017.01_CuaHangNam,', 'Lưới trát tường 1.2m'],
  ['PR-1', 'APPROVED', 'HS017.01_CuaHangNam,', 'Lưới trát tường 1.5m'],
  ['PR-2', 'REJECTED', 'HS018.01_CuaHangTrung,', 'Lưới trát tường 1.2m'],
  ['PR-3', 'APPROVED', 'HS019.01_CuaHangKhac,', 'Lưới trát tường 1.2m'],
  ['PR-4', 'APPROVED', 'HS017.01_CuaHangNam,', 'Cục kê bê tông PCA 70'],
]), 'Sheet2');
state.pr = parsePr(XLSX.write(prBook, { type: 'buffer', bookType: 'xlsx' }), 'pr.xlsx');
const prMatches = matchPr(state.report, state.pr, state.report.products[0]);
assert.equal(prMatches.productRows, 4);
assert.equal(prMatches.byStore.size, 2);
assert.equal(prMatches.unmatched.size, 1);
state.result = calculate();
assert.deepEqual(Array.from(state.result.rows, row => row.prDocuments.length), [1, 1, 0]);
exportExcel();
assert.equal(exported.Sheets['Miền Nam'].K2.v, 'Đã gửi');
assert.equal(exported.Sheets['Miền Bắc'].K2.v, 'Chưa gửi');

fields['#product-name'].value = 'Cục kê bê tông';
const zeroStock = calculate();
assert.equal(zeroStock.total.stock, 0);
assert.equal(zeroStock.total.remaining, 120);
assert.equal(zeroStock.rows[0].prDocuments.length, 1);

const duplicateStores = { stores: [
  { id: 'AGI.25', name: 'Bình Sơn' },
  { id: 'BTH.08', name: 'Bình Sơn' },
] };
const duplicatePr = { entries: [
  { documentId: 'PR-5', store: 'HS017.25_BinhSon,', product: 'Cục kê bê tông PCA 70' },
  { documentId: 'PR-6', store: 'BinhSon', product: 'Cục kê bê tông PCA 70' },
  { documentId: 'PR-7', store: 'HS017.99_BinhSon,', product: 'Cục kê bê tông PCA 70' },
] };
const duplicates = matchPr(duplicateStores, duplicatePr, { name: 'Cục kê bê tông' });
assert.deepEqual(Array.from(duplicates.byStore.keys()), ['AGI.25']);
assert.equal(duplicates.unmatched.size, 2);

const grouped = renderRegion({ label: 'Miền Nam' }, [
  { id: 'AG.1', province: 'An Giang', name: 'Cửa hàng 1', model: '1A', target: 20, stock: 5, remaining: 15, prDocuments: ['PR-1'] },
  { id: 'AG.2', province: 'An Giang', name: 'Cửa hàng 2', model: '1A', target: 20, stock: 50, remaining: 0, prDocuments: [] },
  { id: 'KG.1', province: 'Kiên Giang', name: 'Cửa hàng 3', model: 'CHTT', target: 50, stock: 0, remaining: 50, prDocuments: [] },
]);
assert.equal((grouped.match(/class="province-total"/g) || []).length, 2);
assert.match(grouped, /An Giang[\s\S]*?2 cửa hàng[\s\S]*?55[\s\S]*?15[\s\S]*?Cửa hàng 1[\s\S]*?Cửa hàng 2[\s\S]*?Kiên Giang/);
assert.match(grouped, /Cửa hàng 3[\s\S]*?pull-zero/);
assert.match(grouped, /Trạng thái PR/);
assert.match(grouped, /Đã gửi/);
assert.match(grouped, /Chưa gửi/);
console.log('Pull tracking checks passed');
