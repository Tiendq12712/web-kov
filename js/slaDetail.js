/**
 * SLA tính trên từng data (tab "Data Txx", cột "Thời gian tạo" và "Thời gian tương tác"): trễ khi (ngày tương tác − ngày tạo) > 7 ngày, tính theo ngày lịch, gồm cả data đã làm.
 * Data chưa xong (chưa làm, đang làm) tính đến hiện tại; data hủy không tính. Sắp trễ: chưa xong, đã qua từ 5 đến 7 ngày.
 */
import { SLA_DAYS, WARN_DAYS } from './sla.js';

const DAY = 86_400_000;
const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);
const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '(Chưa giao nhân sự)');
const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';

/** Phân loại một data: { elapsed (ngày), kind: 'late-done' | 'late-open' | 'soon' | 'ok' | 'cancel' }. */
export const wallNow = () => Date.now() - new Date().getTimezoneOffset() * 60_000;   // giờ hiện tại theo giờ địa phương (cùng hệ với giờ ghi trong Sheet)
const dayNo = (ts) => Math.floor(ts / DAY);

export function classify(r, now = wallNow()) {
  if (r.status === 'Hủy') return { kind: 'cancel', elapsed: null };
  const done = r.status === 'Đã làm';
  const end = done ? (r.modifiedTs ?? r.createdTs) : now;
  if (r.createdTs == null || end == null) return { kind: 'ok', elapsed: null };
  const elapsed = dayNo(end) - dayNo(r.createdTs);   // chênh lệch theo ngày lịch (ngày tương tác − ngày tạo)
  if (elapsed > SLA_DAYS) return { kind: done ? 'late-done' : 'late-open', elapsed };
  if (!done && elapsed >= SLA_DAYS - WARN_DAYS) return { kind: 'soon', elapsed };
  return { kind: 'ok', elapsed };
}

const tally = (items) => {
  const c = { late_done: 0, late_open: 0, soon: 0, ok: 0 };
  for (const x of items) { if (x.kind === 'late-done') c.late_done += 1; else if (x.kind === 'late-open') c.late_open += 1; else if (x.kind === 'soon') c.soon += 1; else if (x.kind === 'ok') c.ok += 1; }
  const total = c.late_done + c.late_open + c.soon + c.ok;
  const late = c.late_done + c.late_open;
  return { ...c, total, late, lateRate: ratio(late, total), soonRate: ratio(c.soon, total) };
};

export function computeSlaDetail(rows, { month, code = null, now = wallNow() } = {}) {
  const scoped = rows.filter((r) => (!month || r.month === month) && (!code || codeOf(r.handler) === code)).map((r) => ({ r, ...classify(r, now) }));
  const live = scoped.filter((x) => x.kind !== 'cancel');
  const totals = tally(live);
  const byPerson = new Map();
  for (const x of live) { const k = codeOf(x.r.handler) || '(pool)'; (byPerson.get(k) ?? byPerson.set(k, []).get(k)).push(x); }
  const people = [...byPerson].map(([k, list]) => ({ code: k === '(pool)' ? '' : k, name: nameOf(list[0].r.handler), ...tally(list) })).sort((a, b) => b.late - a.late || b.total - a.total);
  const byDay = new Map();
  for (const x of live) { const k = x.r.created || '—'; (byDay.get(k) ?? byDay.set(k, []).get(k)).push(x); }
  const days = [...byDay].map(([iso, list]) => ({ iso, ...tally(list) })).sort((a, b) => b.iso.localeCompare(a.iso));
  // Ma trận nhân sự × ngày tạo: chỉ các ngày còn data trễ hoặc sắp trễ (gồm cả data đã làm).
  const flagged = live.filter((x) => x.kind !== 'ok');
  const matrixDays = [...new Set(flagged.map((x) => x.r.created || '—'))].sort();
  const matrix = people.map((p) => {
    const mine = flagged.filter((x) => (codeOf(x.r.handler) || '') === p.code && nameOf(x.r.handler) === p.name);
    return { code: p.code, name: p.name, total: mine.length, cells: Object.fromEntries(matrixDays.map((d) => [d, tally(mine.filter((x) => (x.r.created || '—') === d))])) };
  }).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const matrixTotals = Object.fromEntries(matrixDays.map((d) => [d, tally(flagged.filter((x) => (x.r.created || '—') === d))]));
  // Thống kê riêng data ĐÃ LÀM: bao nhiêu data đã làm bị trễ SLA, thời gian xử lý, mức trễ.
  const doneItems = live.filter((x) => x.r.status === 'Đã làm' && x.elapsed != null);
  const median = (arr) => { const v = [...arr].sort((a, b) => a - b); return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
  const doneStat = (list) => {
    const days = list.map((x) => x.elapsed), late = list.filter((x) => x.kind === 'late-done');
    const band = (lo, hi) => late.filter((x) => x.elapsed > lo && x.elapsed <= hi).length;   // số ngày lịch: 8, 9, 10, trên 10
    return { done: list.length, late: late.length, lateRate: ratio(late.length, list.length), avg: days.length ? sum(days) / days.length : null, median: median(days), max: days.length ? Math.max(...days) : null,
      b1: band(7, 8), b2: band(8, 9), b3: band(9, 10), b4: band(10, Infinity) };
  };
  const donePeople = [...new Map(doneItems.map((x) => [`${codeOf(x.r.handler)}|${nameOf(x.r.handler)}`, x])).entries()].map(([key]) => {
    const [code, name] = key.split('|');
    return { code, name, ...doneStat(doneItems.filter((x) => `${codeOf(x.r.handler)}|${nameOf(x.r.handler)}` === key)) };
  }).sort((a, b) => b.late - a.late || b.done - a.done);
  const doneTotals = doneStat(doneItems);
  const longest = live.filter((x) => x.elapsed != null).sort((a, b) => b.elapsed - a.elapsed).slice(0, 15).map((x) => ({ ...x.r, elapsed: x.elapsed, kind: x.kind }));
  return { totals, people, days, donePeople, doneTotals, matrix, matrixDays, matrixTotals, matrixTotal: flagged.length, longest, cancelled: scoped.length - live.length, now };
}
