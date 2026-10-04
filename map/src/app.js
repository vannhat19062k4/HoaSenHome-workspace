/* Hoa Sen store locator. Input records are generated from the supplied workbook. */
const stores = window.HOA_SEN_STORES || [];
const supply = window.HOA_SEN_SUPPLY || { warehouses: [], assignments: [] };
const assignmentsByStore = new Map(supply.assignments.filter(a => a.storeId).map(a => [a.storeId, a]));
const warehouseById = new Map(supply.warehouses.map(w => [w.id, w]));
const typeLabel = { traditional: 'Cửa hàng truyền thống', home: 'Hoa Sen Home' };
const state = { region: 'Tất cả', province: '', type: 'all', search: '', selected: null,
  warehouse: '', showConnections: false, connectionTarget: 'stores' };
const number = new Intl.NumberFormat('vi-VN');
const collator = new Intl.Collator('vi');
const kgFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });
let inventory = null;
let map, markerLayer, warehouseLayer, connectionLayer, connectionRenderer, markerById = new Map(), warehouseMarkerById = new Map();
let areaBoundaryLayer, provinceBoundaryLayer, provinceBoundaryData = null;
const provinceBoundaryByName = new Map(), coverageBoundaryByKey = new Map(), provincePathByName = new Map();
const defaultWarehousePoints = new Map(supply.warehouses.map(w => [w.id, {lat:w.lat,lng:w.lng,coordinateStatus:w.coordinateStatus}]));
const routeCache = new Map();
let routeQueue = Promise.resolve(), lastRouteRequest = 0;
const savedWarehousePoints = (() => { try { return JSON.parse(localStorage.getItem('hoa-sen-warehouse-points') || '{}'); } catch { return {}; } })();
for (const w of supply.warehouses) {
  const point = savedWarehousePoints[w.id];
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lng)) Object.assign(w, point);
}

const root = document.getElementById('root');
root.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand-row">
        <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
        <div><div class="brand-name">HOA SEN</div><div class="brand-sub">STORE NETWORK</div></div>
        <button class="mobile-close" id="mobile-close" aria-label="Đóng danh sách">×</button>
      </div>
      <div class="sidebar-body">
        <div class="eyebrow">HỆ THỐNG CỬA HÀNG · VIỆT NAM</div>
        <h1>Bản đồ<br><span>cửa hàng</span></h1>
        <p class="intro">Khám phá mạng lưới Hoa Sen theo miền, tỉnh và loại hình cửa hàng.</p>
        <div class="metric-grid">
          <div class="metric"><strong>${number.format(stores.length)}</strong><span>Cửa hàng</span></div>
          <div class="metric"><strong>${new Set(stores.map(s => s.province)).size}</strong><span>Tỉnh / thành</span></div>
          <div class="metric"><strong>${stores.filter(s => s.lat !== null).length}</strong><span>Có tọa độ</span></div>
        </div>
        <section class="inventory-import" aria-label="Nhập tồn kho riêng">
          <div class="eyebrow">TỒN KHO THỰC TẾ</div>
          <label class="inventory-upload" for="inventory-file">＋ Nhập file tồn kho Excel</label>
          <input id="inventory-file" type="file" accept=".xlsx,.xls" aria-label="Chọn file tồn kho có hai sheet HTPP và NM">
          <div id="inventory-status" class="inventory-status" aria-live="polite">Chưa nhập file tồn kho. Dữ liệu chỉ được đọc trên trình duyệt này.</div>
        </section>
        <div class="filters">
          <label class="field-label" for="search">Tìm cửa hàng</label>
          <div class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" placeholder="Tên, mã CH hoặc địa chỉ..." autocomplete="off"></div>
          <label class="field-label region-label">Chọn miền</label>
          <div class="region-grid" id="regions" role="group" aria-label="Chọn miền">
            <button data-region="Tất cả">Tất cả</button><button data-region="Bắc">Miền Bắc</button>
            <button data-region="Trung">Miền Trung</button><button data-region="Nam">Miền Nam</button>
          </div>
          <label class="field-label" for="province">Tỉnh / thành phố</label>
          <select id="province"></select>
          <label class="field-label">Loại cửa hàng</label>
          <div class="type-tabs" id="types" role="group" aria-label="Loại cửa hàng">
            <button data-type="all">Tất cả</button><button data-type="traditional">Truyền thống</button><button data-type="home">Hoa Sen Home</button>
          </div>
          <div class="supply-divider"></div>
          <label class="field-label" for="warehouse">Tổng kho cung ứng</label>
          <select id="warehouse"></select>
          <div class="connection-controls">
            <label class="switch-label"><input id="show-connections" type="checkbox"><span>Hiện đường nối</span></label>
            <select id="connection-target" aria-label="Đường nối tới cửa hàng hoặc tỉnh"><option value="stores">Đến cửa hàng</option><option value="provinces">Đến tỉnh</option></select>
          </div>
          <div id="warehouse-summary" class="warehouse-summary"></div>
        </div>
        <div class="results-head"><div><span class="eyebrow">KẾT QUẢ</span><h2 id="result-total"></h2></div><span class="result-count" id="pin-total"></span></div>
        <div class="store-list" id="store-list"></div>
      </div>
      <div class="sidebar-footer">Dữ liệu vị trí từ danh sách cửa hàng được cung cấp</div>
    </aside>
    <main class="map-panel">
      <div id="map" class="map-canvas" aria-label="Bản đồ vị trí cửa hàng"></div>
      <div class="map-topbar"><a class="hub-link" href="/" aria-label="Về trung tâm công cụ" title="Về trung tâm công cụ">⌂ <span class="hub-link-text">Công cụ</span></a><button class="mobile-list-button" id="mobile-list">☰ Danh sách</button><div class="map-title"><span class="eyebrow">BẢN ĐỒ MẠNG LƯỚI</span><strong id="map-area">Toàn quốc</strong></div><div class="map-top-actions"><button id="map-connections" aria-pressed="false">Đường nối: Tắt</button><div class="map-caption" id="map-caption"></div></div></div>
      <div class="map-legend"><span><i class="legend-dot traditional"></i>Cửa hàng truyền thống <b id="traditional-count"></b></span><span><i class="legend-dot home"></i>Hoa Sen Home <b id="home-count"></b></span><span><i class="legend-dot warehouse"></i>Tổng kho <b id="warehouse-count"></b></span><span id="boundary-legend"><i class="legend-boundary"></i>Viền tỉnh</span></div>
      <div class="island-inset" aria-label="Vị trí tham chiếu Hoàng Sa và Trường Sa"><span class="inset-label">QUẦN ĐẢO VIỆT NAM</span><div class="island island-hoangsa"><i></i>Hoàng Sa</div><div class="island island-truongsa"><i></i>Trường Sa</div><small>Sơ đồ vị trí, không thể hiện ranh giới</small></div>
      <div class="boundary-credit">Ranh giới tỉnh 2025 · <a href="https://sapnhap.bando.com.vn/" target="_blank" rel="noopener noreferrer">Bản đồ hành chính Việt Nam</a></div>
      <div id="detail-container"></div><div id="map-note"></div>
    </main>
  </div>`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
}
function formatKg(value) { return `${kgFormat.format(value || 0)} kg`; }
function compactKg(value) { return value >= 1000 ? `${kgFormat.format(value / 1000)} t` : formatKg(value); }
function warehouseLabel(warehouse) {
  const aliases = window.HOA_SEN_INVENTORY.warehouseAliasesById[warehouse.id] || [];
  return aliases.length ? `${warehouse.name} (${aliases.join(', ')})` : warehouse.name;
}
function storeStock(store) { return inventory?.storeById.get(store.id) || null; }
function warehouseStock(warehouse) { return inventory?.warehouseById.get(warehouse.id) || null; }
function primaryStore(store, warehouseId) { return assignmentsByStore.get(store.id)?.primaryId === warehouseId; }
function sumStoreKg(items) { return items.reduce((sum, store) => sum + (storeStock(store)?.kg || 0), 0); }
function availableProvinceNames() {
  if (inventory && !state.warehouse) return new Set();
  return new Set(stores.filter(s =>
    (state.region === 'Tất cả' || s.region === state.region) &&
    (!state.warehouse || primaryStore(s,state.warehouse) || (!inventory && assignmentsByStore.get(s.id)?.alternateIds.includes(state.warehouse)))
  ).map(s => s.province));
}
function renderBoundaries() {
  if (!map || !provinceBoundaryData) return;
  areaBoundaryLayer.clearLayers();
  const areaKey = state.warehouse ?
    (state.region === 'Tất cả' ? `warehouse:${state.warehouse}` : `warehouse-region:${state.warehouse}:${state.region}`) :
    (state.region === 'Tất cả' ? '' : `region:${state.region}`);
  const area = coverageBoundaryByKey.get(areaKey);
  const legend=document.getElementById('boundary-legend');
  legend.innerHTML=state.province?'<i class="legend-boundary selected"></i>Tỉnh đang chọn':
    state.warehouse?'<i class="legend-boundary warehouse"></i>Tỉnh có CH của kho':
    state.region!=='Tất cả'?'<i class="legend-boundary region"></i>Viền miền theo CH':
    '<i class="legend-boundary"></i>Viền tỉnh';
  if (area) window.L.geoJSON(area, {
    pane:'areaBoundaryPane', interactive:false,
    style:{color:state.warehouse?'#a86612':'#176d8a',weight:3,opacity:.95,
      fillColor:state.warehouse?'#f3a537':'#338fab',fillOpacity:state.warehouse ? .13 : .09}
  }).addTo(areaBoundaryLayer);
  for (const [name,path] of provincePathByName) {
    const selected = name === state.province;
    path.setStyle({color:selected?'#d11f32':'#526f7a',weight:selected?3.2:1,
      opacity:selected?1:.72,fillColor:'#d11f32',fillOpacity:selected?.17:0});
    if (selected) path.bringToFront();
  }
}
async function loadBoundaries() {
  try {
    const responses = await Promise.all([
      fetch('./data/provinces-2025.geojson'),fetch('./data/coverage-2025.geojson')
    ]);
    if (responses.some(response => !response.ok)) throw new Error('Không tải được ranh giới tỉnh.');
    const [provinces,coverage] = await Promise.all(responses.map(response => response.json()));
    if (provinces.features?.length !== 34 || coverage.features?.length !== 22) throw new Error('Dữ liệu ranh giới chưa đầy đủ.');
    provinceBoundaryData = provinces;
    for (const feature of provinces.features) provinceBoundaryByName.set(feature.properties.name,feature);
    for (const feature of coverage.features) coverageBoundaryByKey.set(`${feature.properties.kind}:${feature.properties.id}`,feature);
    if (provinceBoundaryByName.size !== 34 || stores.some(store => !provinceBoundaryByName.has(store.province)) ||
      supply.warehouses.some(warehouse => !coverageBoundaryByKey.has(`warehouse:${warehouse.id}`))) {
      throw new Error('Ranh giới không khớp danh sách tỉnh và tổng kho.');
    }
    window.L.geoJSON(provinces, {
      pane:'provinceBoundaryPane',style:{color:'#526f7a',weight:1,opacity:.72,fillOpacity:0},
      onEachFeature(feature,path) {
        const name=feature.properties.name;
        provincePathByName.set(name,path);
        path.bindTooltip(name,{sticky:true});
        path.on('click',()=>{
          if (!availableProvinceNames().has(name)) return;
          state.province=name;state.selected=null;
          if (inventory && state.warehouse) state.connectionTarget='stores';
          updateProvinceOptions();render();fitArea();
        });
      }
    }).addTo(provinceBoundaryLayer);
    renderBoundaries();
    if (state.province || state.warehouse || state.region !== 'Tất cả') fitArea();
  } catch (error) {
    document.querySelector('.boundary-credit').textContent='Chưa tải được ranh giới tỉnh';
    console.warn(error);
  }
}
function productRows(stock) {
  if (!stock?.products.size) return '<p class="inventory-empty">Không có sản phẩm trong file này.</p>';
  return [...stock.products.values()].sort((a,b) => b.kg - a.kg || collator.compare(a.name,b.name)).map(product =>
    `<div class="inventory-product"><div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)}</small></div><b>${formatKg(product.kg)}</b></div>`
  ).join('');
}
function renderInventoryStatus() {
  const target = document.getElementById('inventory-status');
  if (!inventory) return;
  const unmatchedStores = [...inventory.unmatchedStores.values()].sort((a,b)=>b.kg-a.kg);
  const unmatchedWarehouses = [...inventory.unmatchedWarehouses.values()].sort((a,b)=>b.kg-a.kg);
  target.innerHTML = `<strong>${escapeHtml(inventory.fileName)}</strong>
    <span>CH: ${formatKg(inventory.storeKg)} · Tổng kho: ${formatKg(inventory.warehouseKg)}</span>
    <span>Đã ghép ${inventory.storeById.size} CH trên bản đồ.</span>
    ${unmatchedStores.length || unmatchedWarehouses.length || inventory.skippedRows ? `<details class="inventory-audit"><summary>Cần đối chiếu: ${unmatchedStores.length} CH, ${unmatchedWarehouses.length} tổng kho${inventory.skippedRows ? `, ${inventory.skippedRows} dòng bỏ qua` : ''}</summary>
      ${unmatchedStores.map(item=>`<p>CH ${escapeHtml(item.label)}: ${formatKg(item.kg)}</p>`).join('')}
      ${unmatchedWarehouses.map(item=>`<p>Kho ${escapeHtml(item.label)}: ${formatKg(item.kg)} (chưa có ghim)</p>`).join('')}
    </details>` : ''}`;
}
function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
}
function filteredStores() {
  const q = normalize(state.search.trim());
  return stores.filter(s =>
    (state.region === 'Tất cả' || s.region === state.region) &&
    (!state.province || s.province === state.province) &&
    (state.type === 'all' || s.type === state.type) &&
    (!state.warehouse || primaryStore(s,state.warehouse) || (!inventory && assignmentsByStore.get(s.id)?.alternateIds.includes(state.warehouse))) &&
    (!q || normalize([s.name, s.code, s.address, s.province].join(' ')).includes(q))
  );
}
function updateProvinceOptions() {
  const provinces = [...new Set(stores.filter(s =>
    (state.region === 'Tất cả' || s.region === state.region) &&
    (!state.warehouse || (inventory ? primaryStore(s,state.warehouse) : primaryStore(s,state.warehouse) || assignmentsByStore.get(s.id)?.alternateIds.includes(state.warehouse)))
  ).map(s => s.province))].sort(collator.compare);
  document.getElementById('province').innerHTML = `<option value="">Tất cả tỉnh / thành</option>` + provinces.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  document.getElementById('province').value = state.province;
}
function updateControls() {
  document.querySelectorAll('[data-region]').forEach(b => b.classList.toggle('active', b.dataset.region === state.region));
  document.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
  document.getElementById('map-area').textContent = state.province || (state.warehouse ? warehouseById.get(state.warehouse)?.name : '') || (state.region === 'Tất cả' ? 'Toàn quốc' : `Miền ${state.region}`);
  document.getElementById('warehouse').value = state.warehouse;
  document.getElementById('show-connections').checked = state.showConnections;
  const mapButton=document.getElementById('map-connections');
  mapButton.textContent=`Đường nối: ${state.showConnections ? 'Bật' : 'Tắt'}`;
  mapButton.setAttribute('aria-pressed',String(state.showConnections));
  document.getElementById('connection-target').value = state.connectionTarget;
}
function located(w) { return Number.isFinite(w?.lat) && Number.isFinite(w?.lng); }
function mapsSearch(address) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`; }
function routeLink(w, s) {
  return `https://www.google.com/maps/dir/?api=1&origin=${w.lat},${w.lng}&destination=${s.lat},${s.lng}&travelmode=driving`;
}
function routeKey(w,s) { return `${w.id}:${w.lat},${w.lng}:${s.id}:${s.lat},${s.lng}`; }
function referenceKm(w,s) {
  const toRad=Math.PI/180, dLat=(s.lat-w.lat)*toRad, dLng=(s.lng-w.lng)*toRad;
  const a=Math.sin(dLat/2)**2+Math.cos(w.lat*toRad)*Math.cos(s.lat*toRad)*Math.sin(dLng/2)**2;
  return Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*1.3);
}
function roadDistance(w,s) {
  const key=routeKey(w,s);
  if (routeCache.has(key)) return routeCache.get(key);
  const request=routeQueue.then(async()=>{
    const delay=Math.max(0,1050-(Date.now()-lastRouteRequest));
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    lastRouteRequest=Date.now();
    const url=`https://routing.openstreetmap.de/routed-car/route/v1/driving/${w.lng},${w.lat};${s.lng},${s.lat}?overview=false&steps=false`;
    const response=await fetch(url);
    if (!response.ok) throw new Error(`Routing HTTP ${response.status}`);
    const data=await response.json();
    const meters=data?.routes?.[0]?.distance;
    if (data.code!=='Ok' || !Number.isFinite(meters)) throw new Error('No road route');
    return Math.round(meters/100)/10;
  });
  routeQueue=request.catch(()=>{});
  routeCache.set(key,request);
  return request;
}
function showRoadDistance(w,s) {
  const target=document.getElementById('road-distance');
  if (!target) return;
  const key=routeKey(w,s);
  target.dataset.routeKey=key;
  target.textContent='Đang tính km đường ô tô…';
  roadDistance(w,s).then(km=>{
    const current=document.getElementById('road-distance');
    if (current?.dataset.routeKey===key) current.innerHTML=`<strong>${number.format(km)} km</strong> theo tuyến ô tô tham khảo <small><a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener noreferrer">OSRM</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · ${w.coordinateStatus==='area_reference'?'điểm kho tham chiếu · ':''}không xét giới hạn xe tải · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Sửa bản đồ</a></small>`;
  }).catch(()=>{
    const current=document.getElementById('road-distance');
    if (current?.dataset.routeKey===key) current.innerHTML=`<strong>≈ ${number.format(referenceKm(w,s))} km</strong> ước tính tham khảo <small>Chưa truy cập được dịch vụ định tuyến; km này suy từ khoảng cách địa lý, không phải tuyến đường.</small>`;
  });
}
function renderWarehouseSummary() {
  const target = document.getElementById('warehouse-summary');
  const w = warehouseById.get(state.warehouse);
  if (!w) {
    const unlinked = supply.assignments.filter(a => !a.storeId);
    target.innerHTML = `<strong>${supply.warehouses.length} tổng kho · ${supply.assignments.length} phân công</strong>
      ${inventory ? `<small>Tồn tại các tổng kho trong file: ${formatKg(inventory.warehouseKg)} · tại CH: ${formatKg(inventory.storeKg)}. Hai nguồn tồn được tính riêng.</small>` : ''}
      <small>${unlinked.length} dòng chưa có ghim trong file vị trí: ${escapeHtml(unlinked.map(a=>a.name).join(', '))}.</small>`;
    return;
  }
  const rows = supply.assignments.filter(a => a.primaryId === w.id);
  const alternate = supply.assignments.filter(a => a.alternateIds.includes(w.id));
  const provinces = new Set(rows.map(a => a.province)).size;
  const sourceOnly=rows.filter(a=>!a.storeId);
  const linkedStores=filteredStores();
  const mappedStores=linkedStores.filter(s=>s.lat!==null).length;
  target.innerHTML = `<strong>${escapeHtml(warehouseLabel(w))}</strong><small>${rows.length} CH chính · ${alternate.length} CH dự phòng · ${provinces} tỉnh/thành</small>
    ${inventory ? `<small class="inventory-warehouse-totals">Tồn tại kho: ${warehouseStock(w) ? formatKg(warehouseStock(w).kg) : 'không có dòng trong file'} · CH phụ trách chính: ${formatKg(sumStoreKg(linkedStores))}</small>` : ''}
    <small class="connection-status">${state.showConnections ? `Đang nối ${mappedStores}/${linkedStores.length} CH có tọa độ` : 'Đường nối đang tắt'}</small>
    ${sourceOnly.length ? `<small class="source-only">Chưa có ghim: ${escapeHtml(sourceOnly.map(a=>a.name).join(', '))}</small>` : ''}
    <p>${escapeHtml(w.address)}</p>
    <a href="${mapsSearch(w.address)}" target="_blank" rel="noopener noreferrer">Tìm địa chỉ trên Maps ↗</a>
    ${located(w) ? `<small class="point-status">${w.coordinateStatus==='area_reference' ? 'Điểm tham chiếu khu vực' : 'Tọa độ đã nhập'}: ${w.lat.toFixed(5)}, ${w.lng.toFixed(5)}${w.coordinateStatus==='area_reference' ? ' · cần link Maps cổng kho để xác nhận' : ''}</small><small>Đường liền: kho chính · đường đứt: kho dự phòng.</small>${w.coordinateStatus!=='area_reference' ? '<button class="clear-point" id="clear-warehouse-point">Khôi phục điểm tham chiếu</button>' : ''}` : '<small class="point-status pending">Chưa có tọa độ kho.</small>'}
    <div class="warehouse-point-entry"><input id="warehouse-point" aria-label="Tọa độ hoặc link Maps tổng kho" placeholder="lat,lng hoặc link Maps có tọa độ"><button id="save-warehouse-point">Lưu</button></div>
    <small id="warehouse-point-message">Link Maps rút gọn không chứa tọa độ; hãy gửi link hoặc nhập tọa độ đầy đủ.</small>`;
}
function parseWarehousePoint(input) {
  const raw = String(input || '').trim();
  let match = raw.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{2,3}\.\d+)$/);
  if (!match) {
    let decoded=raw;
    try { decoded=decodeURIComponent(raw); } catch { /* Keep raw text for the other formats. */ }
    match = decoded.match(/[?&](?:q|query|ll)=(-?\d{1,2}\.\d+),(-?\d{2,3}\.\d+)/i);
  }
  if (!match) match = raw.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{2,3}\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]), lng = Number(match[2]);
  return lat>=8 && lat<=24 && lng>=102 && lng<=115 ? {lat,lng} : null;
}
function renderList(visible) {
  const container = document.getElementById('store-list');
  if (inventory) {
    const warehouse = warehouseById.get(state.warehouse);
    const crumbs = `<div class="inventory-breadcrumb"><button data-hierarchy-root>Tổng kho</button>${warehouse ? ` <span>›</span> <button data-hierarchy-warehouse>${escapeHtml(warehouseLabel(warehouse))}</button>` : ''}${state.province ? ` <span>›</span> <b>${escapeHtml(state.province)}</b>` : ''}</div>`;
    if (!warehouse) {
      const cards = supply.warehouses.map(w => {
        const assigned = visible.filter(s => primaryStore(s,w.id));
        const own = warehouseStock(w);
        return `<button class="inventory-step" data-warehouse="${escapeHtml(w.id)}"><span class="inventory-step-icon">▣</span><span class="inventory-step-main"><strong>${escapeHtml(warehouseLabel(w))}</strong><small>Tại kho: ${own ? formatKg(own.kg) : 'không có dòng trong file'}</small><small>CH phụ trách: ${formatKg(sumStoreKg(assigned))} · ${assigned.length} CH</small></span><span class="store-chevron">›</span></button>`;
      }).join('');
      const unlinked = [...inventory.unmatchedWarehouses.values()].sort((a,b)=>b.kg-a.kg);
      container.innerHTML = crumbs + cards + (unlinked.length ? `<div class="inventory-unmapped"><strong>Tổng kho trong file chưa có ghim</strong>${unlinked.map(item => `<details><summary>${escapeHtml(item.label)} · ${formatKg(item.kg)}</summary><div class="inventory-product-list">${productRows(item)}</div></details>`).join('')}</div>` : '');
      return;
    }
    if (!state.province) {
      const groups = new Map();
      for (const store of visible) {
        if (!groups.has(store.province)) groups.set(store.province, []);
        groups.get(store.province).push(store);
      }
      const own = warehouseStock(warehouse);
      const ownStock = `<details class="inventory-own-stock"><summary><strong>Tồn tại ${escapeHtml(warehouseLabel(warehouse))}</strong><b>${own ? formatKg(own.kg) : 'không có dòng trong file'}</b></summary><div class="inventory-product-list">${productRows(own)}</div></details>`;
      const provinces = [...groups.entries()].sort(([a],[b])=>collator.compare(a,b)).map(([province, group]) =>
        `<button class="inventory-step" data-province="${escapeHtml(province)}"><span class="inventory-step-icon province">⌖</span><span class="inventory-step-main"><strong>${escapeHtml(province)}</strong><small>Tồn tại CH: ${formatKg(sumStoreKg(group))} · ${group.length} CH</small></span><span class="store-chevron">›</span></button>`
      ).join('');
      container.innerHTML = crumbs + ownStock + provinces + (!provinces ? '<div class="empty-state">Không có cửa hàng thuộc tổng kho này theo bộ lọc.</div>' : '');
      return;
    }
    container.innerHTML = crumbs + (visible.length ? visible.map(store => {
      const stock = storeStock(store);
      return `<button class="store-row ${state.selected === store.id ? 'selected' : ''}" data-store="${escapeHtml(store.id)}">
        <span class="store-icon ${store.type}">${store.type === 'home' ? 'H' : 'S'}</span>
        <span class="store-text"><strong>${escapeHtml(store.name)}</strong><small>${escapeHtml(store.code)} · ${stock ? formatKg(stock.kg) : 'chưa có dòng tồn kho'}</small></span>
        <span class="store-chevron">›</span></button>`;
    }).join('') : '<div class="empty-state">Không có cửa hàng thuộc tỉnh này theo bộ lọc.</div>');
    return;
  }
  container.innerHTML = visible.length ? visible.map(s => `
    <button class="store-row ${state.selected === s.id ? 'selected' : ''}" data-store="${escapeHtml(s.id)}">
      <span class="store-icon ${s.type}">${s.type === 'home' ? 'H' : 'S'}</span>
      <span class="store-text"><strong>${escapeHtml(s.name)}</strong><small>${escapeHtml(s.code)} · ${escapeHtml(s.province)}</small></span>
      <span class="store-chevron">›</span>
    </button>`).join('') : '<div class="empty-state">Không tìm thấy cửa hàng phù hợp với bộ lọc.</div>';
}
function renderDetail() {
  const target = document.getElementById('detail-container');
  const s = stores.find(store => store.id === state.selected);
  if (!s) { target.innerHTML = ''; return; }
  const mapLink = /^https:\/\/(www\.google\.com\/maps|goo\.gl\/maps|maps\.app\.goo\.gl)/.test(s.mapsUrl || '') ? s.mapsUrl : '';
  const assignment = assignmentsByStore.get(s.id);
  const warehouse = assignment && warehouseById.get(assignment.primaryId);
  const routeWarehouse = warehouseById.get(state.warehouse) || warehouse;
  const alternateNames = assignment?.alternateIds.map(id => warehouseById.get(id)?.name).filter(Boolean) || [];
  const stock = storeStock(s);
  target.innerHTML = `<div class="detail-card">
    <button class="detail-close" id="detail-close" aria-label="Đóng chi tiết">×</button>
    <div class="detail-eyebrow"><span class="small-dot ${s.type}"></span>${typeLabel[s.type]} · ${escapeHtml(s.code)}</div>
    <h2>${escapeHtml(s.name)}</h2>
    ${inventory ? `<div class="inventory-detail"><strong>Tồn tại cửa hàng: ${stock ? formatKg(stock.kg) : 'không có dòng trong file'}</strong><span>${stock?.products.size || 0} mã hàng</span><div class="inventory-product-list">${productRows(stock)}</div></div>` : ''}
    <div class="detail-line"><span>Địa chỉ</span><strong>${escapeHtml(s.address)}</strong></div>
    <div class="detail-line"><span>Miền / tỉnh</span><strong>${escapeHtml(s.region)} / ${escapeHtml(s.province)}</strong></div>
    ${warehouse ? `<div class="detail-line"><span>Tổng kho chính</span><strong>${escapeHtml(warehouse.name)}</strong></div>` : ''}
    ${alternateNames.length ? `<div class="detail-line"><span>Kho dự phòng</span><strong>${escapeHtml(alternateNames.join(', '))}</strong></div>` : ''}
    ${routeWarehouse && routeWarehouse!==warehouse ? `<div class="detail-line"><span>Kho đang chọn</span><strong>${escapeHtml(routeWarehouse.name)}</strong></div>` : ''}
    ${assignment && ((assignment.model==='CHTT') !== (s.type==='traditional')) ? '<p class="unlocated-note">Loại cửa hàng trong bảng cung ứng khác file vị trí; phân công kho được ghép theo tên.</p>' : ''}
    ${s.companyEmail ? `<div class="detail-line"><span>Email công ty</span><strong>${escapeHtml(s.companyEmail)}</strong></div>` : ''}
    ${s.lat === null ? '<p class="unlocated-note">Link Maps rút gọn chưa xác định được tọa độ để đặt ghim chính xác.</p>' : ''}
    ${s.coordinateSource === 'google_maps_view' ? '<p class="unlocated-note">Tọa độ lấy từ tâm khung xem Maps; nên đối chiếu lại vị trí cửa hàng.</p>' : ''}
    ${mapLink ? `<a class="maps-button" href="${escapeHtml(mapLink)}" target="_blank" rel="noopener noreferrer">Mở Google Maps <span>↗</span></a>` : ''}
    ${routeWarehouse && located(routeWarehouse) && s.lat!==null ? `<div class="road-distance" id="road-distance" aria-live="polite"></div><a class="maps-button route-button" href="${routeLink(routeWarehouse,s)}" target="_blank" rel="noopener noreferrer">Mở tuyến trên Google Maps <span>↗</span></a>` : ''}
    ${routeWarehouse && !located(routeWarehouse) ? '<p class="distance-pending">Đang chờ link Maps của tổng kho để xem tuyến đường và km ô tô.</p>' : ''}
  </div>`;
  if (routeWarehouse && located(routeWarehouse) && s.lat!==null) showRoadDistance(routeWarehouse,s);
}
function render() {
  document.body.classList.toggle('inventory-mode', Boolean(inventory));
  const visible = filteredStores();
  const mapped = visible.filter(s => s.lat !== null).length;
  const traditional = visible.filter(s => s.type === 'traditional').length;
  updateControls();
  const provinceCount = new Set(visible.map(s=>s.province)).size;
  document.getElementById('result-total').textContent = inventory ? (!state.warehouse ? `${supply.warehouses.length} tổng kho` : !state.province ? `${provinceCount} tỉnh / thành` : `${visible.length} cửa hàng`) : `${number.format(visible.length)} cửa hàng`;
  document.getElementById('pin-total').textContent = inventory ? formatKg(sumStoreKg(visible)) : `${mapped} ghim`;
  document.getElementById('map-caption').textContent = inventory ? `Tồn CH: ${formatKg(sumStoreKg(visible))}` : `${number.format(visible.length)} địa điểm đang hiển thị`;
  document.getElementById('traditional-count').textContent = traditional;
  document.getElementById('home-count').textContent = visible.length - traditional;
  document.getElementById('warehouse-count').textContent = supply.warehouses.filter(located).length + '/' + supply.warehouses.length;
  renderList(visible);
  renderInventoryStatus();
  renderWarehouseSummary();
  renderDetail();
  renderBoundaries();
  document.getElementById('map-note').innerHTML = !state.selected && visible.length > mapped ? `<div class="map-note">${visible.length - mapped} cửa hàng chưa có tọa độ tin cậy; vẫn có trong danh sách và giữ link Maps.</div>` : '';
  updateMarkers(visible);
  updateWarehouseMarkers();
  updateConnectionLines(visible);
}
function updateWarehouseMarkers() {
  if (!map || !warehouseLayer) return;
  warehouseLayer.clearLayers();
  warehouseMarkerById.clear();
  for (const w of supply.warehouses) {
    if (!located(w) || (state.warehouse && state.warehouse!==w.id)) continue;
    const glyph='<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13 16 5l12 8v14H4V13Zm4 2v8h4v-8H8Zm7 0v8h4v-8h-4Zm7 0v8h3v-8h-3Z" fill="currentColor"/></svg>';
    const icon = L.divIcon({className:'warehouse-icon',html:`<span class="warehouse-pin">${glyph}</span><span class="warehouse-pin-label">${escapeHtml(w.name.replace(/^TK /,''))}</span>`,iconSize:[58,70],iconAnchor:[29,29],popupAnchor:[0,-30]});
    const marker = L.marker([w.lat,w.lng],{icon,title:w.name,zIndexOffset:1000});
    marker.bindPopup(`<strong>${escapeHtml(warehouseLabel(w))}</strong>${inventory ? `<p>Tồn tại kho: ${warehouseStock(w) ? formatKg(warehouseStock(w).kg) : 'không có dòng trong file'}</p>` : ''}<p>${escapeHtml(w.address)}</p><small>${w.coordinateStatus==='area_reference'?'Điểm tham chiếu khu vực; cần xác minh cổng kho.':'Tọa độ đã nhập.'}</small>`);
    marker.on('click',()=>{chooseWarehouse(w.id);setTimeout(()=>warehouseMarkerById.get(w.id)?.openPopup(),100);});
    marker.addTo(warehouseLayer);
    warehouseMarkerById.set(w.id,marker);
  }
}
function curvedPoints(w,point,seed) {
  const start=[w.lat,w.lng], end=point;
  const avg=(start[0]+end[0])/2*Math.PI/180, scale=Math.max(.55,Math.cos(avg));
  const dx=(end[1]-start[1])*scale, dy=end[0]-start[0];
  const length=Math.hypot(dx,dy);
  if (length<.015) return [start,end];
  let hash=0; for(const ch of seed) hash=(hash*31+ch.charCodeAt(0))|0;
  const bend=Math.min(.32,Math.max(.025,length*.12))*(hash%2===0?1:-1);
  const midLat=(start[0]+end[0])/2+(dx/length)*bend;
  const midLng=(start[1]+end[1])/2-(dy/length)*bend/scale;
  const points=[];
  for(let i=0;i<=20;i++){const t=i/20,u=1-t;points.push([u*u*start[0]+2*u*t*midLat+t*t*end[0],u*u*start[1]+2*u*t*midLng+t*t*end[1]]);}
  return points;
}
function updateConnectionLines(visible) {
  if (!map || !connectionLayer) return;
  connectionLayer.clearLayers();
  if (!state.showConnections) return;
  const visibleIds = new Set(visible.filter(s=>s.lat!==null).map(s=>s.id));
  const storeById = new Map(stores.map(s=>[s.id,s]));
  const routes=[];
  for (const a of supply.assignments) {
    if (!a.storeId || !visibleIds.has(a.storeId)) continue;
    const s=storeById.get(a.storeId);
    for (const id of [a.primaryId,...a.alternateIds]) {
      const w=warehouseById.get(id);
      if (!located(w) || (state.warehouse && state.warehouse!==id)) continue;
      routes.push({w,s,alternate:id!==a.primaryId});
    }
  }
  if (state.connectionTarget==='provinces') {
    const grouped=new Map();
    for (const r of routes) {
      const key=`${r.w.id}|${r.s.province}|${r.alternate}`;
      if (!grouped.has(key)) grouped.set(key,{w:r.w,province:r.s.province,alternate:r.alternate,points:[]});
      grouped.get(key).points.push([r.s.lat,r.s.lng]);
    }
    for (const item of grouped.values()) {
      const lat=item.points.reduce((sum,p)=>sum+p[0],0)/item.points.length;
      const lng=item.points.reduce((sum,p)=>sum+p[1],0)/item.points.length;
      L.polyline(curvedPoints(item.w,[lat,lng],item.province),{renderer:connectionRenderer,color:item.alternate?'#a87725':'#206c8b',weight:2,opacity:.68,dashArray:item.alternate?'5 5':null,interactive:true})
        .bindTooltip(`${item.w.name} → ${item.province}: ${item.points.length} CH${item.alternate?' (dự phòng)':''}`)
        .addTo(connectionLayer);
    }
  } else {
    for (const r of routes) {
      L.polyline(curvedPoints(r.w,[r.s.lat,r.s.lng],r.s.id),{renderer:connectionRenderer,color:r.alternate?'#a87725':'#155c78',weight:state.warehouse ? 2.8 : 1.5,opacity:state.warehouse ? 0.84 : 0.22,dashArray:r.alternate?'4 5':null,interactive:true})
        .bindTooltip(`${r.w.name} → ${r.s.name}${r.alternate?' (dự phòng)':''}`)
        .addTo(connectionLayer);
    }
  }
}
function popupNode(s) {
  const box = document.createElement('div');
  box.className = 'map-popup';
  const eyebrow = document.createElement('div'); eyebrow.className = 'map-popup-eyebrow'; eyebrow.textContent = `${typeLabel[s.type]} · ${s.code}`;
  const title = document.createElement('strong'); title.textContent = s.name;
  const address = document.createElement('p'); address.textContent = s.address;
  box.append(eyebrow, title, address);
  const assignment=assignmentsByStore.get(s.id);
  const warehouse=assignment && warehouseById.get(assignment.primaryId);
  if (warehouse) {
    const supplyLine=document.createElement('p');
    supplyLine.textContent=`Tổng kho chính: ${warehouse.name}`;
    box.append(supplyLine);
  }
  if (inventory) {
    const stockLine=document.createElement('p');
    stockLine.textContent=`Tồn tại CH: ${storeStock(s) ? formatKg(storeStock(s).kg) : 'không có dòng trong file'}`;
    box.append(stockLine);
  }
  if (s.mapsUrl) {
    const link = document.createElement('a'); link.href = s.mapsUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Mở Google Maps ↗'; box.append(link);
  }
  return box;
}
function updateMarkers(visible) {
  if (!map) return;
  const L = window.L;
  markerLayer.clearLayers(); markerById.clear();
  if (map.getZoom() <= 6 && state.region === 'Tất cả' && !state.province && !state.warehouse) {
    for (const region of ['Bắc','Trung','Nam']) {
      const group = visible.filter(s => s.region === region);
      const located = group.filter(s => s.lat !== null);
      if (!located.length) continue;
      const lat = located.reduce((sum, s) => sum + s.lat, 0) / located.length;
      const lng = located.reduce((sum, s) => sum + s.lng, 0) / located.length;
      const icon = L.divIcon({ className:'', html:`<span class="region-cluster"><b>${inventory ? compactKg(sumStoreKg(group)) : group.length}</b><small>Miền ${region}</small></span>`, iconSize:[62,62], iconAnchor:[31,31] });
      const marker = L.marker([lat,lng], { icon, title:`Miền ${region}: ${group.length} cửa hàng${inventory ? ` · ${formatKg(sumStoreKg(group))}` : ''}, ${group.length - located.length} chưa có tọa độ` });
      marker.on('click', () => { state.region = region; state.province = ''; state.selected = null; updateProvinceOptions(); render(); fitArea(); });
      marker.addTo(markerLayer);
    }
    return;
  }
  if ((inventory && state.warehouse && !state.province) || (map.getZoom() <= 7 && !state.province && !state.warehouse)) {
    const groups = new Map();
    for (const s of visible) {
      if (!groups.has(s.province)) groups.set(s.province, []);
      groups.get(s.province).push(s);
    }
    for (const [province, group] of groups) {
      const located = group.filter(s => s.lat !== null);
      if (!located.length) continue;
      const lat = located.reduce((sum, s) => sum + s.lat, 0) / located.length;
      const lng = located.reduce((sum, s) => sum + s.lng, 0) / located.length;
      const iconSize=inventory ? 60 : 46;
      const icon = L.divIcon({ className:'', html:`<span class="province-cluster"><b>${inventory ? compactKg(sumStoreKg(group)) : group.length}</b><small>${escapeHtml(province)}</small></span>`, iconSize:[iconSize,iconSize], iconAnchor:[iconSize/2,iconSize/2] });
      const marker = L.marker([lat,lng], { icon, title:`${province}: ${group.length} cửa hàng${inventory ? ` · ${formatKg(sumStoreKg(group))}` : ''}, ${group.length - located.length} chưa có tọa độ` });
      marker.on('click', () => { state.province = province; state.selected = null; if (inventory && state.warehouse) state.connectionTarget='stores'; updateProvinceOptions(); render(); fitArea(); });
      marker.addTo(markerLayer);
    }
    return;
  }
  for (const s of visible) {
    if (s.lat === null) continue;
    const compact = Boolean(state.warehouse) && map.getZoom() <= 7;
    const pinSize = compact ? 18 : 25;
    const icon = L.divIcon({ className: '', html: `<span class="store-pin ${s.type === 'home' ? 'store-pin-home' : 'store-pin-traditional'}${compact ? ' supply-store-pin' : ''}"><span></span></span>`, iconSize: [pinSize,pinSize], iconAnchor:[pinSize/2,pinSize/2], popupAnchor:[0,-pinSize/2] });
    const marker = L.marker([s.lat,s.lng], { icon, title: `${typeLabel[s.type]} ${s.name}` });
    marker.bindPopup(popupNode(s), { maxWidth:280, minWidth:220 });
    marker.on('click', () => selectStore(s.id, false));
    marker.addTo(markerLayer); markerById.set(s.id, marker);
  }
}
function fitArea() {
  if (!map) return;
  if (state.region === 'Tất cả' && !state.province && !state.warehouse) {
    map.flyToBounds([[7.7,102.3],[23.8,115.1]], { padding:[24,24], duration:.75 }); return;
  }
  const areaKey=state.warehouse ?
    (state.region === 'Tất cả' ? `warehouse:${state.warehouse}` : `warehouse-region:${state.warehouse}:${state.region}`) :
    `region:${state.region}`;
  const boundaryFeature = state.province ? provinceBoundaryByName.get(state.province) : coverageBoundaryByKey.get(areaKey);
  if (boundaryFeature) {
    const bounds=window.L.geoJSON(boundaryFeature).getBounds();
    const w=warehouseById.get(state.warehouse);
    if (!state.province && located(w)) bounds.extend([w.lat,w.lng]);
    map.flyToBounds(bounds,{padding:[48,48],maxZoom:state.province?10:8,duration:.75});
    return;
  }
  const areaStores = filteredStores().filter(s=>s.lat!==null);
  if (!areaStores.length) return;
  const points=areaStores.map(s => [s.lat,s.lng]);
  const w=warehouseById.get(state.warehouse);
  if (located(w)) points.push([w.lat,w.lng]);
  const bounds = window.L.latLngBounds(points);
  map.flyToBounds(bounds.pad(state.province ? .18 : .08), { padding:[48,48], maxZoom:state.province ? 12 : 8, duration:.75 });
}
function chooseWarehouse(id) {
  state.warehouse=id;
  state.province='';
  state.selected=null;
  state.showConnections=Boolean(id);
  if (id) {
    state.region='Tất cả'; state.province=''; state.type='all'; state.search='';
    state.connectionTarget=inventory ? 'provinces' : 'stores';
    document.getElementById('search').value='';
  }
  updateProvinceOptions();
  render(); fitArea();
}
function selectStore(id, moveMap = true) {
  if (inventory) {
    const store = stores.find(item => item.id === id);
    const primaryId = assignmentsByStore.get(id)?.primaryId;
    if (store && primaryId) {
      state.warehouse = primaryId;
      state.province = store.province;
      state.region = 'Tất cả';
      state.connectionTarget = 'stores';
      state.showConnections = true;
      updateProvinceOptions();
    }
  }
  state.selected = id;
  if (inventory) render(); else { renderList(filteredStores()); renderDetail(); }
  document.getElementById('map-note').innerHTML = '';
  document.getElementById('sidebar').classList.remove('sidebar-open');
  const marker = markerById.get(id);
  if (marker && moveMap) {
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 11), { duration:.55 });
    setTimeout(() => marker.openPopup(), 450);
  } else if (moveMap && map) {
    const store = stores.find(s => s.id === id);
    if (store && store.lat !== null) {
      map.flyTo([store.lat,store.lng], 11, { duration:.55 });
      setTimeout(() => markerById.get(id)?.openPopup(), 650);
    }
  }
}
function initMap() {
  if (!window.L) {
    document.getElementById('map').innerHTML = '<div class="map-error">Không tải được thư viện bản đồ. Hãy kiểm tra kết nối mạng để xem bản đồ và các ghim.</div>';
    return;
  }
  const L = window.L;
  map = L.map('map', { zoomControl:false, preferCanvas:true, minZoom:4, maxZoom:17 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors', maxZoom:19 }).addTo(map);
  map.createPane('areaBoundaryPane').style.zIndex=350;
  map.createPane('provinceBoundaryPane').style.zIndex=360;
  L.control.zoom({ position:'bottomright' }).addTo(map);
  map.fitBounds([[7.7,102.3],[23.8,115.1]], { padding:[24,24] });
  markerLayer = L.layerGroup().addTo(map);
  areaBoundaryLayer = L.layerGroup().addTo(map);
  provinceBoundaryLayer = L.layerGroup().addTo(map);
  connectionRenderer=L.svg({padding:.5});
  connectionLayer = L.layerGroup().addTo(map);
  warehouseLayer = L.layerGroup().addTo(map);
  map.on('zoomend', () => updateMarkers(filteredStores()));
  [['Hoàng Sa',16.5,112.1],['Trường Sa',9.5,112.3]].forEach(([label,lat,lng]) => {
    L.marker([lat,lng], { icon:L.divIcon({ className:'', html:`<span class="island-map-label">${label}</span>`, iconSize:[85,22], iconAnchor:[42,11] }), interactive:false }).addTo(map);
  });
  updateMarkers(filteredStores());
  updateWarehouseMarkers();
  updateConnectionLines(filteredStores());
  loadBoundaries();
}

document.getElementById('regions').addEventListener('click', e => {
  const button = e.target.closest('[data-region]'); if (!button) return;
  state.region = button.dataset.region; state.province = ''; state.selected = null;
  updateProvinceOptions(); render(); fitArea();
});
document.getElementById('province').addEventListener('change', e => {
  state.province = e.target.value; state.selected = null;
  if (inventory && state.warehouse) state.connectionTarget=state.province ? 'stores' : 'provinces';
  render(); fitArea();
});
document.getElementById('types').addEventListener('click', e => {
  const button = e.target.closest('[data-type]'); if (!button) return;
  state.type = button.dataset.type; state.selected = null; render();
});
document.getElementById('warehouse').addEventListener('change', e => {
  chooseWarehouse(e.target.value);
});
document.getElementById('show-connections').addEventListener('change', e => {
  state.showConnections=e.target.checked; render();
});
document.getElementById('map-connections').addEventListener('click', () => {
  state.showConnections=!state.showConnections; render();
});
document.getElementById('connection-target').addEventListener('change', e => {
  state.connectionTarget=e.target.value; render();
});
document.getElementById('warehouse-summary').addEventListener('click', e => {
  if (e.target.closest('#clear-warehouse-point')) {
    const w=warehouseById.get(state.warehouse);
    Object.assign(w,defaultWarehousePoints.get(w.id));
    delete savedWarehousePoints[w.id];
    localStorage.setItem('hoa-sen-warehouse-points',JSON.stringify(savedWarehousePoints));
    render(); return;
  }
  if (!e.target.closest('#save-warehouse-point')) return;
  const input=document.getElementById('warehouse-point');
  const point=parseWarehousePoint(input?.value);
  if (!point) {
    document.getElementById('warehouse-point-message').textContent='Không đọc được tọa độ. Nhập dạng 10.12345,106.12345 hoặc link Maps đầy đủ có tọa độ.';
    return;
  }
  const w=warehouseById.get(state.warehouse);
  Object.assign(w,point,{coordinateStatus:'user_entered'});
  savedWarehousePoints[w.id]={...point,coordinateStatus:'user_entered'};
  localStorage.setItem('hoa-sen-warehouse-points',JSON.stringify(savedWarehousePoints));
  render(); fitArea();
});
document.getElementById('search').addEventListener('input', e => {
  state.search = e.target.value; state.selected = null; render();
});
document.getElementById('store-list').addEventListener('click', e => {
  const rootButton=e.target.closest('[data-hierarchy-root]');
  if (rootButton) { chooseWarehouse(''); return; }
  const warehouseButton=e.target.closest('[data-warehouse]');
  if (warehouseButton) { chooseWarehouse(warehouseButton.dataset.warehouse); return; }
  const backToWarehouse=e.target.closest('[data-hierarchy-warehouse]');
  if (backToWarehouse) { state.province=''; state.selected=null; state.connectionTarget='provinces'; render(); fitArea(); return; }
  const provinceButton=e.target.closest('[data-province]');
  if (provinceButton) { state.province=provinceButton.dataset.province; state.selected=null; state.connectionTarget='stores'; render(); fitArea(); return; }
  const button=e.target.closest('[data-store]'); if (button) selectStore(button.dataset.store);
});
document.getElementById('inventory-file').addEventListener('change', async e => {
  const file=e.target.files?.[0];
  if (!file) return;
  const status=document.getElementById('inventory-status');
  status.textContent=`Đang đọc ${file.name}…`;
  try {
    const parsed=window.HOA_SEN_INVENTORY.parseWorkbook(await file.arrayBuffer(),stores,supply.warehouses,window.XLSX);
    parsed.fileName=file.name;
    inventory=parsed;
    state.region='Tất cả'; state.province=''; state.type='all'; state.search=''; state.selected=null;
    document.getElementById('search').value='';
    chooseWarehouse('');
  } catch (error) {
    status.textContent=`Không đọc được file: ${error.message}`;
  }
  e.target.value='';
});
document.getElementById('detail-container').addEventListener('click', e => {
  if (e.target.closest('#detail-close')) { state.selected = null; render(); if (map) map.closePopup(); }
});
document.getElementById('mobile-list').addEventListener('click', () => document.getElementById('sidebar').classList.add('sidebar-open'));
document.getElementById('mobile-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('sidebar-open'));

document.getElementById('warehouse').innerHTML='<option value="">Tất cả tổng kho</option>' + supply.warehouses.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(warehouseLabel(w))}</option>`).join('');
updateProvinceOptions(); render(); initMap();
