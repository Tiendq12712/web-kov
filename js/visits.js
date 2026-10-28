/**
 * Lượt truy cập web: mỗi lần vào trang, web gửi một dòng (email, tên, vai trò, thiết bị, thời điểm) tới Google Form của chủ web;
 * câu trả lời nằm trong Sheet phản hồi của Form. Gửi qua Form nên nhân sự chỉ xem cũng ghi được, không cần quyền ghi Sheet.
 * Chưa cấu hình Form (CONFIG.visits.form trống) thì không ghi gì. Chỉ Admin xem thống kê (Thiết lập → Truy cập).
 */
import { CONFIG } from './config.js';
import { fetchRows, fetchTabs } from './sheet.js';
import { getToken } from './auth.js';
import { stampNow } from './audit.js';

const SAME_VISIT_MS = 30 * 60_000;   // mở lại trong 30 phút tính là cùng một lượt
export const visitsEnabled = () => Boolean(CONFIG.visits?.form && CONFIG.visits.fields?.email);

const lastKey = (email) => `kpi.visit.last.${email}`;
const deviceOf = () => (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Điện thoại' : 'Máy tính');

/** Ghi một lượt vào (không ném lỗi, không chặn giao diện). */
export function logVisit({ email, name, role }, now = Date.now()) {
  if (!visitsEnabled() || !email) return false;
  try {
    const last = Number(localStorage.getItem(lastKey(email)) ?? 0);
    if (now - last < SAME_VISIT_MS) return false;
    localStorage.setItem(lastKey(email), String(now));
  } catch { /* không đọc/ghi được bộ nhớ: vẫn ghi */ }
  const f = CONFIG.visits.fields, body = new URLSearchParams();
  body.set(f.email, email); if (f.name) body.set(f.name, name ?? ''); if (f.role) body.set(f.role, role ?? ''); if (f.device) body.set(f.device, deviceOf()); if (f.at) body.set(f.at, stampNow(new Date(now)));
  fetch(`https://docs.google.com/forms/d/e/${CONFIG.visits.form}/formResponse`, { method: 'POST', mode: 'no-cors', body }).catch(() => {});
  return true;
}

/** Đọc Sheet phản hồi của Form: cột nhận theo tiêu đề (Email, Tên, Vai trò, Thiết bị, Thời điểm; không có "Thời điểm" thì dùng dấu thời gian của Form). */
export async function loadVisits(link) {
  if (!link) throw new Error('Chưa có dòng "Lịch sử truy cập" trong tab Danh sách link');
  const tab = link.tab || (await fetchTabs(link.id, getToken()))[0];
  return parseVisits(await fetchRows(link.id, getToken(), { tab: `'${tab.replace(/'/g, "''")}'`, range: 'A1:H20000', render: 'FORMATTED_VALUE' }));
}

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
export function parseVisits(rows) {
  const head = (rows[0] ?? []).map(plain);
  const at = (...names) => head.findIndex((h) => names.some((n) => h.startsWith(n)));
  const col = { email: at('email'), name: at('ten', 'ho ten', 'name'), role: at('vai tro', 'role'), device: at('thiet bi', 'device'), time: at('thoi diem'), stamp: at('dau thoi gian', 'timestamp') };
  if (col.email < 0) throw new Error('Sheet phản hồi cần có cột "Email"');
  const when = (r) => { const t = String(r[col.time >= 0 ? col.time : col.stamp] ?? '').trim(); const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(t) ?? null; return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4].padStart(2, '0')}:${m[5]}` : ''; };
  return rows.slice(1).map((r) => ({ email: String(r[col.email] ?? '').trim().toLowerCase(), name: String(r[col.name] ?? '').trim(), role: String(r[col.role] ?? '').trim(), device: String(r[col.device] ?? '').trim(), at: when(r) }))
    .filter((x) => x.email && x.at).sort((a, b) => b.at.localeCompare(a.at));
}

const dayMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const addDays = (iso, n) => new Date(dayMs(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** Thống kê: hôm nay / 7 ngày / 30 ngày, số lượt theo ngày, theo tài khoản và tài khoản chưa vào 7 ngày (`accounts`: [{email, name, role}]). */
export function visitStats(rows, accounts, today) {
  const since = (n) => addDays(today, -(n - 1));
  const within = (n) => rows.filter((r) => r.at.slice(0, 10) >= since(n) && r.at.slice(0, 10) <= today);
  const uniq = (list) => new Set(list.map((r) => r.email)).size;
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29)).map((d) => { const L = rows.filter((r) => r.at.slice(0, 10) === d); return { day: d, visits: L.length, people: uniq(L) }; });
  const by = new Map();
  for (const r of rows) { const p = by.get(r.email) ?? { email: r.email, name: r.name, role: r.role, device: r.device, last: r.at, total: 0, d7: 0, d30: 0 }; p.total += 1; if (r.at.slice(0, 10) >= since(7)) p.d7 += 1; if (r.at.slice(0, 10) >= since(30)) p.d30 += 1; by.set(r.email, p); }
  const names = new Map(accounts.map((a) => [a.email.toLowerCase(), a]));
  const people = [...by.values()].map((p) => ({ ...p, name: names.get(p.email)?.name || p.name })).sort((a, b) => b.last.localeCompare(a.last));
  const active7 = new Set(within(7).map((r) => r.email));
  return {
    todayPeople: uniq(within(1)), todayVisits: within(1).length, week: { people: uniq(within(7)), visits: within(7).length }, month: { people: uniq(within(30)), visits: within(30).length },
    days, people, inactive: accounts.filter((a) => !active7.has(a.email.toLowerCase())), total: rows.length,
  };
}
