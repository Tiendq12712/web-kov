import { getDriveToken } from './auth.js';

/**
 * Kiểm tra email nào trong tab Tài khoản chưa được chia sẻ các Google Sheet của báo cáo.
 * Dùng Drive API (permissions.list): cần quyền Chỉnh sửa trên Sheet đó mới xem được danh sách chia sẻ.
 */
const RANK = { reader: 1, commenter: 2, writer: 3, fileOrganizer: 4, organizer: 4, owner: 5 };
const LABEL = { reader: 'Người xem', commenter: 'Người nhận xét', writer: 'Người chỉnh sửa', fileOrganizer: 'Chỉnh sửa', organizer: 'Chỉnh sửa', owner: 'Chủ sở hữu' };
const lower = (s) => String(s ?? '').trim().toLowerCase();

async function listPermissions(fileId, token) {
  const out = [];
  let page = '';
  do {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&pageSize=100&fields=nextPageToken,permissions(type,role,emailAddress,domain)${page ? `&pageToken=${page}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) throw Object.assign(new Error('Phiên đăng nhập đã hết hạn'), { code: 'auth' });
    if (res.status === 403 || res.status === 404) {
      const body = await res.json().catch(() => ({}));
      const reason = body.error?.errors?.[0]?.reason ?? '';
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + JSON.stringify(body))) throw new Error('Chưa bật Google Drive API cho dự án (Google Cloud → APIs & Services → Thư viện → Google Drive API → Bật)');
      throw new Error('Bạn cần quyền Chỉnh sửa trên Sheet này để xem danh sách chia sẻ');
    }
    if (!res.ok) throw new Error(`Drive trả lỗi ${res.status}`);
    const json = await res.json();
    out.push(...(json.permissions ?? []));
    page = json.nextPageToken ?? '';
  } while (page);
  return out;
}

/** Mức quyền của một email trên một Sheet: { rank, via } hoặc { group: true } nếu chỉ có nhóm (không biết thành viên) hoặc null. */
export function levelOf(email, perms) {
  const domain = email.split('@')[1];
  let best = null;
  let group = false;
  for (const p of perms) {
    const rank = RANK[p.role] ?? 0;
    if (p.type === 'user' && lower(p.emailAddress) === email) best = !best || rank > best.rank ? { rank, via: 'user' } : best;
    else if (p.type === 'anyone' || (p.type === 'domain' && lower(p.domain) === domain)) best = !best || rank > best.rank ? { rank, via: p.type } : best;
    else if (p.type === 'group') group = true;
  }
  return best ?? (group ? { group: true } : null);
}

/**
 * @param accounts  [{ email, name, role }]
 * @param sheets    [{ key, label, id, need: 'reader' | 'writer' }]
 * @returns { sheets, rows: [{ email, name, cells: { key: 'ok' | 'low' | 'group' | 'missing' } }], problems }
 */
export async function checkAccess({ accounts, sheets }) {
  const token = await getDriveToken();
  const perms = await Promise.all(sheets.map((s) => listPermissions(s.id, token).then((p) => ({ ...s, perms: p })).catch((err) => { if (err.code === 'auth') throw err; return { ...s, perms: [], error: err.message }; })));
  const rows = accounts.map((a) => {
    const email = lower(a.email);
    const cells = {};
    for (const s of perms) {
      if (s.error) { cells[s.key] = 'unknown'; continue; }
      const lv = levelOf(email, s.perms);
      const need = RANK[s.need] ?? 1;
      cells[s.key] = !lv ? 'missing' : lv.group ? 'group' : lv.rank >= need ? 'ok' : 'low';
    }
    return { email: a.email, name: a.name, cells };
  });
  const problems = rows.filter((r) => Object.values(r.cells).some((c) => c === 'missing' || c === 'low'));
  return { sheets: perms.map(({ perms: _p, ...s }) => s), rows, problems };
}

export const roleLabel = (r) => LABEL[r] ?? r;
