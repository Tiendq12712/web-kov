# web-kov — báo cáo tiến độ KPI SC ONLINE KOV

Web tĩnh (HTML/CSS/ES modules), không build, không thư viện ngoài. Dữ liệu đọc trực tiếp từ Google Sheet
bằng quyền của người xem; chỉ email thuộc tên miền công ty được vào.

## Thiết lập một lần (Google Cloud Console)
1. Tạo project → **APIs & Services → Library** → bật **Google Sheets API**.
2. **OAuth consent screen** → Internal (Workspace) hoặc External + thêm **Test users**.
3. **Credentials → OAuth client ID → Web application**, thêm **Authorized JavaScript origins**: `http://localhost:8080` và domain triển khai.
4. Dán Client ID vào `js/config.js` (`clientId`).

## Sheet cấu hình (`configSheet` trong `js/config.js`)
Mọi thứ khác nằm trong một Google Sheet với 3 tab:
- **Tài khoản**: `STT | Email | Phân quyền | Mô tả quyền`. Phân quyền: `Admin` (cố định, không sửa trên web), `Quản trị` (vào Thiết lập, quản lý Thành viên), `Thành viên` (chỉ xem). Email không có trong tab này không đăng nhập được.
- **Danh sách link**: `Thông tin | ID link | Sheet`. Mỗi dòng là **một Google Sheet có tab theo từng tháng** (T9, T10…): `KPI` hoặc `Năng suất`. Web tự nhận các tab tháng; tab KPI và năng suất **cùng tên** (ví dụ T10) được ghép thành một tháng, năm lấy từ tiêu đề tab KPI ("… KPI 10/2026"). Cột `Sheet` chỉ là ghi chú. Tab theo dõi công việc (tên có chữ "công việc", ví dụ `Theo dõi công việc ONL T10`) trong Sheet KPI sẽ bật tab Công việc.
- **Cấu hình đồng bộ**: `crm_url | gsheet_url | tab_name | Bật/tắt` (tác vụ của tool CRM).
Người sửa trên web phải có quyền **chỉnh sửa** Sheet cấu hình (Google kiểm tra); web chỉ xin quyền ghi khi bạn bấm lưu.

## Thiết lập · Đồng bộ CRM (chạy tool KiotViet CRM từ web)
Chỉ chạy trên máy này, qua `server.py` (nghe ở 127.0.0.1) dùng Python của tool CRM đã cài:
```bash
~/Downloads/Tool_KiotViet_CRM_MacOS/venv/bin/python3 server.py 8080   # mở http://localhost:8080
```
Đổi thư mục tool bằng biến môi trường `KV_TOOL_DIR`. Nút ⚙ (góc trên bên phải) chỉ hiện với Admin và Quản trị.
- Cookie CRM chỉ giữ trong bộ nhớ máy chủ, không ghi ra file.
- Danh sách tác vụ lưu trong tab `Cấu hình đồng bộ` của Sheet cấu hình.
- Mỗi Google Sheet đích phải chia sẻ quyền chỉnh sửa cho tài khoản dịch vụ hiển thị trong trang Thiết lập.
- `credentials.json` và `cookie.txt` của tool KHÔNG được đưa vào repo này.

## Thiết lập · Xuất Call (call-report.kiotviet.com)
Mục **Xuất Call** nhập cookie `JSESSIONID` của call-report (chỉ giữ trong bộ nhớ), danh sách agent, Google Sheet đích và tab đích
(lưu trong tab `Cấu hình call` của Sheet cấu hình). Khi chạy, `call_report.py` tính khoảng ngày (ngày 1 của tháng → hôm qua),
gọi `list_call_outbound_cs03` như khi bấm *Tìm Kiếm* (tham số `cuser` = email đăng nhập, `dsnhanvien` = các mã agent cách nhau bằng dấu phẩy),
tải file **Excel** ở cuối bảng rồi ghi lên Google Sheet. Có nút **Chạy thử** để kiểm tra mà không ghi Sheet.
`certs/` chứa chứng chỉ trung gian GlobalSign (máy chủ call-report không gửi kèm), đã kiểm tra chuỗi tin cậy.

### Tiện ích Chrome lấy cookie call-report
Thư mục `extension/call-report-cookie/` (Manifest V3). Quyền: đọc cookie của `call-report.kiotviet.com` và gọi `localhost:8080`.
Cài: `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục này (đã thay đổi thì bấm biểu tượng tải lại ⟳).
Đăng nhập call-report, chạy `server.py`, bấm biểu tượng tiện ích: cookie `JSESSIONID` được **gửi thẳng vào web-kov** (Thiết lập → Xuất Call);
server không chạy thì tiện ích sao chép vào clipboard. Server chỉ nhận đường này từ đúng tiện ích (ID cố định `adlmjjkfhfjbfphjgkfocgikbakpmngb`
nhờ khóa trong manifest; ID nằm ở `EXTENSION_ORIGIN` trong `server.py`) và chỉ cho `POST /api/call/cookie`.

## Chạy chỉ xem báo cáo (không cần tool CRM)
```bash
python3 serve.py 8080   # rồi mở http://localhost:8080 (server không cache, tránh thấy bản cũ)
```

## Thêm tháng mới
Thêm tab `T11` vào Sheet KPI (và Sheet năng suất) — web tự nhận. Chỉ khi có Sheet mới thì thêm link ở Thiết lập → Cấu hình.

## Tab Công việc
Các bảng theo dõi công việc nằm ngay dưới bảng KPI trong tab tháng (T10…); tab Công việc chỉ hiện khi tab tháng có các bảng này. Trang Tổng quan gộp KPI, công việc và năng suất; các tab Team chỉ để xem chi tiết. `js/work.js` nhận các bảng pivot theo tiêu đề cột:
tình trạng xử lý, tình trạng liên hệ, số cuộc gọi trên mỗi ACT, tồn theo ngày, data đã chia, nguồn data, ngành hàng.

## Báo cáo năng suất
Tab **Năng suất** đọc tab `Report ONLINE` (đổi tên ở `productivityTab`) của Sheet năng suất. Bộ đọc nhận khối bằng chữ tiêu đề:
bảng theo ngày từng người (cột `Ngày`), `Tuần N (a-b)` và `TỔNG TEAM` (thống kê tháng, kèm dòng MIỀN NAM/MIỀN BẮC).

## Cấu trúc
- `js/auth.js` — đăng nhập Google, kiểm tra tên miền, giữ token trong phiên
- `js/sheet.js` — gọi Sheets API và chuyển bảng KPI thành dữ liệu (`COLUMNS` ánh xạ cột)
- `server.py` — máy chủ cục bộ: phát web + API chạy tool CRM
- `js/directory.js` — đọc/ghi tab Tài khoản và Danh sách link, phân quyền, dựng danh sách tháng
- `js/settingsController.js`, `js/views/settings.js`, `js/crm.js` — trang Thiết lập
- `js/work.js` — đọc tab Theo dõi công việc ONL
- `js/report.js` — đọc tab Report ONLINE (ngày, tuần, tháng)
- `js/metrics.js` — công thức (70/30, ngưỡng tiến độ, thời gian đã qua)
- `js/views/team.js` — `COLUMNS`/`KEYS` quyết định cột bảng
- `js/dom.js` — template tag `html` tự escape (chống XSS)
