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
  function findSheet(wb, name) { const key = wb.SheetNames.find(n => norm(n) === norm(name)); if (!key) throw Error(`File không có sheet ${name} như mẫu đã dùng.`); return wb.Sheets[key]; }
  function labeledRow(ws, label, column, start, end, uppercase) {
    for (let row = start; row <= (end || lastRow(ws)); row++) {
      const v = value(ws, column, row);
      if (norm(v) === norm(label) && (!uppercase || String(v).trim() === String(v).trim().toUpperCase())) return row;
    }
    throw Error(`Không tìm thấy mục ${label}.`);
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
    const summary = findSheet(wb, '1.'), sales = findSheet(wb, 'BÁN HÀNG');
    const inventory = findSheet(wb, 'TỒN KHO'), province = findSheet(wb, 'Chi tiết Tỉnh');
    const stores = findSheet(wb, 'Chi tiết Cửa hàng');
    const report_date = reportDate(sales, filename), month = report_date.slice(5, 7) + '/' + report_date.slice(0, 4);
    const total = labeledRow(sales, 'TỔNG', 2, 4, 4), stockTotal = labeledRow(inventory, 'TỔNG', 2, 4, 4);
    const plan = num(col(sales, 'AW', total)), actual = num(col(sales, 'AO', total));
    const headline = {
      daily_kg: num(col(sales, 'I', total)), mtd_kg: actual,
      revenue_vnd: num(col(sales, 'AP', total)), profit_vnd: num(col(sales, 'AR', total)),
      plan_kg: plan, attainment: actual !== null && plan ? actual / plan : null,
      inventory_kg: num(col(inventory, 'O', stockTotal)), consignment_kg: num(col(inventory, 'W', stockTotal))
    };
    const products = [], details = []; let firstDetail = 5;
    for (const category of CATEGORIES) {
      const row = labeledRow(sales, category, 2, 5, lastRow(sales), true);
      const stockRow = labeledRow(inventory, category, 2, 5, lastRow(inventory), true);
      products.push({ name: category, daily_kg: num(col(sales, 'I', row)), mtd_kg: num(col(sales, 'AO', row)), revenue_vnd: num(col(sales, 'AP', row)), profit_vnd: num(col(sales, 'AR', row)), inventory_kg: num(col(inventory, 'O', stockRow)), delta_kg: num(col(sales, 'BK', row)) });
      let subgroup = '';
      for (let dr = firstDetail; dr < row; dr++) {
        const group = value(sales, 2, dr), name = value(sales, 3, dr);
        if (String(group ?? '').trim()) subgroup = String(group).trim();
        if (name) details.push({ category, subgroup, name: String(name).trim(), daily_kg: num(col(sales, 'I', dr)), mtd_kg: num(col(sales, 'AO', dr)), delta_kg: num(col(sales, 'BK', dr)), revenue_vnd: num(col(sales, 'AP', dr)), profit_vnd: num(col(sales, 'AR', dr)) });
      }
      firstDetail = row + 1;
    }
    const regions = REGIONS.map((name, i) => {
      const daily = ['E', 'F', 'G'][i], mtd = ['O', 'P', 'Q'][i], planCol = ['AT', 'AU', 'AV'][i], stockCol = ['L', 'M', 'N'][i];
      const mtd_kg = num(col(sales, mtd, total)), plan_kg = num(col(sales, planCol, total));
      return { name, daily_kg: num(col(sales, daily, total)), mtd_kg, plan_kg, attainment: mtd_kg !== null && plan_kg ? mtd_kg / plan_kg : null, inventory_kg: num(col(inventory, stockCol, stockTotal)) };
    });
    const regionalPlan = regions.reduce((sum, r) => sum + (r.plan_kg || 0), 0);
    if (plan === null || Math.abs(regionalPlan - plan) > Math.max(1, Math.abs(plan) * .001)) throw Error('Kế hoạch miền không khớp kế hoạch toàn quốc trong file.');
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
    const supply = ['TỔNG', ...CATEGORIES].map(name => { const row = labeledRow(summary, name, 1, 17, 22); return { name, requested_kg: num(col(summary, 'G', row)), pulled_kg: num(col(summary, 'L', row)), remaining_kg: num(col(summary, 'Q', row)) }; });
    const store_alerts = CATEGORIES.map(name => { const row = labeledRow(summary, name, 1, 28, 32); return { name, no_sales: num(col(summary, 'B', row)), below_stock_min: num(col(summary, 'F', row)) }; });
    return { filename, report_date, month, headline, products, details, regions, provinces, stores: storeRows, supply, store_alerts };
  }
  return { analyze };
});
