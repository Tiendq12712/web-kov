/**
 * Điểm Add-on thực đạt của Payment, Kship và HDDT/CKS (Sheet "Addon", mỗi loại một tab).
 * KPI trong Sheet tính đủ 5đ cho mỗi act; cột "Điểm ghi nhận" cho biết điểm thực tế, phần thiếu được trừ khỏi Add-on.
 * Tháng của một act theo ngày chỉnh sửa / tương tác cuối. Chỉ trừ điểm ở tháng có dữ liệu từ ít nhất 2 loại.
 */
export const FULL = 5;
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

export const TYPES = {
  payment: { label: 'Kích hoạt Payment', short: 'Payment', mark: 'sc impact thanh cong payment?', date: 'ngay chinh sua', key: 'activityid' },
  kship: { label: 'Giới thiệu Kship', short: 'Kship', mark: 'kship_status', date: 'last_interaction_time', key: 'ticket_no' },
  hddt: { label: 'Hướng dẫn HDDT/CKS', short: 'HDDT/CKS', mark: 'impact_hddt', date: 'modifiedtime', key: 'activityid' },
};

function monthOf(v) {
  const t = String(v ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return { ym: `${m[3]}-${m[2].padStart(2, '0')}`, iso: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? { ym: `${m[1]}-${m[2]}`, iso: t.slice(0, 10) } : { ym: '', iso: '' };
}

const STATUS_COL = { payment: 'sc impact thanh cong payment?', kship: 'kship_status', hddt: 'impact_hddt' };

/** Các tab của Sheet Addon (mỗi tab: mảng dòng) → danh sách act, mỗi act kèm điểm thực và điểm bị trừ. */
export function parseAddonScores(sets) {
  const out = [];
  const seen = new Set();
  for (const rows of sets) {
    const head = (rows[0] ?? []).map(plain);
    const type = Object.keys(TYPES).find((t) => head.includes(TYPES[t].mark));
    if (!type) continue;
    const at = (n) => head.indexOf(plain(n));
    const col = { id: at(TYPES[type].key), retailer: at('retailer_id'), who: at('last_name'), pts: at('Điểm ghi nhận'), date: at(TYPES[type].date), status: at(STATUS_COL[type]), cause: at('kship_nn_that_bai'), detail: at('kship_chitiet_that_bai'), digi: at('Số ngày có digi invoice trong 30D'), reg: at('Ngày đăng ký lần đầu') >= 0 ? at('Ngày đăng ký lần đầu') : at('min_merchant_regist_date'), einv: at('total_einvoice') };
    if (col.who < 0 || col.pts < 0) continue;
    for (const r of rows.slice(1)) {
      const who = String(r[col.who] ?? '').trim();
      const code = /^(\d+)\s*-/.exec(who)?.[1];
      if (!code) continue;
      const id = String(r[col.id] ?? '').trim();
      const k = `${type}:${id || `${code}:${r[col.retailer]}`}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const raw = Number(String(r[col.pts] ?? '').replace(',', '.'));
      const points = Number.isFinite(raw) ? Math.max(0, Math.min(FULL, raw)) : 0;
      const d = monthOf(r[col.date]);
      out.push({
        type, id, code, name: (who.split(' - ')[1] ?? who).trim(), retailer: String(r[col.retailer] ?? '').trim(),
        month: d.ym, date: d.iso, points, lost: FULL - points,
        status: String(r[col.status] ?? '').trim(), cause: String((col.cause >= 0 ? r[col.cause] : '') || (col.detail >= 0 ? r[col.detail] : '') || '').trim(),
        digi: col.digi >= 0 ? String(r[col.digi] ?? '').trim() : '', registered: col.reg >= 0 ? String(r[col.reg] ?? '').trim() : '', einvoice: col.einv >= 0 ? String(r[col.einv] ?? '').trim() : '',
      });
    }
  }
  return { rows: out };
}

const FLAGS = { payment: 'Kích hoạt payment thành công', kship: 'Giới thiệu Kship', hddt: 'Hướng dẫn KH HDDT/CKS thành công' };

/**
 * Act trong data chi tiết (tab Data Txx) được ghi Payment/Kship/HDDT nhưng retailer không có trong tab tương ứng của Sheet Addon
 * (báo cáo PBI thiếu): mặc định không đạt điểm, trừ đủ 5đ.
 */
export function findMissing(detailRows, data, ym) {
  const have = new Set((data?.rows ?? []).map((x) => `${x.type}|${x.code}|${x.retailer}`));
  const out = [];
  for (const r of detailRows ?? []) {
    if (r.month !== ym) continue;
    const m = /^(\d+)\s*-\s*([^-]+)/.exec(r.handler ?? '');
    if (!m) continue;
    const retailer = String(r.retailer ?? '').trim();
    for (const [type, flag] of Object.entries(FLAGS)) {
      if (!r.add?.includes(flag) || have.has(`${type}|${m[1]}|${retailer}`)) continue;
      out.push({ type, id: '', code: m[1], name: m[2].trim(), retailer, month: ym, date: r.created ?? '', points: 0, lost: FULL, missing: true, status: '', cause: '', digi: '', registered: '', einvoice: '' });
    }
  }
  return out;
}

const empty = () => ({ acts: 0, earned: 0, lost: 0, full: 0 });

/** Điểm theo nhân sự trong một tháng: { [mã]: { acts, earned, lost, byType, rows } } và các act không thuộc nhân sự nào. */
export function scoresForMonth(data, ym, knownCodes = null) {
  const people = new Map();
  const orphans = [];
  for (const x of data?.rows ?? []) {
    if (x.month !== ym) continue;
    if (knownCodes && !knownCodes.has(x.code)) { orphans.push(x); continue; }
    const p = people.get(x.code) ?? { code: x.code, name: x.name, ...empty(), byType: Object.fromEntries(Object.keys(TYPES).map((t) => [t, empty()])), rows: [] };
    for (const s of [p, p.byType[x.type]]) { s.acts += 1; s.earned += x.points; s.lost += x.lost; if (x.lost === 0) s.full += 1; }
    p.rows.push(x);
    people.set(x.code, p);
  }
  return { people, orphans };
}

/** Trừ điểm không đạt khỏi Add-on và KPI của từng nhân sự (giữ số gốc của Sheet ở addon.sheetDone / sheetKpi). */
export function applyAddonScores(teams, data, ym, extra = []) {
  // Tháng chỉ có dữ liệu của một loại (ví dụ vài act HDDT cũ lọt sang tháng trước) là chưa đủ để trừ điểm.
  if (new Set((data?.rows ?? []).filter((x) => x.month === ym).map((x) => x.type)).size < 2) return { orphans: [] };
  const codes = new Set(teams.flatMap((t) => t.members.map((m) => m.code)));
  const { people, orphans } = scoresForMonth({ rows: [...data.rows, ...extra] }, ym, codes);
  for (const t of teams) for (const m of t.members) {
    const p = people.get(m.code);
    m.addonBase ??= { addon: m.addon, kpi: m.kpi };   // số gốc của Sheet KPI, để tính lại được nhiều lần (khi data chi tiết tải xong thì bổ sung act thiếu)
    const base = m.addonBase;
    if (!p || !base.addon) { m.addonScore = null; m.addon = base.addon; m.kpi = base.kpi; continue; }
    const before = base.addon.rate;
    const done = Math.max(0, (base.addon.done ?? 0) - p.lost);
    m.addonScore = { acts: p.acts, earned: p.earned, lost: p.lost, full: p.full, byType: p.byType, rows: p.rows, sheetDone: base.addon.done, sheetRate: before, sheetKpi: base.kpi, missing: p.rows.filter((x) => x.missing).length };
    m.addon = { ...base.addon, done, missing: Math.max((base.addon.target ?? 0) - done, 0), rate: base.addon.target ? done / base.addon.target : 0 };
    m.kpi = typeof base.kpi === 'number' && typeof before === 'number' ? Math.max(0, base.kpi - 0.3 * (before - m.addon.rate)) : base.kpi;
  }
  return { orphans };
}
