"""One local web server for the Hoa Sen Home tool hub and its V7 packing API."""

from __future__ import annotations

import json
import math
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from truck.core import (
    Cargo, DEFAULT_VEHICLES, delete_user_preset, get_dims, grid_breakdown,
    load_all_presets, make_plan, save_user_preset,
)

ROOT = Path(__file__).resolve().parent
MODES = ("Ưu tiên tải nặng", "Ưu tiên hàng lớn", "Cân bằng")
TITLES = ("PA 1 — Ưu tiên tải nặng", "PA 2 — Ưu tiên hàng lớn", "PA 3 — Cân bằng theo ưu tiên")


def number(value, label, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label}: cần nhập số hợp lệ.")
    if value < minimum or value > maximum:
        raise ValueError(f"{label}: cần nằm trong khoảng {minimum}–{maximum}.")
    return float(value)


def integer(value, label, minimum, maximum):
    result = number(value, label, minimum, maximum)
    if not result.is_integer():
        raise ValueError(f"{label}: cần nhập số nguyên.")
    return int(result)


def parse_request(body):
    truck_data = body.get("truck")
    if not isinstance(truck_data, dict):
        raise ValueError("Thiếu thông tin xe.")
    length = number(truck_data.get("length"), "Dài thùng", 0.1, 50)
    width = number(truck_data.get("width"), "Rộng thùng", 0.1, 10)
    wall = number(truck_data.get("wall"), "Chiều cao bửng", 0.1, 5)
    height = number(truck_data.get("height"), "Chiều cao xếp", wall, 10)
    payload = number(truck_data.get("payload"), "Tải trọng", 1, 100000)
    raw_cargos = body.get("cargos")
    if not isinstance(raw_cargos, list) or not 1 <= len(raw_cargos) <= 6:
        raise ValueError("Cần nhập từ 1 đến 6 loại hàng.")
    cargos = []
    for index, item in enumerate(raw_cargos, 1):
        if not isinstance(item, dict):
            raise ValueError(f"Hàng {index}: dữ liệu không hợp lệ.")
        name = str(item.get("name", "")).strip()[:100]
        if not name:
            raise ValueError(f"Hàng {index}: cần nhập tên.")
        kind = item.get("kind")
        if kind not in ("Cuộn tròn", "Hình hộp", "Tấm phẳng"):
            raise ValueError(f"Hàng {index}: dạng hàng không hợp lệ.")
        qty = integer(item.get("qty"), f"Hàng {index}: số lượng", 0, 1000000)
        priority = integer(item.get("priority"), f"Hàng {index}: mức ưu tiên", 1, 3)
        kg = number(item.get("kg"), f"Hàng {index}: kg/đơn vị", 0.001, 50000)
        target = number(item.get("target_kg", 0), f"Hàng {index}: tải mong muốn", 0, 100000)
        orientation = item.get("orientation")
        if kind == "Cuộn tròn":
            diameter = number(item.get("diameter"), f"Hàng {index}: đường kính", 0.001, 10)
            roll_height = number(item.get("roll_height"), f"Hàng {index}: chiều dài/cao cuộn", 0.001, 10)
            if orientation not in ("Đứng", "Nằm dọc", "Nằm ngang"):
                raise ValueError(f"Hàng {index}: tư thế không hợp lệ.")
            dimensions = (diameter, diameter, roll_height)
            cargo = Cargo(name, kind, qty, kg, priority, orientation, dimensions, diameter, roll_height, target)
        elif kind == "Tấm phẳng":
            plate_length = number(item.get("plate_length"), f"Hàng {index}: dài tấm", 0.01, 20)
            plate_width = number(item.get("plate_width"), f"Hàng {index}: rộng tấm", 0.01, 20)
            thickness = number(item.get("thickness_mm"), f"Hàng {index}: độ dày", 0.1, 500)
            plate_orientations = {
                "Nằm (chồng lên)": (plate_length, plate_width, thickness / 1000),
                "Đứng dọc xe": (thickness / 1000, plate_width, plate_length),
                "Đứng ngang xe": (plate_length, thickness / 1000, plate_width),
            }
            if orientation not in plate_orientations:
                raise ValueError(f"Hàng {index}: tư thế không hợp lệ.")
            dimensions = plate_orientations[orientation]
            label = f"{orientation} ({thickness:.1f} mm)"
            cargo = Cargo(name, kind, qty, kg, priority, label, dimensions, 0, 0, target, thickness)
        else:
            raw_dimensions = item.get("dimensions")
            if not isinstance(raw_dimensions, list) or len(raw_dimensions) != 3:
                raise ValueError(f"Hàng {index}: kích thước không hợp lệ.")
            dimensions = tuple(number(x, f"Hàng {index}: kích thước", 0.001, 20) for x in raw_dimensions)
            cargo = Cargo(name, kind, qty, kg, priority,
                          f"{dimensions[0]:.3f} X × {dimensions[1]:.3f} Y × {dimensions[2]:.3f} Z",
                          dimensions, 0, dimensions[2], target)
        cargos.append(cargo)
    return (length, width, height), wall, payload, cargos


def serialize_plan(title, mode, cargos, truck, payload):
    result = make_plan(cargos, truck, payload, mode)
    return {
        "title": title,
        "mode": mode,
        "loaded": result["loaded"],
        "weight": result["weight"],
        "metrics": result["m"],
        "placed": [vars(item) for item in result["placed"]],
        "cargos": [vars(item) for item in cargos],
        "breakdown": [grid_breakdown(get_dims(c), truck, c.qty, c.kg, payload) for c in cargos],
    }


def validate_preset(body):
    name = str(body.get("name", "")).strip()[:80]
    if not name:
        raise ValueError("Cần nhập tên xe.")
    if name in DEFAULT_VEHICLES:
        raise ValueError("Tên xe đã thuộc danh sách mặc định.")
    spec = body.get("spec")
    if not isinstance(spec, dict):
        raise ValueError("Thông số xe không hợp lệ.")
    length = number(spec.get("L"), "Dài thùng", 0.1, 50)
    width = number(spec.get("W"), "Rộng thùng", 0.1, 10)
    wall = number(spec.get("wall"), "Chiều cao bửng", 0.1, 5)
    height = number(spec.get("H_max"), "Cao xếp tối đa", wall, 10)
    payload = number(spec.get("payload"), "Tải trọng", 1, 100000)
    return name, {"L": length, "W": width, "wall": wall, "H_max": height, "payload": payload}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/presets":
            self.send_json({"presets": load_all_presets(), "defaults": list(DEFAULT_VEHICLES)})
            return
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path not in ("/api/plan", "/api/presets"):
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 100_000:
                raise ValueError("Dữ liệu gửi lên quá lớn hoặc rỗng.")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Dữ liệu gửi lên không hợp lệ.")
            if path == "/api/presets":
                name, spec = validate_preset(body)
                save_user_preset(name, spec)
                self.send_json({"presets": load_all_presets(), "defaults": list(DEFAULT_VEHICLES)})
                return
            truck, _wall, payload, cargos = parse_request(body)
            mode = body.get("mode")
            if mode is None:
                plans = [serialize_plan(title, strategy, cargos, truck, payload) for title, strategy in zip(TITLES, MODES)]
            elif mode in MODES:
                plans = [serialize_plan(TITLES[MODES.index(mode)], mode, cargos, truck, payload)]
            else:
                raise ValueError("Chiến lược xếp hàng không hợp lệ.")
            self.send_json({"plans": plans})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)

    def do_DELETE(self):
        if urlsplit(self.path).path != "/api/presets":
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(size))
            name = str(body.get("name", ""))
            if not delete_user_preset(name):
                raise ValueError("Không thể xóa xe mặc định hoặc xe không tồn tại.")
            self.send_json({"presets": load_all_presets(), "defaults": list(DEFAULT_VEHICLES)})
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hoa Sen Home tool hub")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        print(f"Mở http://{args.host}:{args.port}/", flush=True)
        server.serve_forever()
