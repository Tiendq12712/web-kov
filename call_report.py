"""Xuất dữ liệu cuộc gọi từ call-report.kiotviet.com, báo cáo cs03 (Outbound Call), theo đúng các bước của trang:
mở báo cáo với 3 thông tin (cookie đăng nhập, danh sách user/agent, khoảng thời gian) -> đọc bảng kết quả
(hoặc tải file xuất nếu trang có) -> các dòng ghi lên Google Sheet.
Chỉ dùng thư viện chuẩn + openpyxl (đã có cùng tool CRM). Cookie chỉ nằm trong bộ nhớ."""
import csv
import io
import os
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from html.parser import HTMLParser

HOST = 'https://call-report.kiotviet.com'
REPORT_URL = f'{HOST}/report/custom-report/cs03'
LOGIN_PATH = '/report/login'
PAGE_CAP = 500   # mỗi lần tìm trang chỉ trả tối đa 500 dòng (mới nhất trước): đủ 500 dòng nghĩa là có thể còn thiếu
RETRIES = 4
RETRY_CODES = (502, 503, 504)
TIMEOUT = 90
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36'   # giống trình duyệt đã đăng nhập: trang có thể gắn phiên với User-Agent


MAX_SPAN_DAYS = 366


def parse_range(date_from, date_to):
    """Nhận hai ngày dạng YYYY-MM-DD (do giao diện tính theo thiết lập) và kiểm tra hợp lệ."""
    try:
        start, end = date.fromisoformat(date_from), date.fromisoformat(date_to)
    except ValueError:
        raise ValueError('Ngày không đúng định dạng YYYY-MM-DD.')
    if end < start:
        raise ValueError('"Đến ngày" phải sau hoặc bằng "Từ ngày".')
    if (end - start).days > MAX_SPAN_DAYS:
        raise ValueError(f'Khoảng thời gian tối đa {MAX_SPAN_DAYS} ngày.')
    return start, end


# call-report.kiotviet.com chỉ gửi chứng chỉ lá (thiếu chứng chỉ trung gian GlobalSign). Trình duyệt tự bù, Python thì không,
# nên bổ sung chứng chỉ trung gian công khai (đã kiểm tra chuỗi tới GlobalSign Root R6) vào bộ tin cậy của kết nối này.
EXTRA_CA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'certs', 'globalsign-gcc-r6-alphassl-ca-2025.pem')
_context = None


def _ssl_context():
    global _context
    if _context is None:
        try:
            import certifi
            _context = ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            _context = ssl.create_default_context()
        if os.path.exists(EXTRA_CA):
            _context.load_verify_locations(cafile=EXTRA_CA)
    return _context


class _SameHostRedirect(urllib.request.HTTPRedirectHandler):
    """Không theo chuyển hướng sang máy chủ khác: tránh gửi cookie phiên ra ngoài call-report.kiotviet.com."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlparse(newurl).netloc != urllib.parse.urlparse(HOST).netloc:
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _get(url, cookie):
    if urllib.parse.urlparse(url).netloc != urllib.parse.urlparse(HOST).netloc:
        raise ValueError('Liên kết không thuộc call-report.kiotviet.com')
    req = urllib.request.Request(url, headers={'Cookie': cookie, 'User-Agent': USER_AGENT, 'Referer': HOST})
    opener = urllib.request.build_opener(_SameHostRedirect, urllib.request.HTTPSHandler(context=_ssl_context()))
    for attempt in range(RETRIES):
        try:
            with opener.open(req, timeout=TIMEOUT) as resp:
                return resp.read(), resp.geturl()
        except urllib.error.HTTPError as err:   # máy chủ phía sau báo cáo đôi lúc trả 502/503/504 tạm thời: thử lại vài lần
            if err.code not in RETRY_CODES or attempt == RETRIES - 1:
                raise
            time.sleep(3 * (attempt + 1))


def _text(data):
    return data.decode('utf-8', errors='ignore')


COOKIE_ERROR = 'Cookie call-report không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại và lấy cookie mới.'


def is_login_page(html, final):
    """Chưa đăng nhập: trang chuyển về /report/login (hoặc trả biểu mẫu mật khẩu)."""
    return LOGIN_PATH in urllib.parse.urlparse(final).path or 'type="password"' in html


def agent_codes(entries):
    """Mã agent gửi cho trang: mỗi dòng nhập lấy phần số đầu (ví dụ "8407 DVKH Success …" -> "8407"), bỏ trùng."""
    codes = []
    for entry in entries:
        m = re.match(r'\s*(\d+)', entry)
        code = m.group(1) if m else entry.strip()
        if code and code not in codes:
            codes.append(code)
    return codes


def search_url(agents, start, end, user):
    """Địa chỉ giống bấm "Tìm kiếm" trên báo cáo: mỗi agent là một tham số user=<mã>; start/end là datetime (độ chính xác tới phút)."""
    params = [
        ('search', '1'), ('cuser', user), ('date_range', 'This month'),
        ('from_datetime', f'{start:%Y-%m-%dT%H:%M}'), ('to_datetime', f'{end:%Y-%m-%dT%H:%M}'),
        ('caller', ''), ('talking_from', ''), ('destination', ''), ('talking_to', ''),
        *[('user', code) for code in agents], ('trunk', ''),
    ]
    return f'{REPORT_URL}?{urllib.parse.urlencode(params)}'


class _Table(HTMLParser):
    """Gom mọi bảng trong trang (mỗi bảng là danh sách dòng); bảng lồng nhau không được hỗ trợ."""
    def __init__(self):
        super().__init__()
        self.tables, self._rows, self._row, self._cell = [], None, None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self._rows = []
        elif tag == 'tr' and self._rows is not None:
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = ''

    def handle_data(self, data):
        if self._cell is not None:
            self._cell += data

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self._cell is not None and self._row is not None:
            self._row.append(' '.join(self._cell.split()))
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if any(self._row):
                self._rows.append(self._row)
            self._row = None
        elif tag == 'table' and self._rows is not None:
            self.tables.append(self._rows)
            self._rows = None


def parse_html_table(html):
    """Bảng kết quả là bảng nhiều dòng nhất trong trang (bảng bộ lọc/menu chỉ có vài dòng)."""
    parser = _Table()
    parser.feed(html)
    return max(parser.tables, key=len, default=[])


def parse_excel(data):
    """File xlsx thật, CSV, hoặc bảng HTML đặt tên .xls."""
    if data[:2] == b'PK':
        from openpyxl import load_workbook
        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
        return [['' if v is None else str(v) for v in row] for row in sheet.iter_rows(values_only=True) if any(v is not None for v in row)]
    text = _text(data).lstrip('\ufeff')
    if '<table' in text.lower():
        return parse_html_table(text)
    return [row for row in csv.reader(io.StringIO(text)) if any(c.strip() for c in row)]


DURATION_HEADERS = {'do chuong', 'dam thoai'}      # cột thời lượng: "Đổ Chuông", "Đàm Thoại"
DURATION = re.compile(r'^\d{1,3}:\d{2}:\d{2}$')


def _plain(text):
    import unicodedata
    text = str(text).replace('đ', 'd').replace('Đ', 'D')   # đ không tách dấu được bằng NFD
    return unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode().lower().strip()


def _target_worksheet(client_sheet, url, tab_name):
    """Tab mà tool CRM vừa ghi: ưu tiên gid trong link, rồi tên tab, rồi tab đầu tiên (giống tool gốc)."""
    gid = re.search(r'gid=(\d+)', url)
    if gid:
        try:
            return client_sheet.get_worksheet_by_id(int(gid.group(1)))
        except Exception:
            pass
    if tab_name:
        try:
            return client_sheet.worksheet(tab_name)
        except Exception:
            pass
    return client_sheet.get_worksheet(0)


def fix_duration_columns(credentials, url, tab_name, rows, log):
    """Tool CRM ghi mọi ô dạng văn bản nên "00:00:03" bị hiện dấu ' và công thức sai.
    Ghi lại riêng các cột thời lượng bằng USER_ENTERED để Google Sheet nhận thành giá trị thời gian thật."""
    columns = [i for i, h in enumerate(rows[0]) if _plain(h) in DURATION_HEADERS]
    if not columns:
        log('Không thấy cột Đổ Chuông / Đàm Thoại để chuyển sang dạng thời gian.')
        return
    import gspread
    from gspread.utils import rowcol_to_a1
    client = gspread.service_account(filename=credentials)
    sheet = client.open_by_url(url) if url.startswith('http') else client.open_by_key(url)
    ws = _target_worksheet(sheet, url, tab_name)
    last = len(rows)
    for i in columns:
        values = [[row[i] if i < len(row) and DURATION.match(str(row[i]).strip()) else (row[i] if i < len(row) else '')]
                  for row in rows[1:]]
        ws.update(values, range_name=f'{rowcol_to_a1(2, i + 1)}:{rowcol_to_a1(last, i + 1)}', raw=False)
    log(f'Đã chuyển {len(columns)} cột thời lượng ({", ".join(rows[0][i] for i in columns)}) sang giá trị thời gian.')


def fetch_window(cookie, agents, start, end, user):
    """Một lần tìm trong [start, end]: trả các dòng (dòng đầu là tiêu đề) hoặc [] nếu không có bảng."""
    data, final = _get(search_url(agents, start, end, user), cookie)
    html = _text(data)
    if is_login_page(html, final):
        raise ValueError(COOKIE_ERROR)
    return parse_html_table(html)


def windows(cookie, agents, start, end, user, log):
    """Chia khoảng thời gian cho tới khi mỗi đoạn trả dưới PAGE_CAP dòng (trang cắt ở 500 dòng mới nhất): sinh các dòng của từng đoạn."""
    rows = fetch_window(cookie, agents, start, end, user)
    if len(rows) - 1 < PAGE_CAP:
        log(f'{start:%d/%m %H:%M} → {end:%d/%m %H:%M}: {max(len(rows) - 1, 0)} dòng.')
        yield rows
        return
    if end - start <= timedelta(minutes=1):
        log(f'CẢNH BÁO: phút {start:%d/%m %H:%M} có từ {PAGE_CAP} dòng trở lên, trang chỉ trả {PAGE_CAP} dòng nên có thể thiếu.')
        yield rows
        return
    mid = start + (end - start) / 2
    mid = mid.replace(second=0, microsecond=0)
    log(f'{start:%d/%m %H:%M} → {end:%d/%m %H:%M}: đủ {PAGE_CAP} dòng (có thể bị cắt), chia đôi.')
    # hai đoạn chung nhau đúng phút giữa để không hụt dòng; dòng trùng được loại ở collect_rows
    yield from windows(cookie, agents, start, mid, user, log)
    yield from windows(cookie, agents, mid, end, user, log)


def collect_rows(cookie, agents, start, end, user, log):
    """Ghép kết quả các đoạn; dòng trùng ở ranh giới giữa hai đoạn chỉ giữ một."""
    rows, seen = [], set()
    for part in windows(cookie, agents, start, end, user, log):
        if not part:
            continue
        if not rows:
            rows.append(part[0])
        fresh = [r for r in part[1:] if tuple(r) not in seen]
        rows += fresh
        seen.update(tuple(r) for r in fresh)
    return rows


def export_rows(cookie, agents, start, end, cuser, log):
    """Chạy trọn quy trình và trả về các dòng (dòng đầu là tiêu đề)."""
    codes = agent_codes(agents)
    log(f'Khoảng ngày: {start:%d/%m/%Y} → {end:%d/%m/%Y}; {len(codes)} agent.')
    if not cuser:
        raise ValueError('Chưa biết tài khoản đăng nhập call-report. Hãy điền "Tài khoản call-report" (email đăng nhập) ở phần cấu hình.')
    log(f'Tài khoản: {cuser}. Đang mở báo cáo cs03 (mỗi lần tìm tối đa {PAGE_CAP} dòng nên tự chia nhỏ khoảng thời gian)…')
    rows = collect_rows(cookie, codes, datetime.combine(start, datetime.min.time()), datetime.combine(end, datetime.min.time()).replace(hour=23, minute=59), cuser, log)
    if len(rows) < 2:
        raise ValueError('Không thấy dòng dữ liệu. Có thể không có cuộc gọi trong khoảng ngày đã chọn, hoặc trang đã đổi cấu trúc.')
    log(f'Đã đọc {len(rows) - 1:,} dòng.')
    return rows
