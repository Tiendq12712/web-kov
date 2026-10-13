import { CONFIG } from './config.js';
import { getToken } from './auth.js';
import { fetchRows, fetchTabs, sheetId } from './sheet.js';
import { readTable, writeTable } from './sheetTable.js';

/* ---------- Phân quyền ---------- */
export const ROLES = {
  admin: { label: 'Admin', note: 'Full quyền' },
  manager: { label: 'Quản trị', note: 'Thiết lập' },
  member: { label: 'Thành viên', note: 'Chỉ xem' },
};

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const roleFrom = (label) => {
  const p = plain(label);
  return p === 'admin' ? 'admin' : p.includes('quan tri') ? 'manager' : 'member';
};

/** Admin quản lý được mọi người trừ Admin; Quản trị chỉ quản lý Thành viên; Thành viên không quản lý ai. */
export const canManage = (actorRole, targetRole) =>
  actorRole === 'admin' ? targetRole !== 'admin' : actorRole === 'manager' && targetRole === 'member';

export const canOpenSettings = (role) => role === 'admin' || role === 'manager';

/* ---------- Tab "Tài khoản" ---------- */
const ACCOUNT_COLUMNS = ['STT', 'Email', 'Phân quyền', 'Mô tả quyền', 'Tên/Biệt danh', 'Giới tính'];
const accountTarget = { url: CONFIG.configSheet, tab: CONFIG.tabs.accounts, columns: ACCOUNT_COLUMNS };
export const GENDERS = ['Nam', 'Nữ'];
const genderFrom = (text) => GENDERS.find((g) => plain(g) === plain(text)) ?? '';
const toAccount = ([, email, label, note, name, gender]) => ({ email: email.trim(), role: roleFrom(label), note: note.trim(), name: name.trim(), gender: genderFrom(gender) });
const fromAccount = (a, i) => [String(i + 1), a.email, ROLES[a.role].label, a.note || ROLES[a.role].note, a.name ?? '', a.gender ?? ''];

export const loadAccounts = async () => (await readTable(accountTarget)).map(toAccount).filter((a) => a.email);
export const findAccount = (list, email) => list.find((a) => a.email.toLowerCase() === email.toLowerCase());

async function mutateAccounts(change) {
  const current = await loadAccounts();
  const next = change(current);
  await writeTable({ ...accountTarget, rows: next.map(fromAccount), previousLength: current.length });
  return next;
}

const assertCan = (actor, target, message) => {
  if (!canManage(actor, target)) throw new Error(message);
};

export const addAccount = (actor, email, role, name = '', gender = '') => mutateAccounts((list) => {
  assertCan(actor, role, 'Bạn không có quyền tạo tài khoản với quyền này');
  if (findAccount(list, email)) throw new Error('Email này đã có trong danh sách');
  return [...list, { email, role, note: '', name, gender }];
});

export const updateAccount = (actor, original, email, role, name = '', gender = '') => mutateAccounts((list) => {
  const target = findAccount(list, original);
  if (!target) throw new Error('Không tìm thấy tài khoản (có thể đã bị người khác xóa)');
  assertCan(actor, target.role, 'Không thể sửa tài khoản này');
  assertCan(actor, role, 'Bạn không có quyền gán quyền này');
  const clash = findAccount(list, email);
  if (clash && clash !== target) throw new Error('Email này đã có trong danh sách');
  return list.map((a) => (a === target ? { email, role, name, gender, note: a.role === role ? a.note : '' } : a));
});

export const removeAccount = (actor, email) => mutateAccounts((list) => {
  const target = findAccount(list, email);
  if (!target) return list;
  assertCan(actor, target.role, 'Không thể xóa tài khoản này');
  return list.filter((a) => a !== target);
});

/* ---------- Tab "Danh sách link" ---------- */
const LINK_COLUMNS = ['Thông tin', 'ID link', 'Sheet'];
const linkTarget = { url: CONFIG.configSheet, tab: CONFIG.tabs.links, columns: LINK_COLUMNS };

/** "KPI 11/2026", "Năng suất 2026-11", "KPI T11"… -> '2026-11'; không có tháng thì null. */
export function monthFromText(text, defaultYear = new Date().getFullYear()) {
  const pad = (m) => String(m).padStart(2, '0');
  let m = /(\d{4})\s*[/.-]\s*(\d{1,2})/.exec(text);
  if (m) return `${m[1]}-${pad(m[2])}`;
  m = /(\d{1,2})\s*[/.-]\s*(\d{4})/.exec(text);
  if (m) return `${m[2]}-${pad(m[1])}`;
  m = /\bT(?:háng)?\s*(\d{1,2})\b/i.exec(text);
  return m ? `${defaultYear}-${pad(m[1])}` : null;
}

const kindOf = (info) => {
  const p = plain(info);
  return p.startsWith('kpi') ? 'kpi' : p.includes('nang suat') ? 'productivity' : 'other';
};
const toLink = ([info, id, tab]) => ({ info: info.trim(), id: sheetId(id.trim()), tab: tab.trim(), kind: kindOf(info), month: monthFromText(info) });
const fromLink = (l) => [l.info, l.id, l.tab];

export const loadLinks = async () => (await readTable(linkTarget)).map(toLink).filter((l) => l.id);

async function mutateLinks(change) {
  const current = await loadLinks();
  const next = change(current);
  await writeTable({ ...linkTarget, rows: next.map(fromLink), previousLength: current.length });
  return next;
}

export const addLink = (link) => mutateLinks((list) => [...list, toLink([link.info, link.id, link.tab])]);
export const updateLink = (index, link) => mutateLinks((list) => list.map((l, i) => (i === index ? toLink([link.info, link.id, link.tab]) : l)));
export const removeLink = (index) => mutateLinks((list) => list.filter((_, i) => i !== index));

/* ---------- Từ danh sách link -> danh sách tháng báo cáo ---------- */
/** Mỗi link là một Google Sheet có tab theo tháng (T9, T10…). Năm lấy từ tiêu đề trong tab KPI ("… KPI 10/2026"). */
const sameName = (a, b) => plain(a) === plain(b);

async function yearFromTitle(link, tab) {
  try {
    const [row = []] = await fetchRows(link.id, getToken(), { tab, range: 'A1:AD1' });
    const title = row.find((cell) => typeof cell === 'string' && /\d{1,2}\s*\/\s*\d{4}/.test(cell));
    return title ? monthFromText(title) : null;
  } catch (err) {
    if (err.code === 'auth') throw err;
    return null;
  }
}

const tabsOf = async (links, kind) => (await Promise.all(links.filter((l) => l.kind === kind)
  .map(async (l) => (await fetchTabs(l.id, getToken())).map((tab) => ({ id: l.id, tab }))))).flat();

/**
 * Mỗi tháng: { month, kpi: {id, tab}, productivity: {id, tab} | null }, mới nhất trước.
 * Tab KPI/năng suất cùng tên (ví dụ T10) được ghép với nhau; các báo cáo công việc nằm ngay trong tab KPI của tháng.
 */
export async function resolveMonths(links) {
  const [kpiTabs, productivityTabs] = await Promise.all([tabsOf(links, 'kpi'), tabsOf(links, 'productivity')]);
  const monthTabs = kpiTabs.filter((t) => monthFromText(t.tab));

  const entries = await Promise.all(monthTabs.map(async (t) => {
    const month = (await yearFromTitle(t, t.tab)) ?? monthFromText(t.tab);
    const productivity = productivityTabs.find((p) => sameName(p.tab, t.tab)) ?? null;
    return { month, kpi: t, productivity };
  }));
  const byMonth = new Map(entries.map((e) => [e.month, e]));   // trùng tháng: dòng sau thay dòng trước
  return [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
}
