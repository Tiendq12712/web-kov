/** Đánh dấu "đã nghe lại" ở tab Nghe lại call: tải nhật ký, lưu từng đánh giá (Sheet hoặc trên máy). */
import { loadHeard, saveHeard, heardKey } from '../heard.js';
import { state } from './state.js';
import { hooks } from './hooks.js';

export async function ensureHeard() {
  const L = state.listen;
  if (L.heardLoaded || L.heardLoading) return;
  L.heardLoading = true;
  try { L.heard = await loadHeard(state.me.email); } catch (err) { if (err.code === 'auth') hooks.authLost(err.message); }
  L.heardLoaded = true; L.heardLoading = false;
  if (state.tab === 'listen') hooks.renderView();
}
export async function markHeard(sel) {
  const L = state.listen, { retailer, ts, code, name } = sel.dataset, key = heardKey(retailer, ts ? Number(ts) : null);
  if (!sel.value) { L.heard.delete(key); L.heardNotice = 'Đã bỏ đánh dấu trên máy này; nhật ký trên Sheet vẫn giữ lần đánh giá trước (dòng mới nhất mới được tính khi tải lại).'; return hooks.renderView(); }
  L.heard.set(key, { retailer, ts, code, name, result: sel.value, by: state.me.email, at: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  L.heardNotice = ''; hooks.renderView();
  const res = await saveHeard(state.me.email, { retailer, ts: ts ? Number(ts) : '', code, name, result: sel.value, by: state.me.email });
  if (!res.shared) { L.heardNotice = `Chưa ghi được lên Sheet (${res.error}). Kết quả được giữ trên máy này; nhờ Admin cấp quyền chỉnh sửa Sheet cấu hình để cả nhóm cùng thấy.`; if (state.tab === 'listen') hooks.renderView(); }
}

