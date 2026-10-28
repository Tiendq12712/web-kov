/**
 * Đánh giá của quản lý cho từng act "tư vấn tính năng nhưng không khớp": lưu thành nhật ký trong tab "Đánh giá không khớp" của Sheet cấu hình
 * (mỗi lần đánh giá thêm một dòng, dòng mới nhất của cùng act là kết quả hiện tại; dòng có đánh giá rỗng nghĩa là bỏ đánh giá). Chọn được nhiều đánh giá cho một act.
 * Không ghi được Sheet thì giữ trên máy này.
 */
import { CONFIG } from './config.js';
import { readTable, appendRow } from './sheetTable.js';

export const EVALS = [
  { id: 'skip', label: 'SC không tư vấn theo gợi ý', tone: 'bad' },
  { id: 'nofeature', label: 'SC có tư vấn nhưng không chọn tính năng', tone: 'warn' },
  { id: 'customer', label: 'KH chủ động đưa ra vấn đề', tone: 'info' },
  { id: 'objective', label: 'Lý do khách quan (KH không cần, đã dùng…)', tone: 'good' },
  { id: 'rcm', label: 'Gợi ý hệ thống chưa phù hợp', tone: 'info' },
  { id: 'other', label: 'Khác (xem ghi chú)', tone: 'neutral' },
];
const LEGACY = { forgot: 'skip' };   // bản cũ tách "quên tư vấn" và "cố tình"; nay gộp thành một
export const evalOf = (id) => EVALS.find((e) => e.id === (LEGACY[id] ?? id)) ?? null;

const COLUMNS = ['Activity ID', 'Retailer ID', 'Mã NS', 'Nhân sự', 'Đánh giá', 'Ghi chú', 'Người đánh giá', 'Thời điểm'];
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.mismatch, columns: COLUMNS, maxRows: 5000 };
const localKey = (email) => `kpi.mismatchEval.${email}`;

/** Một act có thể có nhiều đánh giá, lưu trong một ô, ngăn bằng dấu phẩy ("skip,customer"). Trả về mảng id hợp lệ, không trùng. */
export const evalIds = (raw) => [...new Set(String(raw ?? '').split(',').map((x) => evalOf(x.trim())?.id).filter(Boolean))];

export function mergeEvals(rows) {
  const out = new Map();
  for (const [id, retailer, code, name, raw, note, by, at] of rows) {
    if (!id) continue;
    const results = evalIds(raw);
    if (!results.length) { out.delete(id); continue; }   // đánh giá rỗng = bỏ đánh giá
    out.set(id, { id, retailer, code, name, result: results.join(','), results, note, by, at });
  }
  return out;
}

const readLocal = (email) => { try { return JSON.parse(localStorage.getItem(localKey(email))) ?? []; } catch { return []; } };
const writeLocal = (email, rows) => { try { localStorage.setItem(localKey(email), JSON.stringify(rows.slice(-500))); } catch { /* bỏ qua */ } };

export async function loadEvals(email) {
  let remote = [];
  try { remote = await readTable(target); } catch (err) { if (err.code === 'auth') throw err; }
  return mergeEvals([...remote, ...readLocal(email)]);
}

/** Lưu một đánh giá; trả về { shared: true } nếu đã ghi lên Sheet, { shared: false, error } nếu chỉ lưu trên máy. */
export async function saveEval(email, rec) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const row = [String(rec.id), String(rec.retailer ?? ''), String(rec.code ?? ''), rec.name ?? '', rec.result ?? '', rec.note ?? '', rec.by ?? email, stamp];
  try { await appendRow({ ...target, row }); return { shared: true }; }
  catch (error) { writeLocal(email, [...readLocal(email), row]); return { shared: false, error: error.message }; }
}
