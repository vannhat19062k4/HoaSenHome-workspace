/* Reads the recurring HĐKD workbook in the browser; no upload to a server. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoaSenDashboardParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CATEGORIES = ['THÉP XÂY DỰNG', 'THÉP HÌNH', 'LƯỚI KẼM', 'INOX', 'PHỤ KIỆN'];
  const REGIONS = ['MIỀN NAM', 'MIỀN TRUNG', 'MIỀN BẮC'];
  function norm(v) { return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, ' ').trim().toUpperCase(); }
  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
  function value(ws, column, row) { const cell = ws[XLSX.utils.encode_cell({c: column - 1, r: row - 1})]; return cell ? cell.v : null; }
  function col(ws, name, row) { return value(ws, XLSX.utils.decode_col(name) + 1, row); }
  function lastRow(ws) { return XLSX.utils.decode_range(ws['!ref']).e.r + 1; }
  function group(ws, heading) {
    const end = XLSX.utils.decode_range(ws['!ref']).e.c + 1;
    for (let column = 1; column <= end; column++) {
      if (!norm(value(ws, column, 2)).startsWith(norm(heading))) continue;
      let next = column + 1;
      while (next <= end && !norm(value(ws, next, 2))) next++;
      return { start: column, end: next };
    }
    return null;
  }
  function field(ws, block, heading) {
    if (!block) return null;
    for (let column = block.start; column < block.end; column++) {
      if (norm(value(ws, column, 3)).startsWith(norm(heading))) return column;
    }
    return null;
  }
  function metric(ws, block, heading, row) {
    const column = field(ws, block, heading);
    return column === null ? null : num(value(ws, column, row));
  }
  function findSheet(wb, name) { const key = wb.SheetNames.find(n => norm(n) === norm(name)); if (!key) throw Error(`File không có sheet ${name} như mẫu đã dùng.`); return wb.Sheets[key]; }
  function optionalSheet(wb, name) { const key = wb.SheetNames.find(n => norm(n) === norm(name)); return key ? wb.Sheets[key] : null; }
  function labeledRow(ws, label, column, start, end, uppercase) {
    for (let row = start; row <= (end || lastRow(ws)); row++) {
      const v = value(ws, column, row);
      if (norm(v) === norm(label) && (!uppercase || String(v).trim() === String(v).trim().toUpperCase())) return row;
    }
    throw Error(`Không tìm thấy mục ${label}.`);
  }
  function optionalRow(ws, label, column, start, end) {
    if (!ws) return null;
    try { return labeledRow(ws, label, column, start, end); }
    catch { return null; }
  }
  function reportDate(sales, filename) {
    const raw = value(sales, 2, 1);
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
    if (typeof raw === 'number') {
      const parsed = XLSX.SSF.parse_date_code(raw);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const match = filename.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    throw Error('Không đọc được ngày báo cáo trong file.');
  }
  function analyze(wb, filename) {
    const summary = optionalSheet(wb, '1.'), sales = findSheet(wb, 'BÁN HÀNG');
    const inventory = findSheet(wb, 'TỒN KHO'), province = findSheet(wb, 'Chi tiết Tỉnh');
    const stores = findSheet(wb, 'Chi tiết Cửa hàng');
    const report_date = reportDate(sales, filename), month = report_date.slice(5, 7) + '/' + report_date.slice(0, 4);
    const total = labeledRow(sales, 'TỔNG', 2, 4, 4), stockTotal = labeledRow(inventory, 'TỔNG', 2, 4, 4);
    const dailyBlock = group(sales, 'Sản lượng ngày');
    const monthBlock = group(sales, 'Sản lượng lũy kế tháng');
    const totalBlock = group(sales, 'Tổng Ngành hàng');
    const planBlock = group(sales, 'HTPP - KẾ HOẠCH THÁNG');
    const deltaBlock = group(sales, 'Ngành hàng - Chênh lệch sản lượng');
    const warnings = [];
    if (!summary) warnings.push({ section: 'summary', message: 'File không có trang 1.; phần kéo hàng và cảnh báo cửa hàng được để trống. Các phần còn lại vẫn dùng được.' });
    const plan = metric(sales, planBlock, 'SL', total);
    const actual = metric(sales, totalBlock, 'SẢN LƯỢNG', total);
    if (!dailyBlock || !monthBlock || !totalBlock) warnings.push({ section: 'sales', message: 'Thiếu một khối sản lượng trong sheet BÁN HÀNG; các ô chưa đọc được được để trống.' });
    if (!deltaBlock) warnings.push({ section: 'products', message: 'Không tìm thấy khối so cùng kỳ tháng trước; các giá trị thay đổi được để trống.' });
    const headline = {
      daily_kg: metric(sales, dailyBlock, 'SL', total), mtd_kg: actual,
      revenue_vnd: metric(sales, totalBlock, 'DOANH THU', total), profit_vnd: metric(sales, totalBlock, 'LỢI NHUẬN', total),
      plan_kg: plan, attainment: actual !== null && plan ? actual / plan : null,
      inventory_kg: num(col(inventory, 'O', stockTotal)), consignment_kg: num(col(inventory, 'W', stockTotal))
    };
    const products = [], details = []; let firstDetail = 5;
    for (const category of CATEGORIES) {
      const row = labeledRow(sales, category, 2, 5, lastRow(sales), true);
      const stockRow = labeledRow(inventory, category, 2, 5, lastRow(inventory), true);
      products.push({ name: category, daily_kg: metric(sales, dailyBlock, 'SL', row), mtd_kg: metric(sales, totalBlock, 'SẢN LƯỢNG', row), revenue_vnd: metric(sales, totalBlock, 'DOANH THU', row), profit_vnd: metric(sales, totalBlock, 'LỢI NHUẬN', row), inventory_kg: num(col(inventory, 'O', stockRow)), delta_kg: metric(sales, deltaBlock, 'SL', row) });
      let subgroup = '';
      for (let dr = firstDetail; dr < row; dr++) {
        const group = value(sales, 2, dr), name = value(sales, 3, dr);
        if (String(group ?? '').trim()) subgroup = String(group).trim();
        if (name) details.push({ category, subgroup, name: String(name).trim(), daily_kg: metric(sales, dailyBlock, 'SL', dr), mtd_kg: metric(sales, totalBlock, 'SẢN LƯỢNG', dr), delta_kg: metric(sales, deltaBlock, 'SL', dr), revenue_vnd: metric(sales, totalBlock, 'DOANH THU', dr), profit_vnd: metric(sales, totalBlock, 'LỢI NHUẬN', dr) });
      }
      firstDetail = row + 1;
    }
    const regions = REGIONS.map((name, i) => {
      const label = ['MN', 'MTR', 'MB'][i], stockCol = ['L', 'M', 'N'][i];
      const mtd_kg = metric(sales, monthBlock, label, total), plan_kg = metric(sales, planBlock, label, total);
      return { name, daily_kg: metric(sales, dailyBlock, label, total), mtd_kg, plan_kg, attainment: mtd_kg !== null && plan_kg ? mtd_kg / plan_kg : null, inventory_kg: num(col(inventory, stockCol, stockTotal)) };
    });
    const regionalPlan = regions.reduce((sum, r) => sum + (r.plan_kg || 0), 0);
    if (plan === null || regions.some(r => r.plan_kg === null)) {
      warnings.push({ section: 'plans', message: 'Thiếu kế hoạch toàn quốc hoặc kế hoạch một miền trong file; tiến độ kế hoạch cần đối chiếu.' });
    } else if (Math.abs(regionalPlan - plan) > Math.max(1, Math.abs(plan) * .001)) {
      const fmt = n => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
      warnings.push({ section: 'plans', message: `Kế hoạch toàn quốc ${fmt(plan)} kg, tổng ba miền ${fmt(regionalPlan)} kg; lệch ${fmt(regionalPlan - plan)} kg. Kiểm tra phần kế hoạch trong file.` });
    }
    const provinces = []; let currentRegion = null;
    for (let row = 5; row <= lastRow(province); row++) {
      const raw = value(province, 2, row), label = norm(raw);
      if (currentRegion && !label) break;
      if (REGIONS.some(x => norm(x) === label)) currentRegion = REGIONS.find(x => norm(x) === label);
      else if (currentRegion && typeof value(province, 1, row) === 'number') provinces.push({ name: String(raw).trim(), region: currentRegion, stores: value(province, 1, row), plan_kg: num(value(province, 3, row)), actual_kg: num(value(province, 9, row)) });
    }
    const storeRows = [];
    for (let row = 5; row <= lastRow(stores); row++) {
      const id = value(stores, 1, row);
      if (id === null || !String(id).trim()) continue;
      storeRows.push({ id: String(id).trim(), name: String(value(stores, 5, row) || '').trim(), province_source: String(value(stores, 4, row) || '').trim(), daily_kg: num(value(stores, 13, row)), mtd_kg: num(value(stores, 76, row)), plan_kg: (num(value(stores, 7, row)) || 0) * 1000, inventory_kg: num(value(stores, 94, row)) });
    }
    const supply = ['TỔNG', ...CATEGORIES].map(name => {
      const row = optionalRow(summary, name, 1, 17, 22);
      if (summary && row === null) warnings.push({ section: 'supply', message: `Không tìm thấy mục ${name} trong phần kéo hàng; dòng này được để trống.` });
      return { name, requested_kg: row === null ? null : num(col(summary, 'G', row)), pulled_kg: row === null ? null : num(col(summary, 'L', row)), remaining_kg: row === null ? null : num(col(summary, 'Q', row)) };
    });
    const store_alerts = CATEGORIES.map(name => {
      const row = optionalRow(summary, name, 1, 28, 32);
      if (summary && row === null) warnings.push({ section: 'stores', message: `Không tìm thấy mục ${name} trong phần cảnh báo cửa hàng; dòng này được để trống.` });
      return { name, no_sales: row === null ? null : num(col(summary, 'B', row)), below_stock_min: row === null ? null : num(col(summary, 'F', row)) };
    });
    return { filename, report_date, month, headline, products, details, regions, provinces, stores: storeRows, supply, store_alerts, warnings };
  }
  return { analyze };
});
