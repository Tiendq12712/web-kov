"""Máy chủ tĩnh cho kiểm tra tự động: phục vụ thư mục và nhận kết quả từ tests/smoke.html (POST /__result)."""
import functools, http.server, sys

directory, port, result_file = sys.argv[1], int(sys.argv[2]), sys.argv[3]


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(result_file, 'wb') as f:
            f.write(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=directory)).serve_forever()
