"""Kiểm tra đọc báo cáo cs03 của call-report: python3 tests/test_call_report.py"""
import os
import sys
import urllib.parse
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import call_report as cr  # noqa: E402

url = cr.search_url(['8410', '8427'], datetime(2026, 11, 1, 0, 0), datetime(2026, 11, 6, 23, 59), 'tien.dq@kiotviet.com')
q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query, keep_blank_values=True)
assert url.startswith('https://call-report.kiotviet.com/report/custom-report/cs03?'), url
assert q['date_range'] == ['This month'] and q['user'] == ['8410', '8427'] and q['cuser'] == ['tien.dq@kiotviet.com'] and q['search'] == ['1']
assert q['from_datetime'] == ['2026-11-01T00:00'] and q['to_datetime'] == ['2026-11-06T23:59']

assert cr.agent_codes(['8407 DVKH Success A', '8407', ' 8410']) == ['8407', '8410']

html = '''<div><table><tr><td>Lọc</td></tr></table>
<table><thead><tr><th>Caller</th><th>Đàm thoại</th></tr></thead>
<tbody><tr><td>8410</td><td>00:01:02</td></tr><tr><td>8427</td><td>00:00:03</td></tr></tbody></table>
</div>'''
rows = cr.parse_html_table(html)
assert rows == [['Caller', 'Đàm thoại'], ['8410', '00:01:02'], ['8427', '00:00:03']], rows
assert cr.parse_excel('﻿Caller,Đàm thoại\n8410,00:01:02\n'.encode()) == [['Caller', 'Đàm thoại'], ['8410', '00:01:02']]
assert cr.parse_excel(html.encode()) == rows

for bad in ('https://evil.example/report', 'http://call-report.kiotviet.com.evil.example/'):
    try:
        cr._get(bad, 'a=b')
        raise SystemExit(f'phải từ chối {bad}')
    except ValueError:
        pass
print('call_report: ĐẠT')

assert cr.is_login_page('', 'https://call-report.kiotviet.com/report/login') and not cr.is_login_page('<table></table>', cr.REPORT_URL)

# Trang chỉ trả 500 dòng mới nhất mỗi lần tìm: collect_rows phải chia nhỏ khoảng thời gian và ghép đủ, không trùng, không thiếu.
start, end = datetime(2026, 11, 1), datetime(2026, 11, 5, 23, 59)
data = [(start + timedelta(minutes=7 * i)) for i in range(int((end - start).total_seconds() // 60 // 7))]
calls = []

def fake_fetch(cookie, agents, a, b, user):
    calls.append((a, b))
    inside = sorted((t for t in data if a <= t <= b), reverse=True)[:cr.PAGE_CAP]
    return [['Thời gian', 'Người Gọi']] + [[f'{t:%Y-%m-%d %H:%M}', '8427'] for t in inside] if inside else []

cr.fetch_window = fake_fetch
logs = []
got = cr.collect_rows('c', ['8427'], start, end, 'u', logs.append)
assert len(got) - 1 == len(data) > cr.PAGE_CAP, (len(got) - 1, len(data))
assert len({tuple(r) for r in got[1:]}) == len(data), 'có dòng trùng'
assert len(calls) > 1 and any('chia đôi' in m for m in logs)
cr.fetch_window = lambda *a: [['h'], ['x']]
assert cr.collect_rows('c', ['1'], start, end, 'u', logs.append) == [['h'], ['x']]
print('chia nhỏ khoảng thời gian: ĐẠT')
