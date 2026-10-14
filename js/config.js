/** Cấu hình cố định của ứng dụng. Mọi thứ còn lại (tài khoản, link báo cáo, tác vụ CRM) nằm trong Sheet cấu hình. */
export const CONFIG = {
  // OAuth Client ID (loại "Web application") tạo trong Google Cloud Console.
  clientId: '383426194032-ic78e89vmaqt81bc022uisvqrbhj8njf.apps.googleusercontent.com',
  // Chỉ email thuộc tên miền này được đăng nhập.
  allowedDomain: 'kiotviet.com',
  // Sheet cấu hình dùng chung và tên các tab trong đó.
  configSheet: '1z2zQNUtjH71qWJz0NZ6ofN95ZdAmBwCSxd-KWNnMsnM',
  // Sheet lưu tin nhắn chia sẻ (mặc định cùng Sheet cấu hình; nên dùng Sheet riêng để nhân sự không sửa được tab Tài khoản).
  chatSheet: '1EiTaC-AyjL8ZzINGgcQolzpIjfyskqIk1jui5A7r3ns',
  tabs: { updated: 'Cập nhật', thread: 'Hội thoại', chat: 'Chia sẻ', accounts: 'Tài khoản', links: 'Danh sách link', sync: 'Cấu hình đồng bộ', call: 'Cấu hình call' },
};
