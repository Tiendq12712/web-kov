/**
 * Nhật ký thao tác: ghi lại các việc nhạy cảm (đồng bộ CRM, xuất call, sửa tài khoản, link, cookie…) vào tab "Nhật ký thao tác"
 * của Sheet cấu hình: ai làm, lúc nào, làm gì. Không bao giờ ghi nội dung cookie hay mật khẩu, chỉ ghi tên hành động và thông tin mô tả.
 * Ghi không được (mất mạng, thiếu quyền) thì giữ hàng đợi trên máy và thử lại ở lần ghi kế tiếp.
 */
import { CONFIG } from './config.js';
import { readTable, appendRow } from './sheetTable.js';

const COLUMNS = ['Thời điểm', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Chi tiết'];
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.audit, columns: COLUMNS, maxRows: 5000 };
const QUEUE = 'kpi.audit.queue';
const pad = (n) => String(n).padStart(2, '0');

export const stampNow = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
/** Cắt gọn và bỏ xuống dòng để một hành động nằm gọn trên một dòng của Sheet. */
export const clean = (text, max = 300) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Một dòng Sheet -> bản ghi. */
export const entryOf = ([at, by, action, object, detail]) => ({ at: String(at ?? '').trim(), by: String(by ?? '').trim(), action: String(action ?? '').trim(), object: String(object ?? '').trim(), detail: String(detail ?? '').trim() });

const readQueue = () => { try { return JSON.parse(localStorage.getItem(QUEUE)) ?? []; } catch { return []; } };
const writeQueue = (rows) => { try { localStorage.setItem(QUEUE, JSON.stringify(rows.slice(-200))); } catch { /* bỏ qua */ } };

/** Đẩy các dòng đang chờ lên Sheet; dòng nào lỗi thì giữ lại. */
async function flush() {
  const queue = readQueue();
  if (!queue.length) return;
  const left = [];
  for (const row of queue) { try { await appendRow({ ...target, row }); } catch { left.push(row); } }
  writeQueue(left);
}

/** Ghi một hành động. Không ném lỗi: nhật ký không được làm hỏng thao tác chính. */
export async function logAction(email, action, object = '', detail = '') {
  const row = [stampNow(), email || '(không rõ)', clean(action, 80), clean(object, 120), clean(detail)];
  try { await appendRow({ ...target, row }); flush().catch(() => {}); }
  catch { writeQueue([...readQueue(), row]); }
}

/** Đọc nhật ký, mới nhất trước (gồm cả các dòng đang chờ trên máy này). */
export async function loadAudit() {
  let rows = [];
  try { rows = await readTable(target); } catch (err) { if (err.code === 'auth') throw err; throw err; }
  const entries = [...rows, ...readQueue()].map(entryOf).filter((e) => e.at && e.action);
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
