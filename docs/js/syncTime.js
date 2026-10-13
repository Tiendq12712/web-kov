import { CONFIG } from './config.js';
import { readTable, writeTable } from './sheetTable.js';

/** Thời điểm bấm "Đồng bộ CRM" gần nhất, lưu trong Sheet cấu hình để mọi người cùng thấy. */
const KEY = 'Đồng bộ CRM lần cuối';
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.updated, columns: ['Thiết lập', 'Giá trị'] };
const pad = (n) => String(n).padStart(2, '0');

const format = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parse = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(text ?? '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};

/** Trả về Date hoặc null (chưa đồng bộ lần nào / không đọc được → dùng thời gian ghi trong báo cáo). */
export async function loadSyncTime() {
  try {
    const row = (await readTable(target)).find(([key]) => key.trim() === KEY);
    return parse(row?.[1]);
  } catch { return null; }
}

export const recordSyncTime = (now = new Date()) =>
  writeTable({ ...target, rows: [[KEY, format(now)]], previousLength: 1 });

/** Đè ngày/giờ cập nhật của từng team bằng thời điểm đồng bộ, nếu thời điểm đó thuộc đúng tháng đang xem. */
export function applySyncTime(data, syncTime) {
  if (!syncTime || `${syncTime.getFullYear()}-${pad(syncTime.getMonth() + 1)}` !== data.month) return data;
  const asOf = `${data.month}-${pad(syncTime.getDate())}`;
  const updatedTime = `${syncTime.getHours()}h${pad(syncTime.getMinutes())}`;
  return { ...data, teams: data.teams.map((t) => ({ ...t, asOf, updatedTime })) };
}
