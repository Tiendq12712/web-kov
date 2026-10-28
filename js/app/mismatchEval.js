/** Đánh giá "vì sao không khớp" ở tab Customer Info: tải nhật ký, lưu từng đánh giá (Sheet hoặc trên máy). */
import { loadEvals, saveEval } from '../mismatchEval.js';
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

/** `el`: ô chọn đánh giá hoặc ô ghi chú của một dòng (cùng mang data-id, data-retailer, data-code, data-name). */
export async function setEval(el, { result, note }) {
  const C = state.cinfo, { id, retailer, code, name } = el.dataset;
  const prev = C.evals.get(id);
  const rec = { id, retailer, code, name, result: result ?? prev?.result ?? '', note: note ?? prev?.note ?? '', by: state.me.email, at: new Date().toISOString().slice(0, 16).replace('T', ' ') };
  if (!rec.result) { C.evalNotice = 'Chọn đánh giá trước, rồi mới ghi chú được.'; return hooks.renderView(); }
  C.evals.set(id, rec); C.evalNotice = ''; hooks.renderView();
  const res = await saveEval(state.me.email, rec);
  if (!res.shared) { C.evalNotice = `Chưa ghi được lên Sheet (${res.error}). Đánh giá được giữ trên máy này; cần quyền chỉnh sửa Sheet cấu hình để cả nhóm quản lý cùng thấy.`; if (state.tab === 'cinfo') hooks.renderView(); }
}
export async function clearEval(el) {
  const C = state.cinfo, { id, retailer, code, name } = el.dataset;
  C.evals.delete(id); C.evalNotice = ''; hooks.renderView();
  const res = await saveEval(state.me.email, { id, retailer, code, name, result: '', note: '', by: state.me.email });
  if (!res.shared) { C.evalNotice = `Chưa ghi được lên Sheet (${res.error}).`; if (state.tab === 'cinfo') hooks.renderView(); }
}
