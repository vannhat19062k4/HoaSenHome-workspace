const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 0) => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clone = (value) => JSON.parse(JSON.stringify(value));
const modes = ['Ưu tiên tải nặng', 'Ưu tiên hàng lớn', 'Cân bằng'];
const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
const bundledPresets = JSON.parse(document.querySelector('#default-presets').textContent);
const defaultCargo = (index) => ({ name: `Hàng ${index + 1}`, kind: 'Cuộn tròn', qty: 100, kg: 60, target_kg: 0, priority: 3, orientation: 'Đứng', diameter: 0.4, roll_height: 1.2, plate_length: 1.2, plate_width: 0.6, thickness_mm: 4, baseDimensions: [1.2, 0.4, 0.4], dimensions: [1.2, 0.4, 0.4] });
const state = { presets: clone(bundledPresets), defaults: Object.keys(bundledPresets), vehicleName: 'Xe tải 8T', vehicle: null, over: true, cargos: Array.from({ length: 6 }, (_, i) => defaultCargo(i)), count: 3, activeCargo: 0, plans: [], planInputs: [], initialInputs: [], originalCargos: [], originalBreakdowns: [], manualDrafts: [], activePlan: 0, busy: false };

async function api(path, method = 'GET', body) {
  const url = `${window.location.origin}${path}`;
  const options = { method };
  if (body !== undefined) { options.headers = { 'Content-Type': 'application/json' }; options.body = JSON.stringify(body); }
  const attempts = method === 'GET' || path === '/api/plan' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetch(url, options);
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || 'Không thể xử lý yêu cầu.');
        error.apiResponse = true;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.apiResponse || attempt === attempts - 1) throw error;
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
  }
}

function readableError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  if (/string did not match|failed to fetch|network|load failed/i.test(detail)) return 'Không kết nối được bộ tính tải. Vui lòng kiểm tra máy chủ và thử lại.';
  return detail;
}

function field(label, name, value, min, max, step, extra = '') {
  return `<div class="field ${extra}"><label for="${name}">${label}</label><input id="${name}" data-field="${name}" type="number" min="${min}" max="${max}" step="any" required value="${esc(value)}"></div>`;
}

function renderPresets() {
  $('#vehicle-select').innerHTML = Object.keys(state.presets).map(name => `<option value="${esc(name)}" ${name === state.vehicleName ? 'selected' : ''}>${esc(name)}</option>`).join('') + '<option value="custom"' + (state.vehicleName === 'custom' ? ' selected' : '') + '>✏️ Tùy chỉnh</option>';
  $('#preset-table').innerHTML = Object.entries(state.presets).map(([name, v]) => `<tr><td>${esc(name)}</td><td>${fmt(v.L, 2)}</td><td>${fmt(v.W, 2)}</td><td>${fmt(v.wall, 2)}</td><td>${fmt(v.H_max, 2)}</td><td>${fmt(v.payload)}</td></tr>`).join('');
  const custom = state.vehicleName === 'custom';
  $('#preset-actions').innerHTML = custom ? '<div class="preset-actions"><div class="field"><label for="preset-name">Tên xe mới</label><input id="preset-name" maxlength="80" placeholder="Ví dụ: Xe nội bộ 8T"></div><button class="btn" id="save-preset" type="button">Lưu xe</button></div>' : (state.defaults.includes(state.vehicleName) ? '' : '<div class="preset-actions"><button class="btn danger" id="delete-preset" type="button">Xóa xe đã lưu</button></div>');
}

function renderVehicle() {
  const v = state.vehicle;
  $('#vehicle-fields').innerHTML = field('Dài thùng (m)', 'length', v.length, .1, 50, .1) + field('Rộng thùng (m)', 'width', v.width, .1, 10, .1) + field('Chiều cao bửng (m)', 'wall', v.wall, .1, 5, .1) + field('Tải trọng (kg)', 'payload', v.payload, 1, 100000, 100) + field('Cao xếp tối đa (m)', 'height', state.over ? v.height : v.wall, v.wall, 10, .1);
  $('#allow-over').checked = state.over;
  $('#height').disabled = !state.over;
  updateVehicleSummary();
}

function updateVehicleSummary() {
  const v = state.vehicle;
  const height = state.over ? Number(v.height) : Number(v.wall);
  $('#vehicle-summary').innerHTML = `<strong>${fmt(v.length, 2)} × ${fmt(v.width, 2)} × ${fmt(height, 2)} m</strong><br>Thể tích ${fmt(v.length * v.width * height, 2)} m³ · Tải ${fmt(v.payload)} kg`;
}

function setVehicle(name) {
  state.vehicleName = name;
  const v = name === 'custom' ? { L: 6.8, W: 2.2, wall: 1.6, H_max: 2.4, payload: 8200 } : state.presets[name];
  state.vehicle = { length: v.L, width: v.W, wall: v.wall, height: Math.max(v.wall, v.H_max), payload: v.payload };
  state.over = true;
  renderPresets();
  renderVehicle();
}

function permutations(values) {
  const [a, b, c] = values;
  const all = [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]];
  return all.filter((item, index) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(item)) === index);
}

function boxOrientationLabel(values) {
  return values.map((value, index) => `${Number(value).toFixed(3)} ${'XYZ'[index]}`).join(' × ');
}

function renderCargoTabs() {
  $('#cargo-tabs').innerHTML = Array.from({ length: state.count }, (_, i) => `<button type="button" role="tab" data-cargo-tab="${i}" aria-selected="${i === state.activeCargo}" class="${i === state.activeCargo ? 'active' : ''}">Hàng ${i + 1}</button>`).join('');
}

function options(items, selected) { return items.map(item => `<option value="${esc(item)}" ${item === selected ? 'selected' : ''}>${esc(item)}</option>`).join(''); }

function renderCargo() {
  renderCargoTabs();
  const c = state.cargos[state.activeCargo];
  let details = '';
  if (c.kind === 'Cuộn tròn') {
    details = `<div class="form-grid">${field('Đường kính (m)', 'diameter', c.diameter, .001, 10, .01)}${field('Chiều dài/cao cuộn (m)', 'roll_height', c.roll_height, .001, 10, .05)}</div><div class="field orientation-field"><label>Tư thế</label><div class="orientation-options">${['Đứng', 'Nằm dọc', 'Nằm ngang'].map(item => `<label><input type="radio" name="orientation" value="${item}" ${c.orientation === item ? 'checked' : ''}>${item}</label>`).join('')}</div></div>`;
  } else if (c.kind === 'Tấm phẳng') {
    details = `<p class="hint">Dành cho tôn, thép tấm, panel… Nhập độ dày theo mm.</p><div class="form-grid">${field('Dài tấm (m)', 'plate_length', c.plate_length, .01, 20, .05)}${field('Rộng tấm (m)', 'plate_width', c.plate_width, .01, 20, .05)}${field('Độ dày (mm)', 'thickness_mm', c.thickness_mm, .1, 500, .1)}</div><div class="field orientation-field"><label>Tư thế xếp</label><div class="orientation-options">${['Nằm (chồng lên)', 'Đứng dọc xe', 'Đứng ngang xe'].map(item => `<label><input type="radio" name="orientation" value="${item}" ${c.orientation === item ? 'checked' : ''}>${item}</label>`).join('')}</div></div><p id="plate-grid" class="hint"></p>`;
  } else {
    const perms = permutations(c.baseDimensions);
    const selected = JSON.stringify(c.dimensions);
    details = `<div class="form-grid">${field('Dài (m)', 'box-length', c.baseDimensions[0], .001, 20, .05)}${field('Rộng (m)', 'box-width', c.baseDimensions[1], .001, 20, .05)}${field('Cao (m)', 'box-height', c.baseDimensions[2], .001, 20, .05)}</div><div class="field orientation-field"><label for="box-orientation">Tư thế X × Y × Z</label><select id="box-orientation">${perms.map(p => `<option value="${esc(JSON.stringify(p))}" ${JSON.stringify(p) === selected ? 'selected' : ''}>${boxOrientationLabel(p)}</option>`).join('')}</select></div>`;
  }
  $('#cargo-form').innerHTML = `<div class="cargo-form-grid"><div class="field"><label for="name">Tên hàng</label><input id="name" data-field="name" maxlength="100" value="${esc(c.name)}"></div><div class="field"><label for="kind">Dạng hàng</label><select id="kind" data-field="kind">${options(['Cuộn tròn', 'Hình hộp', 'Tấm phẳng'], c.kind)}</select></div>${field('Số lượng cần chở', 'qty', c.qty, 1, 1000000, 1)}${field('Kg / đơn vị', 'kg', c.kg, .001, 50000, .001)}${field('Tải mong muốn (kg) · 0 = tự phân bổ', 'target_kg', c.target_kg, 0, 100000, 100)}<div class="field"><label for="priority">Ưu tiên</label><select id="priority" data-field="priority">${options(['3', '2', '1'], String(c.priority))}</select></div></div><div class="cargo-kind-fields"><h3>Kích thước và tư thế xếp</h3>${details}</div>`;
  updatePlateGrid();
}

function cargoDimensions(c) {
  if (c.kind === 'Cuộn tròn') {
    if (c.orientation === 'Đứng') return [c.diameter, c.diameter, c.roll_height];
    if (c.orientation === 'Nằm dọc') return [c.roll_height, c.diameter, c.diameter];
    return [c.diameter, c.roll_height, c.diameter];
  }
  if (c.kind === 'Tấm phẳng') {
    const t = c.thickness_mm / 1000;
    if (c.orientation === 'Nằm (chồng lên)') return [c.plate_length, c.plate_width, t];
    if (c.orientation === 'Đứng dọc xe') return [t, c.plate_width, c.plate_length];
    return [c.plate_length, t, c.plate_width];
  }
  return c.dimensions;
}

function updatePlateGrid() {
  const target = $('#plate-grid');
  if (!target) return;
  const c = state.cargos[state.activeCargo];
  const [dx, dy, dz] = cargoDimensions(c);
  const v = state.vehicle;
  const h = state.over ? v.height : v.wall;
  const nx = Math.floor((v.length + 1e-8) / dx), ny = Math.floor((v.width + 1e-8) / dy), nz = Math.floor((h + 1e-8) / dz);
  const byWeight = Math.floor((v.payload + 1e-8) / c.kg);
  target.textContent = `Dài ${nx} × Ngang ${ny} × Cao ${nz} = ${fmt(nx * ny * nz)} tấm theo thể tích · ${fmt(byWeight)} tấm theo tải trọng`;
}

function requestCargo(c) {
  return { name: c.name, kind: c.kind, qty: Number(c.qty), kg: Number(c.kg), target_kg: Number(c.target_kg), priority: Number(c.priority), orientation: c.orientation, diameter: Number(c.diameter), roll_height: Number(c.roll_height), plate_length: Number(c.plate_length), plate_width: Number(c.plate_width), thickness_mm: Number(c.thickness_mm), dimensions: c.dimensions.map(Number) };
}

function requestBody() {
  const v = state.vehicle;
  return { truck: { length: Number(v.length), width: Number(v.width), wall: Number(v.wall), height: Number(state.over ? v.height : v.wall), payload: Number(v.payload) }, cargos: state.cargos.slice(0, state.count).map(requestCargo) };
}

function message(text, kind = 'error') { $('#input-warning').innerHTML = text ? `<div class="notice ${kind}">${esc(text)}</div>` : ''; }

async function calculate() {
  if (state.busy) return;
  const body = requestBody();
  const invalid = [...document.querySelectorAll('#vehicle-fields input,#cargo-form input[type=number]')].find(el => !el.checkValidity());
  if (invalid) { invalid.reportValidity(); return; }
  if (body.cargos.some(c => !c.name.trim())) { message('Mỗi loại hàng cần có tên.'); return; }
  state.busy = true;
  $('#calculate').disabled = true;
  $('#calculate').textContent = 'Đang tính toán…';
  message('');
  try {
    const result = await api('/api/plan', 'POST', body);
    state.plans = result.plans;
    state.planInputs = result.plans.map(() => clone(body));
    state.initialInputs = result.plans.map(() => clone(body));
    state.originalCargos = result.plans.map(plan => clone(plan.cargos));
    state.originalBreakdowns = result.plans.map(plan => clone(plan.breakdown));
    state.manualDrafts = result.plans.map(plan => plan.cargos.map((cargo, i) => ({ qty: plan.loaded[i], target_kg: cargo.target_kg, orientation: body.cargos[i].orientation, dimensions: clone(body.cargos[i].dimensions) })));
    state.activePlan = 0;
    renderResults();
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { console.error('Không tính được phương án tải xe:', error); message(readableError(error)); }
  finally { state.busy = false; $('#calculate').disabled = false; $('#calculate').textContent = '⚡ Tìm 3 phương án tối ưu'; }
}

function renderResults() {
  if (!state.plans.length) return;
  const plan = state.plans[state.activePlan];
  const body = state.planInputs[state.activePlan];
  const originalBody = state.initialInputs[state.activePlan];
  const originalCargos = state.originalCargos[state.activePlan];
  const originalBreakdown = state.originalBreakdowns[state.activePlan];
  const m = plan.metrics;
  const totalTargets = originalBody.cargos.reduce((sum, c) => sum + c.target_kg, 0);
  $('#results').innerHTML = `<div class="results-head"><div><div class="eyebrow">KẾT QUẢ</div><h2>3 phương án xếp hàng</h2></div></div><div class="tab-list" role="tablist">${state.plans.map((p, i) => `<button type="button" role="tab" data-plan-tab="${i}" aria-selected="${i === state.activePlan}" class="${i === state.activePlan ? 'active' : ''}">${esc(p.title)}</button>`).join('')}</div><div class="panel result-panel">
    <div class="metric-grid"><div class="metric"><span>Số đơn vị</span><strong>${fmt(m.done)}</strong></div><div class="metric"><span>Tải đã xếp</span><strong>${fmt(m.weight)} kg</strong></div><div class="metric"><span>Dùng tải</span><strong>${fmt(m.util * 100, 1)}%</strong></div><div class="metric"><span>Lấp đầy</span><strong>${fmt(m.fill * 100, 1)}%</strong></div></div>
    <div class="status-line notice ${m.weight > body.truck.payload + 1e-8 ? 'error' : ''}">${m.weight > body.truck.payload + 1e-8 ? '❌ Vượt tải.' : '✅ Không vượt tải.'} &nbsp; Tải xe: ${fmt(body.truck.payload)} kg · Còn lại: ${fmt(Math.max(body.truck.payload - m.weight, 0))} kg</div>
    ${totalTargets > body.truck.payload ? `<div class="status-line notice warn">Tổng tải mong muốn ${fmt(totalTargets)} kg vượt tải xe. V7 sẽ tự cắt phần vượt.</div>` : ''}
    <div class="result-section"><h3>Chi tiết cách xếp · Dài × Ngang × Cao</h3><p class="hint">Bảng lý thuyết giả sử toàn bộ thùng chỉ chở một loại hàng. Số thực xếp có thể khác khi chở hỗn hợp.</p><div class="table-wrap"><table><thead><tr><th>Hàng</th><th>Kích thước X × Y × Z</th><th>Dài</th><th>Ngang</th><th>Cao</th><th>Max thể tích</th><th>Max tải</th><th>Nhu cầu</th><th>Thực xếp</th><th>Tổng kg</th></tr></thead><tbody>${originalCargos.map((c, i) => { const g = originalBreakdown[i]; const d = dimensionsFromPlan(c); return `<tr><td>${esc(c.name)}</td><td>${d.map(x => fmt(x, 4)).join(' × ')} m</td><td>${g.nx}</td><td>${g.ny}</td><td>${g.nz}</td><td>${fmt(g.by_vol)}</td><td>${fmt(g.by_wt)}</td><td>${fmt(c.qty)}</td><td>${fmt(plan.loaded[i])}</td><td>${fmt(plan.loaded[i] * c.kg, 1)}</td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="result-section"><h3>Chỉnh thủ công</h3><p class="hint">Giảm số lượng, đổi tư thế hoặc đặt mục tiêu kg rồi tính lại riêng phương án này.</p>${originalCargos.map((c, i) => manualRow(c, i, plan.loaded[i], body.truck.payload)).join('')}<div class="manual-actions"><button type="button" class="btn primary" id="recalculate">🔄 Tính lại phương án này</button></div></div>
    <div class="result-section result-flex"><div><h3>Mô phỏng 3D</h3><div id="plot3d" class="plot"></div></div><div class="balance"><h3>Trọng tâm</h3><p>X = <strong>${fmt(m.cx, 2)} m</strong> / giữa xe ${fmt(body.truck.length / 2, 2)} m</p><p>Y = <strong>${fmt(m.cy, 2)} m</strong> / giữa xe ${fmt(body.truck.width / 2, 2)} m</p><p>Lệch dọc: <strong>${fmt(m.long * 100, 1)}%</strong></p><p>Lệch ngang: <strong>${fmt(m.lat * 100, 1)}%</strong></p></div></div>
    <div class="result-section"><h3>Tổng hợp</h3><div class="table-wrap"><table><thead><tr><th>Hàng</th><th>Dạng</th><th>Nhu cầu</th><th>Đã xếp</th><th>Chưa xếp</th><th>Kg/đv</th><th>Tổng kg</th><th>Mục tiêu</th><th>Tư thế</th></tr></thead><tbody>${originalCargos.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${esc(c.kind)}</td><td>${fmt(c.qty)}</td><td>${fmt(plan.loaded[i])}</td><td>${fmt(Math.max(c.qty - plan.loaded[i], 0))}</td><td>${fmt(c.kg, 2)}</td><td>${fmt(plan.loaded[i] * c.kg, 1)}</td><td>${fmt(c.target_kg)}</td><td>${esc(c.orientation)}</td></tr>`).join('')}</tbody></table></div></div>
  </div>`;
  drawPlot(plan, body.truck);
}

function dimensionsFromPlan(c) {
  if (c.kind !== 'Cuộn tròn') return c.dims;
  if (c.orientation === 'Đứng') return [c.diameter, c.diameter, c.height];
  if (c.orientation === 'Nằm dọc') return [c.height, c.diameter, c.diameter];
  return [c.diameter, c.height, c.diameter];
}

function manualRow(c, index, loaded, payload) {
  const input = state.planInputs[state.activePlan].cargos[index];
  const initial = state.initialInputs[state.activePlan].cargos[index];
  const draft = state.manualDrafts[state.activePlan][index];
  let orientation = '';
  if (c.kind === 'Cuộn tròn') orientation = `<select data-manual-orientation="${index}">${options(['Đứng', 'Nằm dọc', 'Nằm ngang'], draft.orientation)}</select>`;
  else if (c.kind === 'Tấm phẳng') orientation = `<input disabled value="${esc(c.orientation)}" aria-label="Tư thế tấm phẳng">`;
  else orientation = `<select data-manual-box="${index}">${permutations(c.dims).map(p => `<option value="${esc(JSON.stringify(p))}" ${JSON.stringify(p) === JSON.stringify(draft.dimensions) ? 'selected' : ''}>${p.map(x => Number(x).toFixed(3)).join(' × ')}</option>`).join('')}</select>`;
  return `<div class="manual-row"><div class="manual-name">${esc(c.name)}<small>${esc(c.kind)}</small></div><div class="field"><label>Tư thế</label>${orientation}</div><div class="field"><label>Số lượng · tối đa ${fmt(initial.qty)}</label><input type="number" data-manual-qty="${index}" min="0" max="${initial.qty}" step="1" value="${draft.qty}"></div><div class="field"><label>Mục tiêu kg</label><input type="number" data-manual-target="${index}" min="0" max="${payload}" step="any" value="${draft.target_kg}"></div></div>`;
}

async function recalculate() {
  const index = state.activePlan;
  const body = clone(state.initialInputs[index]);
  for (let i = 0; i < body.cargos.length; i++) {
    const q = $(`[data-manual-qty="${i}"]`), t = $(`[data-manual-target="${i}"]`);
    if (!q.checkValidity() || !t.checkValidity()) { (!q.checkValidity() ? q : t).reportValidity(); return; }
    body.cargos[i].qty = Number(q.value);
    body.cargos[i].target_kg = Number(t.value);
    const roll = $(`[data-manual-orientation="${i}"]`), box = $(`[data-manual-box="${i}"]`);
    if (roll) body.cargos[i].orientation = roll.value;
    if (box) body.cargos[i].dimensions = JSON.parse(box.value);
  }
  const button = $('#recalculate'); button.disabled = true; button.textContent = 'Đang tính lại…';
  try {
    const result = await api('/api/plan', 'POST', { ...body, mode: modes[index] });
    state.plans[index] = result.plans[0];
    state.planInputs[index] = body;
    renderResults();
  } catch (error) { console.error('Không tính lại được phương án tải xe:', error); alert(readableError(error)); button.disabled = false; button.textContent = '🔄 Tính lại phương án này'; }
}

function boxMesh(p) {
  const { x, y, z, lx: a, ly: b, lz: c } = p;
  return { x: [x,x+a,x+a,x,x,x+a,x+a,x], y: [y,y,y+b,y+b,y,y,y+b,y+b], z: [z,z,z,z,z+c,z+c,z+c,z+c], i: [0,0,0,1,1,2,4,4,5,3,3,6], j: [1,2,4,2,5,6,5,6,7,0,4,7], k: [2,3,5,3,6,7,1,7,6,4,7,3] };
}

function cylinderMesh(p, diameter) {
  const n = 14, x = [], y = [], z = [], i = [], j = [], k = [];
  for (const zz of [p.z, p.z + p.lz]) for (let index = 0; index < n; index++) { const angle = 2 * Math.PI * index / n; x.push(p.x + diameter / 2 + diameter / 2 * Math.cos(angle)); y.push(p.y + diameter / 2 + diameter / 2 * Math.sin(angle)); z.push(zz); }
  const bottom = x.length; x.push(p.x + diameter / 2); y.push(p.y + diameter / 2); z.push(p.z);
  const top = x.length; x.push(p.x + diameter / 2); y.push(p.y + diameter / 2); z.push(p.z + p.lz);
  for (let index = 0; index < n; index++) { const next = (index + 1) % n; i.push(index, next, bottom, top); j.push(next, n + next, next, n + index); k.push(n + index, n + index, index, n + next); }
  return { x, y, z, i, j, k };
}

function drawPlot(plan, truck) {
  const target = $('#plot3d');
  if (!window.Plotly) { target.textContent = 'Không tải được thư viện mô phỏng 3D.'; return; }
  const L = truck.length, W = truck.width, H = truck.height;
  const traces = [{ type: 'mesh3d', x: [0,L,L,0], y: [0,0,W,W], z: [0,0,0,0], i: [0,0], j: [1,2], k: [2,3], opacity: .08, color: '#aaa', hoverinfo: 'skip' }];
  for (const p of plan.placed) {
    const c = plan.cargos[p.cargo_idx], count = p.count || 1;
    const mesh = c.kind === 'Cuộn tròn' && c.orientation === 'Đứng' ? cylinderMesh(p, c.diameter) : boxMesh(p);
    traces.push({ type: 'mesh3d', ...mesh, opacity: .78, color: colors[p.cargo_idx % colors.length], showlegend: false, hovertemplate: `<b>${esc(c.name)}${count > 1 ? ` (×${count})` : ''}</b><br>${esc(c.orientation)}<br>${fmt(c.kg, 2)} kg/đv${count > 1 ? `<br>Tổng: ${fmt(count * c.kg, 1)} kg` : ''}<br>Vị trí (${fmt(p.x, 3)}, ${fmt(p.y, 3)}, ${fmt(p.z, 3)})<extra></extra>` });
  }
  const corners = [[0,0,0],[L,0,0],[0,W,0],[L,W,0],[0,0,H],[L,0,H],[0,W,H],[L,W,H]];
  for (const [a,b] of [[0,1],[2,3],[0,2],[1,3],[4,5],[6,7],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]]) traces.push({ type: 'scatter3d', mode: 'lines', x: [corners[a][0],corners[b][0]], y: [corners[a][1],corners[b][1]], z: [corners[a][2],corners[b][2]], line: { width: 4, color: '#aab0ba' }, showlegend: false, hoverinfo: 'skip' });
  window.Plotly.newPlot(target, traces, { paper_bgcolor: '#101216', plot_bgcolor: '#101216', font: { family: 'Inter, sans-serif', color: '#d5d9df' }, scene: { xaxis: { title: 'X – Dài (m)' }, yaxis: { title: 'Y – Rộng (m)' }, zaxis: { title: 'Z – Cao (m)' }, aspectmode: 'data' }, margin: { l: 0, r: 0, t: 5, b: 0 }, autosize: true }, { responsive: true, displaylogo: false });
}

document.addEventListener('change', event => {
  const t = event.target;
  if (t.dataset.manualOrientation !== undefined) { state.manualDrafts[state.activePlan][Number(t.dataset.manualOrientation)].orientation = t.value; return; }
  if (t.dataset.manualBox !== undefined) { state.manualDrafts[state.activePlan][Number(t.dataset.manualBox)].dimensions = JSON.parse(t.value); return; }
  if (t.id === 'vehicle-select') { setVehicle(t.value); return; }
  if (t.id === 'allow-over') { state.over = t.checked; renderVehicle(); updatePlateGrid(); return; }
  if (t.id === 'cargo-count') { state.count = Number(t.value); state.activeCargo = Math.min(state.activeCargo, state.count - 1); renderCargo(); return; }
  if (t.name === 'orientation') { state.cargos[state.activeCargo].orientation = t.value; updatePlateGrid(); return; }
  if (t.id === 'box-orientation') { state.cargos[state.activeCargo].dimensions = JSON.parse(t.value); return; }
  if (t.dataset.field === 'kind') { const c = state.cargos[state.activeCargo]; c.kind = t.value; c.orientation = t.value === 'Tấm phẳng' ? 'Nằm (chồng lên)' : t.value === 'Cuộn tròn' ? 'Đứng' : ''; renderCargo(); return; }
  if (t.dataset.field === 'priority') { state.cargos[state.activeCargo].priority = Number(t.value); return; }
});

document.addEventListener('input', event => {
  const t = event.target;
  if (t.dataset.manualQty !== undefined) { state.manualDrafts[state.activePlan][Number(t.dataset.manualQty)].qty = Number(t.value); return; }
  if (t.dataset.manualTarget !== undefined) { state.manualDrafts[state.activePlan][Number(t.dataset.manualTarget)].target_kg = Number(t.value); return; }
  if (t.closest('#vehicle-fields') && t.dataset.field) { state.vehicle[t.dataset.field] = Number(t.value); if (t.dataset.field === 'wall') { $('#height').min = t.value; if (state.vehicle.height < state.vehicle.wall) { state.vehicle.height = state.vehicle.wall; $('#height').value = state.vehicle.height; } } updateVehicleSummary(); updatePlateGrid(); return; }
  if (t.closest('#cargo-form') && t.dataset.field && t.dataset.field !== 'kind') { const c = state.cargos[state.activeCargo]; c[t.dataset.field] = t.dataset.field === 'name' ? t.value : Number(t.value); updatePlateGrid(); return; }
  if (t.id.startsWith('box-')) { const c = state.cargos[state.activeCargo]; const axis = { 'box-length': 0, 'box-width': 1, 'box-height': 2 }[t.id]; if (axis !== undefined) { c.baseDimensions[axis] = Number(t.value); c.dimensions = [...c.baseDimensions]; const select = $('#box-orientation'); select.innerHTML = permutations(c.baseDimensions).map(p => `<option value="${esc(JSON.stringify(p))}">${boxOrientationLabel(p)}</option>`).join(''); } }
});

document.addEventListener('click', async event => {
  const t = event.target;
  const cargoTab = t.closest('[data-cargo-tab]'); if (cargoTab) { state.activeCargo = Number(cargoTab.dataset.cargoTab); renderCargo(); return; }
  const planTab = t.closest('[data-plan-tab]'); if (planTab) { state.activePlan = Number(planTab.dataset.planTab); renderResults(); return; }
  if (t.id === 'calculate') { calculate(); return; }
  if (t.id === 'recalculate') { recalculate(); return; }
  if (t.id === 'save-preset') { const name = $('#preset-name').value.trim(); if (!name) { $('#preset-name').focus(); return; } try { const v = state.vehicle; const result = await api('/api/presets', 'POST', { name, spec: { L: v.length, W: v.width, wall: v.wall, H_max: state.over ? v.height : v.wall, payload: v.payload } }); state.presets = result.presets; state.defaults = result.defaults; setVehicle(name); } catch (error) { alert(readableError(error)); } return; }
  if (t.id === 'delete-preset') { try { const result = await api('/api/presets', 'DELETE', { name: state.vehicleName }); state.presets = result.presets; state.defaults = result.defaults; setVehicle('Xe tải 8T'); } catch (error) { alert(readableError(error)); } }
  if (t.id === 'retry-presets') { refreshPresets(); }
});

let presetRetryTimer = null;
let presetSyncing = false;

async function refreshPresets() {
  if (presetSyncing) return;
  presetSyncing = true;
  window.clearTimeout(presetRetryTimer);
  const status = $('#preset-status');
  try {
    const result = await api('/api/presets');
    if (!result.presets || !result.presets['Xe tải 8T']) throw new Error('Danh sách xe không hợp lệ.');
    state.presets = result.presets;
    state.defaults = result.defaults;
    renderPresets();
    status.innerHTML = '';
  } catch (error) {
    console.error('Không đồng bộ được danh sách xe:', error);
    status.innerHTML = '<div class="notice warn">Chưa kết nối được máy chủ. Bạn có thể chỉnh xe mặc định; cần kết nối để tính tải và dùng xe đã lưu. Trang sẽ tự thử lại. <button type="button" class="btn ghost" id="retry-presets">Thử lại ngay</button></div>';
    presetRetryTimer = window.setTimeout(refreshPresets, 5000);
  } finally {
    presetSyncing = false;
  }
}

window.addEventListener('online', refreshPresets);
window.addEventListener('focus', () => { if ($('#preset-status').textContent) refreshPresets(); });

setVehicle('Xe tải 8T');
renderCargo();
refreshPresets();
