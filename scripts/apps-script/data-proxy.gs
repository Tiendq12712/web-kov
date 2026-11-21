/**
 * Cầu nối dữ liệu cho web báo cáo: nhân viên chỉ cần đăng nhập Google (xin quyền email), KHÔNG cần được chia sẻ Google Sheet.
 * Script chạy bằng tài khoản của bạn (chủ các Sheet), xác minh token Google của người gọi, kiểm tra email có trong tab "Tài khoản"
 * rồi mới đọc Sheet và trả dữ liệu. Chỉ ĐỌC (ghi vẫn do web dùng token của chính người có quyền sửa Sheet).
 *
 * Cài đặt: xem hướng dẫn trong scripts/apps-script/README.md.
 */
const CLIENT_ID = '383426194032-ic78e89vmaqt81bc022uisvqrbhj8njf.apps.googleusercontent.com';   // trùng CONFIG.clientId của web
const CONFIG_SHEET = '1z2zQNUtjH71qWJz0NZ6ofN95ZdAmBwCSxd-KWNnMsnM';
const ACCOUNTS_TAB = 'Tài khoản';        // cột B = Email
const LINKS_TAB = 'Danh sách link';      // mọi link Google Sheet trong tab này được phép đọc
const ALLOWED_DOMAIN = 'kiotviet.com';
const CACHE_SEC = 300;                   // dữ liệu một lần đọc được giữ chừng này giây để nhiều người mở trang cùng lúc không đọc Sheet lại
const MAX_CHUNKS = 20;                   // dữ liệu nén lớn hơn mức này (khoảng 1,8 MB) thì không lưu cache

const json = (obj) => ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
const fail = (code, message) => Object.assign(new Error(message), { code });
const sha = (text) => Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
const cache = () => CacheService.getScriptCache();

function doGet() { return json({ ok: true, service: 'kpi-data-proxy' }); }

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const email = verifyToken(req.token);
    assertAccount(email);
    if (req.op === 'rows') return json({ ok: true, values: readRows(req) });
    if (req.op === 'tabs') return json({ ok: true, tabs: readTabs(req) });
    throw fail('bad', 'Yêu cầu không hợp lệ');
  } catch (err) {
    return json({ ok: false, code: err.code || 'error', error: String(err.message || err) });
  }
}

/** Token truy cập Google của người gọi: còn hạn, cấp cho đúng ứng dụng web này, email đã xác minh và thuộc tên miền cho phép. */
function verifyToken(token) {
  if (!token) throw fail('auth', 'Thiếu token đăng nhập');
  const key = 'tok_' + sha(token);
  const hit = cache().get(key);
  if (hit) return hit;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw fail('auth', 'Phiên đăng nhập đã hết hạn');
  const info = JSON.parse(res.getContentText());
  const email = String(info.email || '').toLowerCase();
  if (info.azp !== CLIENT_ID && info.aud !== CLIENT_ID) throw fail('forbidden', 'Token không cấp cho ứng dụng này');
  if (String(info.email_verified) !== 'true' || !email.endsWith('@' + ALLOWED_DOMAIN)) throw fail('forbidden', 'Tài khoản không thuộc tên miền được phép');
  cache().put(key, email, Math.max(30, Math.min(300, Number(info.expires_in) || 300)));
  return email;
}

/** Email phải có trong tab "Tài khoản" của Sheet cấu hình. */
function assertAccount(email) {
  let list = cache().get('accounts');
  if (!list) {
    const values = Sheets.Spreadsheets.Values.get(CONFIG_SHEET, ACCOUNTS_TAB + '!A2:G500', { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
    list = JSON.stringify(values.map((r) => String(r[1] || '').trim().toLowerCase()).filter(Boolean));
    cache().put('accounts', list, 120);
  }
  if (JSON.parse(list).indexOf(email) < 0) throw fail('forbidden', 'Tài khoản của bạn chưa có trong danh sách người dùng của báo cáo');
}

/** Các Google Sheet được phép đọc: Sheet cấu hình, mọi link trong tab Danh sách link và (tùy chọn) Script property SHEETS (cách nhau bằng dấu phẩy). */
function allowedSheets() {
  const hit = cache().get('sheets');
  if (hit) return JSON.parse(hit);
  const set = {};
  set[CONFIG_SHEET] = true;
  const rows = Sheets.Spreadsheets.Values.get(CONFIG_SHEET, LINKS_TAB + '!A1:H300', { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
  rows.forEach((r) => r.forEach((cell) => { const m = /\/d\/([\w-]+)/.exec(String(cell)); if (m) set[m[1]] = true; }));
  String(PropertiesService.getScriptProperties().getProperty('SHEETS') || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => { set[id] = true; });
  cache().put('sheets', JSON.stringify(set), 300);
  return set;
}
function assertSheet(id) {
  if (!/^[\w-]{20,}$/.test(String(id || '')) || !allowedSheets()[id]) throw fail('forbidden', 'Google Sheet này không nằm trong danh sách báo cáo');
}

const putBig = (key, text) => {
  const zip = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, 'text/plain')).getBytes());
  const parts = [];
  for (let i = 0; i < zip.length; i += 90000) parts.push(zip.slice(i, i + 90000));
  if (parts.length > MAX_CHUNKS) return;
  const all = { [key + '_n']: String(parts.length) };
  parts.forEach((p, i) => { all[key + '_' + i] = p; });
  cache().putAll(all, CACHE_SEC);
};
const getBig = (key) => {
  const n = Number(cache().get(key + '_n'));
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => key + '_' + i), got = cache().getAll(keys);
  if (keys.some((k) => !got[k])) return null;
  return Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(keys.map((k) => got[k]).join('')), 'application/x-gzip')).getDataAsString();
};

function readRows(req) {
  assertSheet(req.sheet);
  const render = req.render === 'FORMATTED_VALUE' ? 'FORMATTED_VALUE' : 'UNFORMATTED_VALUE';
  const range = String(req.range || '');
  if (!range) throw fail('bad', 'Thiếu vùng dữ liệu');
  const key = 'rows_' + sha([req.sheet, range, render].join('|'));
  const hit = getBig(key);
  if (hit) return JSON.parse(hit);
  let values;
  try { values = Sheets.Spreadsheets.Values.get(req.sheet, range, { valueRenderOption: render }).values || []; }
  catch (err) { throw fail('norange', 'Không tìm thấy tab hoặc vùng dữ liệu'); }
  putBig(key, JSON.stringify(values));
  return values;
}

function readTabs(req) {
  assertSheet(req.sheet);
  const key = 'tabs_' + sha(req.sheet);
  const hit = cache().get(key);
  if (hit) return JSON.parse(hit);
  const sheets = Sheets.Spreadsheets.get(req.sheet, { fields: 'sheets.properties(title,hidden)' }).sheets || [];
  const tabs = sheets.map((s) => s.properties).filter((p) => !p.hidden).map((p) => p.title);
  cache().put(key, JSON.stringify(tabs), CACHE_SEC);
  return tabs;
}

/** Chạy một lần trong trình soạn thảo để Google hỏi quyền đọc Sheet cho script. */
function authorize() {
  Sheets.Spreadsheets.Values.get(CONFIG_SHEET, ACCOUNTS_TAB + '!A1:B2');
  Logger.log('Đã đọc được Sheet cấu hình. Số Sheet được phép: ' + Object.keys(allowedSheets()).length);
}
