#!/usr/bin/env python3
"""Static dev server for the prototype — `python3 -m http.server`, made to survive the app.

The app is ~230 ES modules and ~50 stylesheets, and every `npm run bump` changes all
their URLs at once, so a reload asks for all of them in parallel. The stock server
listens with a backlog of 5 and speaks HTTP/1.0 (one connection per file): past the
fifth pending connection the kernel resets the rest, and the browser drops whatever
was in them — a stylesheet here, a module there. The page then renders with random
pieces missing (the grey fills of the right panel went first, 2026-09-30) and nothing
in the code is wrong.

Two changes fix it: a 256-deep backlog, and HTTP/1.1 keep-alive so the browser
reuses a handful of connections instead of opening one per file.

Usage: python3 scripts/dev-server.py [port]   (default 8000)
"""
import http.server
import sys


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quiet: the preview's log pane is for errors
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    with Server(("0.0.0.0", port), Handler) as httpd:
        print(f"Serving on http://localhost:{port} (and on the LAN, for a phone)", flush=True)
        httpd.serve_forever()
