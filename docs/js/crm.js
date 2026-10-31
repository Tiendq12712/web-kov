import { CONFIG } from './config.js';
import { readTable, writeTable } from './sheetTable.js';

/* ---------- Tab "Cấu hình đồng bộ" trong Sheet cấu hình ---------- */
const COLUMNS = ['crm_url', 'gsheet_url', 'tab_name', 'Bật/tắt', 'Mô tả'];
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.sync, columns: COLUMNS };

const ON = new Set(['bat', 'true', '1', 'x', 'co']);
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

const fromRow = ([crm, sheet, tab, on, note]) => ({ crm_url: crm.trim(), gsheet_url: sheet.trim(), tab_name: tab.trim(), enabled: ON.has(plain(on)), description: note.trim() });
const toRow = (t) => [t.crm_url, t.gsheet_url, t.tab_name, t.enabled ? 'Bật' : 'Tắt', t.description ?? ''];

export const loadTasks = async () => (await readTable(target)).map(fromRow).filter((t) => t.crm_url);

/** Đọc bản mới nhất → áp dụng thay đổi → ghi lại, để hạn chế ghi đè khi nhiều người cùng sửa. */
export async function mutateTasks(change) {
  const current = await loadTasks();
  const next = change(current);
  await writeTable({ ...target, rows: next.map(toRow), previousLength: current.length });
  return next;
}

/* ---------- Tab "Cấu hình call": Google Sheet đích và danh sách agent của mục Xuất Call ---------- */
const CALL_COLUMNS = ['Thiết lập', 'Giá trị'];
const CALL_KEYS = {
  gsheet_url: 'Google Sheet đích', tab_name: 'Tab đích', agents: 'Danh sách agent', cuser: 'Tài khoản call-report',
  date_mode: 'Chế độ thời gian', date_from: 'Từ ngày (tùy chọn)', date_to: 'Đến ngày (tùy chọn)',
};

/** Các cách chọn khoảng thời gian xuất; `range(today)` trả về [từ, đến] dạng Date. */
const day = (d, offset = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
export const DATE_MODES = [
  { id: 'month_to_yesterday', label: 'Từ đầu tháng đến hôm qua', range: (t) => [t.getDate() === 1 ? day(t, -1) : new Date(t.getFullYear(), t.getMonth(), 1), day(t, -1)] },
  { id: 'yesterday', label: 'Hôm qua', range: (t) => [day(t, -1), day(t, -1)] },
  { id: 'today', label: 'Hôm nay', range: (t) => [day(t), day(t)] },
  { id: 'last7', label: '7 ngày gần nhất (đến hôm qua)', range: (t) => [day(t, -7), day(t, -1)] },
  { id: 'last_month', label: 'Tháng trước', range: (t) => [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)] },
  { id: 'custom', label: 'Tùy chọn (chọn ngày)' },
];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const modeOf = (config) => DATE_MODES.find((m) => m.id === config.date_mode || m.label === config.date_mode) ?? DATE_MODES[0];

/** Khoảng ngày sẽ xuất theo cấu hình: { from, to } dạng YYYY-MM-DD, hoặc { error }. */
export function resolveRange(config, today = new Date()) {
  const mode = modeOf(config);
  const [from, to] = mode.id === 'custom' ? [config.date_from, config.date_to] : mode.range(today).map(iso);
  if (!from || !to) return { error: 'Hãy chọn đủ "Từ ngày" và "Đến ngày".' };
  if (to < from) return { error: '"Đến ngày" phải sau hoặc bằng "Từ ngày".' };
  return { from, to };
}
const callTarget = { url: CONFIG.configSheet, tab: CONFIG.tabs.call, columns: CALL_COLUMNS };

export async function loadCallConfig() {
  const values = new Map((await readTable(callTarget)).map(([key, value]) => [key.trim(), value]));
  const config = Object.fromEntries(Object.entries(CALL_KEYS).map(([field, key]) => [field, (values.get(key) ?? '').trim()]));
  return { ...config, date_mode: modeOf(config).id };
}

export async function saveCallConfig(config) {
  const previous = (await readTable(callTarget)).length;
  await writeTable({ ...callTarget, rows: Object.entries(CALL_KEYS).map(([field, key]) => [key, field === 'date_mode' ? modeOf(config).label : config[field]]), previousLength: previous });
  return config;
}

export const splitAgents = (text) => text.split(/[\n;]+/).map((a) => a.trim()).filter(Boolean);

/* ---------- Máy chủ cục bộ chạy tool CRM ---------- */
/** Gọi máy chủ cục bộ; `scope` là nhóm API (crm hoặc call). */
async function request(scope, method, path, body) {
  let res;
  try {
    res = await fetch(`/api/${scope}${path}`, {
      method,
      headers: { 'X-KV-Client': 'web-kov', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Không kết nối được máy chủ cục bộ của tool CRM (có thể đã tắt hoặc bạn mở web ngoài http://localhost:8080). Chạy lại máy chủ rồi thử lại.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Máy chủ cục bộ trả lỗi ${res.status}`);
  return data;
}

const api = (method, path, body) => request('crm', method, path, body);
const fetchCall = (method, path, body) => request('call', method, path, body);

export const crmServer = {
  status: () => api('GET', '/status'),
  setCookie: (cookie) => api('POST', '/cookie', { cookie }),
  clearCookie: () => api('DELETE', '/cookie'),
  run: (tasks) => api('POST', '/run', { tasks: tasks.map(({ description, ...task }) => task) }),
  job: (id, since) => api('GET', `/jobs/${id}?since=${since}`),
  stop: (id) => api('POST', `/jobs/${id}/stop`, {}),
};

export const callServer = {
  setCookie: (cookie) => fetchCall('POST', '/cookie', { cookie }),
  clearCookie: () => fetchCall('DELETE', '/cookie'),
  run: (params) => fetchCall('POST', '/run', params),
};
