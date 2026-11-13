const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = { Buffer, Uint8Array, ArrayBuffer, Date, module: { exports: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'inventory/xlsx.full.min.js'), 'utf8'), context);
context.XLSX = context.module.exports;
context.module = { exports: {} };
vm.runInContext(fs.readFileSync(path.join(root, 'dashboard/parser.js'), 'utf8'), context);
const { analyze } = context.module.exports;
const { XLSX } = context;

function makeWorkbook(salesInoxHeading) {
  const sales = [], stock = [];
  const put = (rows, row, col, value) => {
    if (!rows[row - 1]) rows[row - 1] = [];
    rows[row - 1][col - 1] = value;
  };
  put(sales, 1, 2, new Date(2026, 11, 12));
  for (const [col, heading, field] of [
    [5, 'Sản lượng ngày', 'SL'], [7, 'Sản lượng lũy kế tháng', 'MN'],
    [9, 'Tổng Ngành hàng', 'SẢN LƯỢNG'], [11, 'HTPP - KẾ HOẠCH THÁNG', 'SL'],
    [13, 'Ngành hàng - Chênh lệch sản lượng', 'SL'],
  ]) {
    put(sales, 2, col, heading);
    put(sales, 3, col, field);
  }
  put(sales, 4, 2, 'TỔNG');
  put(sales, 4, 9, 100);
  put(sales, 4, 11, 120);
  put(stock, 4, 2, 'TỔNG');
  put(stock, 4, 15, 500);
  for (const [row, heading, amount] of [
    [12, 'THÉP XÂY DỰNG', 40], [20, 'THÉP HÌNH', 20],
    [30, 'LƯỚI KẼM', 10], [35, salesInoxHeading, 8], [40, 'PHỤ KIỆN', 22],
  ]) {
    put(sales, row, 2, heading);
    put(sales, row, 9, amount);
    put(stock, row, 2, heading === salesInoxHeading ? 'INOX' : heading);
    put(stock, row, 15, amount * 2);
  }
  put(sales, 34, 2, 'Inox');
  put(sales, 34, 3, 'Inox Cuộn');
  put(sales, 34, 9, 3);
  const book = XLSX.utils.book_new();
  for (const [name, data] of [
    ['BÁN HÀNG ', sales], ['TỒN KHO', stock],
    ['Chi tiết Tỉnh', [['Tỉnh']]], ['Chi tiết Cửa hàng', [['Cửa hàng']]],
  ]) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), name);
  return book;
}

for (const heading of ['INOX', 'NHÔM - INOX']) {
  const report = analyze(makeWorkbook(heading), 'BÁO CÁO 12.11.2026.xlsx');
  assert.equal(report.products[3].name, heading);
  assert.equal(report.products[3].mtd_kg, 8);
  assert.equal(report.products[3].inventory_kg, 16);
  assert.equal(report.details.find(item => item.name === 'Inox Cuộn').category, heading);
}
console.log('Dashboard category checks passed.');
