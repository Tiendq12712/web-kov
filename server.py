#!/usr/bin/env python3
"""Máy chủ cục bộ cho web-kov: phát file web + cầu nối tới tool KiotViet CRM.

Chạy bằng Python của chính tool (đã cài sẵn thư viện):
    <thư-mục-tool>/venv/bin/python3 server.py [cổng]

Bảo mật:
- Chỉ nghe ở 127.0.0.1, kiểm tra Host/Origin và header X-KV-Client (chặn trang web khác gọi vào).
- Cookie CRM chỉ giữ trong bộ nhớ của tiến trình này, không ghi ra file.
- Chỉ phát file trong thư mục web-kov; từ chối đường dẫn bắt đầu bằng dấu chấm (.git, .claude…).
- Chỉ chấp nhận link CRM của kvcrm.kiotviet.vn và link Google Sheets.
"""
import json
import os
import re
import sys
import threading
import time
import uuid
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Python cài từ python.org trên macOS chưa có chứng chỉ gốc -> dùng bộ của certifi (đã cài cùng tool).
try:
    import certifi
    os.environ.setdefault('SSL_CERT_FILE', certifi.where())
except ImportError:
    pass

WEB_DIR = os.path.dirname(os.path.abspath(__file__))
TOOL_DIR = os.path.expanduser(os.environ.get('KV_TOOL_DIR', '~/Downloads/Tool_KiotViet_CRM_MacOS'))
CLIENT_HEADER = ('X-KV-Client', 'web-kov')
MAX_BODY = 1_000_000
# Tiện ích Chrome "Lấy cookie call-report" (ID cố định nhờ khóa trong manifest) được phép gửi cookie, và chỉ việc đó.
EXTENSION_ORIGIN = 'chrome-extension://adlmjjkfhfjbfphjgkfocgikbakpmngb'
EXTENSION_PATHS = {('POST', '/api/call/cookie')}
CRM_HOST = 'kvcrm.kiotviet.vn'
SHEETS_HOST = 'docs.google.com'
SHEET_ID = re.compile(r'^[\w-]{20,}$')

import call_report  # noqa: E402  (xuất dữ liệu call-report, cùng thư mục)

# --- Nạp tool CRM (không bắt buộc: thiếu thì web báo "chưa sẵn sàng") ---------------------------
crm = None
crm_error = ''
try:
    sys.path.insert(0, TOOL_DIR)
    import crm_export_tool as crm  # noqa: E402
except Exception as exc:  # thiếu thư mục tool hoặc thư viện
    crm_error = f'{type(exc).__name__}: {exc}'


class State:
    """Trạng thái dùng chung giữa các request (cookie + công việc đang chạy)."""

    def __init__(self):
        self.lock = threading.Lock()
        self.cookie = ''          # cookie CRM
        self.call_cookie = ''     # cookie call-report
        self.job = None


state = State()


def service_account_email():
    path = crm.find_credentials() if crm else None
    if not path:
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f).get('client_email')
    except Exception:
        return None


def valid_crm_url(url):
    p = urlparse(url)
    return p.scheme == 'https' and p.hostname == CRM_HOST


def valid_sheet(url):
    if SHEET_ID.match(url):
        return True
    p = urlparse(url)
    return p.scheme == 'https' and p.hostname == SHEETS_HOST and '/spreadsheets/d/' in p.path


def explain_sheet_failure(credentials, url):
    """Vì sao không ghi được Google Sheet? (tool gốc chỉ in thông báo rỗng với lỗi 'không tìm thấy')."""
    email = service_account_email() or 'tài khoản dịch vụ'
    try:
        import gspread
        client = gspread.service_account(filename=credentials)
        client.open_by_url(url) if url.startswith('http') else client.open_by_key(url)
        return 'Đã mở được Sheet nhưng ghi dữ liệu thất bại (kiểm tra tên tab hoặc Sheet có bị khóa không).'
    except Exception as exc:
        name = type(exc).__name__
        if name == 'SpreadsheetNotFound':
            return (f'Không mở được Google Sheet đích. Hãy chia sẻ Sheet đó với quyền Chỉnh sửa cho {email} '
                    f'và kiểm tra link đúng.')
        if name == 'APIError':
            status = getattr(getattr(exc, 'response', None), 'status_code', '')
            hint = {403: f'Chưa chia sẻ quyền chỉnh sửa cho {email} hoặc chưa bật Google Sheets API.',
                    404: 'Link Google Sheet không đúng.', 429: 'Vượt giới hạn gọi Google, chờ một lát rồi chạy lại.'}.get(status, str(exc)[:200])
            return f'Google trả lỗi {status}: {hint}'
        return f'{name}: {exc}'


# --- Công việc đồng bộ -----------------------------------------------------------------------
class Job:
    def __init__(self, tasks):
        self.id = uuid.uuid4().hex[:10]
        self.tasks = tasks
        self.logs = []
        self.done = 0
        self.ok = 0
        self.finished = False
        self.stop = False

    def log(self, message):
        self.logs.append(str(message))

    def run(self, cookie, credentials):
        total = len(self.tasks)
        self.log(f'Bắt đầu đồng bộ {total} tác vụ (tuần tự).')
        for i, task in enumerate(self.tasks, start=1):
            if self.stop:
                self.log('Đã dừng theo yêu cầu.')
                break
            label = task.get('name') or task.get('tab_name') or f'#{i}'
            self.log(f'--- [{i}/{total}] {label} ---')
            try:
                rows = crm.export_crm_data(cookie, task['crm_url'], log_fn=self.log)
                if not rows or rows == [['Invalid request']]:
                    raise ValueError('Không lấy được dữ liệu. Cookie CRM hết hạn hoặc link bộ lọc không đúng.')
                if self.stop:
                    self.log('Đã dừng trước khi ghi lên Google Sheets.')
                    break
                if not crm.push_to_google_sheets(rows, credentials, task['gsheet_url'],
                                                 worksheet_name=task.get('tab_name', ''), log_fn=self.log):
                    raise ValueError(explain_sheet_failure(credentials, task['gsheet_url']))
                self.ok += 1
                self.log(f'Hoàn tất {label}: {max(len(rows) - 1, 0):,} dòng.')
            except Exception as exc:
                self.log(f'THẤT BẠI {label}: {exc}')
            self.done = i
            time.sleep(0.2)
        self.finished = True
        self.log(f'Xong: {self.ok}/{total} tác vụ thành công.')


class CallJob(Job):
    """Xuất Excel từ call-report rồi ghi lên Google Sheet."""

    def __init__(self, params):
        super().__init__([{'name': 'Call report'}])
        self.params = params

    def run(self, cookie, credentials):
        self.log('Bắt đầu xuất dữ liệu call.')
        try:
            rows = call_report.export_rows(cookie, self.params['agents'], *self.params['range'], self.params['cuser'], self.log)
            if self.params.get('dry_run'):
                self.ok = 1
                self.log(f'Chạy thử xong (KHÔNG ghi Google Sheet): {len(rows) - 1:,} dòng, {len(rows[0])} cột: {", ".join(rows[0][:8])}…')
            elif self.stop:
                self.log('Đã dừng trước khi ghi lên Google Sheets.')
            elif crm.push_to_google_sheets(rows, credentials, self.params['gsheet_url'],
                                           worksheet_name=self.params['tab_name'], log_fn=self.log):
                call_report.fix_duration_columns(credentials, self.params['gsheet_url'], self.params['tab_name'], rows, self.log)
                self.ok = 1
                self.log(f'Hoàn tất: ghi {len(rows) - 1:,} dòng lên Google Sheet.')
            else:
                raise ValueError(explain_sheet_failure(credentials, self.params['gsheet_url']))
        except Exception as exc:
            self.log(f'THẤT BẠI: {exc}')
        self.done = 1
        self.finished = True


def launch(job, cookie, missing_cookie_message):
    """Chạy một công việc nền; mỗi lúc chỉ có một công việc (CRM hoặc call)."""
    with state.lock:
        if state.job and not state.job.finished:
            raise RuntimeError('Đang có một lượt chạy khác, hãy chờ hoặc dừng nó.')
        if not cookie:
            raise RuntimeError(missing_cookie_message)
        credentials = crm.find_credentials()
        if not credentials:
            raise RuntimeError('Không tìm thấy credentials.json của tool.')
        state.job = job
        threading.Thread(target=job.run, args=(cookie, credentials), daemon=True).start()
        return job


def start_job(tasks):
    return launch(Job(tasks), state.cookie, 'Chưa nhập cookie CRM.')


# --- HTTP ----------------------------------------------------------------------------------------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, port, **kwargs):
        self.port = port
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    # Không để trình duyệt giữ bản cũ của file web.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and '/api/' in str(args[0]):
            return   # không in nội dung request API ra terminal
        super().log_message(fmt, *args)

    # -- kiểm tra an toàn
    def host_ok(self):
        return self.headers.get('Host', '') in (f'localhost:{self.port}', f'127.0.0.1:{self.port}')

    def api_allowed(self, method='GET', path=''):
        origin = self.headers.get('Origin')
        local = (f'http://localhost:{self.port}', f'http://127.0.0.1:{self.port}')
        extension = origin == EXTENSION_ORIGIN and (method, path) in EXTENSION_PATHS
        return self.host_ok() and (origin is None or origin in local or extension) \
            and self.headers.get(CLIENT_HEADER[0]) == CLIENT_HEADER[1]

    def cors_headers(self):
        """Chỉ tiện ích đã đăng ký mới được trả lời CORS; trang web khác không bao giờ nhận header này."""
        if self.headers.get('Origin') == EXTENSION_ORIGIN:
            self.send_header('Access-Control-Allow-Origin', EXTENSION_ORIGIN)
            self.send_header('Vary', 'Origin')

    def do_OPTIONS(self):
        """Preflight của tiện ích: chỉ cho đường gửi cookie."""
        path = urlparse(self.path).path
        if self.headers.get('Origin') == EXTENSION_ORIGIN and self.host_ok() and ('POST', path) in EXTENSION_PATHS:
            self.send_response(204)
            self.cors_headers()
            self.send_header('Access-Control-Allow-Methods', 'POST')
            self.send_header('Access-Control-Allow-Headers', f'Content-Type, {CLIENT_HEADER[0]}')
            self.send_header('Access-Control-Max-Age', '600')
            self.end_headers()
        else:
            self.send_error(403)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            raise ValueError('Dữ liệu gửi lên quá lớn')
        return json.loads(self.rfile.read(length) or b'{}')

    # -- định tuyến
    def send_head(self):
        """Chỉ phát file web: không phát file ẩn (.git, .claude…) hay mã Python."""
        path = urlparse(self.path).path
        hidden = any(part.startswith('.') for part in path.split('/') if part)
        if not self.host_ok() or hidden or path.endswith(('.py', '.pyc')):
            self.send_error(404)
            return None
        return super().send_head()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            return self.api('GET', path)
        return super().do_GET()

    def do_HEAD(self):
        if urlparse(self.path).path.startswith('/api/'):
            return self.send_error(405)
        return super().do_HEAD()

    def do_POST(self):
        self.api('POST', urlparse(self.path).path)

    def do_DELETE(self):
        self.api('DELETE', urlparse(self.path).path)

    def api(self, method, path):
        if not self.api_allowed(method, path):
            return self.send_json({'error': 'Không được phép'}, 403)
        try:
            handler = ROUTES.get((method, path)) or self.job_route(method, path)
            if not handler:
                return self.send_json({'error': 'Không tìm thấy'}, 404)
            payload = self.read_json() if method == 'POST' else {}
            return self.send_json(handler(payload))
        except (ValueError, RuntimeError) as exc:
            return self.send_json({'error': str(exc)}, 400)
        except Exception as exc:
            return self.send_json({'error': f'Lỗi máy chủ: {exc}'}, 500)

    def job_route(self, method, path):
        m = re.fullmatch(r'/api/crm/jobs/(\w+)(/stop)?', path)
        if not m:
            return None
        job = state.job if state.job and state.job.id == m.group(1) else None
        if not job:
            raise ValueError('Không tìm thấy lượt chạy này')
        if m.group(2) and method == 'POST':
            return lambda _p: stop_job(job)
        since = int(re.search(r'since=(\d+)', self.path).group(1)) if 'since=' in self.path else 0
        return lambda _p: job_status(job, since)


def stop_job(job):
    job.stop = True
    return {'ok': True}


def job_status(job, since):
    return {'id': job.id, 'logs': job.logs[since:], 'next': len(job.logs), 'done': job.done,
            'total': len(job.tasks), 'ok': job.ok, 'finished': job.finished}


# --- Các API ------------------------------------------------------------------------------------
def api_status(_payload):
    return {
        'ready': crm is not None, 'error': crm_error,
        'cookieSet': bool(state.cookie), 'callCookieSet': bool(state.call_cookie), 'serviceAccount': service_account_email(),
        'running': bool(state.job and not state.job.finished),
        'jobId': state.job.id if state.job else None,
    }


def api_set_cookie(payload):
    cookie = str(payload.get('cookie', '')).strip()
    if 'KVCRM_PHPSESSID' not in cookie and 'current_user' not in cookie:
        raise ValueError('Cookie không đúng định dạng (cần có KVCRM_PHPSESSID hoặc current_user).')
    state.cookie = cookie
    return {'cookieSet': True}


def api_clear_cookie(_payload):
    state.cookie = ''
    return {'cookieSet': False}


def api_run(payload):
    if crm is None:
        raise RuntimeError(f'Chưa nạp được tool CRM ({crm_error}).')
    tasks = []
    for raw in payload.get('tasks', []):
        task = {key: str(raw.get(key, '')).strip() for key in ('name', 'crm_url', 'gsheet_url', 'tab_name')}
        if not valid_crm_url(task['crm_url']):
            raise ValueError(f'Link CRM không hợp lệ (chỉ nhận https://{CRM_HOST}): {task["name"] or task["crm_url"][:40]}')
        if not valid_sheet(task['gsheet_url']):
            raise ValueError(f'Link Google Sheet không hợp lệ: {task["name"] or task["gsheet_url"][:40]}')
        tasks.append(task)
    if not tasks:
        raise ValueError('Chưa chọn tác vụ nào để chạy.')
    return {'jobId': start_job(tasks).id}


COOKIE_NAME = re.compile(r'^[\w.-]+=[^;\s]+(;\s*[\w.-]+=[^;\s]*)*;?$')


def api_set_call_cookie(payload):
    cookie = str(payload.get('cookie', '')).strip()
    if 'JSESSIONID' not in cookie and '=' not in cookie:
        cookie = f'JSESSIONID={cookie}' if re.fullmatch(r'[\w-]{16,}', cookie) else cookie
    if not COOKIE_NAME.match(cookie):
        raise ValueError('Cookie không đúng định dạng (dạng JSESSIONID=giá_trị hoặc chỉ giá trị JSESSIONID).')
    state.call_cookie = cookie
    return {'callCookieSet': True}


def api_clear_call_cookie(_payload):
    state.call_cookie = ''
    return {'callCookieSet': False}


def api_run_call(payload):
    if crm is None:
        raise RuntimeError(f'Chưa nạp được tool CRM ({crm_error}).')
    agents = [str(a).strip() for a in payload.get('agents', []) if str(a).strip()]
    gsheet_url, tab_name = str(payload.get('gsheet_url', '')).strip(), str(payload.get('tab_name', '')).strip()
    if not agents:
        raise ValueError('Chưa nhập danh sách agent.')
    if len(agents) > 200 or any(len(a) > 120 for a in agents):
        raise ValueError('Danh sách agent quá dài.')
    if not valid_sheet(gsheet_url) and not payload.get('dry_run'):
        raise ValueError('Link Google Sheet đích không hợp lệ.')
    cuser = str(payload.get('cuser', '')).strip()
    if len(cuser) > 120 or re.search(r'[\s&=?#/]', cuser):
        raise ValueError('Tài khoản call-report không hợp lệ.')
    date_range = call_report.parse_range(str(payload.get('date_from', '')), str(payload.get('date_to', '')))
    job = launch(CallJob({'agents': agents, 'gsheet_url': gsheet_url, 'tab_name': tab_name[:100], 'range': date_range, 'cuser': cuser,
                  'dry_run': bool(payload.get('dry_run'))}),
                 state.call_cookie, 'Chưa nhập cookie call-report.')
    return {'jobId': job.id}


ROUTES = {
    ('POST', '/api/call/cookie'): api_set_call_cookie,
    ('DELETE', '/api/call/cookie'): api_clear_call_cookie,
    ('POST', '/api/call/run'): api_run_call,
    ('GET', '/api/crm/status'): api_status,
    ('POST', '/api/crm/cookie'): api_set_cookie,
    ('DELETE', '/api/crm/cookie'): api_clear_cookie,
    ('POST', '/api/crm/run'): api_run,
}


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, port=port))
    print(f'web-kov chạy tại http://localhost:{port}  (tool CRM: {"sẵn sàng" if crm else "CHƯA SẴN SÀNG - " + crm_error})')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nĐã dừng.')


if __name__ == '__main__':
    main()
