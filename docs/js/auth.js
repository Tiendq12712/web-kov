import { CONFIG } from './config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SCOPE = 'openid email https://www.googleapis.com/auth/spreadsheets.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const STORAGE_KEY = 'kpi.session';
const EXPIRY_MARGIN_MS = 60_000;

let tokenClient = null;
let session = readSession();
let writeGrant = null;   // quyền ghi chỉ xin khi sửa danh sách, giữ trong bộ nhớ

/* Token lưu trong sessionStorage (mất khi đóng tab), không lưu lâu dài. */
function readSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    return s && s.expiresAt - EXPIRY_MARGIN_MS > Date.now() ? s : null;
  } catch { return null; }
}
function writeSession(s) {
  session = s;
  try { s ? sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)) : sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

const loadGis = () => new Promise((resolve, reject) => {
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

export async function signIn() {
  await loadGis();
  const { access_token: token, expires_in: seconds } = await requestToken({ prompt: 'select_account' });  // cho phép chọn tài khoản khác
  const profile = await fetchProfile(token);
  if (!isAllowed(profile)) {
    google.accounts.oauth2.revoke(token);
    throw new Error(`Chỉ tài khoản @${CONFIG.allowedDomain} được phép truy cập`);
  }
  writeSession({ token, email: profile.email, expiresAt: Date.now() + seconds * 1000 });
  return session;
}

/** Xin thêm quyền ghi (chỉ khi quản lý danh sách truy cập). Google vẫn chặn nếu bạn không có quyền sửa Sheet. */
export async function getWriteToken() {
  if (writeGrant && writeGrant.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return writeGrant.token;
  await loadGis();
  const { access_token: token, expires_in: seconds } = await requestToken({ scope: WRITE_SCOPE, login_hint: session?.email });
  writeGrant = { token, expiresAt: Date.now() + seconds * 1000 };
  return token;
}

export function signOut() {
  writeGrant = null;
  if (session && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(session.token);
  writeSession(null);
}
