"""Kiểm tra phân loại lỗi đồng bộ: python3 tests/test_job_errors.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import job_errors as je  # noqa: E402

cases = [
    ('Cookie call-report không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại và lấy cookie mới.', 'cookie'),
    ('Không lấy được dữ liệu. Cookie CRM hết hạn hoặc link bộ lọc không đúng.', 'cookie'),
    ('Không lấy được CSRF token (đã đăng nhập chưa?)', 'cookie'),
    ('HTTP 401 Unauthorized', 'cookie'),
    ('Chưa chia sẻ quyền chỉnh sửa cho tool@x.iam hoặc chưa bật Google Sheets API.', 'sheet'),
    ('File Excel không có dòng dữ liệu.', 'other'),
    ('Khoảng thời gian tối đa 31 ngày.', 'other'),
]
for message, expected in cases:
    got = je.classify(message)
    assert got == expected, f'{message!r}: mong đợi {expected}, nhận {got}'

ambiguous = 'Không lấy được dữ liệu. Cookie CRM hết hạn hoặc link bộ lọc không đúng.'
assert je.should_abort(ambiguous, 0) is True, 'tác vụ đầu tiên lỗi mơ hồ: dừng (nhiều khả năng cookie)'
assert je.should_abort(ambiguous, 2) is False, 'đã có tác vụ thành công trước đó: cookie còn dùng được, chỉ bỏ qua tác vụ này'
assert je.should_abort('Cookie call-report không hợp lệ hoặc đã hết hạn.', 3) is True, 'cookie hết hạn rõ ràng: luôn dừng'
assert je.should_abort('File Excel không có dòng dữ liệu.', 0) is False
assert 'hết hạn' in je.friendly(ambiguous, 'crm') and 'cookie CRM' in je.friendly(ambiguous, 'crm')
assert 'call-report' in je.friendly('Cookie call-report không hợp lệ', 'call')
assert je.friendly('lỗi lạ', 'crm') == ''
print('OK: job_errors')
