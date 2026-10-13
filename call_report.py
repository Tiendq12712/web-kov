"""Xuất dữ liệu cuộc gọi từ call-report.kiotviet.com (Joget) theo đúng các bước của trang:
mở biểu mẫu Outbound Call -> "Tìm Kiếm" (gọi list_call_outbound_cs03) -> liên kết Excel -> đọc file.
Chỉ dùng thư viện chuẩn + openpyxl (đã có cùng tool CRM). Cookie chỉ nằm trong bộ nhớ."""
import io
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
from datetime import date
from html.parser import HTMLParser

HOST = 'https://call-report.kiotviet.com'
BASE = f'{HOST}/jw/web/userview/billing_system/pay_thebill/_'
FORM_URL = f'{BASE}/frm_cs03_call_outbound?embed=true'
LIST_URL = f'{BASE}/list_call_outbound_cs03'
TIMEOUT = 90
USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'


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


def _get(url, cookie):
    req = urllib.request.Request(url, headers={'Cookie': cookie, 'User-Agent': USER_AGENT, 'Referer': HOST})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=_ssl_context()) as resp:
        return resp.read(), resp.geturl()


def _text(data):
    return data.decode('utf-8', errors='ignore')


def check_login(cookie):
    """Mở biểu mẫu Outbound Call để kiểm tra cookie còn dùng được; hỏng thì báo lỗi rõ ràng."""
    data, final = _get(FORM_URL, cookie)
    if 'name="j_password"' in _text(data) or '/web/login' in final:
        raise ValueError('Cookie call-report không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại và lấy cookie mới.')


def current_username(cookie):
    """Tên đăng nhập (email) của phiên qua API chuẩn của Joget; không lấy được thì trả về chuỗi rỗng."""
    try:
        data, _ = _get(f'{HOST}/jw/web/json/workflow/currentUsername', cookie)
        username = json.loads(_text(data)).get('username', '')
        return '' if username in ('', 'roleAnonymous') else username
    except Exception:
        return ''


def agent_codes(entries):
    """Mã agent gửi cho trang: mỗi dòng nhập lấy phần số đầu (ví dụ "8407 DVKH Success …" -> "8407"), bỏ trùng."""
    codes = []
    for entry in entries:
        m = re.match(r'\s*(\d+)', entry)
        code = m.group(1) if m else entry.strip()
        if code and code not in codes:
            codes.append(code)
    return codes


def search(cookie, agents, start, end, user):
    """Giống bấm "Tìm Kiếm": trang đặt địa chỉ này vào khung kết quả."""
    params = {
        'embed': 'true', 'cuser': user,
        'Tu': f'{start:%Y-%m-%d} 00:00', 'Den': f'{end:%Y-%m-%d} 23:59',
        'sogoi': '', 'damthoaitu': '', 'damthoaiden': '', 'src_trunk': '', 'str_queue': '',
        'src_chieugoi': '', 'src_sonhan': '', 'src_trangthai': '', 'src_nhom': '',
        'dsnhanvien': ','.join(agents),
    }
    data, _ = _get(f'{LIST_URL}?{urllib.parse.urlencode(params)}', cookie)
    return _text(data)


def result_summary(html):
    m = re.search(r'<span class="pagebanner">(.*?)</span>', html, re.S)
    return re.sub(r'<[^>]+>', '', m.group(1)).strip() if m else ''


def excel_link(html):
    """Liên kết "Excel" ở cuối bảng kết quả (chỉ có khi bảng có dữ liệu)."""
    for href, label in re.findall(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S):
        if re.sub(r'<[^>]+>', '', label).strip().lower() == 'excel':
            return urllib.parse.urljoin(LIST_URL, href.replace('&amp;', '&'))
    return None


class _Table(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == 'tr':
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
                self.rows.append(self._row)
            self._row = None


def parse_excel(data):
    """File Excel xlsx thật, hoặc bảng HTML đặt tên .xls (kiểu xuất của Joget/displaytag)."""
    if data[:2] == b'PK':
        from openpyxl import load_workbook
        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).active
        return [['' if v is None else str(v) for v in row] for row in sheet.iter_rows(values_only=True) if any(v is not None for v in row)]
    parser = _Table()
    parser.feed(_text(data))
    return parser.rows


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


def export_rows(cookie, agents, start, end, cuser, log):
    """Chạy trọn quy trình và trả về các dòng (dòng đầu là tiêu đề)."""
    codes = agent_codes(agents)
    log(f'Khoảng ngày: {start:%d/%m/%Y} → {end:%d/%m/%Y}; {len(codes)} agent.')
    check_login(cookie)
    cuser = cuser or current_username(cookie)
    if not cuser:
        raise ValueError('Chưa biết tài khoản đăng nhập call-report. Hãy điền "Tài khoản call-report" (email đăng nhập) ở phần cấu hình.')
    log(f'Đã đăng nhập (tài khoản: {cuser}). Đang bấm Tìm Kiếm…')
    html = search(cookie, codes, start, end, cuser)
    log(f'Kết quả: {result_summary(html) or "không đọc được tóm tắt"}.')
    link = excel_link(html)
    if not link:
        raise ValueError('Không thấy liên kết Excel. Có thể không có cuộc gọi nào trong khoảng ngày đã chọn.')
    log('Đang tải file Excel…')
    data, _ = _get(link, cookie)
    rows = parse_excel(data)
    if len(rows) < 2:
        raise ValueError('File Excel không có dòng dữ liệu.')
    log(f'Đã đọc {len(rows) - 1:,} dòng.')
    return rows
