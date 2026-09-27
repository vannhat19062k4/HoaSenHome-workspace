
import math, itertools, json, os, re
from dataclasses import dataclass, field
import streamlit as st
import plotly.graph_objects as go

st.set_page_config(page_title="Truck Loading Optimizer V7", page_icon="🚚", layout="wide")
EPS = 1e-8

# ═══════════════════════════════════════════════════════════════
#  1. VEHICLE PRESET SYSTEM
# ═══════════════════════════════════════════════════════════════

PRESET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vehicle_presets.json")

DEFAULT_VEHICLES = {
    "Xe tải 1T":       {"L": 3.10, "W": 1.56, "wall": 0.40, "H_max": 1.80, "payload": 990},
    "Xe tải 1.5T":     {"L": 3.70, "W": 1.70, "wall": 0.50, "H_max": 2.00, "payload": 1490},
    "Xe tải 2.5T":     {"L": 4.30, "W": 1.90, "wall": 0.50, "H_max": 2.20, "payload": 2490},
    "Xe tải 3.5T":     {"L": 4.80, "W": 2.00, "wall": 0.55, "H_max": 2.30, "payload": 3490},
    "Xe tải 5T":       {"L": 5.80, "W": 2.10, "wall": 0.55, "H_max": 2.40, "payload": 4990},
    "Xe tải 8T":       {"L": 6.80, "W": 2.20, "wall": 1.60, "H_max": 2.40, "payload": 8200},
    "Xe tải 10T":      {"L": 7.20, "W": 2.30, "wall": 1.80, "H_max": 2.60, "payload": 9990},
    "Xe tải 15T":      {"L": 9.40, "W": 2.40, "wall": 2.00, "H_max": 2.80, "payload": 14990},
    "Đầu kéo 20T":     {"L": 12.0, "W": 2.40, "wall": 2.30, "H_max": 2.90, "payload": 19990},
    "Container 20ft":   {"L": 5.90, "W": 2.35, "wall": 2.39, "H_max": 2.39, "payload": 21700},
    "Container 40ft":   {"L": 12.03,"W": 2.35, "wall": 2.39, "H_max": 2.39, "payload": 26500},
}

def _load_user_presets():
    if os.path.exists(PRESET_FILE):
        try:
            with open(PRESET_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def load_all_presets():
    presets = dict(DEFAULT_VEHICLES)
    presets.update(_load_user_presets())
    return presets

def save_user_preset(name, spec):
    data = _load_user_presets()
    data[name] = spec
    with open(PRESET_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def delete_user_preset(name):
    if name in DEFAULT_VEHICLES:
        return False
    data = _load_user_presets()
    if name in data:
        del data[name]
        with open(PRESET_FILE, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    return False


# ═══════════════════════════════════════════════════════════════
#  2. DATA CLASSES
# ═══════════════════════════════════════════════════════════════

@dataclass
class Cargo:
    name: str
    kind: str            # "Cuộn tròn" | "Hình hộp" | "Tấm phẳng"
    qty: int
    kg: float
    priority: int
    orientation: str
    dims: tuple          # (lx, ly, lz) after orientation
    diameter: float = 0
    height: float = 0
    target_kg: float = 0.0
    thickness_mm: float = 0.0   # only for Tấm phẳng display

@dataclass
class Placed:
    cargo_idx: int
    number: int
    x: float
    y: float
    z: float
    lx: float
    ly: float
    lz: float
    count: int = 1      # > 1 for grouped thin products


# ═══════════════════════════════════════════════════════════════
#  3. GEOMETRY HELPERS
# ═══════════════════════════════════════════════════════════════

def get_dims(c):
    if c.kind == "Cuộn tròn":
        d, h = c.diameter, c.height
        if c.orientation == "Đứng":     return (d, d, h)
        if c.orientation == "Nằm dọc":  return (h, d, d)
        return (d, h, d)
    return c.dims

def intersects(a, b):
    return not (a.x + a.lx <= b.x + EPS or b.x + b.lx <= a.x + EPS or
                a.y + a.ly <= b.y + EPS or b.y + b.ly <= a.y + EPS or
                a.z + a.lz <= b.z + EPS or b.z + b.lz <= a.z + EPS)

def inside(p, L, W, H):
    return (p.x >= -EPS and p.y >= -EPS and p.z >= -EPS and
            p.x + p.lx <= L + EPS and p.y + p.ly <= W + EPS and p.z + p.lz <= H + EPS)

def is_thin(dims):
    """Thin = any dimension < 20 mm or aspect ratio > 50:1."""
    mn, mx = min(dims), max(dims)
    return mn < 0.02 or (mx / max(mn, 1e-9) > 50)


# ═══════════════════════════════════════════════════════════════
#  4. GRID BREAKDOWN (bảng chi tiết ngang × cao × dài)
# ═══════════════════════════════════════════════════════════════

def grid_breakdown(dims, truck, qty, kg_each, payload_budget):
    """Compute how many units fit in each axis direction."""
    dx, dy, dz = dims
    L, W, H = truck
    nx = int(math.floor((L + EPS) / dx)) if dx > EPS else 0
    ny = int(math.floor((W + EPS) / dy)) if dy > EPS else 0
    nz = int(math.floor((H + EPS) / dz)) if dz > EPS else 0
    by_vol = nx * ny * nz
    by_wt  = int(math.floor((payload_budget + EPS) / kg_each)) if kg_each > EPS else 0
    actual = min(qty, by_vol, by_wt)
    return dict(nx=nx, ny=ny, nz=nz,
                by_vol=by_vol, by_wt=by_wt,
                actual=actual, kg_total=actual * kg_each)


# ═══════════════════════════════════════════════════════════════
#  5. PACKING ALGORITHM
# ═══════════════════════════════════════════════════════════════

def _candidates(placed, d, truck, mode):
    L, W, H = truck
    a, b, c = d
    xs, ys, zs = {0.0}, {0.0}, {0.0}
    for p in placed:
        xs.add(round(p.x + p.lx, 6))
        ys.add(round(p.y + p.ly, 6))
        zs.add(round(p.z + p.lz, 6))
    pts = [(x, y, z) for z in zs for y in ys for x in xs
           if x + a <= L + EPS and y + b <= W + EPS and z + c <= H + EPS]
    if mode == "Ưu tiên tải nặng":
        pts.sort(key=lambda q: (q[1], q[2], q[0]))
    elif mode == "Ưu tiên hàng lớn":
        pts.sort(key=lambda q: (q[0], q[2], q[1]))
    else:
        pts.sort(key=lambda q: (q[2], q[0], q[1]))
    return pts

def _place_one(placed, d, truck, mode):
    a, b, c = d
    for x, y, z in _candidates(placed, d, truck, mode):
        p = Placed(-1, -1, x, y, z, a, b, c)
        if inside(p, *truck) and all(not intersects(p, q) for q in placed):
            return p
    return None


def _pack_thin_bulk(idx, cargo, truck, placed, budget):
    """Grid‑pack thin products in columns — one Placed per column."""
    d = get_dims(cargo)
    L, W, H = truck
    dx, dy, dz = d

    max_by_wt = int(math.floor((budget + EPS) / max(cargo.kg, EPS)))
    remain = min(cargo.qty, max_by_wt)
    if remain <= 0:
        return [], 0, 0.0

    nx = int(math.floor((L + EPS) / dx)) if dx > EPS else 0
    ny = int(math.floor((W + EPS) / dy)) if dy > EPS else 0

    new_placed = []
    total = 0

    for ix in range(nx):
        for iy in range(ny):
            if total >= remain:
                break
            x0, y0 = ix * dx, iy * dy
            # Find lowest available z at this column
            col_z = 0.0
            for p in placed:
                if not (x0 + dx <= p.x + EPS or p.x + p.lx <= x0 + EPS or
                        y0 + dy <= p.y + EPS or p.y + p.ly <= y0 + EPS):
                    col_z = max(col_z, p.z + p.lz)
            avail = H - col_z
            if avail < dz - EPS:
                continue
            n_stack = min(int(math.floor((avail + EPS) / dz)), remain - total)
            if n_stack <= 0:
                continue
            new_placed.append(Placed(
                cargo_idx=idx, number=total + 1,
                x=x0, y=y0, z=col_z,
                lx=dx, ly=dy, lz=n_stack * dz,
                count=n_stack
            ))
            total += n_stack
        if total >= remain:
            break

    return new_placed, total, total * cargo.kg


def pack(cargos, truck, payload, mode):
    """Pack with shared truck‑weight budget."""
    order = list(range(len(cargos)))
    if mode == "Ưu tiên tải nặng":
        order.sort(key=lambda i: (-cargos[i].kg, -cargos[i].priority))
    elif mode == "Ưu tiên hàng lớn":
        order.sort(key=lambda i: (
            -(get_dims(cargos[i])[0] * get_dims(cargos[i])[1] * get_dims(cargos[i])[2]),
            -cargos[i].priority))
    else:
        order.sort(key=lambda i: (-cargos[i].priority, -cargos[i].kg))

    caps = []
    for c in cargos:
        t = getattr(c, "target_kg", 0.0)
        caps.append(min(c.qty, int(math.floor((t + EPS) / c.kg))) if t > EPS else c.qty)

    placed = []
    loaded = [0] * len(cargos)
    weight = 0.0

    target_order = [i for i in order if getattr(cargos[i], "target_kg", 0.0) > EPS]
    free_order   = [i for i in order if getattr(cargos[i], "target_kg", 0.0) <= EPS]

    def try_load(i):
        nonlocal weight
        c = cargos[i]
        if loaded[i] >= caps[i] or weight + c.kg > payload + EPS:
            return False
        p = _place_one(placed, get_dims(c), truck, mode)
        if p is None:
            return False
        p.cargo_idx = i
        p.number = loaded[i] + 1
        placed.append(p)
        loaded[i] += 1
        weight += c.kg
        return True

    def try_thin(i):
        nonlocal weight
        c = cargos[i]
        rem = caps[i] - loaded[i]
        if rem <= 0:
            return False
        tmp = Cargo(c.name, c.kind, rem, c.kg, c.priority, c.orientation,
                    c.dims, c.diameter, c.height, c.target_kg, c.thickness_mm)
        np_, cnt, w = _pack_thin_bulk(i, tmp, truck, placed, payload - weight)
        if cnt <= 0:
            return False
        placed.extend(np_)
        loaded[i] += cnt
        weight += w
        return True

    # ── Phase 1: target products ──
    for i in target_order:
        if is_thin(get_dims(cargos[i])):
            try_thin(i)
        else:
            while try_load(i):
                pass

    # ── Phase 2: free products ──
    progress = True
    while progress and weight < payload - EPS:
        progress = False
        for i in free_order:
            if is_thin(get_dims(cargos[i])):
                if loaded[i] < caps[i] and try_thin(i):
                    progress = True
            else:
                if try_load(i):
                    progress = True

    # ── Phase 3: leftover ──
    if weight < payload - EPS:
        progress = True
        while progress:
            progress = False
            for i in target_order:
                if loaded[i] < caps[i]:
                    if is_thin(get_dims(cargos[i])):
                        if try_thin(i):
                            progress = True
                    elif try_load(i):
                        progress = True

    return placed, loaded, weight


# ═══════════════════════════════════════════════════════════════
#  6. METRICS
# ═══════════════════════════════════════════════════════════════

def metrics(cargos, placed, loaded, weight, payload, L, W, H):
    done = sum(loaded)
    vol  = sum(p.lx * p.ly * p.lz for p in placed)
    if weight > EPS:
        cx = sum((p.x + p.lx / 2) * cargos[p.cargo_idx].kg * getattr(p, "count", 1)
                 for p in placed) / weight
        cy = sum((p.y + p.ly / 2) * cargos[p.cargo_idx].kg * getattr(p, "count", 1)
                 for p in placed) / weight
    else:
        cx, cy = L / 2, W / 2
    return dict(
        done=done, weight=weight,
        util=weight / max(payload, 1),
        fill=vol / max(L * W * H, 1e-9),
        cx=cx, cy=cy,
        long=abs(cx - L / 2) / (L / 2) if L > EPS else 0,
        lat=abs(cy - W / 2) / (W / 2) if W > EPS else 0,
    )

def make_plan(cargos, truck, payload, mode):
    p, l, w = pack(cargos, truck, payload, mode)
    return {"placed": p, "loaded": l, "weight": w,
            "m": metrics(cargos, p, l, w, payload, *truck), "cargos": cargos}


# ═══════════════════════════════════════════════════════════════
#  7. 3‑D VISUALIZATION
# ═══════════════════════════════════════════════════════════════

COLORS = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
    "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
    "#F0B27A", "#82E0AA", "#F1948A", "#AED6F1", "#D2B4DE",
]

def _boxmesh(x, y, z, a, b, c):
    X = [x, x+a, x+a, x,   x, x+a, x+a, x  ]
    Y = [y, y,   y+b, y+b, y, y,   y+b, y+b]
    Z = [z, z,   z,   z,   z+c,z+c,z+c, z+c]
    I = [0,0,0,1,1,2,4,4,5,3,3,6]
    J = [1,2,4,2,5,6,5,6,7,0,4,7]
    K = [2,3,5,3,6,7,1,7,6,4,7,3]
    return X, Y, Z, I, J, K

def _cylinder(cx, cy, z, r, h, n=14):
    v = []
    for zz in (z, z + h):
        for k in range(n):
            a = 2 * math.pi * k / n
            v.append((cx + r * math.cos(a), cy + r * math.sin(a), zz))
    bc = len(v); v.append((cx, cy, z))
    tc = len(v); v.append((cx, cy, z + h))
    I, J, K = [], [], []
    for k in range(n):
        q = (k + 1) % n
        I += [k, q, bc, tc]
        J += [q, n + q, q, n + k]
        K += [n + k, n + k, k, n + q]
    xs = [v[i][0] for i in range(len(v))]
    ys = [v[i][1] for i in range(len(v))]
    zs = [v[i][2] for i in range(len(v))]
    return xs, ys, zs, I, J, K

def fig3d(L, W, H, cargos, placed, key_suffix=""):
    fig = go.Figure()
    # Floor
    fig.add_trace(go.Mesh3d(
        x=[0, L, L, 0], y=[0, 0, W, W], z=[0, 0, 0, 0],
        i=[0, 0], j=[1, 2], k=[2, 3],
        opacity=0.08, color="#888", hoverinfo="skip"))

    for p in placed:
        c = cargos[p.cargo_idx]
        color = COLORS[p.cargo_idx % len(COLORS)]
        cnt = getattr(p, "count", 1)
        lbl = f"<b>{c.name}"
        if cnt > 1:
            lbl += f" (×{cnt})"
        lbl += f"</b><br>{c.orientation}<br>{c.kg:.2f} kg/đv"
        if cnt > 1:
            lbl += f"<br>Tổng: {cnt * c.kg:,.1f} kg"
        lbl += f"<br>Vị trí ({p.x:.3f}, {p.y:.3f}, {p.z:.3f})"

        if c.kind == "Cuộn tròn" and c.orientation == "Đứng":
            X, Y, Z, I, J, K = _cylinder(
                p.x + c.diameter / 2, p.y + c.diameter / 2, p.z,
                c.diameter / 2, p.lz)
        else:
            X, Y, Z, I, J, K = _boxmesh(p.x, p.y, p.z, p.lx, p.ly, p.lz)

        fig.add_trace(go.Mesh3d(
            x=X, y=Y, z=Z, i=I, j=J, k=K,
            opacity=0.78, color=color, showlegend=False,
            hovertemplate=lbl + "<extra></extra>"))

    # Truck edges
    edges = [
        ((0,0,0),(L,0,0)),((0,W,0),(L,W,0)),((0,0,0),(0,W,0)),((L,0,0),(L,W,0)),
        ((0,0,H),(L,0,H)),((0,W,H),(L,W,H)),((0,0,H),(0,W,H)),((L,0,H),(L,W,H)),
        ((0,0,0),(0,0,H)),((L,0,0),(L,0,H)),((0,W,0),(0,W,H)),((L,W,0),(L,W,H)),
    ]
    for a, b in edges:
        fig.add_trace(go.Scatter3d(
            x=[a[0], b[0]], y=[a[1], b[1]], z=[a[2], b[2]],
            mode="lines", line=dict(width=4, color="#333"),
            showlegend=False, hoverinfo="skip"))

    fig.update_layout(
        scene=dict(
            xaxis_title="X – Dài (m)",
            yaxis_title="Y – Rộng (m)",
            zaxis_title="Z – Cao (m)",
            aspectmode="data"),
        height=680,
        margin=dict(l=0, r=0, t=5, b=0))
    return fig


# ═══════════════════════════════════════════════════════════════
#  8. STREAMLIT UI
# ═══════════════════════════════════════════════════════════════

st.title("🚚 Truck Loading Optimizer V7")
st.caption(
    "Hỗ trợ **tấm mỏng** (≥ 0.4 mm), **cuộn tròn**, **hình hộp** · "
    "Chọn nhanh loại xe hoặc tùy chỉnh · "
    "Chi tiết cách xếp: **ngang × cao × dài**."
)

# ─────────────────── SIDEBAR ────────────────────
with st.sidebar:
    st.header("🚛 CHỌN LOẠI XE")

    presets = load_all_presets()
    options = list(presets.keys()) + ["✏️ Tùy chỉnh"]
    default_idx = options.index("Xe tải 8T") if "Xe tải 8T" in options else 0
    sel_vehicle = st.selectbox("Loại xe", options, index=default_idx, key="vsel")

    # ── Resolve defaults ──
    if sel_vehicle == "✏️ Tùy chỉnh":
        vkey = "custom"
        dL, dW, dwall, dpay, dHmax = 6.80, 2.20, 1.60, 8200.0, 2.40
    else:
        vkey = re.sub(r"[^a-zA-Z0-9]", "_", sel_vehicle)
        sp = presets[sel_vehicle]
        dL, dW, dwall, dpay, dHmax = sp["L"], sp["W"], sp["wall"], sp["payload"], sp["H_max"]

    # ── Sync defaults when vehicle changes ──
    if st.session_state.get("_prev_vkey") != vkey:
        st.session_state[f"L_{vkey}"]    = float(dL)
        st.session_state[f"W_{vkey}"]    = float(dW)
        st.session_state[f"wall_{vkey}"] = float(dwall)
        st.session_state[f"pl_{vkey}"]   = float(dpay)
        st.session_state[f"Hm_{vkey}"]   = float(max(dwall, dHmax))
        st.session_state["_prev_vkey"]   = vkey

    # When keys already exist in session_state (set by sync above or
    # by a previous render), omit the value= argument to avoid the
    # Streamlit "default vs session-state" warning.
    _has = lambda k: k in st.session_state
    L       = st.number_input("Dài thùng (m)",      0.1, 50.0,    step=0.1,  format="%.2f", key=f"L_{vkey}")    if _has(f"L_{vkey}")    else st.number_input("Dài thùng (m)",      0.1, 50.0,    value=float(dL),    step=0.1,  format="%.2f", key=f"L_{vkey}")
    W       = st.number_input("Rộng thùng (m)",     0.1, 10.0,    step=0.1,  format="%.2f", key=f"W_{vkey}")    if _has(f"W_{vkey}")    else st.number_input("Rộng thùng (m)",     0.1, 10.0,    value=float(dW),    step=0.1,  format="%.2f", key=f"W_{vkey}")
    wall    = st.number_input("Chiều cao bửng (m)", 0.1,  5.0,    step=0.1,  format="%.2f", key=f"wall_{vkey}") if _has(f"wall_{vkey}") else st.number_input("Chiều cao bửng (m)", 0.1,  5.0,    value=float(dwall), step=0.1,  format="%.2f", key=f"wall_{vkey}")
    payload = st.number_input("Tải trọng (kg)",     1.0, 100000., step=100.,                key=f"pl_{vkey}")   if _has(f"pl_{vkey}")   else st.number_input("Tải trọng (kg)",     1.0, 100000., value=float(dpay),  step=100.,                key=f"pl_{vkey}")
    over    = st.checkbox("Cho phép vượt bửng", True, key=f"over_{vkey}")
    if over:
        H   = st.number_input("Cao xếp tối đa (m)", wall, 10.0, step=0.1, format="%.2f", key=f"Hm_{vkey}") if _has(f"Hm_{vkey}") else st.number_input("Cao xếp tối đa (m)", wall, 10.0, value=float(max(wall, dHmax)), step=0.1, format="%.2f", key=f"Hm_{vkey}")
    else:
        H   = wall

    # ── Save / Delete preset ──
    if sel_vehicle == "✏️ Tùy chỉnh":
        st.divider()
        st.markdown("**💾 Lưu thành xe mới**")
        new_name = st.text_input("Tên xe", "", key="new_vname")
        if st.button("💾 Lưu xe", disabled=not new_name.strip(), key="save_v"):
            save_user_preset(new_name.strip(), {
                "L": L, "W": W, "wall": wall, "H_max": H, "payload": payload
            })
            st.success(f"✅ Đã lưu '{new_name.strip()}'!")
            st.rerun()
    elif sel_vehicle not in DEFAULT_VEHICLES:
        if st.button("🗑️ Xóa preset này", key="del_v"):
            delete_user_preset(sel_vehicle)
            st.success("Đã xóa!")
            st.rerun()

    # ── Show all presets table ──
    with st.expander("📋 Bảng thông số tất cả xe"):
        rows = []
        for vname, vspec in presets.items():
            rows.append({
                "Xe": vname,
                "Dài (m)": vspec["L"],
                "Rộng (m)": vspec["W"],
                "Bửng (m)": vspec["wall"],
                "Cao max (m)": vspec["H_max"],
                "Tải (kg)": vspec["payload"],
            })
        st.dataframe(rows, hide_index=True, width=380)

    st.divider()
    st.markdown(f"📐 **Thùng:** {L:.2f} × {W:.2f} × {H:.2f} m")
    st.markdown(f"📦 **Thể tích:** {L * W * H:,.2f} m³")
    st.markdown(f"⚖️ **Tải:** {payload:,.0f} kg")
    n = st.selectbox("Số loại hàng", list(range(1, 7)), index=2, key="n_cargo")


# ─────────────────── PRODUCT INPUT ────────────────────
st.subheader("📦 DỮ LIỆU HÀNG")
tabs = st.tabs([f"Hàng {i + 1}" for i in range(n)])
cargos = []

for i in range(n):
    with tabs[i]:
        col_a, col_b = st.columns(2)
        with col_a:
            name = st.text_input("Tên hàng", f"Hàng {i + 1}", key=f"nm{i}")
            kind = st.selectbox("Dạng hàng", ["Cuộn tròn", "Hình hộp", "Tấm phẳng"], key=f"kd{i}")
            qty = int(st.number_input("Số lượng cần chở", 1, 1000000, 100, key=f"qt{i}"))
            kg  = float(st.number_input("Kg / đơn vị", 0.001, 50000.0, 60.0, key=f"kg{i}"))
            target_kg = float(st.number_input(
                "Tải mong muốn (kg) — 0 = tự phân bổ",
                0.0, 100000.0, 0.0, 100.0, key=f"tg{i}"
            ))
        with col_b:
            pri = int(st.selectbox("Ưu tiên", [3, 2, 1], index=0, key=f"pr{i}"))

        # ── Cuộn tròn ──
        if kind == "Cuộn tròn":
            c1, c2 = st.columns(2)
            with c1:
                diam = float(st.number_input(
                    "Đường kính (m)", 0.001, 10.0, 0.4, 0.01,
                    format="%.3f", key=f"di{i}"))
            with c2:
                ht = float(st.number_input(
                    "Chiều dài/cao cuộn (m)", 0.001, 10.0, 1.2, 0.05,
                    format="%.3f", key=f"hi{i}"))
            ori = st.radio("Tư thế", ["Đứng", "Nằm dọc", "Nằm ngang"],
                           horizontal=True, key=f"or{i}")
            ds = (diam, diam, ht)
            cargos.append(Cargo(name, kind, qty, kg, pri, ori, ds, diam, ht, target_kg))

        # ── Tấm phẳng (≥ 0.4 mm) ──
        elif kind == "Tấm phẳng":
            st.info("💡 Dành cho tôn, thép tấm, panel … rất mỏng. Nhập độ dày theo **mm**.")
            c1, c2, c3 = st.columns(3)
            with c1:
                tx = float(st.number_input("Dài tấm (m)", 0.01, 20.0, 1.2, 0.05, key=f"tx{i}"))
            with c2:
                ty = float(st.number_input("Rộng tấm (m)", 0.01, 20.0, 0.6, 0.05, key=f"ty{i}"))
            with c3:
                tz_mm = float(st.number_input(
                    "Độ dày (mm)", 0.1, 500.0, 4.0, 0.1,
                    format="%.1f", key=f"tz{i}"))
            tz = tz_mm / 1000.0  # → mét

            ori_opts = {
                "Nằm (chồng lên)":    (tx, ty, tz),
                "Đứng dọc xe":        (tz, ty, tx),
                "Đứng ngang xe":      (tx, tz, ty),
            }
            ori_sel = st.radio("Tư thế xếp", list(ori_opts.keys()),
                               horizontal=True, key=f"or{i}")
            ds = ori_opts[ori_sel]
            ori_label = f"{ori_sel} ({tz_mm:.1f} mm)"

            g = grid_breakdown(ds, (L, W, H), qty, kg, payload)
            st.caption(
                f"📏 X={ds[0]:.4f} × Y={ds[1]:.4f} × Z={ds[2]:.4f} m  →  "
                f"Dài {g['nx']} × Ngang {g['ny']} × Cao {g['nz']} = "
                f"**{g['by_vol']:,}** tấm (thể tích), "
                f"**{g['by_wt']:,}** tấm (tải trọng)")
            cargos.append(Cargo(name, kind, qty, kg, pri, ori_label, ds,
                                0, 0, target_kg, tz_mm))

        # ── Hình hộp ──
        else:
            c1, c2, c3 = st.columns(3)
            with c1:
                bx = float(st.number_input("Dài (m)", 0.001, 20.0, 1.2, 0.05, key=f"bx{i}"))
            with c2:
                by = float(st.number_input("Rộng (m)", 0.001, 20.0, 0.4, 0.05, key=f"by{i}"))
            with c3:
                bz = float(st.number_input("Cao (m)", 0.001, 20.0, 0.4, 0.05, key=f"bz{i}"))
            perms = list(dict.fromkeys(itertools.permutations((bx, by, bz))))
            labels = {p: f"{p[0]:.3f} X × {p[1]:.3f} Y × {p[2]:.3f} Z" for p in perms}
            sel_perm = st.selectbox("Tư thế X × Y × Z", perms,
                                    format_func=lambda p: labels[p], key=f"or{i}")
            ds = sel_perm
            ori_label = labels[sel_perm]
            cargos.append(Cargo(name, kind, qty, kg, pri, ori_label, ds, 0, bz, target_kg))


# ─────────────────── OPTIMISE BUTTON ────────────────────
st.divider()
if st.button("⚡ TÌM 3 PHƯƠNG ÁN TỐI ƯU", type="primary", use_container_width=True):
    truck = (L, W, H)
    strategies = [
        ("PA 1 — Ưu tiên tải nặng",        "Ưu tiên tải nặng"),
        ("PA 2 — Ưu tiên hàng lớn",        "Ưu tiên hàng lớn"),
        ("PA 3 — Cân bằng theo ưu tiên",   "Cân bằng"),
    ]
    with st.spinner("Đang tính toán …"):
        st.session_state.plans = [
            (nm, make_plan(cargos, truck, payload, md)) for nm, md in strategies
        ]
    st.session_state.cargos = cargos
    st.session_state.truck  = (L, W, H, wall, payload)


# ─────────────────── RESULTS ────────────────────
if "plans" in st.session_state:
    st.subheader("🏆 3 PHƯƠNG ÁN")
    plan_tabs = st.tabs([x[0] for x in st.session_state.plans])

    for pi, (title, plan) in enumerate(st.session_state.plans):
        with plan_tabs[pi]:
            m = plan["m"]
            # ── KPIs ──
            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Số đơn vị", f"{m['done']:,}")
            k2.metric("Tải", f"{m['weight']:,.0f} kg")
            k3.metric("Dùng tải", f"{m['util'] * 100:.1f}%")
            k4.metric("Lấp đầy", f"{m['fill'] * 100:.1f}%")
            if m["weight"] <= payload + EPS:
                st.success("✅ Không vượt tải.")
            else:
                st.error("❌ Vượt tải!")

            # ════════════════════════════════════════════
            #  BẢNG CHI TIẾT CÁCH XẾP (ngang × cao × dài)
            # ════════════════════════════════════════════
            st.markdown("#### 📊 CHI TIẾT CÁCH XẾP — Dài × Ngang × Cao")
            st.caption(
                "Bảng lý thuyết: giả sử toàn bộ thùng xe chỉ chở **1 loại hàng**. "
                "Số thực xếp có thể khác khi chở hỗn hợp."
            )

            bd_rows = []
            for ci, c in enumerate(cargos):
                d = get_dims(c)
                gb = grid_breakdown(d, (L, W, H), c.qty, c.kg, payload)
                bd_rows.append({
                    "Hàng":           c.name,
                    "Kích thước":     f"{d[0]:.4f} × {d[1]:.4f} × {d[2]:.4f} m",
                    "Dài (X)":        f"⌊{L:.2f}/{d[0]:.4f}⌋ = {gb['nx']}",
                    "Ngang (Y)":      f"⌊{W:.2f}/{d[1]:.4f}⌋ = {gb['ny']}",
                    "Cao (Z)":        f"⌊{H:.2f}/{d[2]:.4f}⌋ = {gb['nz']}",
                    "Max thể tích":   f"{gb['nx']}×{gb['ny']}×{gb['nz']} = {gb['by_vol']:,}",
                    "Max tải trọng":  f"⌊{payload:,.0f}/{c.kg:.2f}⌋ = {gb['by_wt']:,}",
                    "Nhu cầu":        f"{c.qty:,}",
                    "Thực xếp (PA)":  f"{plan['loaded'][ci]:,}",
                    "Tổng kg":        f"{plan['loaded'][ci] * c.kg:,.1f}",
                })
            st.dataframe(bd_rows, use_container_width=True, hide_index=True)

            # ── Weight allocation ──
            st.markdown("#### 🧠 Phân bổ tải")
            target_total = sum(getattr(c, "target_kg", 0.0) for c in cargos)
            remaining = max(payload - plan["weight"], 0.0)
            b1, b2, b3 = st.columns(3)
            b1.metric("Tải xe", f"{payload:,.0f} kg")
            b2.metric("Đã xếp", f"{plan['weight']:,.0f} kg")
            b3.metric("Còn lại", f"{remaining:,.0f} kg")

            # ── Manual edit ──
            st.markdown("#### 🛠️ Chỉnh thủ công")
            st.caption("Giảm số lượng / đổi tư thế / đặt mục tiêu kg. Tổng tải luôn bị chặn theo tải xe.")
            edits = []
            for ci, c in enumerate(cargos):
                cc1, cc2, cc3 = st.columns([1.3, 1, 1])
                with cc1:
                    q = st.number_input(
                        f"{c.name} — SL", 0, c.qty, plan["loaded"][ci],
                        key=f"q{pi}_{ci}")
                with cc2:
                    if c.kind == "Cuộn tròn":
                        opts = ["Đứng", "Nằm dọc", "Nằm ngang"]
                        ori = st.selectbox(
                            f"{c.name} — tư thế", opts,
                            index=opts.index(c.orientation) if c.orientation in opts else 0,
                            key=f"o{pi}_{ci}")
                    elif c.kind == "Tấm phẳng":
                        st.text_input(
                            f"{c.name} — tư thế", c.orientation,
                            disabled=True, key=f"o{pi}_{ci}")
                        ori = c.orientation
                    else:
                        perms = list(dict.fromkeys(itertools.permutations(c.dims)))
                        ori = st.selectbox(
                            f"{c.name} — X/Y/Z", perms,
                            format_func=lambda p: f"{p[0]:.3f}×{p[1]:.3f}×{p[2]:.3f}",
                            key=f"o{pi}_{ci}")
                with cc3:
                    tgt = st.number_input(
                        f"{c.name} — mục tiêu kg",
                        0.0, payload, float(getattr(c, "target_kg", 0.0)),
                        100.0, key=f"t{pi}_{ci}")

                if c.kind == "Cuộn tròn":
                    edits.append(Cargo(c.name, c.kind, int(q), c.kg, c.priority,
                                       ori, c.dims, c.diameter, c.height, tgt))
                elif c.kind == "Tấm phẳng":
                    edits.append(Cargo(c.name, c.kind, int(q), c.kg, c.priority,
                                       ori, c.dims, 0, 0, tgt, c.thickness_mm))
                else:
                    new_dims = ori if isinstance(ori, tuple) else c.dims
                    new_ori  = (f"{ori[0]:.3f}×{ori[1]:.3f}×{ori[2]:.3f}"
                                if isinstance(ori, tuple) else str(ori))
                    edits.append(Cargo(c.name, c.kind, int(q), c.kg, c.priority,
                                       new_ori, new_dims, 0, c.height, tgt))

            if target_total > payload:
                st.warning(
                    f"⚠️ Tổng tải mong muốn {target_total:,.0f} kg "
                    f"vượt tải xe {payload:,.0f} kg. V7 sẽ tự cắt phần vượt.")

            if st.button("🔄 Tính lại phương án này", key=f"re{pi}"):
                mode = ["Ưu tiên tải nặng", "Ưu tiên hàng lớn", "Cân bằng"][pi]
                st.session_state.plans[pi] = (
                    title, make_plan(edits, (L, W, H), payload, mode))
                st.rerun()

            # ── 3D viz ──
            left, right = st.columns([2.3, 1])
            with left:
                st.plotly_chart(
                    fig3d(L, W, H, plan.get("cargos", cargos), plan["placed"]),
                    use_container_width=True, key=f"plot3d_{pi}")
            with right:
                st.markdown("#### 📍 Trọng tâm")
                st.write(f"X = {m['cx']:.2f} m / giữa xe {L / 2:.2f} m")
                st.write(f"Y = {m['cy']:.2f} m / giữa xe {W / 2:.2f} m")
                st.write(f"Lệch dọc: {m['long'] * 100:.1f}%")
                st.write(f"Lệch ngang: {m['lat'] * 100:.1f}%")

            # ── Summary table ──
            st.markdown("#### 📋 Tổng hợp")
            rows = []
            for ci, c in enumerate(cargos):
                rows.append({
                    "Hàng":      c.name,
                    "Dạng":      c.kind,
                    "Nhu cầu":   c.qty,
                    "Đã xếp":   plan["loaded"][ci],
                    "Chưa xếp": max(c.qty - plan["loaded"][ci], 0),
                    "Kg/đv":     c.kg,
                    "Tổng kg":   plan["loaded"][ci] * c.kg,
                    "Mục tiêu":  getattr(c, "target_kg", 0.0),
                    "Tư thế":    c.orientation,
                })
            st.dataframe(rows, use_container_width=True, hide_index=True)

else:
    st.info(
        "Nhập thông tin xe + hàng hóa rồi nhấn **⚡ Tối ưu**. "
        "Hỗ trợ: **Cuộn tròn**, **Hình hộp**, **Tấm phẳng** (≥ 0.4 mm)."
    )

st.divider()
st.caption(
    "V7 · Chọn nhanh loại xe từ preset · "
    "Hỗ trợ tấm mỏng (4 mm+) với xếp chồng tối ưu · "
    "Bảng chi tiết ngang × cao × dài · "
    "Tải xe = ngân sách chung. "
    "⚠️ Cần kiểm tra tải trục, chằng buộc và an toàn thực tế trước khi vận hành."
)
