"""
MCP Transports Implementation: Standard I/O and HTTP / SSE.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

try:
    from .constants import SERVER_NAME, SERVER_VERSION
    from .fastmcp_adapter import HAS_FASTMCP
    from .protocol import process_json_rpc
    from .store import ModelStore
except ImportError:
    from constants import SERVER_NAME, SERVER_VERSION
    from fastmcp_adapter import HAS_FASTMCP
    from protocol import process_json_rpc
    from store import ModelStore


def run_stdio(store: ModelStore) -> None:
    """Runs the MCP server over standard I/O."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
            resp = process_json_rpc(store, msg)
            if resp is not None:
                sys.stdout.write(json.dumps(resp) + "\n")
                sys.stdout.flush()
        except Exception as err:
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32700, "message": f"Parse error: {str(err)}"},
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()


def run_sse(store: ModelStore, port: int = 8003, host: str = "0.0.0.0") -> None:
    """Runs the MCP server over HTTP / SSE transport."""

    class MCPHttpHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path in ("/health", "/", "/healthz"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({
                        "status": "ok",
                        "service": SERVER_NAME,
                        "version": SERVER_VERSION,
                        "fastmcp": HAS_FASTMCP,
                    }).encode("utf-8")
                )
                return
            self.send_response(404)
            self.end_headers()

        def do_POST(self):
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len).decode("utf-8")
            try:
                msg = json.loads(body)
                resp = process_json_rpc(store, msg)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                if resp is not None:
                    self.wfile.write(json.dumps(resp).encode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

        def log_message(self, format, *args):
            # Suppress default noisy http log
            pass

    httpd = HTTPServer((host, port), MCPHttpHandler)
    httpd.serve_forever()
