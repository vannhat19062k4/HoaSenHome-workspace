// =============================================
// APP LOGIC - TOOL KIỂM TRA TỒN KHO THEO ĐỊNH MỨC
// Hoa Sen Home - NĐTC 2025-2026
// =============================================

// ========== STATE MANAGEMENT ==========
const AppState = {
  currentLevel: 'thap',       // thap | tb | cao
  currentRegion: 'all',       // all | mien_nam | mien_trung | mien_bac
  currentView: 'dashboard',   // dashboard | input | detail
  actualInventory: {},         // { provinceKey: { productKey: number } }
  selectedProvince: null,
};

// ========== UTILITY FUNCTIONS ==========
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Math.round(num).toLocaleString('vi-VN');
}

function formatTons(kg) {
  if (kg === null || kg === undefined || isNaN(kg)) return '—';
  if (kg >= 1000000) return (kg / 1000000).toFixed(2) + ' triệu kg';
  if (kg >= 1000) return (kg / 1000).toFixed(1) + ' tấn';
  return formatNumber(kg) + ' kg';
}

function getPercentage(actual, quota) {
  if (!quota || quota === 0) return null;
  return (actual / quota) * 100;
}

function getStatus(actual, quota) {
  if (actual === null || actual === undefined || actual === '') return { code: 'empty', label: 'Chưa nhập', icon: '⬜', class: 'status-empty' };
  if (!quota || quota === 0) return { code: 'no_quota', label: 'Không ĐM', icon: '➖', class: 'status-empty' };
  
  const pct = getPercentage(actual, quota);
  
  if (pct < 50) return { code: 'critical_low', label: 'Thiếu N.trọng', icon: '🔴', class: 'status-critical-low', pct };
  if (pct < 80) return { code: 'low', label: 'Thấp', icon: '🟡', class: 'status-low', pct };
  if (pct <= 120) return { code: 'ok', label: 'Hợp lý', icon: '✅', class: 'status-ok', pct };
  if (pct <= 150) return { code: 'high', label: 'Cao', icon: '🟠', class: 'status-high', pct };
  return { code: 'critical_high', label: 'Thừa N.trọng', icon: '🟣', class: 'status-critical-high', pct };
}

function getDiffClass(actual, quota) {
  if (!actual || !quota) return 'diff-neutral';
  const diff = actual - quota;
  if (Math.abs(diff) < quota * 0.05) return 'diff-neutral';
  return diff > 0 ? 'diff-positive' : 'diff-negative';
}

function getProvincesByRegion(regionId) {
  return Object.entries(PROVINCES_DATA).filter(([key, data]) => {
    if (regionId === 'all') return true;
    return data.region === regionId;
  });
}

function getQuota(provinceKey, productKey, level) {
  const prov = PROVINCES_DATA[provinceKey];
  if (!prov || !prov.quotas || !prov.quotas[level]) return 0;
  return prov.quotas[level][productKey] || 0;
}

function getActual(provinceKey, productKey) {
  if (!AppState.actualInventory[provinceKey]) return null;
  const val = AppState.actualInventory[provinceKey][productKey];
  if (val === null || val === undefined || val === '') return null;
  return parseFloat(val);
}

// ========== CALCULATIONS ==========
function calculateRegionSummary(regionId, level) {
  const provinces = getProvincesByRegion(regionId);
  let totalQuota = 0;
  let totalActual = 0;
  let hasActualData = false;
  let statusCounts = { ok: 0, low: 0, high: 0, critical_low: 0, critical_high: 0, empty: 0, no_quota: 0 };
  
  provinces.forEach(([key, data]) => {
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      totalQuota += quota;
      
      if (actual !== null) {
        totalActual += actual;
        hasActualData = true;
      }
      
      const status = getStatus(actual, quota);
      statusCounts[status.code] = (statusCounts[status.code] || 0) + 1;
    });
  });
  
  return { totalQuota, totalActual, hasActualData, statusCounts, provinceCount: provinces.length };
}

function calculateNationalSummary(level) {
  let totalQuota = 0;
  let totalActual = 0;
  let hasActualData = false;
  let statusCounts = { ok: 0, low: 0, high: 0, critical_low: 0, critical_high: 0, empty: 0, no_quota: 0 };
  let provinceCount = 0;
  
  Object.entries(PROVINCES_DATA).forEach(([key, data]) => {
    provinceCount++;
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      totalQuota += quota;
      
      if (actual !== null) {
        totalActual += actual;
        hasActualData = true;
      }
      
      const status = getStatus(actual, quota);
      statusCounts[status.code] = (statusCounts[status.code] || 0) + 1;
    });
  });
  
  return { totalQuota, totalActual, hasActualData, statusCounts, provinceCount };
}

// ========== RENDER FUNCTIONS ==========

function renderDashboard() {
  const level = AppState.currentLevel;
  const national = calculateNationalSummary(level);
  
  // Summary cards
  const summaryHTML = `
    <div class="summary-grid">
      <div class="summary-card card-total fade-in">
        <div class="card-header">
          <span class="card-label">Tổng Định Mức (${QUOTA_LEVELS[level]})</span>
          <div class="card-icon" style="background: rgba(102, 126, 234, 0.15);">📊</div>
        </div>
        <div class="card-value" style="color: #818cf8;">${formatTons(national.totalQuota)}</div>
        <div class="card-sub">${national.provinceCount} điểm kho trên toàn quốc</div>
      </div>
      <div class="summary-card card-green fade-in">
        <div class="card-header">
          <span class="card-label">Tồn Kho Thực Tế</span>
          <div class="card-icon" style="background: rgba(34, 197, 94, 0.15);">📦</div>
        </div>
        <div class="card-value" style="color: var(--accent-green);">${national.hasActualData ? formatTons(national.totalActual) : '—'}</div>
        <div class="card-sub">${national.hasActualData ? `${(national.totalActual/national.totalQuota*100).toFixed(1)}% so với định mức` : 'Chưa nhập số liệu'}</div>
      </div>
      <div class="summary-card card-yellow fade-in">
        <div class="card-header">
          <span class="card-label">Mặt Hàng Hợp Lý</span>
          <div class="card-icon" style="background: rgba(245, 158, 11, 0.15);">✅</div>
        </div>
        <div class="card-value" style="color: var(--accent-yellow);">${national.statusCounts.ok || 0}</div>
        <div class="card-sub">trong tổng ${national.provinceCount * PRODUCT_KEYS.length} mục</div>
      </div>
      <div class="summary-card card-red fade-in">
        <div class="card-header">
          <span class="card-label">Cần Chú Ý</span>
          <div class="card-icon" style="background: rgba(239, 68, 68, 0.15);">⚠️</div>
        </div>
        <div class="card-value" style="color: var(--accent-red);">${(national.statusCounts.critical_low || 0) + (national.statusCounts.low || 0) + (national.statusCounts.high || 0) + (national.statusCounts.critical_high || 0)}</div>
        <div class="card-sub">${national.statusCounts.critical_low || 0} thiếu nghiêm trọng, ${national.statusCounts.critical_high || 0} thừa nghiêm trọng</div>
      </div>
    </div>
  `;
  
  // Region cards
  let regionCardsHTML = '<div class="region-grid">';
  REGIONS.forEach(region => {
    const summary = calculateRegionSummary(region.id, level);
    const pct = summary.hasActualData ? (summary.totalActual / summary.totalQuota * 100) : 0;
    const barColor = pct < 50 ? 'var(--accent-red)' : pct < 80 ? 'var(--accent-yellow)' : pct <= 120 ? 'var(--accent-green)' : 'var(--accent-orange)';
    
    regionCardsHTML += `
      <div class="region-card fade-in" onclick="filterByRegion('${region.id}')">
        <div class="region-card-header">
          <span class="region-emoji">${region.icon}</span>
          <div>
            <div class="region-name">${region.label}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${summary.provinceCount} điểm kho</div>
          </div>
        </div>
        <div class="region-stats">
          <div class="region-stat">
            <div class="region-stat-label">Định mức</div>
            <div class="region-stat-value" style="color: ${region.color};">${formatTons(summary.totalQuota)}</div>
          </div>
          <div class="region-stat">
            <div class="region-stat-label">Thực tế</div>
            <div class="region-stat-value">${summary.hasActualData ? formatTons(summary.totalActual) : '—'}</div>
          </div>
          <div class="region-stat">
            <div class="region-stat-label">Hợp lý</div>
            <div class="region-stat-value" style="color: var(--accent-green);">${summary.statusCounts.ok || 0}</div>
          </div>
          <div class="region-stat">
            <div class="region-stat-label">Cần chú ý</div>
            <div class="region-stat-value" style="color: var(--accent-red);">${(summary.statusCounts.critical_low || 0) + (summary.statusCounts.low || 0) + (summary.statusCounts.high || 0) + (summary.statusCounts.critical_high || 0)}</div>
          </div>
        </div>
        ${summary.hasActualData ? `
          <div class="progress-bar-container">
            <div class="progress-label">
              <span style="color: var(--text-muted);">Tồn kho / Định mức</span>
              <span style="color: ${barColor}; font-weight: 600;">${pct.toFixed(1)}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${Math.min(pct, 100)}%; background: ${barColor};"></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  });
  regionCardsHTML += '</div>';
  
  document.getElementById('dashboard-content').innerHTML = summaryHTML + regionCardsHTML;
  
  // Render province table
  renderProvinceTable();
}

function renderProvinceTable() {
  const level = AppState.currentLevel;
  const regionFilter = AppState.currentRegion;
  
  let provinces = Object.entries(PROVINCES_DATA).filter(([key, data]) => {
    if (regionFilter === 'all') return true;
    return data.region === regionFilter;
  });
  
  // Sort: tỉnh trước, tổng kho sau, theo miền
  const regionOrder = ['mien_nam', 'mien_trung', 'mien_bac'];
  provinces.sort((a, b) => {
    const rA = regionOrder.indexOf(a[1].region);
    const rB = regionOrder.indexOf(b[1].region);
    if (rA !== rB) return rA - rB;
    if (a[1].type !== b[1].type) return a[1].type === 'tinh' ? -1 : 1;
    return 0;
  });
  
  // Build table header
  let headerHTML = `
    <tr>
      <th class="col-product" style="position: sticky; left: 0; background: rgba(17, 24, 39, 0.95); z-index: 10;">Tỉnh / Tổng Kho</th>
      <th class="col-number">Số CH</th>
  `;
  
  PRODUCT_KEYS.forEach(pk => {
    headerHTML += `<th class="col-number">${PRODUCT_LABELS[pk]}<br><small style="color:var(--text-muted);font-weight:400;">ĐM: ${QUOTA_LEVELS[level]}</small></th>`;
    headerHTML += `<th class="col-number" style="background:rgba(59,130,246,0.05);">Thực tế</th>`;
    headerHTML += `<th class="col-number">Trạng thái</th>`;
  });
  headerHTML += '</tr>';
  
  // Build table body
  let bodyHTML = '';
  let lastRegion = '';
  
  provinces.forEach(([key, data]) => {
    // Insert region separator
    if (data.region !== lastRegion) {
      lastRegion = data.region;
      const regionLabel = REGIONS.find(r => r.id === data.region);
      if (regionLabel) {
        bodyHTML += `<tr class="row-region"><td colspan="${2 + PRODUCT_KEYS.length * 3}" style="font-weight:700; padding:14px; font-size:14px; position: sticky; left: 0;">${regionLabel.icon} ${regionLabel.label}</td></tr>`;
      }
    }
    
    const isKho = data.type === 'tong_kho';
    bodyHTML += `<tr class="${isKho ? 'row-tong-kho' : ''}">`;
    bodyHTML += `<td style="position: sticky; left: 0; background: ${isKho ? 'rgba(168, 85, 247, 0.05)' : 'var(--bg-card)'}; z-index: 5; white-space: nowrap;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="type-badge ${isKho ? 'type-tong-kho' : 'type-tinh'}">${isKho ? 'TK' : 'Tỉnh'}</span>
        <span style="font-weight:600;">${data.name}</span>
      </div>
    </td>`;
    bodyHTML += `<td class="cell-number" style="color:var(--text-muted);">${data.num_ch || '—'}</td>`;
    
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      const status = getStatus(actual, quota);
      
      bodyHTML += `<td class="cell-number">${quota ? formatNumber(quota) : '<span style="color:var(--text-muted);">—</span>'}</td>`;
      bodyHTML += `<td class="cell-input"><input type="number" class="input-cell" data-province="${key}" data-product="${pk}" value="${actual !== null ? actual : ''}" placeholder="0" onchange="handleInputChange(this)"></td>`;
      bodyHTML += `<td class="cell-number"><span class="status-badge ${status.class}">${status.icon} ${status.pct ? status.pct.toFixed(0) + '%' : status.label}</span></td>`;
    });
    
    bodyHTML += '</tr>';
  });
  
  document.getElementById('province-table-head').innerHTML = headerHTML;
  document.getElementById('province-table-body').innerHTML = bodyHTML;
}

function renderProductChart() {
  const level = AppState.currentLevel;
  const regionFilter = AppState.currentRegion;
  
  // Aggregate by product
  const productSummary = {};
  PRODUCT_KEYS.forEach(pk => {
    productSummary[pk] = { quota: 0, actual: 0, hasActual: false };
  });
  
  Object.entries(PROVINCES_DATA).forEach(([key, data]) => {
    if (regionFilter !== 'all' && data.region !== regionFilter) return;
    
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      productSummary[pk].quota += quota;
      if (actual !== null) {
        productSummary[pk].actual += actual;
        productSummary[pk].hasActual = true;
      }
    });
  });
  
  const maxQuota = Math.max(...Object.values(productSummary).map(s => s.quota));
  
  let chartHTML = '';
  PRODUCT_KEYS.forEach(pk => {
    const s = productSummary[pk];
    if (s.quota === 0) return;
    
    const quotaPct = (s.quota / maxQuota) * 100;
    const actualPct = s.hasActual ? (s.actual / maxQuota) * 100 : 0;
    const ratio = s.hasActual ? (s.actual / s.quota * 100) : 0;
    const fillClass = ratio < 50 ? 'fill-red' : ratio < 80 ? 'fill-yellow' : ratio <= 120 ? 'fill-green' : 'fill-purple';
    
    chartHTML += `
      <div class="bar-row">
        <div class="bar-label" title="${PRODUCT_LABELS[pk]}">${PRODUCT_LABELS[pk]}</div>
        <div class="bar-track">
          <div class="bar-fill fill-blue" style="width: ${quotaPct}%; opacity: 0.3; position: absolute;">
          </div>
          ${s.hasActual ? `<div class="bar-fill ${fillClass}" style="width: ${actualPct}%;">${ratio.toFixed(0)}%</div>` : ''}
        </div>
        <div class="bar-value">${formatTons(s.quota)}</div>
      </div>
    `;
  });
  
  document.getElementById('product-chart').innerHTML = chartHTML || '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">Chưa có dữ liệu</div></div>';
}

function renderStatusChart() {
  const level = AppState.currentLevel;
  const regionFilter = AppState.currentRegion;
  
  let statusCounts = { ok: 0, low: 0, high: 0, critical_low: 0, critical_high: 0, empty: 0 };
  
  Object.entries(PROVINCES_DATA).forEach(([key, data]) => {
    if (regionFilter !== 'all' && data.region !== regionFilter) return;
    
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      const status = getStatus(actual, quota);
      statusCounts[status.code] = (statusCounts[status.code] || 0) + 1;
    });
  });
  
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  
  const statusItems = [
    { key: 'ok', label: '✅ Hợp lý (80-120%)', color: 'var(--accent-green)', count: statusCounts.ok },
    { key: 'low', label: '🟡 Thấp (50-80%)', color: 'var(--accent-yellow)', count: statusCounts.low },
    { key: 'high', label: '🟠 Cao (120-150%)', color: 'var(--accent-orange)', count: statusCounts.high },
    { key: 'critical_low', label: '🔴 Thiếu (<50%)', color: 'var(--accent-red)', count: statusCounts.critical_low },
    { key: 'critical_high', label: '🟣 Thừa (>150%)', color: 'var(--accent-purple)', count: statusCounts.critical_high },
    { key: 'empty', label: '⬜ Chưa nhập', color: 'var(--text-muted)', count: statusCounts.empty + (statusCounts.no_quota || 0) },
  ];
  
  let chartHTML = '<div class="gauge-grid">';
  statusItems.forEach(item => {
    chartHTML += `
      <div class="gauge-item">
        <div class="gauge-label">${item.label}</div>
        <div class="gauge-value" style="color: ${item.color};">${item.count}</div>
        <div class="gauge-percent" style="color: var(--text-muted);">${total > 0 ? (item.count / total * 100).toFixed(1) : 0}%</div>
      </div>
    `;
  });
  chartHTML += '</div>';
  
  document.getElementById('status-chart').innerHTML = chartHTML;
}

// ========== EVENT HANDLERS ==========

function handleInputChange(input) {
  const province = input.dataset.province;
  const product = input.dataset.product;
  const value = input.value;
  
  if (!AppState.actualInventory[province]) {
    AppState.actualInventory[province] = {};
  }
  
  AppState.actualInventory[province][product] = value === '' ? null : parseFloat(value);
  
  // Update status badge for this row
  const quota = getQuota(province, product, AppState.currentLevel);
  const actual = getActual(province, product);
  const status = getStatus(actual, quota);
  
  // Find the status cell (next sibling of input's parent)
  const statusCell = input.closest('td').nextElementSibling;
  if (statusCell) {
    statusCell.innerHTML = `<span class="status-badge ${status.class}">${status.icon} ${status.pct ? status.pct.toFixed(0) + '%' : status.label}</span>`;
  }
  
  // Debounced refresh of dashboard cards
  clearTimeout(window._refreshTimer);
  window._refreshTimer = setTimeout(() => {
    refreshSummaryCards();
    renderProductChart();
    renderStatusChart();
  }, 300);
  
  // Save to localStorage
  saveToLocalStorage();
}

function refreshSummaryCards() {
  const level = AppState.currentLevel;
  const national = calculateNationalSummary(level);
  
  const cards = document.querySelectorAll('.summary-card');
  if (cards.length >= 4) {
    cards[1].querySelector('.card-value').textContent = national.hasActualData ? formatTons(national.totalActual) : '—';
    cards[1].querySelector('.card-sub').textContent = national.hasActualData ? `${(national.totalActual/national.totalQuota*100).toFixed(1)}% so với định mức` : 'Chưa nhập số liệu';
    
    cards[2].querySelector('.card-value').textContent = national.statusCounts.ok || 0;
    
    const alertCount = (national.statusCounts.critical_low || 0) + (national.statusCounts.low || 0) + (national.statusCounts.high || 0) + (national.statusCounts.critical_high || 0);
    cards[3].querySelector('.card-value').textContent = alertCount;
    cards[3].querySelector('.card-sub').textContent = `${national.statusCounts.critical_low || 0} thiếu nghiêm trọng, ${national.statusCounts.critical_high || 0} thừa nghiêm trọng`;
  }
}

function changeLevel(level) {
  AppState.currentLevel = level;
  renderAll();
}

function filterByRegion(regionId) {
  AppState.currentRegion = regionId;
  document.getElementById('region-filter').value = regionId;
  renderAll();
}

function switchView(view) {
  AppState.currentView = view;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-view="${view}"]`).classList.add('active');
  
  document.getElementById('dashboard-section').style.display = view === 'dashboard' ? 'block' : 'none';
  document.getElementById('table-section').style.display = view === 'input' ? 'block' : 'none';
  document.getElementById('chart-section').style.display = view === 'detail' ? 'block' : 'none';
  
  if (view === 'input') renderProvinceTable();
  if (view === 'detail') {
    renderProductChart();
    renderStatusChart();
  }
}

// ========== SAMPLE DATA ==========
function loadSampleData() {
  // Load sample actual inventory to demonstrate the tool
  const sampleData = {};
  
  Object.entries(PROVINCES_DATA).forEach(([key, data]) => {
    sampleData[key] = {};
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, AppState.currentLevel);
      if (quota > 0) {
        // Random between 40% and 160% of quota
        const randomFactor = 0.4 + Math.random() * 1.2;
        sampleData[key][pk] = Math.round(quota * randomFactor);
      }
    });
  });
  
  AppState.actualInventory = sampleData;
  ReportStore.clear().catch(error => console.warn('Could not clear shared report:', error));
  saveToLocalStorage();
  renderAll();
  showToast('Đã tải dữ liệu mẫu thành công!', 'success');
}

function clearData() {
  if (confirm('Bạn có chắc muốn xóa toàn bộ số liệu tồn kho đã nhập?')) {
    AppState.actualInventory = {};
    localStorage.removeItem('hoasen_inventory_data');
    ReportStore.clear().catch(error => console.warn('Could not clear shared report:', error));
    renderAll();
    showToast('Đã xóa toàn bộ số liệu', 'info');
  }
}

// ========== EXPORT ==========
function exportCSV() {
  const level = AppState.currentLevel;
  const regionFilter = AppState.currentRegion;
  
  let csv = '\uFEFF'; // BOM for Excel UTF-8
  csv += 'Miền,Loại,Tỉnh/Tổng Kho,Số CH';
  
  PRODUCT_KEYS.forEach(pk => {
    csv += `,${PRODUCT_LABELS[pk]}_ĐM,${PRODUCT_LABELS[pk]}_TT,${PRODUCT_LABELS[pk]}_TT%`;
  });
  csv += '\n';
  
  Object.entries(PROVINCES_DATA).forEach(([key, data]) => {
    if (regionFilter !== 'all' && data.region !== regionFilter) return;
    
    const regionLabel = REGIONS.find(r => r.id === data.region)?.label || '';
    csv += `${regionLabel},${data.type === 'tong_kho' ? 'Tổng kho' : 'Tỉnh'},${data.name},${data.num_ch || ''}`;
    
    PRODUCT_KEYS.forEach(pk => {
      const quota = getQuota(key, pk, level);
      const actual = getActual(key, pk);
      const pct = quota > 0 && actual !== null ? (actual / quota * 100).toFixed(1) : '';
      csv += `,${quota || ''},${actual !== null ? actual : ''},${pct}`;
    });
    csv += '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `kiem_tra_ton_kho_${QUOTA_LEVELS[level]}_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  
  showToast('Đã xuất file CSV thành công!', 'success');
}

// ========== LOCAL STORAGE ==========
function saveToLocalStorage() {
  try {
    localStorage.setItem('hoasen_inventory_data', JSON.stringify(AppState.actualInventory));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem('hoasen_inventory_data');
    if (saved) {
      AppState.actualInventory = JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Could not load from localStorage:', e);
  }
}

// ========== TOAST NOTIFICATION ==========
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========== EXCEL UPLOAD HANDLER ==========

// Column header patterns to identify product categories in report
const REPORT_COLUMN_PATTERNS = {
  // We identify columns by their header text patterns (Row 2 and Row 3)
  // The report has multi-level headers, so we check R2+R3 combinations
  'thep_xay_dung': {
    // Total column for THÉP XÂY DỰNG (R2="THÉP XÂY DỰNG")
    matchR2: ['THÉP XÂY DỰNG'],
    sumColumns: true, // Use the total column, not individual sub-brands
  },
  'thep_v_kem': {
    // Sum of: V Kẽm QT, V Kẽm HS, V Kẽm AK, V kẽm NB, Thép V kẽm
    matchR2: ['Thép V Mạ Kẽm'],
    matchR3: ['V Kẽm QT', 'V Kẽm HS', 'V Kẽm AK', 'V kẽm NB', 'Thép V kẽm', 'V kẽm'],
    sumColumns: true,
  },
  'thep_v_den': {
    // Sum of: V NB, V QT, V AK, V Đen HS, V ĐV, Thép V đen
    matchR2: ['Thép V Đen'],
    matchR3: ['V NB', 'V QT', 'V AK', 'V Đen HS', 'V ĐV', 'Thép V đen', 'V đen'],
    sumColumns: true,
  },
  'thep_hinh': {
    // Sum of: U An Khánh, U Đại Việt, Thép hình U, Thép L đen, I Posco, H Posco, I An Khánh, I Đại Việt, I Nhập Khẩu, Thép hình I
    matchR2: ['Thép hình'],
    matchR3: ['U An Khánh', 'U Đại Việt', 'Thép hình U', 'Thép L đen', 'I Posco', 'H Posco', 'I An Khánh', 'I Đại Việt', 'I Nhập Khẩu', 'Thép hình I'],
    sumColumns: true,
  },
  'thep_tam': {
    matchR3: ['Thép tấm'],
    sumColumns: false,
  },
  'thep_la': {
    // Sum of: La Tín Phát, La kẽm ĐK
    matchR2: ['Thép la'],
    matchR3: ['La Tín Phát', 'La kẽm ĐK', 'La kẽm'],
    sumColumns: true,
  },
  'luoi_b40': {
    // Sum of: Lưới B40 3mm, Lưới B40 3.5mm (NOT including nguyên liệu or lưới thép hàn)
    matchR3: ['Lưới B40 3mm', 'Lưới B40 3.5mm'],
    sumColumns: true,
  },
  'luoi_thep_han': {
    matchR3: ['Lưới thép hàn', 'Lưới thép hàn đen'],
    sumColumns: true,
  },
  'day_3mm': {
    // Sum of Kẽm 3.0mm - 5.0mm (nguyên liệu SX)
    matchR3: ['Kẽm 3.0mm', 'Kẽm 3.50mm', 'Kẽm 4.0mm', 'Kẽm 4.50mm', 'Kẽm 5.0mm'],
    sumColumns: true,
  },
  'kem_gai': {
    matchR3: ['Kẽm gai'],
    sumColumns: false,
  },
  'inox_ong_hop': {
    // Inox TT (ống, hộp thanh)
    matchR3: ['Inox TT'],
    sumColumns: false,
  },
  'inox_cuon': {
    matchR3: ['Inox cuộn'],
    sumColumns: false,
  },
  'day_thep_den': {
    // Sum of: Kẽm buộc 1mm, 1.5mm, 2mm, trắng 2.7mm
    matchR2: ['Phụ Kiện'],
    matchR3: ['Kẽm buộc 1mm', 'Kẽm buộc 1.5mm', 'Kẽm buộc 2mm', 'Kẽm trắng 2.7mm', 'Kẽm buộc'],
    sumColumns: true,
  },
  'dinh_thep': {
    matchR3: ['Đinh 3', 'Đinh 5', 'Đinh 7'],
    sumColumns: true,
  }
};

// Province name normalization for matching
function normalizeProvinceName(name) {
  if (!name) return '';
  return name.trim()
    .replace(/\s+/g, ' ')
    .replace('TP.HCM', 'TP.HCM')
    .replace('Tp.HCM', 'TP.HCM')
    .replace('TPHCM', 'TP.HCM')
    .replace('TP HCM', 'TP.HCM')
    .replace('Hồ Chí Minh', 'TP.HCM');
}

function findMatchingProvinceKey(reportName) {
  const normalized = normalizeProvinceName(reportName);
  
  // Direct match
  if (PROVINCES_DATA[normalized]) return normalized;
  
  // Case-insensitive match
  for (const key of Object.keys(PROVINCES_DATA)) {
    if (key.toLowerCase() === normalized.toLowerCase()) return key;
  }
  
  // Partial match
  for (const key of Object.keys(PROVINCES_DATA)) {
    if (normalized.includes(key) || key.includes(normalized)) return key;
  }
  
  return null;
}

function handleExcelUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  showToast('Đang đọc file Excel...', 'info');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Find the "Chi tiết Tỉnh" sheet
      let sheetName = null;
      for (const name of workbook.SheetNames) {
        if (name.includes('Chi tiết Tỉnh') || name.includes('Chi tiet Tinh') || name.includes('Chi tiết tỉnh')) {
          sheetName = name;
          break;
        }
      }
      
      if (!sheetName) {
        showToast('Không tìm thấy sheet "Chi tiết Tỉnh"! Các sheet có: ' + workbook.SheetNames.join(', '), 'error');
        return;
      }
      
      const ws = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(ws['!ref']);
      
      // Step 1: Find the TỒN KHO section by scanning Row 1
      let tonKhoStartCol = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({r: 0, c})];
        if (cell && cell.v && typeof cell.v === 'string' && cell.v.includes('TỒN KHO')) {
          tonKhoStartCol = c;
          break;
        }
      }
      
      if (tonKhoStartCol < 0) {
        showToast('Không tìm thấy phần "TỒN KHO" trong sheet!', 'error');
        return;
      }
      
      // Step 2: Read R2 and R3 headers in the TỒN KHO section
      const columnHeaders = {}; // col_index → { r2: string, r3: string }
      for (let c = tonKhoStartCol; c <= range.e.c; c++) {
        const cellR2 = ws[XLSX.utils.encode_cell({r: 1, c})];
        const cellR3 = ws[XLSX.utils.encode_cell({r: 2, c})];
        columnHeaders[c] = {
          r2: cellR2 ? String(cellR2.v || '').trim() : '',
          r3: cellR3 ? String(cellR3.v || '').trim() : '',
        };
      }
      
      // Step 3: Map columns to product keys
      const columnToProduct = {}; // col_index → product_key
      let lastR2 = '';
      
      for (let c = tonKhoStartCol; c <= range.e.c; c++) {
        const h = columnHeaders[c];
        if (h.r2) lastR2 = h.r2;
        
        for (const [productKey, patterns] of Object.entries(REPORT_COLUMN_PATTERNS)) {
          // Check R3 match first (more specific)
          if (patterns.matchR3) {
            for (const p of patterns.matchR3) {
              if (h.r3 && h.r3.includes(p)) {
                columnToProduct[c] = productKey;
                break;
              }
            }
          }
          
          // Check R2 match (for total columns only - where R3 is empty)
          if (!columnToProduct[c] && patterns.matchR2 && !patterns.matchR3) {
            for (const p of patterns.matchR2) {
              if (h.r2 && h.r2 === p && !h.r3) {
                columnToProduct[c] = productKey;
                break;
              }
            }
          }
        }
      }
      
      // Step 4: Read province rows and extract inventory
      const extracted = {};
      const matchResults = [];
      let provinceCol = 1; // Column B (0-indexed = 1)
      
      for (let r = 3; r <= range.e.r; r++) {  // Start from row 4 (0-indexed = 3)
        const nameCell = ws[XLSX.utils.encode_cell({r, c: provinceCol})];
        if (!nameCell || !nameCell.v) continue;
        
        const reportName = String(nameCell.v).trim();
        
        // Skip region headers and totals
        if (['TOÀN QUỐC', 'MIỀN NAM', 'MIỀN TRUNG', 'MIỀN BẮC'].includes(reportName)) continue;
        
        const matchedKey = findMatchingProvinceKey(reportName);
        
        if (matchedKey) {
          const provInventory = {};
          let totalKg = 0;
          
          for (const [colStr, productKey] of Object.entries(columnToProduct)) {
            const col = parseInt(colStr);
            const cell = ws[XLSX.utils.encode_cell({r, c: col})];
            if (cell && typeof cell.v === 'number' && cell.v > 0) {
              if (!provInventory[productKey]) provInventory[productKey] = 0;
              provInventory[productKey] += Math.round(cell.v);
              totalKg += cell.v;
            }
          }
          
          extracted[matchedKey] = provInventory;
          matchResults.push({
            report: reportName,
            matched: matchedKey,
            total: Math.round(totalKg),
            products: Object.keys(provInventory).length,
            status: 'ok'
          });
        } else {
          matchResults.push({
            report: reportName,
            matched: null,
            total: 0,
            products: 0,
            status: 'not_found'
          });
        }
      }
      
      // Step 5: Load extracted data
      AppState.actualInventory = extracted;
      saveToLocalStorage();
      ReportStore.save(e.target.result, file, workbook.SheetNames).catch(error => {
        console.warn('Could not save workbook for pull tracking:', error);
        showToast('Đã nhập tồn kho, nhưng chưa lưu được file cho công cụ kiểm tra kéo hàng.', 'error');
      });
      renderAll();
      
      // Step 6: Show results modal
      showUploadResults(file.name, matchResults, Object.keys(columnToProduct).length);
      
    } catch (err) {
      console.error('Excel upload error:', err);
      showToast('Lỗi đọc file: ' + err.message, 'error');
    }
  };
  
  reader.readAsArrayBuffer(file);
  input.value = ''; // Reset input
}

function showUploadResults(fileName, matchResults, mappedCols) {
  const matched = matchResults.filter(r => r.status === 'ok');
  const notFound = matchResults.filter(r => r.status === 'not_found');
  const totalKg = matched.reduce((sum, r) => sum + r.total, 0);
  
  let html = `
    <div style="margin-bottom: 20px;">
      <p style="color: var(--text-secondary); margin-bottom: 12px;">📄 File: <strong style="color: var(--text-primary);">${fileName}</strong></p>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div class="region-stat">
          <div class="region-stat-label">Tỉnh đã khớp</div>
          <div class="region-stat-value" style="color: var(--accent-green);">${matched.length}/${matchResults.length}</div>
        </div>
        <div class="region-stat">
          <div class="region-stat-label">Cột sản phẩm</div>
          <div class="region-stat-value" style="color: var(--accent-blue);">${mappedCols}</div>
        </div>
        <div class="region-stat">
          <div class="region-stat-label">Tổng tồn kho</div>
          <div class="region-stat-value" style="color: var(--accent-cyan);">${formatTons(totalKg)}</div>
        </div>
      </div>
    </div>
  `;
  
  // Matched provinces table
  html += `<div style="margin-bottom: 20px;"><h3 style="font-size: 14px; margin-bottom: 10px;">✅ Tỉnh đã khớp thành công (${matched.length})</h3>`;
  html += '<div class="table-scroll" style="max-height: 300px; overflow-y: auto;">';
  html += '<table><thead><tr><th>BC HĐKD</th><th>→ Định mức</th><th style="text-align:right">Tổng TK (kg)</th><th style="text-align:right">Số MH</th></tr></thead><tbody>';
  matched.forEach(r => {
    html += `<tr>
      <td>${r.report}</td>
      <td><span class="status-badge status-ok">${r.matched}</span></td>
      <td class="cell-number">${formatNumber(r.total)}</td>
      <td class="cell-number">${r.products}</td>
    </tr>`;
  });
  html += '</tbody></table></div></div>';
  
  // Not found provinces
  if (notFound.length > 0) {
    html += `<div><h3 style="font-size: 14px; margin-bottom: 10px; color: var(--accent-yellow);">⚠️ Không tìm thấy trong định mức (${notFound.length})</h3>`;
    html += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
    notFound.forEach(r => {
      html += `<span class="status-badge status-low">${r.report}</span>`;
    });
    html += '</div></div>';
  }
  
  document.getElementById('upload-modal-body').innerHTML = html;
  document.getElementById('upload-modal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
}

// ========== RENDER ALL ==========
function renderAll() {
  renderDashboard();
  if (AppState.currentView === 'input') renderProvinceTable();
  if (AppState.currentView === 'detail') {
    renderProductChart();
    renderStatusChart();
  }
}

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  
  // Set up event listeners
  document.getElementById('level-select').addEventListener('change', (e) => changeLevel(e.target.value));
  document.getElementById('region-filter').addEventListener('change', (e) => filterByRegion(e.target.value));
  
  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });
  
  renderAll();
});
