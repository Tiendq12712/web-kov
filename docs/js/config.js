/** Cấu hình cố định của ứng dụng. Mọi thứ còn lại (tài khoản, link báo cáo, tác vụ CRM) nằm trong Sheet cấu hình. */
export const CONFIG = {
  // OAuth Client ID (loại "Web application") tạo trong Google Cloud Console.
  clientId: '383426194032-ic78e89vmaqt81bc022uisvqrbhj8njf.apps.googleusercontent.com',
  // Chỉ email thuộc tên miền này được đăng nhập.
  allowedDomain: 'kiotviet.com',
  // Sheet cấu hình dùng chung và tên các tab trong đó.
  configSheet: '1z2zQNUtjH71qWJz0NZ6ofN95ZdAmBwCSxd-KWNnMsnM',
  // Bật/tắt nhân vật Coach KPI nổi ở góc màn hình (true = bật, false = tắt).
  coachEnabled: true,
  // Ngưỡng cảnh báo tự động ở Tổng quan (để trống = dùng mặc định trong js/alerts.js): noAnswerRate, noAnswerMin, noImpactRate, noImpactMin, slaRate, errRate, errMin.
  alerts: {},
  // Mục tiêu % Impact của nhân sự (cột % Impact ở Tổng quan): xanh khi đạt mục tiêu, cam khi đạt từ 80% mục tiêu, đỏ khi thấp hơn.
  impactTarget: 0.4,
  addonReport: false,   // báo cáo Add-on (tab "Chi tiết addon" của Sheet PBI): tạm ẩn vì dữ liệu PBI chưa chuẩn; đổi thành true để hiện lại
  // Diện mạo nhân vật robot (nhân vật riêng): armor = màu giáp, accent = màu khiên/ánh sáng.
  mascot: { armor: '#2f63e0', accent: '#38bdf8' },
  // Sheet lưu tin nhắn chia sẻ (mặc định cùng Sheet cấu hình; nên dùng Sheet riêng để nhân sự không sửa được tab Tài khoản).
  chatSheet: '1EiTaC-AyjL8ZzINGgcQolzpIjfyskqIk1jui5A7r3ns',
  tabs: { history: 'Lịch sử', updated: 'Cập nhật', thread: 'Hội thoại', chat: 'Chia sẻ', accounts: 'Tài khoản', links: 'Danh sách link', sync: 'Cấu hình đồng bộ', call: 'Cấu hình call', slaExtra: 'Gia hạn SLA', heard: 'Đã nghe lại', mismatch: 'Đánh giá không khớp', audit: 'Nhật ký thao tác' },
};
