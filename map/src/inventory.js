/* Read the separate inventory workbook in the browser. No workbook data is uploaded. */
(function (root) {
  function normalize(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function provinceKey(value) {
    const key = normalize(value);
    return ['tphcm', 'thanhphohochiminh', 'hochiminh'].includes(key) ? 'hochiminh' : key;
  }
  function findColumns(rows) {
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const columns = new Map(rows[i].map((value, index) => [normalize(value), index]));
      if (['mahang', 'tenhang', 'sl1', 'dvt1', 'tenkho'].every(key => columns.has(key))) return { row: i, columns };
    }
    throw new Error('Không tìm thấy dòng tiêu đề Mã hàng, Tên hàng, ĐVT1 và SL1.');
  }
  function pick(row, columns, key) { return row[columns.get(key)] ?? null; }
  function addStock(target, id, sku, name, kg) {
    if (!target.has(id)) target.set(id, { kg: 0, rows: 0, products: new Map() });
    const stock = target.get(id);
    stock.kg += kg;
    stock.rows++;
    const productKey = String(sku || name).trim();
    if (!stock.products.has(productKey)) stock.products.set(productKey, { sku: String(sku || '').trim(), name: String(name || sku || '').trim(), kg: 0 });
    stock.products.get(productKey).kg += kg;
  }
  function addUnmatched(target, key, label, kg, sku, name) {
    if (!target.has(key)) target.set(key, { label, kg: 0, rows: 0, products: new Map() });
    const record = target.get(key);
    record.kg += kg;
    record.rows++;
    const productKey = String(sku || name).trim();
    if (!record.products.has(productKey)) record.products.set(productKey, { sku: String(sku || '').trim(), name: String(name || sku || '').trim(), kg: 0 });
    record.products.get(productKey).kg += kg;
  }
  function parseWorkbook(bytes, stores, warehouses, XLSX) {
    if (!XLSX?.read || !XLSX?.utils?.sheet_to_json) throw new Error('Không tải được bộ đọc Excel. Hãy tải lại trang.');
    const workbook = XLSX.read(bytes, { type: 'array' });
    const sheets = new Map(workbook.SheetNames.map(name => [normalize(name), name]));
    const storeSheet = sheets.get('htpp') || sheets.get('cuahang');
    const warehouseSheet = sheets.get('nm') || sheets.get('tongkho');
    if (!storeSheet || !warehouseSheet) throw new Error('File cần có 2 sheet HTPP (Cửa hàng) và NM (Tổng kho).');

    const byStoreName = new Map();
    const byStoreCode = new Map();
    for (const store of stores) {
      const key = `${provinceKey(store.province)}|${normalize(store.name)}`;
      if (!byStoreName.has(key)) byStoreName.set(key, []);
      byStoreName.get(key).push(store);
      byStoreCode.set(normalize(store.code), store);
    }
    const byWarehouseName = new Map(warehouses.map(warehouse => [normalize(warehouse.name.replace(/^TK\s+/i, '')), warehouse]));
    const result = {
      storeById: new Map(), warehouseById: new Map(), unmatchedStores: new Map(), unmatchedWarehouses: new Map(),
      storeRows: 0, warehouseRows: 0, storeKg: 0, warehouseKg: 0, skippedRows: 0
    };
    for (const [sheetName, kind] of [[storeSheet, 'store'], [warehouseSheet, 'warehouse']]) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
      const { row: headerRow, columns } = findColumns(rows);
      if (kind === 'store' && !['tinhkgnm', 'ouchquanlykho'].every(key => columns.has(key))) throw new Error('Sheet HTPP thiếu cột TỈNH/KG/NM hoặc OU CH quản lý kho.');
      for (const row of rows.slice(headerRow + 1)) {
        const rawKg = pick(row, columns, 'sl1');
        if (row.every(value => value == null)) continue;
        if (rawKg == null || rawKg === '') { result.skippedRows++; continue; }
        const kg = typeof rawKg === 'number' ? rawKg : Number(rawKg);
        if (!Number.isFinite(kg) || normalize(pick(row, columns, 'dvt1')) !== 'kg') { result.skippedRows++; continue; }
        const sku = pick(row, columns, 'mahang');
        const name = pick(row, columns, 'tenhang');
        if (!sku && !name) { result.skippedRows++; continue; }
        if (kind === 'store') {
          result.storeRows++;
          result.storeKg += kg;
          const province = pick(row, columns, 'tinhkgnm');
          const ou = String(pick(row, columns, 'ouchquanlykho') || '');
          const storeName = ou.includes('_') ? ou.slice(ou.indexOf('_') + 1) : ou;
          const candidates = byStoreName.get(`${provinceKey(province)}|${normalize(storeName)}`) || [];
          const branchCode = pick(row, columns, 'machinhanhktqt');
          const direct = byStoreCode.get(normalize(branchCode));
          const store = candidates.length === 1 ? candidates[0] : direct && provinceKey(direct.province) === provinceKey(province) ? direct : null;
          if (store) addStock(result.storeById, store.id, sku, name, kg);
          else {
            const key = `${provinceKey(province)}|${normalize(storeName)}|${normalize(branchCode)}`;
            addUnmatched(result.unmatchedStores, key, `${storeName || branchCode || 'Không rõ CH'} · ${province || 'Không rõ tỉnh'}`, kg, sku, name);
          }
        } else {
          result.warehouseRows++;
          result.warehouseKg += kg;
          const rawName = String(pick(row, columns, 'tenkho') || '');
          const nameMatch = rawName.match(/Tổng kho\s+(.+)$/i);
          const warehouseName = nameMatch ? nameMatch[1].trim() : rawName.trim();
          const warehouse = byWarehouseName.get(normalize(warehouseName));
          if (warehouse) addStock(result.warehouseById, warehouse.id, sku, name, kg);
          else addUnmatched(result.unmatchedWarehouses, normalize(warehouseName), warehouseName || 'Không rõ tổng kho', kg, sku, name);
        }
      }
    }
    if (!result.storeRows && !result.warehouseRows) throw new Error('File không có dòng tồn kho hợp lệ theo kg.');
    return result;
  }
  const api = { parseWorkbook, normalize, provinceKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HOA_SEN_INVENTORY = api;
})(typeof window !== 'undefined' ? window : globalThis);
