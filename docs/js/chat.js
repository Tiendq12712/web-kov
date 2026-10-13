import { CONFIG } from './config.js';
import { readTable, appendRow, updateRow } from './sheetTable.js';

/** Tin nhắn chia sẻ khó khăn: mỗi dòng là một tin của nhân sự, phản hồi của quản lý nằm cùng dòng. */
const COLUMNS = ['ID', 'Thời gian', 'Email', 'Họ tên', 'Nội dung', 'Trạng thái', 'Người trả lời', 'Trả lời', 'Thời gian trả lời'];
const target = { url: CONFIG.chatSheet, tab: CONFIG.tabs.chat, columns: COLUMNS };
const MAX_LENGTH = 1000;

const stamp = () => new Date().toLocaleString('vi-VN', { hour12: false });
const toMessage = ([id, at, email, name, text, status, by, reply, repliedAt], index) =>
  ({ index, id, at, email, name, text, status, by, reply, repliedAt });
const fromMessage = (m) => [m.id, m.at, m.email, m.name, m.text, m.status, m.by, m.reply, m.repliedAt];

export const loadMessages = async () => (await readTable(target)).map(toMessage);

export async function sendMessage({ email, name, text }) {
  const body = text.trim().slice(0, MAX_LENGTH);
  if (!body) throw new Error('Hãy nhập nội dung trước khi gửi');
  await appendRow({ ...target, row: fromMessage({ id: String(Date.now()), at: stamp(), email, name, text: body, status: 'Mới', by: '', reply: '', repliedAt: '' }) });
}

export async function replyMessage(message, by, reply) {
  const body = reply.trim().slice(0, MAX_LENGTH);
  if (!body) throw new Error('Hãy nhập nội dung phản hồi');
  await updateRow({ ...target, index: message.index, row: fromMessage({ ...message, status: 'Đã trả lời', by, reply: body, repliedAt: stamp() }) });
}

export const CHAT_MAX_LENGTH = MAX_LENGTH;
