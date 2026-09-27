"""Vercel Python Function for the unchanged V7 loading algorithm."""

import json
import logging
from http.server import BaseHTTPRequestHandler

from server import plan_response


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 1 <= size <= 100_000:
                raise ValueError("Dữ liệu gửi lên quá lớn hoặc rỗng.")
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("Dữ liệu gửi lên không hợp lệ.")
            self.send_json(plan_response(body))
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, 400)
        except Exception:
            logging.exception("V7 plan calculation failed")
            self.send_json({"error": "Bộ tính tải gặp lỗi. Vui lòng thử lại."}, 500)

    def send_json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
