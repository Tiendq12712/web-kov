/**
 * Đánh dấu data đã nghe lại call: kết quả lưu thành nhật ký trong tab "Đã nghe lại" của Sheet cấu hình để cả nhóm quản lý cùng thấy
 * (mỗi lần đánh giá thêm một dòng, dòng mới nhất của cùng data là kết quả hiện tại). Không ghi được Sheet thì giữ trên máy này.
 */
import { CONFIG } from './config.js';
import { readTable, appendRow } from './sheetTable.js';

export const RESULTS = [
  { id: 'ok', label: 'Ổn', tone: 'good' },
  { id: 'remind', label: 'Cần nhắc nhở', tone: 'warn' },
  { id: 'wrong', label: 'Sai trạng thái kết nối', tone: 'bad' },
];
export const resultOf = (id) => RESULTS.find((r) => r.id === id) ?? null;

const COLUMNS = ['Retailer ID', 'Thời gian tương tác', 'Mã NS', 'Nhân sự', 'Kết quả', 'Ghi chú', 'Người nghe', 'Thời điểm'];
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.heard, columns: COLUMNS, maxRows: 5000 };
const localKey = (email) => `kpi.heard.${email}`;

/** Khóa của một data: Retailer ID + thời gian tương tác. */
export const heardKey = (retailer, ts) => `${retailer}|${ts ?? ''}`;

/** Các dòng nhật ký -> Map(khóa -> bản ghi mới nhất). */
export function mergeHeard(rows) {
  const out = new Map();
  for (const [retailer, ts, code, name, result, note, by, at] of rows) {
    if (!retailer || !resultOf(result)) continue;   // dòng "Chưa nghe" (rỗng) hoặc sai định dạng thì bỏ qua
    out.set(heardKey(retailer, ts), { retailer, ts, code, name, result, note, by, at });
  }
  return out;
}

const readLocal = (email) => { try { return JSON.parse(localStorage.getItem(localKey(email))) ?? []; } catch { return []; } };
const writeLocal = (email, rows) => { try { localStorage.setItem(localKey(email), JSON.stringify(rows.slice(-500))); } catch { /* bỏ qua */ } };

export async function loadHeard(email) {
  let remote = [];
  try { remote = await readTable(target); } catch (err) { if (err.code === 'auth') throw err; }
  return mergeHeard([...remote, ...readLocal(email)]);   // bản trên máy (chưa đẩy được lên Sheet) áp sau cùng
}

/** Lưu một đánh giá; trả về { shared: true } nếu đã ghi lên Sheet, { shared: false, error } nếu chỉ lưu trên máy. */
export async function saveHeard(email, rec) {
  const stamp = rec.at ?? new Date().toISOString().slice(0, 16).replace('T', ' ');
  const row = [String(rec.retailer), String(rec.ts ?? ''), String(rec.code ?? ''),   // ghi dạng chuỗi (RAW) để số lớn không bị Sheet đổi sang dạng khoa học
     rec.name ?? '', rec.result, rec.note ?? '', rec.by ?? email, stamp];
  try { await appendRow({ ...target, row }); return { shared: true }; }
  catch (error) { writeLocal(email, [...readLocal(email), row]); return { shared: false, error: error.message }; }
}
