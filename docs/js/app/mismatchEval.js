/** Đánh giá "vì sao không khớp" ở tab Customer Info: tải nhật ký, lưu từng đánh giá (Sheet hoặc trên máy). */
import { loadEvals, saveEval, evalIds } from '../mismatchEval.js';
import { state } from './state.js';
import { hooks } from './hooks.js';

export async function ensureEvals() {
  const C = state.cinfo;
  if (C.evalsLoaded || C.evalsLoading || state.me.role === 'member') return;
  C.evalsLoading = true;
  try { C.evals = await loadEvals(state.me.email); } catch (err) { if (err.code === 'auth') hooks.authLost(err.message); }
  C.evalsLoaded = true; C.evalsLoading = false;
  if (state.tab === 'cinfo') hooks.renderView();
}

/** `el`: ô đánh giá hoặc ô ghi chú của một dòng (mang data-id, data-retailer, data-code, data-name); `results`: các đánh giá đang chọn. */
export async function setEval(el, { results, note }) {
  const C = state.cinfo, { id, retailer, code, name } = el.dataset;
  const prev = C.evals.get(id);
  const ids = results ?? prev?.results ?? [];
  if (results) C.evalOpen = id;   // giữ ô chọn đang mở để chọn tiếp nhiều đánh giá
  const rec = { id, retailer, code, name, result: ids.join(','), results: ids, note: note ?? prev?.note ?? '', by: state.me.email, at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
  if (!ids.length && results) return clearEval(el);
  if (!ids.length) { C.evalNotice = 'Chọn đánh giá trước, rồi mới ghi chú được.'; return hooks.renderView(); }
  C.evals.set(id, rec); C.evalNotice = ''; hooks.renderView();
  const res = await saveEval(state.me.email, rec);
  if (!res.shared) { C.evalNotice = `Chưa ghi được lên Sheet (${res.error}). Đánh giá được giữ trên máy này; cần quyền chỉnh sửa Sheet cấu hình để cả nhóm quản lý cùng thấy.`; if (state.tab === 'cinfo') hooks.renderView(); }
}
export async function clearEval(el) {
  const C = state.cinfo, { id, retailer, code, name } = el.dataset;
  C.evals.delete(id); C.evalNotice = ''; C.evalOpen = id; hooks.renderView();
  const res = await saveEval(state.me.email, { id, retailer, code, name, result: '', note: '', by: state.me.email });
  if (!res.shared) { C.evalNotice = `Chưa ghi được lên Sheet (${res.error}).`; if (state.tab === 'cinfo') hooks.renderView(); }
}
