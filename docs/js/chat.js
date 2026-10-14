import { CONFIG } from './config.js';
import { readTable, appendRow } from './sheetTable.js';

/**
 * Hội thoại: mỗi tin nhắn là một dòng trong tab "Hội thoại" của Sheet chat.
 * Kênh `chung` = cả nhóm cùng thấy; kênh riêng = email của nhân sự (nhân sự đó + Admin/Quản trị thấy).
 */
export const GENERAL = 'chung';
const COLUMNS = ['ID', 'Thời gian', 'Kênh', 'Email', 'Tên', 'Quyền', 'Nội dung'];
const target = { url: CONFIG.chatSheet, tab: CONFIG.tabs.thread, columns: COLUMNS, maxRows: 5000 };
// Tab "Chia sẻ" của phiên bản cũ (mỗi dòng: câu hỏi + phản hồi) vẫn được đọc để không mất tin cũ.
const LEGACY = { url: CONFIG.chatSheet, tab: CONFIG.tabs.chat, columns: ['ID', 'Thời gian', 'Email', 'Họ tên', 'Nội dung', 'Trạng thái', 'Người trả lời', 'Trả lời', 'Thời gian trả lời'], maxRows: 2000 };
export const CHAT_MAX_LENGTH = 1000;

const lower = (s) => String(s ?? '').trim().toLowerCase();
const toMessage = ([id, at, channel, email, name, role, text]) => ({ id: Number(id) || 0, at, channel: lower(channel), email: lower(email), name: name?.trim() ?? '', role: lower(role) || 'member', text });

function fromLegacy([id, at, email, name, text, , by, reply, repliedAt]) {
  const base = Number(id) || 0;
  const out = [{ id: base, at, channel: lower(email), email: lower(email), name: name?.trim() ?? '', role: 'member', text }];
  if (reply?.trim()) out.push({ id: base + 1, at: repliedAt, channel: lower(email), email: '', name: by?.trim() || 'Quản lý', role: 'manager', text: reply });
  return out;
}

export async function loadMessages() {
  const [now, legacy] = await Promise.all([readTable(target), readTable(LEGACY).catch(() => [])]);
  return [...legacy.flatMap(fromLegacy), ...now.map(toMessage)].filter((m) => m.channel && m.text).sort((a, b) => a.id - b.id);
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/** Gửi một tin; trả về tin vừa tạo để hiện ngay. */
export async function sendMessage({ channel, me, name, text }) {
  const body = text.trim().slice(0, CHAT_MAX_LENGTH);
  if (!body) throw new Error('Hãy nhập nội dung trước khi gửi');
  const message = { id: Date.now(), at: stamp(new Date()), channel: lower(channel), email: lower(me.email), name, role: me.role, text: body };
  await appendRow({ ...target, row: [String(message.id), message.at, message.channel, message.email, name, me.role, body] });
  return message;
}

/* ---------- Chưa đọc (nhớ theo từng trình duyệt) ---------- */
const seenKey = (email) => `kpi.chatseen.${lower(email)}`;
const readSeen = (email) => { try { return JSON.parse(localStorage.getItem(seenKey(email))); } catch { return null; } };
const writeSeen = (email, seen) => { try { localStorage.setItem(seenKey(email), JSON.stringify(seen)); } catch {} };

const isManager = (me) => me.role !== 'member';
/** Tin mà người này được phép thấy: kênh chung + kênh riêng của mình (Admin/Quản trị thấy mọi kênh riêng). */
export const visible = (me, m) => isManager(me) || m.channel === GENERAL || m.channel === lower(me.email);

/** { total, by: { kênh: số tin chưa đọc } } — tin của chính mình không tính. */
export function unreadInfo(messages, me) {
  let seen = readSeen(me.email);
  if (!seen) {   // lần đầu: coi kênh chung cũ là đã xem để không báo hàng loạt
    const lastGeneral = messages.filter((m) => m.channel === GENERAL).at(-1)?.id ?? 0;
    seen = { [GENERAL]: lastGeneral };
    writeSeen(me.email, seen);
  }
  const by = {};
  for (const m of messages) {
    if (!visible(me, m) || m.email === lower(me.email) || m.id <= (seen[m.channel] ?? 0)) continue;
    by[m.channel] = (by[m.channel] ?? 0) + 1;
  }
  return { total: Object.values(by).reduce((a, b) => a + b, 0), by };
}

export function markSeen(me, channel, messages) {
  const last = messages.filter((m) => m.channel === channel).at(-1)?.id ?? 0;
  const seen = readSeen(me.email) ?? {};
  if ((seen[channel] ?? 0) >= last) return;
  writeSeen(me.email, { ...seen, [channel]: last });
}

/** Danh sách hội thoại bên trái: "Cả nhóm" + (nhân sự: kênh riêng với quản lý | quản lý: từng nhân sự). */
export function buildThreads(messages, me, members, started = []) {
  const lastOf = (key) => messages.filter((m) => m.channel === key).at(-1) ?? null;
  const threads = [{ key: GENERAL, label: 'Cả nhóm', sub: 'Trao đổi chung', general: true, last: lastOf(GENERAL) }];
  if (!isManager(me)) {
    threads.unshift({ key: lower(me.email), label: 'Quản lý', sub: 'Riêng tư với quản lý', last: lastOf(lower(me.email)) });
    return threads;
  }
  const names = new Map(members.map((m) => [lower(m.email), m.name]));
  messages.filter((m) => m.channel !== GENERAL && m.role === 'member' && m.name && !names.get(m.channel)).forEach((m) => names.set(m.channel, m.name));
  // Chỉ hiện nhân sự đã từng có tin nhắn (hoặc quản lý vừa chọn "Nhắn cho nhân sự…"); người chưa chat thì ẩn.
  const keys = new Set([...messages.map((m) => m.channel).filter((c) => c !== GENERAL), ...started]);
  const priv = [...keys].map((key) => ({ key, label: names.get(key) || key.split('@')[0], sub: key, last: lastOf(key) }))
    .sort((a, b) => (b.last?.id ?? 0) - (a.last?.id ?? 0) || a.label.localeCompare(b.label, 'vi'));
  return [...threads, ...priv];
}

/** Nhân sự chưa có hội thoại nào — quản lý có thể chọn để bắt đầu nhắn. */
export const startable = (messages, members) => {
  const used = new Set(messages.map((m) => m.channel));
  return members.filter((m) => !used.has(m.email));
};
