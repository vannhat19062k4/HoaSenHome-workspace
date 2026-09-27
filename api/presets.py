"""Vercel Python Function exposing V7 defaults; custom vehicles live in the browser."""

import json
from http.server import BaseHTTPRequestHandler

from truck.core import DEFAULT_VEHICLES


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        data = json.dumps({
            "presets": DEFAULT_VEHICLES,
            "defaults": list(DEFAULT_VEHICLES),
            "storage": "browser",
        }, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)
