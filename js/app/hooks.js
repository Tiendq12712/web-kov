/** Cầu nối để các module tách khỏi main.js gọi lại hàm vẽ/điều hướng của main mà không import vòng; main gán khi khởi động. */
export const hooks = {
  renderView: () => {},      // vẽ lại trang đang mở
  authLost: () => {},        // phiên đăng nhập hết hạn
  setTab: () => {},          // chuyển tab
  unread: () => 0,           // số tin nhắn chưa đọc
};
