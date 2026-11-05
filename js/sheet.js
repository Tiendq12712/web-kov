
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DAY_SECONDS = 86400;

/* ---------- Ánh xạ cột (ký hiệu cột Excel) -> trường dữ liệu ---------- */
const ONLINE = {
  level: 'C', kpi: 'Z',
  need: { target: 'J', done: 'K', missing: 'L', rate: 'M', pass: 'N' },
  main: { target: 'O', done: 'P', missing: 'Q', rate: 'R' },
  addon: { target: 'S', done: 'T', missing: 'U', rate: 'V' },
  extra: {
    assigned: 'D', actDone: 'E', doing: 'F', notStarted: 'G',
    avgPerDay: 'H', progress: 'I', impactRate: 'AA', workdays: 'AB',
  },
  talk: { target: 'W', actual: 'X', pass: 'Y' },
};
const TEAMS = [
  { id: 'online-hcm', name: 'Team Online HCM' },
  { id: 'online-hn', name: 'Team Online HN' },
];
const ONLINE_MARKER = 'TEAM ONLINE';   // dòng đánh dấu bắt đầu khối Online (nếu tab còn khối Offline phía trên)
const SECONDS_FIELDS = new Set(['W', 'X']); // Talk time: Sheets trả về phần của ngày

/* ---------- Đọc ô ---------- */
const colIndex = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

const normalize = (v) => {
  if (typeof v !== 'string') return v ?? null;
  const s = v.trim();
  if (s === '' || s.startsWith('#')) return null;     // ô rỗng, #N/A, #DIV/0!...
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s;   // "7.5" -> 7.5
};

const makeReader = (rows) => (letters, row) => normalize(rows[row - 1]?.[colIndex(letters)]);

const readBlock = (cell, row, spec) => Object.fromEntries(Object.entries(spec).map(([key, col]) => {
  let v = cell(col, row);
  if (SECONDS_FIELDS.has(col) && typeof v === 'number') v = Math.round(v * DAY_SECONDS);
  return [key, key === 'pass' ? v === 'Đạt' : v];
}));

const readMember = (cell, row, schema) => {
  const [, code = '', name = '', role = ''] = /^(\d+)\s*-\s*(.+?)(?:\s*-\s*(.+))?$/.exec(String(cell('B', row) ?? '')) ?? [];   // chưa ghi vai trò vẫn đọc được
  const member = { code, name, role, level: cell(schema.level, row), kpi: cell(schema.kpi, row) };
  for (const key of ['need', 'main', 'addon', 'extra', 'talk']) {
    if (schema[key]) member[key] = readBlock(cell, row, schema[key]);
  }
  return member;
};

/** "Update 2h30 10/10" -> { time: '2h30', date: '2026-10-10' } */
const parseUpdated = (text, month) => {
  const m = /Update\s+(\S+)\s+(\d+)\/(\d+)/.exec(text ?? '');
  if (!m) return null;
  const [y, mo] = month.split('-').map(Number);
  if (Number(m[3]) === mo) return { time: m[1], date: `${y}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}` };
  // Sheet chốt số sau nửa đêm ("Update 8h 1/11" trong tab tháng 10): vẫn là số liệu của tháng này, tính đến ngày cuối tháng.
  const last = String(new Date(y, mo, 0).getDate()).padStart(2, '0');
  return { time: m[1], date: Number(m[3]) === (mo % 12) + 1 ? `${month}-${last}` : fallbackAsOf(month) };
};

/** Tab chưa có dòng "Update …" (ví dụ tháng mới vừa mở): hôm nay nếu đang trong tháng, tháng đã qua thì ngày cuối tháng, tháng chưa tới thì ngày 1. */
export function fallbackAsOf(month, now = new Date()) {
  const [y, m] = month.split('-').map(Number);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (today.startsWith(month)) return today;
  return today > month ? `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` : `${month}-01`;
}

/** Dòng sau "TEAM ONLINE" (nếu có); tab chỉ chứa Team Online thì đọc từ đầu. */
const findOnlineStart = (rows) =>
  rows.findIndex((r) => r.some((c) => typeof c === 'string' && c.trim() === ONLINE_MARKER)) + 1;

/** Dòng tổng của team: ghi "Total…", hoặc không có tên nhân sự nhưng có số liệu ở cột D. */
const isTotalRow = (a, b, d) => (typeof a === 'string' && a.startsWith('Total')) || (!b && typeof d === 'number');

/** Chuyển bảng giá trị thô của tab KPI thành dữ liệu báo cáo (chỉ Team Online). */
export function parseKpi(rows, month) {
  const cell = makeReader(rows);
  const start = findOnlineStart(rows);

  const queue = [...TEAMS];
  const teams = [];
  let updated = null;
  let current = null;

  for (let row = start + 1; row <= rows.length; row++) {
    const a = cell('A', row);
    const b = cell('B', row);
    if (typeof a === 'string' && a.startsWith('Update')) {
      updated = parseUpdated(a, month);
    } else if (typeof a === 'number' && /^\d+\s*-/.test(b ?? '') && (current || queue.length)) {
      current ??= { ...queue.shift(), updatedTime: updated?.time ?? '—', asOf: updated?.date ?? fallbackAsOf(month), members: [] };
      current.members.push(readMember(cell, row, ONLINE));
    } else if (current && isTotalRow(a, b, cell('D', row))) {
      teams.push(current);
      current = null;
    }
  }
  if (!teams.length) throw new Error('Không tìm thấy bảng KPI trong tab KPI');
  return { month, title: cell('M', 1), teams };
}

/* ---------- Gọi Google Sheets API ---------- */
export const sheetId = (urlOrId) => /\/d\/([\w-]+)/.exec(urlOrId)?.[1] ?? urlOrId;

/** Thời gian chờ (ms) trước mỗi lần thử lại khi Google báo vượt hạn mức đọc (429); hạn mức tính theo phút nên chờ khá lâu. */
export const RETRY_429 = [3000, 8000, 15000];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch có thời gian chờ: quá hạn thì báo lỗi thay vì chờ mãi; gặp 429 thì chờ rồi thử lại. */
async function fetchWithin(url, init, ms) {
  for (let attempt = 0; ; attempt += 1) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), ms);
    let res;
    try { res = await fetch(url, { ...init, signal: ctrl.signal }); }
    catch (err) { throw err.name === 'AbortError' ? new Error('Google Sheets phản hồi quá lâu. Kiểm tra mạng rồi thử lại.') : err; }
    finally { clearTimeout(timer); }
    if (res.status !== 429 || attempt >= RETRY_429.length) return res;
    await sleep(RETRY_429[attempt]);
  }
}

/** Đọc một tab. `render`: UNFORMATTED_VALUE (số thô) hoặc FORMATTED_VALUE (chuỗi như đang hiển thị). */
export async function fetchRows(urlOrId, token, { tab, range: area = 'A1:AZ1000', render = 'UNFORMATTED_VALUE', timeout = 60_000 } = {}) {
  const range = encodeURIComponent(`${tab}!${area}`);
  const res = await fetchWithin(`${API}/${sheetId(urlOrId)}/values/${range}?valueRenderOption=${render}`, { headers: { Authorization: `Bearer ${token}` } }, timeout);
  if (res.status === 401) throw Object.assign(new Error('Phiên đăng nhập đã hết hạn'), { code: 'auth' });
  if (res.status === 403 || res.status === 404) {
    throw Object.assign(new Error('Tài khoản của bạn chưa được cấp quyền xem Google Sheet này'), { code: 'forbidden' });
  }
  if (res.status === 400) throw new Error(`Không tìm thấy tab "${tab}" trong Google Sheet`);
  if (res.status === 429) throw new Error('Google Sheets đang giới hạn số lần đọc (quá nhiều yêu cầu trong 1 phút). Đợi khoảng 1 phút rồi tải lại trang.');
  if (!res.ok) throw new Error(`Google Sheets trả lỗi ${res.status}`);
  return (await res.json()).values ?? [];
}

/** Tên các tab đang hiển thị của một Google Sheet. */
export async function fetchTabs(urlOrId, token) {
  const res = await fetchWithin(`${API}/${sheetId(urlOrId)}?fields=sheets.properties(title,hidden)`, { headers: { Authorization: `Bearer ${token}` } }, 60_000);
  if (res.status === 401) throw Object.assign(new Error('Phiên đăng nhập đã hết hạn'), { code: 'auth' });
  if (res.status === 403 || res.status === 404) throw Object.assign(new Error('Tài khoản của bạn chưa được cấp quyền xem Google Sheet này'), { code: 'forbidden' });
  if (!res.ok) throw new Error(`Google Sheets trả lỗi ${res.status}`);
  const { sheets = [] } = await res.json();
  return sheets.map((s) => s.properties).filter((p) => !p.hidden).map((p) => p.title);
}
