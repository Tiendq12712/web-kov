#!/usr/bin/env python3
"""Server phát triển: như `python3 -m http.server` nhưng không cho trình duyệt giữ cache cũ."""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    ThreadingHTTPServer(('', port), partial(NoCacheHandler, directory='.')).serve_forever()
