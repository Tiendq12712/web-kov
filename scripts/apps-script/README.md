# Cầu nối dữ liệu (Apps Script)

Cho nhân viên xem báo cáo mà **không cần được chia sẻ Google Sheet**: họ chỉ đăng nhập Google (quyền email). Script chạy bằng tài khoản chủ Sheet.

## Cài đặt (làm một lần, bằng tài khoản chủ các Sheet)
1. Vào script.google.com → Dự án mới, dán nội dung `data-proxy.gs` vào `Code.gs`.
2. Bên trái bấm **Dịch vụ (+)** → chọn **Google Sheets API** → Thêm (giữ tên `Sheets`).
3. Chạy hàm `authorize` một lần, cấp quyền đọc Google Sheets / kết nối dịch vụ ngoài.
4. **Triển khai** → **Triển khai mới** → loại **Ứng dụng web**: *Thực thi bằng* = **Tôi**; *Người có quyền truy cập* = **Bất kỳ ai** (việc kiểm tra danh sách người dùng do chính script làm). Sao chép URL dạng `https://script.google.com/macros/s/…/exec`.
5. Dán URL vào `CONFIG.proxyUrl` trong `js/config.js`, build lại web.
6. Sau khi sửa script phải **Triển khai → Quản lý triển khai → Sửa → Phiên bản mới** thì thay đổi mới có hiệu lực.

Tài khoản chạy script cần xem được mọi Sheet của báo cáo. Sheet được phép đọc: Sheet cấu hình, mọi link trong tab "Danh sách link", và các ID thêm trong Script property `SHEETS` (cách nhau dấu phẩy).
