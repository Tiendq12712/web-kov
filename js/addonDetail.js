/**
 * Thống kê toàn bộ add-on của tháng: theo loại, theo nhân sự và từng act.
 * Nguồn: data chi tiết (cột add-on của tab Data Txx) cho cả 10 loại; Payment/Kship/HDDT lấy điểm thực từ Sheet Addon (m.addonScore).
 */
import { ADDONS } from './segment.js';
import { TYPES, FULL } from './addonScore.js';

const FLAG_TYPE = { 'Kích hoạt payment thành công': 'payment', 'Giới thiệu Kship': 'kship', 'Hướng dẫn KH HDDT/CKS thành công': 'hddt' };
export const SCORED = FLAG_TYPE;
const codeOf = (h) => /^(\d+)\s*-/.exec(h ?? '')?.[1] ?? '';

/** Danh sách act add-on của tháng: 3 loại có điểm lấy từ Sheet Addon (kể cả act thiếu retailer), 7 loại còn lại lấy từ data chi tiết. */
export function addonActs(rows, members, month) {
  const acts = [];
  for (const m of members) for (const x of m.addonScore?.rows ?? []) {
    acts.push({ kind: TYPES[x.type].label, type: x.type, code: m.code, name: m.name, retailer: x.retailer, date: x.date, points: x.points, full: FULL, lost: x.lost, missing: Boolean(x.missing), note: x });
  }
  const known = new Set(members.map((m) => m.code));
  for (const r of rows) {
    if (r.month !== month || !r.add.length) continue;
    const code = codeOf(r.handler);
    if (!known.has(code)) continue;
    const name = members.find((m) => m.code === code).name;
    for (const flag of r.add) {
      if (FLAG_TYPE[flag] && members.find((m) => m.code === code).addonScore) continue;   // đã có từ Sheet Addon
      acts.push({ kind: flag, type: FLAG_TYPE[flag] ?? 'other', code, name, retailer: String(r.retailer ?? '').trim(), date: r.created, points: FLAG_TYPE[flag] ? null : FULL, full: FLAG_TYPE[flag] ? null : FULL, lost: 0, missing: false, status: r.status });   // 7 loại còn lại mặc định đủ 5đ/act
    }
  }
  return acts;
}

export function analyzeAddonDetail(rows, members, { month, code = null } = {}) {
  const scope = code ? members.filter((m) => m.code === code) : members;
  const acts = addonActs(rows, scope, month);
  const kinds = [...ADDONS];
  const byType = kinds.map((kind) => {
    const typeKey = FLAG_TYPE[kind];
    const own = typeKey ? acts.filter((a) => a.type === typeKey) : acts.filter((a) => a.kind === kind);
    const scored = own.some((a) => a.points != null);
    return { kind, type: typeKey ?? null, acts: own.length, people: new Set(own.map((a) => a.code)).size, scored: Boolean(scored), earned: own.reduce((s, a) => s + (a.points ?? 0), 0), lost: own.reduce((s, a) => s + a.lost, 0), missing: own.filter((a) => a.missing).length };
  }).filter((t) => t.acts || t.scored);
  const people = scope.map((m) => {
    const mine = acts.filter((a) => a.code === m.code);
    const counts = Object.fromEntries(kinds.map((k) => [k, mine.filter((a) => (FLAG_TYPE[k] ? a.type === FLAG_TYPE[k] : a.kind === k)).length]));
    const kpiDone = m.addon?.done ?? 0;
    return { code: m.code, name: m.name, acts: mine.length, counts, sheetDone: m.addonScore?.sheetDone ?? m.addon?.done ?? 0, lost: m.addonScore?.lost ?? 0, missing: m.addonScore?.missing ?? 0, done: kpiDone, target: m.addon?.target ?? 0, rate: m.addon?.rate ?? null, scored: Boolean(m.addonScore) };
  }).sort((a, b) => b.acts - a.acts);
  const scoredActs = acts.filter((a) => a.points != null);
  const total = { acts: acts.length, earned: scoredActs.reduce((s, a) => s + a.points, 0), full: scoredActs.length * FULL, lost: scoredActs.reduce((s, a) => s + a.lost, 0), missing: acts.filter((a) => a.missing).length, done: scope.reduce((s, m) => s + (m.addon?.done ?? 0), 0), target: scope.reduce((s, m) => s + (m.addon?.target ?? 0), 0) };
  return { acts, byType, people, total, kinds, hasScores: scoredActs.length > 0 };
}
