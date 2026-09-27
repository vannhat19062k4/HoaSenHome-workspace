import sys
import unittest
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server import MODES, parse_request, serialize_plan, validate_preset  # noqa: E402
from truck import core  # noqa: E402


class V7ParityTests(unittest.TestCase):
    def test_engine_is_verbatim_from_supplied_v7(self):
        original = (ROOT / "truck" / "original_v7.py").read_text()
        copied = (ROOT / "truck" / "core.py").read_text()
        self.assertEqual(
            copied[copied.index("EPS = 1e-8"):],
            original[original.index("EPS = 1e-8"):original.index("COLORS = [")],
        )

    def test_all_three_strategies_with_roll_box_and_plate(self):
        body = {
            "truck": {"length": 4.8, "width": 2.0, "wall": 0.55, "height": 2.3, "payload": 3490},
            "cargos": [
                {"name": "Cuộn", "kind": "Cuộn tròn", "qty": 8, "kg": 60, "priority": 3, "orientation": "Nằm dọc", "diameter": 0.4, "roll_height": 1.2, "target_kg": 0},
                {"name": "Thùng", "kind": "Hình hộp", "qty": 6, "kg": 80, "priority": 2, "orientation": "", "dimensions": [0.7, 0.5, 0.4], "target_kg": 160},
                {"name": "Tấm", "kind": "Tấm phẳng", "qty": 120, "kg": 4, "priority": 1, "orientation": "Nằm (chồng lên)", "plate_length": 1.2, "plate_width": 0.6, "thickness_mm": 4, "target_kg": 0},
            ],
        }
        truck, wall, payload, cargos = parse_request(body)
        self.assertEqual(wall, 0.55)
        self.assertEqual(cargos[2].dims, (1.2, 0.6, 0.004))
        self.assertEqual(cargos[2].thickness_mm, 4)
        for mode in MODES:
            plan = serialize_plan(mode, mode, cargos, truck, payload)
            self.assertEqual(len(plan["loaded"]), 3)
            self.assertEqual(sum(plan["loaded"]), plan["metrics"]["done"])
            self.assertLessEqual(plan["weight"], payload + core.EPS)
            self.assertEqual(plan["loaded"][1] <= 2, True)  # target 160 kg / 80 kg
            self.assertTrue(all(core.inside(core.Placed(**p), *truck) for p in plan["placed"]))
            self.assertEqual(len(plan["breakdown"]), 3)

    def test_manual_zero_and_six_cargos_are_supported(self):
        cargo = {"name": "Tấm", "kind": "Tấm phẳng", "qty": 0, "kg": 2, "priority": 3, "orientation": "Đứng ngang xe", "plate_length": 1.2, "plate_width": 0.6, "thickness_mm": 0.4, "target_kg": 0}
        body = {"truck": {"length": 6.8, "width": 2.2, "wall": 1.6, "height": 2.4, "payload": 8200}, "cargos": [dict(cargo, name=f"Tấm {i}") for i in range(6)]}
        truck, _, payload, cargos = parse_request(body)
        self.assertEqual(len(cargos), 6)
        self.assertEqual(cargos[0].dims, (1.2, 0.0004, 0.6))
        plan = serialize_plan("test", MODES[0], cargos, truck, payload)
        self.assertEqual(plan["metrics"]["done"], 0)

    def test_preset_values_match_v7_limits(self):
        name, spec = validate_preset({"name": "Xe thử", "spec": {"L": 5, "W": 2, "wall": 1, "H_max": 2, "payload": 4000}})
        self.assertEqual(name, "Xe thử")
        self.assertEqual(spec["payload"], 4000)
        with self.assertRaises(ValueError):
            validate_preset({"name": "Xe tải 8T", "spec": spec})

    def test_bundled_vehicle_presets_match_v7(self):
        html = (ROOT / "truck" / "index.html").read_text()
        match = re.search(r'<script id="default-presets" type="application/json">(.*?)</script>', html)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), core.DEFAULT_VEHICLES)


if __name__ == "__main__":
    unittest.main()
