import { getToken, getWriteToken } from './auth.js';
import { sheetId } from './sheet.js';

/** Bảng nhỏ lưu trong một tab Google Sheet: dòng 1 là tiêu đề, dữ liệu từ dòng 2. */
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_ROWS = 500;

const lastColumn = (columns) => String.fromCharCode(64 + columns.length);
const rangeOf = (tab, a1) => encodeURIComponent(`${tab}!${a1}`);

async function call(url, token, options = {}) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60_000);   // quá 60 giây thì báo lỗi thay vì chờ mãi
  let res;
  try { res = await fetch(url, { ...options, signal: ctrl.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }); }
  catch (err) { throw err.name === 'AbortError' ? new Error('Google Sheets phản hồi quá lâu. Kiểm tra mạng rồi thử lại.') : err; }
  finally { clearTimeout(timer); }
  if (res.status === 401) throw Object.assign(new Error('Phiên đăng nhập đã hết hạn'), { code: 'auth' });
  if (res.status === 403) throw new Error('Bạn không có quyền với Google Sheet này (cần quyền chỉnh sửa để thay đổi)');
  return res;
}

/** Đọc các dòng dữ liệu; tab chưa tồn tại thì trả về danh sách rỗng. */
export async function readTable({ url, tab, columns, token = getToken(), maxRows = MAX_ROWS }) {
  const area = `A2:${lastColumn(columns)}${maxRows}`;
  const res = await call(`${API}/${sheetId(url)}/values/${rangeOf(tab, area)}?valueRenderOption=FORMATTED_VALUE`, token);
  if (res.status === 400) return [];
  if (!res.ok) throw new Error(`Không đọc được tab "${tab}" (${res.status})`);
  const { values = [] } = await res.json();
  return values
    .filter((row) => row.some((cell) => String(cell).trim()))
    .map((row) => columns.map((_, i) => String(row[i] ?? '')));
}

/** Ghi lại toàn bộ bảng trong một lệnh; tạo tab nếu chưa có. `previousLength` để xóa các dòng thừa. */
export async function writeTable({ url, tab, columns, rows, previousLength }) {
  const token = await getWriteToken();
  const filler = columns.map(() => '');
  const values = [columns, ...rows];
  while (values.length < previousLength + 1) values.push(filler);
  const put = () => call(`${API}/${sheetId(url)}/values/${rangeOf(tab, `A1:${lastColumn(columns)}${values.length}`)}?valueInputOption=RAW`, token,
    { method: 'PUT', body: JSON.stringify({ values }) });
  let res = await put();
  if (res.status === 400) {
    await call(`${API}/${sheetId(url)}:batchUpdate`, token, {
      method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
    });
    res = await put();
  }
  if (!res.ok) throw new Error(`Không lưu được tab "${tab}" (${res.status})`);
}

const createTab = (url, tab, columns, token) => call(`${API}/${sheetId(url)}:batchUpdate`, token, {
  method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }),
}).then(() => call(`${API}/${sheetId(url)}/values/${rangeOf(tab, `A1:${lastColumn(columns)}1`)}?valueInputOption=RAW`, token,
  { method: 'PUT', body: JSON.stringify({ values: [columns] }) }));

/** Thêm một dòng vào cuối bảng (tạo tab nếu chưa có) — không ghi đè dữ liệu người khác. */
export async function appendRow({ url, tab, columns, row }) {
  const token = await getWriteToken();
  const send = () => call(`${API}/${sheetId(url)}/values/${rangeOf(tab, `A1:${lastColumn(columns)}1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, token,
    { method: 'POST', body: JSON.stringify({ values: [row] }) });
  let res = await send();
  if (res.status === 400) { await createTab(url, tab, columns, token); res = await send(); }
  if (!res.ok) throw new Error(`Không gửi được tin nhắn (${res.status})`);
}

/** Cập nhật đúng một dòng dữ liệu (index tính từ 0 sau dòng tiêu đề). */
export async function updateRow({ url, tab, columns, index, row }) {
  const token = await getWriteToken();
  const res = await call(`${API}/${sheetId(url)}/values/${rangeOf(tab, `A${index + 2}:${lastColumn(columns)}${index + 2}`)}?valueInputOption=RAW`, token,
    { method: 'PUT', body: JSON.stringify({ values: [row] }) });
  if (!res.ok) throw new Error(`Không lưu được phản hồi (${res.status})`);
}
