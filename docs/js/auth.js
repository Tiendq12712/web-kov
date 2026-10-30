import { CONFIG } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'openid email https://www.googleapis.com/auth/spreadsheets.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
/** Google cho người dùng bỏ tích từng quyền ở màn hình cấp quyền: token trả về có thể thiếu quyền xem Google Sheets. */
export const hasSheetsScope = (res) => { if (!res?.scope) return true; const granted = String(res.scope).split(/\s+/); return granted.includes(READ_SCOPE) || granted.includes(WRITE_SCOPE); };   // không có thông tin quyền thì không chặn
let forceConsent = false;
/** Gọi khi vừa đăng nhập mà vẫn bị từ chối đọc Sheet: lần đăng nhập kế tiếp hiện lại màn hình cấp quyền. */
export const requireConsentNext = () => { forceConsent = true; };   // lần đăng nhập trước thiếu quyền Sheets: lần sau luôn hiện lại màn hình cấp quyền
const STORAGE_KEY = 'kpi.session';
const DAY_KEY = 'kpi.day';   // nhớ đăng nhập trong ngày: { email, date } (không chứa token)
const EXPIRY_MARGIN_MS = 60_000;

/** Ngày hiện tại theo giờ máy (YYYY-MM-DD); qua nửa đêm là "hôm sau" và phải đăng nhập lại. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

let tokenClient = null;
let session = readSession();   // today() phải khai báo trước dòng này, nếu không readSession lỗi (vùng chết tạm thời) và phiên đã lưu không bao giờ được dùng lại
const WRITE_FLAG = 'kpi.write';   // đã từng đồng ý quyền ghi (để gửi tin nhắn / sửa cấu hình): các token sau xin kèm quyền ghi luôn
const wantsWrite = () => { try { return localStorage.getItem(WRITE_FLAG) === '1'; } catch { return false; } };
const rememberWrite = (on) => { try { on ? localStorage.setItem(WRITE_FLAG, '1') : localStorage.removeItem(WRITE_FLAG); } catch {} };


/** Token (sống ~1 giờ) giữ ở localStorage để mở lại web trong ngày không phải đăng nhập; chỉ dùng được trong đúng ngày đăng nhập. */
function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return s && s.date === today() && s.expiresAt - EXPIRY_MARGIN_MS > Date.now() ? s : null;
  } catch { return null; }
}
function writeSession(s) {
  session = s;
  try {
    if (!s) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(DAY_KEY); sessionStorage.removeItem(STORAGE_KEY); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    localStorage.setItem(DAY_KEY, JSON.stringify({ email: s.email, date: s.date }));
  } catch {}
}

/** Email đã đăng nhập hôm nay (kể cả khi token đã hết hạn): đủ để hiện "Tiếp tục" thay vì bắt chọn lại tài khoản. */
export function getRemembered() {
  try {
    const r = JSON.parse(localStorage.getItem(DAY_KEY));
    return r && r.date === today() ? r : null;
  } catch { return null; }
}

export const loadGis = () => new Promise((resolve, reject) => {
  if (window.google?.accounts?.oauth2) return resolve();
  const script = Object.assign(document.createElement('script'), { src: GIS_SRC, async: true });
  script.onload = resolve;
  script.onerror = () => reject(new Error('Không tải được dịch vụ đăng nhập Google'));
  document.head.append(script);
});

const requestToken = (override = {}) => new Promise((resolve, reject) => {
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.clientId,
    scope: SCOPE,
    hd: CONFIG.allowedDomain,          // gợi ý Google chỉ hiện tài khoản của tên miền này
    callback: () => {},
  });
  tokenClient.callback = (res) => (res.error ? reject(new Error(res.error_description || res.error)) : resolve(res));
  tokenClient.error_callback = (err) => reject(new Error(err.type === 'popup_closed' ? 'Bạn đã đóng cửa sổ đăng nhập' : err.type));
  tokenClient.requestAccessToken(override);
});

const fetchProfile = async (token) => {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Không lấy được thông tin tài khoản');
  return res.json();
};

const isAllowed = ({ email, email_verified: verified, hd }) =>
  verified && email?.toLowerCase().endsWith(`@${CONFIG.allowedDomain}`) && (!hd || hd === CONFIG.allowedDomain);

export const getSession = () => session;
export const getToken = () => session?.token;

/**
 * Đăng nhập. `resume`: cấp lại token cho tài khoản đã đăng nhập hôm nay mà không hỏi chọn tài khoản
 * (`silent`: không hiện cửa sổ nào nếu Google đã nhớ, lỗi thì để người dùng bấm "Tiếp tục").
 */
export async function signIn({ resume = false, silent = false } = {}) {
  await loadGis();
  const remembered = resume ? getRemembered() : null;
  const write = wantsWrite();
  const scope = write ? `${SCOPE} ${WRITE_SCOPE}` : SCOPE;
  const request = forceConsent
    ? { prompt: 'consent', login_hint: remembered?.email, scope }
    : remembered
      ? { prompt: silent ? 'none' : '', login_hint: remembered.email, scope }
      : { prompt: 'select_account', scope };   // cho phép chọn tài khoản khác
  const granted = await requestToken(request);
  const { access_token: token, expires_in: seconds } = granted;
  if (!hasSheetsScope(granted)) {
    google.accounts.oauth2.revoke(token);
    forceConsent = true;
    throw new Error('Bạn chưa cấp quyền "Xem Google Trang tính" ở màn hình Google. Bấm đăng nhập lại và nhớ tích chọn ô quyền xem Google Sheets (nếu không, web không đọc được báo cáo).');
  }
  forceConsent = false;
  const profile = await fetchProfile(token);
  if (!isAllowed(profile)) {
    google.accounts.oauth2.revoke(token);
    throw new Error(`Chỉ tài khoản @${CONFIG.allowedDomain} được phép truy cập`);
  }
  const date = remembered && remembered.email === profile.email ? remembered.date : today();
  writeSession({ token, email: profile.email, date, write, expiresAt: Date.now() + seconds * 1000 });
  return session;
}

/**
 * Token có quyền ghi (gửi tin nhắn, sửa cấu hình). Chỉ xin khi cần; Google vẫn chặn nếu bạn không có quyền sửa Sheet.
 * Sau khi đồng ý một lần, token (đã gồm quyền ghi) dùng chung cho cả đọc và ghi và được lưu như phiên đăng nhập,
 * nên các lần gửi sau không hỏi lại; các lần cấp token mới cũng xin sẵn quyền ghi.
 */
export async function getWriteToken() {
  if (session?.write && session.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return session.token;
  await loadGis();
  const { access_token: token, expires_in: seconds } = await requestToken({ scope: `${SCOPE} ${WRITE_SCOPE}`, login_hint: session?.email });
  rememberWrite(true);
  writeSession({ ...session, token, write: true, expiresAt: Date.now() + seconds * 1000 });
  return token;
}

const DRIVE_META = 'https://www.googleapis.com/auth/drive.metadata.readonly';
let driveGrant = null;   // token chỉ-đọc-siêu-dữ-liệu Drive để kiểm tra quyền chia sẻ; giữ trong bộ nhớ

/** Token xem danh sách quyền chia sẻ của file (Drive metadata, chỉ đọc). Cần thao tác bấm của người dùng để Google hiện cửa sổ cấp quyền. */
export async function getDriveToken() {
  if (driveGrant && driveGrant.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return driveGrant.token;
  await loadGis();
  const { access_token: token, expires_in: seconds } = await requestToken({ scope: DRIVE_META, login_hint: session?.email });
  driveGrant = { token, expiresAt: Date.now() + seconds * 1000 };
  return token;
}

export function signOut() {
  driveGrant = null;
  rememberWrite(false);
  if (session && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(session.token);
  writeSession(null);
}
