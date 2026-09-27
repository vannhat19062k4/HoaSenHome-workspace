"""V7 preset and packing engine copied from the supplied Streamlit app."""
import math, itertools, json, os, re
from dataclasses import dataclass, field

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

