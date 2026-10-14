import { today } from './auth.js';

/** Bản lưu dữ liệu báo cáo của ngày hôm nay (chỉ trên trình duyệt này), xóa khi đăng xuất hoặc sang ngày mới. */
const KEY = 'kpi.snapshot';

export function saveSnapshot(snapshot) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...snapshot, date: today(), savedAt: Date.now() })); } catch { /* đầy bộ nhớ: bỏ qua */ }
}

export function loadSnapshot(email) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.date === today() && s.email === email ? s : null;
  } catch { return null; }
}

export function clearSnapshot() { try { localStorage.removeItem(KEY); } catch { /* bỏ qua */ } }
