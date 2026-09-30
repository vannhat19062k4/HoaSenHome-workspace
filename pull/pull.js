const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value, digits = 1) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: digits });
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
const models = ['1A', '1B', '2A', '2B', '3A', '3B', 'CHTT'];
const regions = [
  { id: 'nam', label: 'Miền Nam' },
  { id: 'trung', label: 'Miền Trung' },
  { id: 'bac', label: 'Miền Bắc' },
];
const state = { report: null, result: null, activeRegion: 'nam' };
let reportLoadId = 0;

function resetReport() {
  state.report = null;
  state.result = null;
  $('#product-name').value = '';
  $('#product-name').disabled = true;
  $('#product-options').innerHTML = '';
  $('#product-options').hidden = true;
  $('#product-name').setAttribute('aria-expanded', 'false');
  $('#product-count').textContent = 'Chưa có danh sách sản phẩm.';
  models.forEach(model => { $(`[data-model="${model}"]`).nextElementSibling.textContent = '— cửa hàng'; });
  $('#check-pull').disabled = true;
  $('#export-pull').disabled = true;
  $('#results').innerHTML = '<div class="empty-result"><span>▤</span><strong>Chưa có kết quả</strong><p>Chọn sản phẩm và nhập mức chia để kiểm tra từng cửa hàng.</p></div>';
}

function notice(target, text, kind = 'error') {
  $(target).innerHTML = text ? `<div class="notice ${kind}">${esc(text)}</div>` : '';
}

function cell(ws, row, col) {
  return ws[XLSX.utils.encode_cell({ r: row, c: col })]?.v;
}

function regionId(value) {
  const label = norm(value);
  if (label === 'nam' || label === 'mien nam') return 'nam';
  if (label === 'trung' || label === 'mien trung') return 'trung';
  if (label === 'bac' || label === 'mien bac') return 'bac';
  return null;
}

function parseReport(buffer, fileName) {
  if (!window.XLSX) throw new Error('Không tải được thư viện đọc Excel. Vui lòng tải lại trang.');
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const sheetName = workbook.SheetNames.find(name => norm(name) === 'chi tiet cua hang');
  if (!sheetName) throw new Error(`File “${fileName}” không có sheet “Chi tiết Cửa hàng”. Hãy nhập báo cáo có dữ liệu từng cửa hàng.`);
  const ws = workbook.Sheets[sheetName];
  if (!ws?.['!ref']) throw new Error('Sheet “Chi tiết Cửa hàng” không có dữ liệu.');
  const range = XLSX.utils.decode_range(ws['!ref']);
  let stockStart = -1;
  let date = '';
  for (let col = range.s.c; col <= range.e.c; col++) {
    const header = String(cell(ws, 0, col) ?? '');
    if (norm(header).startsWith('ton kho')) {
      stockStart = col;
      const match = header.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
      date = match?.[1] || '';
      break;
    }
  }
  if (stockStart < 0) throw new Error('Không tìm thấy phần “TỒN KHO” trong sheet “Chi tiết Cửa hàng”.');
  const products = [];
  const names = new Set();
  const stockEnd = XLSX.utils.decode_col('FA');
  if (stockStart !== XLSX.utils.decode_col('CP') || range.e.c < stockEnd) throw new Error('Vùng tồn kho không đúng cấu trúc CP–FA của báo cáo.');
  for (let col = stockStart; col <= stockEnd; col++) {
    const name = String(cell(ws, 3, col) || cell(ws, 2, col) || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (names.has(norm(name))) throw new Error(`Tên sản phẩm “${name}” xuất hiện nhiều lần trong phần tồn kho; cần xác định cột trước khi tính.`);
    names.add(norm(name));
    products.push({ name, col });
  }
  if (!products.length) throw new Error('Không tìm thấy sản phẩm trong phần tồn kho.');
  const stores = [];
  const seen = new Set();
  const invalid = [];
  for (let row = 4; row <= range.e.r; row++) {
    const id = String(cell(ws, row, 0) ?? '').trim();
    if (!id) continue;
    const model = String(cell(ws, row, 5) ?? '').trim().toUpperCase();
    const region = regionId(cell(ws, row, 2));
    if (!models.includes(model) || !region) { invalid.push(`${id} (dòng ${row + 1})`); continue; }
    if (seen.has(id)) throw new Error(`Mã cửa hàng “${id}” bị lặp trong báo cáo.`);
    seen.add(id);
    stores.push({ id, oldId: String(cell(ws, row, 1) ?? '').trim(), region, province: String(cell(ws, row, 3) ?? '').trim(), name: String(cell(ws, row, 4) ?? '').trim(), model, row });
  }
  if (invalid.length) throw new Error(`Có ${invalid.length} dòng cửa hàng thiếu miền hoặc mô hình hợp lệ: ${invalid.slice(0, 5).join(', ')}.`);
  if (!stores.length) throw new Error('Không tìm thấy cửa hàng hợp lệ trong sheet.');
  return { ws, sheetName, fileName, date, products, stores };
}

function setReport(report) {
  state.report = report;
  state.result = null;
  $('#source-status').textContent = `${report.fileName} · Tồn kho đến ${report.date || 'ngày chưa xác định'} · ${fmt(report.stores.length, 0)} cửa hàng · ${report.products.length} sản phẩm`;
  $('#product-options').innerHTML = '';
  $('#product-name').disabled = false;
  $('#product-name').value = '';
  $('#product-count').textContent = `Chọn trong ${report.products.length} sản phẩm của phần TỒN KHO.`;
  $('#check-pull').disabled = false;
  $('#export-pull').disabled = true;
  models.forEach(model => {
    $(`[data-model="${model}"]`).nextElementSibling.textContent = `${report.stores.filter(store => store.model === model).length} cửa hàng`;
  });
  notice('#source-warning', '');
  notice('#input-warning', '');
  $('#results').innerHTML = '<div class="empty-result"><span>▤</span><strong>Đã sẵn sàng</strong><p>Chọn sản phẩm và nhập mức chia để kiểm tra từng cửa hàng.</p></div>';
}

function showProductOptions() {
  const input = $('#product-name');
  const list = $('#product-options');
  if (!state.report || input.disabled) return;
  const query = norm(input.value);
  const matches = state.report.products.filter(product => norm(product.name).includes(query));
  list.innerHTML = matches.length
    ? matches.map(product => `<button type="button" role="option" data-product="${esc(product.name)}">${esc(product.name)}<small>${XLSX.utils.encode_col(product.col)}</small></button>`).join('')
    : '<div class="no-product">Không có sản phẩm khớp tên.</div>';
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function hideProductOptions() {
  $('#product-options').hidden = true;
  $('#product-name').setAttribute('aria-expanded', 'false');
}

async function useSavedReport() {
  const loadId = ++reportLoadId;
  resetReport();
  $('#source-status').textContent = 'Đang đọc file đã nhập ở công cụ định mức…';
  try {
    const saved = await ReportStore.load();
    if (loadId !== reportLoadId) return;
    if (!saved) {
      $('#source-status').textContent = 'Chưa có file báo cáo dùng chung.';
      notice('#source-warning', 'Hãy nhập báo cáo tại công cụ tồn kho theo định mức, hoặc chọn file Excel tại đây.');
      return;
    }
    setReport(parseReport(saved.data, saved.fileName));
  } catch (error) {
    if (loadId !== reportLoadId) return;
    state.report = null;
    $('#source-status').textContent = 'Chưa đọc được báo cáo.';
    notice('#source-warning', error.message);
  }
}

async function uploadReport(file) {
  if (!file) return;
  const loadId = ++reportLoadId;
  resetReport();
  $('#source-status').textContent = `Đang đọc ${file.name}…`;
  try {
    const data = await file.arrayBuffer();
    if (loadId !== reportLoadId) return;
    const parsed = parseReport(data, file.name);
    setReport(parsed);
    try { await ReportStore.save(data, file, [parsed.sheetName]); }
    catch (error) { if (loadId === reportLoadId) notice('#source-warning', `Đã đọc file nhưng không lưu được để dùng lại: ${error.message}`, 'warn'); }
  } catch (error) {
    if (loadId !== reportLoadId) return;
    $('#source-status').textContent = 'Không thể dùng file vừa chọn.';
    notice('#source-warning', error.message);
  }
}

function selectedProduct() {
  const name = norm($('#product-name').value);
  const matches = state.report.products.filter(product => norm(product.name) === name);
  if (matches.length !== 1) throw new Error('Hãy chọn đúng một tên sản phẩm từ danh sách.');
  return matches[0];
}

function rulesFromForm() {
  const rules = {};
  for (const model of models) {
    const input = $(`[data-model="${model}"]`);
    if (input.value === '') continue;
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0 || !input.checkValidity()) throw new Error(`Mức chia ${model} phải là số không âm.`);
    if (value > 0) rules[model] = value;
  }
  if (!Object.keys(rules).length) throw new Error('Hãy nhập mức chia lớn hơn 0 cho ít nhất một mô hình.');
  return rules;
}

function summarize(rows) {
  const summary = { stores: rows.length, reached: 0, target: 0, stock: 0, covered: 0, remaining: 0 };
  rows.forEach(row => {
    summary.reached += Number(row.stock >= row.target);
    summary.target += row.target;
    summary.stock += row.stock;
    summary.covered += Math.min(row.stock, row.target);
    summary.remaining += row.remaining;
  });
  summary.progress = summary.target ? summary.covered / summary.target : 0;
  return summary;
}

function calculate() {
  if (!state.report) throw new Error('Chưa có báo cáo hợp lệ.');
  const product = selectedProduct();
  const rules = rulesFromForm();
  const rows = [];
  for (const store of state.report.stores) {
    const target = rules[store.model];
    if (!target) continue;
    const raw = cell(state.report.ws, store.row, product.col);
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) throw new Error(`Tồn kho ${product.name} tại ${store.id} (dòng ${store.row + 1}) không phải số không âm; chưa thể tính.`);
    rows.push({ ...store, target, stock: raw, remaining: Math.max(target - raw, 0), progress: Math.min(raw / target, 1) });
  }
  if (!rows.length) throw new Error('Không có cửa hàng nào thuộc mô hình đã nhập mức chia.');
  const byRegion = Object.fromEntries(regions.map(region => [region.id, rows.filter(row => row.region === region.id)]));
  return { product, rules, rows, byRegion, total: summarize(rows) };
}

function metric(label, value) { return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`; }

function renderRegion(region, rows) {
  const sum = summarize(rows);
  const provinces = new Map();
  rows.forEach(row => {
    const key = norm(row.province);
    if (!provinces.has(key)) provinces.set(key, { name: row.province || 'Chưa rõ tỉnh', rows: [] });
    provinces.get(key).rows.push(row);
  });
  const detailRows = [...provinces.values()].map(province => {
    const subtotal = summarize(province.rows);
    return `<tr class="province-total"><th scope="rowgroup">${esc(province.name)}<small>${subtotal.reached}/${subtotal.stores} CH đạt mức</small></th><td>${subtotal.stores} cửa hàng</td><td>—</td><td class="numeric">${fmt(subtotal.target)}</td><td class="numeric">${fmt(subtotal.stock)}</td><td class="numeric">${fmt(subtotal.remaining)}</td></tr>
      ${province.rows.map(row => `<tr class="store-row"><td>${esc(row.province || '—')}</td><td class="store-name"><strong>${esc(row.name)}</strong><small>${esc(row.id)}</small></td><td><span class="model-badge">${esc(row.model)}</span></td><td class="numeric">${fmt(row.target)}</td><td class="numeric ${row.stock === 0 ? 'pull-zero' : ''}">${row.stock === 0 ? '—' : fmt(row.stock)}</td><td class="numeric"><span class="pull-remaining ${row.remaining ? 'needs-pull' : 'pull-complete'}">${row.remaining ? fmt(row.remaining) : '✓ Đã đạt'}</span></td></tr>`).join('')}`;
  }).join('');
  return `<section class="panel region-block"><div class="region-top"><div><h2>${region.label}</h2><p>${sum.stores} cửa hàng · ${sum.reached} đã đạt mức · ${provinces.size} tỉnh</p></div><strong>${fmt(sum.progress * 100)}% mức phủ</strong></div>
    <div class="region-figures"><span>Mức cần có <strong>${fmt(sum.target)} kg</strong></span><span>Tồn hiện tại <strong>${fmt(sum.stock)} kg</strong></span><span>Còn cần kéo <strong>${fmt(sum.remaining)} kg</strong></span></div>
    <div class="progress-track"><div class="progress-fill" style="width:${(sum.progress * 100).toFixed(2)}%"></div></div>
    <p class="region-note">Mỗi dòng vàng nhạt là tổng của một tỉnh. Cột “Còn cần kéo” cộng phần thiếu của từng cửa hàng.</p>
    <div class="table-wrap pull-table-wrap"><table class="pull-detail-table"><thead><tr><th scope="col">Tỉnh</th><th scope="col">Tên cửa hàng</th><th scope="col">Mô hình</th><th scope="col" class="numeric">Mức cần có <small>kg / CH</small></th><th scope="col" class="numeric">Tồn hiện tại <small>kg</small></th><th scope="col" class="numeric">Còn cần kéo <small>kg</small></th></tr></thead><tbody>${detailRows || '<tr><td colspan="6">Không có cửa hàng thuộc mô hình đã chọn.</td></tr>'}</tbody></table></div></section>`;
}

function renderResult(result) {
  const { total, product, rules } = result;
  const tabs = regions.map(region => {
    const sum = summarize(result.byRegion[region.id]);
    return `<button type="button" class="region-tab${state.activeRegion === region.id ? ' active' : ''}" data-region-tab="${region.id}" aria-pressed="${state.activeRegion === region.id}"><strong>${region.label}</strong><span>${sum.reached}/${sum.stores} cửa hàng đạt</span><small>Còn cần kéo ${fmt(sum.remaining)} kg</small></button>`;
  }).join('');
  $('#results').innerHTML = `<section class="panel"><div class="summary-head"><div><div class="eyebrow">KẾT QUẢ TOÀN QUỐC</div><h2>${esc(product.name)}</h2><p>Tồn kho đến ${esc(state.report.date || 'ngày chưa xác định')} · ${esc(state.report.fileName)} · ${Object.keys(rules).length} mô hình áp dụng</p></div><strong>${fmt(total.progress * 100)}% mức phủ</strong></div>
    <div class="metric-grid">${metric('Cửa hàng áp dụng', fmt(total.stores, 0))}${metric('Đã đạt mức', `${total.reached}/${total.stores}`)}${metric('Đã kéo (tồn hiện tại)', `${fmt(total.stock)} kg`)}${metric('Còn cần kéo', `${fmt(total.remaining)} kg`)}</div><p class="region-note">Tồn hiện tại được tính là đã kéo. Mức phủ dựa trên từng cửa hàng; phần vượt ở cửa hàng khác không bù phần thiếu.</p></section>
    <div class="region-tabs" role="group" aria-label="Chọn miền để xem chi tiết">${tabs}</div>
    ${renderRegion(regions.find(region => region.id === state.activeRegion), result.byRegion[state.activeRegion])}`;
  $('#export-pull').disabled = false;
}

function exportExcel() {
  const result = state.result;
  if (!result) return;
  const book = XLSX.utils.book_new();
  const total = result.total;
  const summaryRows = [
    ['KIỂM TRA KÉO HÀNG · HOA SEN HOME'],
    ['Báo cáo', state.report.fileName], ['Tồn kho đến ngày', state.report.date || 'Không xác định'], ['Sản phẩm', result.product.name],
    [], ['Mô hình', 'Mức chia (kg/CH)', 'Số cửa hàng'],
    ...models.map(model => [model, result.rules[model] ?? '', state.report.stores.filter(store => store.model === model).length]),
    [], ['Miền', 'Số cửa hàng', 'Đã đạt mức', 'Mức cần có (kg)', 'Đã kéo / tồn hiện tại (kg)', 'Còn cần kéo (kg)', 'Mức phủ'],
    ...regions.map(region => { const s = summarize(result.byRegion[region.id]); return [region.label, s.stores, s.reached, s.target, s.stock, s.remaining, s.progress]; }),
    ['Toàn quốc', total.stores, total.reached, total.target, total.stock, total.remaining, total.progress],
    [], ['Ghi chú', 'Tồn hiện tại được tính là đã kéo. Mức phủ theo từng cửa hàng; tồn vượt ở nơi khác không bù phần thiếu.'],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 26 }, { wch: 36 }, { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 24 }, { wch: 18 }];
  for (let row = 16; row <= 19; row++) if (summarySheet[`G${row}`]) summarySheet[`G${row}`].z = '0.0%';
  XLSX.utils.book_append_sheet(book, summarySheet, 'Tổng hợp');
  for (const region of regions) {
    const rows = result.byRegion[region.id];
    const detail = [['Mã CH', 'Mã CH cũ', 'Tỉnh', 'Cửa hàng', 'Mô hình', 'Đã kéo / tồn hiện tại (kg)', 'Mức chia (kg/CH)', 'Còn cần kéo (kg)', 'Mức phủ', 'Trạng thái'],
      ...rows.map(row => [row.id, row.oldId, row.province, row.name, row.model, row.stock, row.target, row.remaining, row.progress, row.remaining ? 'Còn cần kéo' : row.stock > row.target ? 'Vượt mức' : 'Đã đạt'])];
    const sheet = XLSX.utils.aoa_to_sheet(detail);
    sheet['!cols'] = [{ wch: 14 }, { wch: 13 }, { wch: 23 }, { wch: 28 }, { wch: 12 }, { wch: 21 }, { wch: 20 }, { wch: 25 }, { wch: 17 }, { wch: 18 }];
    sheet['!autofilter'] = { ref: `A1:J${detail.length}` };
    for (let row = 2; row <= detail.length; row++) {
      for (const col of ['F', 'G', 'H']) if (sheet[`${col}${row}`]) sheet[`${col}${row}`].z = '#,##0.###';
      if (sheet[`I${row}`]) sheet[`I${row}`].z = '0.0%';
    }
    XLSX.utils.book_append_sheet(book, sheet, region.label);
  }
  const stamp = (state.report.date || new Date().toLocaleDateString('vi-VN')).replaceAll('/', '-');
  XLSX.writeFile(book, `kiem_tra_keo_hang_${stamp}.xlsx`);
}

$('#rules-grid').innerHTML = models.map(model => `<div class="rule-card"><label for="rule-${model}">${model}</label><input id="rule-${model}" type="number" min="0" step="any" inputmode="decimal" placeholder="—" data-model="${model}"><small>— cửa hàng</small></div>`).join('');
$('#reload-report').addEventListener('click', useSavedReport);
$('#report-file').addEventListener('change', event => { uploadReport(event.target.files[0]); event.target.value = ''; });
$('#product-name').addEventListener('focus', showProductOptions);
$('#product-name').addEventListener('input', showProductOptions);
$('#product-name').addEventListener('keydown', event => {
  if (event.key === 'Escape') hideProductOptions();
  if (event.key === 'Enter' && !$('#product-options').hidden) {
    const first = $('#product-options [data-product]');
    if (first) { event.preventDefault(); first.click(); }
  }
});
$('#product-options').addEventListener('click', event => {
  const option = event.target.closest('[data-product]');
  if (!option) return;
  $('#product-name').value = option.dataset.product;
  $('#product-name').dispatchEvent(new Event('input', { bubbles: true }));
  hideProductOptions();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.product-field')) hideProductOptions();
});
$('#check-pull').addEventListener('click', () => {
  try { const result = calculate(); state.result = result; state.activeRegion = 'nam'; notice('#input-warning', ''); renderResult(result); }
  catch (error) { state.result = null; $('#export-pull').disabled = true; notice('#input-warning', error.message); }
});
$('#export-pull').addEventListener('click', () => {
  try { exportExcel(); notice('#input-warning', ''); }
  catch (error) { notice('#input-warning', `Không tạo được file Excel: ${error.message}`); }
});
$('#results').addEventListener('click', event => {
  const tab = event.target.closest('[data-region-tab]');
  if (!tab || !state.result) return;
  state.activeRegion = tab.dataset.regionTab;
  renderResult(state.result);
  $(`[data-region-tab="${state.activeRegion}"]`).focus();
});
document.querySelectorAll('#product-name,#rules-grid input').forEach(input => input.addEventListener('input', () => {
  if (!state.result) return;
  state.result = null;
  $('#export-pull').disabled = true;
  $('#results').innerHTML = '<div class="empty-result"><strong>Đã thay đổi đầu vào</strong><p>Bấm “Kiểm tra tiến độ” để cập nhật kết quả.</p></div>';
}));
useSavedReport();
