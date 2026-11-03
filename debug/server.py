"""Debug server for the Spelunkr TV app. Personal LAN use only; stop it after debugging.

  POST /__log     JSON lines from the TV, appended to logs.jsonl
  GET  /__cmd     JS from cmd.js, sent once per change, run by dbg.js on the TV
  GET  /__dbg.js  the logger that the proxy adds to every HTML page
  GET  /__fix.js  ../spelunkr-tv/tvfix.js, also added to every HTML page
  GET  /*         proxy to https://spelunkr.tv with the logger added to HTML

Run: PC_IP=<this PC's LAN IP> python3 server.py

"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = "https://spelunkr.tv"
DROP_HEADERS = {
    "content-security-policy", "content-security-policy-report-only", "x-frame-options",
    "content-encoding", "content-length", "transfer-encoding", "connection",
    "strict-transport-security", "keep-alive",
    # send_response() writes its own Date and Server; two Date headers break the site's /?_clock read.
    "date", "server",
    "etag", "last-modified", "cache-control", "age",
}
INJECT = b'<script src="/__dbg.js"></script><script src="/__fix.js"></script>'


def read(name, default=""):
    try:
        with open(os.path.join(HERE, name), "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return default


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[http] %s %s\n" % (self.address_string(), fmt % args))

    def send(self, status, body, ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.send(204, b"")

    def do_POST(self):
        if not self.path.startswith("/__log"):
            return self.send(404, b"not found")
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n).decode("utf-8", "replace")
        with open(os.path.join(HERE, "logs.jsonl"), "a", encoding="utf-8") as f:
            for line in raw.splitlines():
                if line.strip():
                    f.write(json.dumps({"rx": time.strftime("%H:%M:%S"), "ip": self.client_address[0], "e": line}) + "\n")
                    print("[tv]", line[:400], flush=True)
        self.send(200, b"ok")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path
        if path.startswith("/__cmd"):
            return self.send(200, read("cmd.js").encode(), "application/javascript")
        if path.startswith("/__dbg.js"):
            return self.send(200, read("dbg.js").encode(), "application/javascript")
        if path.startswith("/__fix.js"):
            return self.send(200, read("../spelunkr-tv/tvfix.js").encode(), "application/javascript")
        return self.proxy(path)

    def proxy(self, path):
        headers = {"Accept-Encoding": "identity"}
        # No If-None-Match: a 304 would make the TV reuse a cached page without the injected scripts.
        for h in ("User-Agent", "Accept", "Accept-Language", "Range"):
            if self.headers.get(h):
                headers[h] = self.headers[h]
        req = urllib.request.Request(UPSTREAM + path, headers=headers, method=self.command)
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            status, rheaders, body = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, rheaders, body = e.code, e.headers, e.read()
        except Exception as e:
            return self.send(502, ("proxy error: %s" % e).encode())
        ctype = rheaders.get("Content-Type", "")
        if "text/html" in ctype:
            body = re.sub(rb"<head[^>]*>", lambda m: m.group(0) + INJECT, body, count=1, flags=re.I)
        self.send_response(status)
        for k, v in rheaders.items():
            if k.lower() not in DROP_HEADERS:
                self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


if __name__ == "__main__":
    # Bind to the PC's LAN address only, not 0.0.0.0: /__cmd sends code that the TV page runs.
    host = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PC_IP")
    if not host:
        sys.exit("usage: PC_IP=<this PC's LAN IP> python3 server.py  (or: server.py <ip> [port])")
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
    print("debug server on http://%s:%d" % (host, port), flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
