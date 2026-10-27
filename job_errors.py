"""Phân loại lỗi của lượt đồng bộ CRM / xuất call để biết khi nào cookie hết hạn và cần dừng ngay (các tác vụ sau cũng sẽ thất bại)."""
import re
import unicodedata


def _plain(text):
    text = unicodedata.normalize('NFD', str(text)).replace('đ', 'd').replace('Đ', 'D')
    return ''.join(c for c in text if unicodedata.category(c) != 'Mn').lower()


COOKIE_PATTERNS = (r'cookie', r'het han', r'csrf', r'dang nhap', r'login', r'unauthorized', r'\b40[13]\b', r'session')
SHEET_PATTERNS = (r'google sheet', r'quyen chinh sua', r'sheets api', r'credentials', r'tai khoan dich vu')
LINK_HINT = r'link bo loc'


def classify(message):
    """Trả về 'cookie' (cookie hết hạn/không hợp lệ), 'sheet' (lỗi ghi Google Sheet) hoặc 'other'."""
    text = _plain(message)
    if any(re.search(p, text) for p in SHEET_PATTERNS) and not re.search(r'cookie', text):
        return 'sheet'
    if any(re.search(p, text) for p in COOKIE_PATTERNS):
        return 'cookie'
    return 'other'


def should_abort(message, done_ok):
    """Có nên dừng cả lượt không. Cookie hết hạn thì dừng ngay. Thông báo mơ hồ "cookie hết hạn hoặc link bộ lọc sai":
    nếu trước đó đã có tác vụ thành công thì cookie còn dùng được (lỗi nằm ở link), nên chỉ bỏ qua tác vụ này."""
    if classify(message) != 'cookie':
        return False
    ambiguous = re.search(LINK_HINT, _plain(message)) is not None
    return not (ambiguous and done_ok > 0)


def friendly(message, scope):
    """Câu hướng dẫn cho người dùng theo từng loại lỗi."""
    kind = classify(message)
    if kind == 'cookie':
        name = 'cookie CRM' if scope == 'crm' else 'cookie call-report'
        return f'Có thể {name} đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại, lấy {name} mới, nhập lại rồi chạy lại.'
    if kind == 'sheet':
        return 'Không ghi được lên Google Sheet. Kiểm tra link Sheet đích và quyền chỉnh sửa của tài khoản dịch vụ.'
    return ''
