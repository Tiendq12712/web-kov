/** So sánh Customer Info theo tuần (T2–CN) theo ngày chỉnh sửa của activity: dùng C-Info, tư vấn tính năng, khớp tính năng và điểm trung bình. */
const DAY = 86_400_000;
const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const weekStart = (day) => { const ms = utc(day); return iso(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY); };
const ratio = (a, b) => (b ? a / b : null);
const avg = (list) => { const v = list.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export const MIN_WEEK_ACTS = 30;   // tuần ít hơn số act này chỉ để tham khảo

export function statsOf(acts) {
  const advised = acts.filter((a) => a.advised);
  const matched = advised.filter((a) => a.match);
  return {
    total: acts.length, notUsed: acts.filter((a) => !a.used).length, advised: advised.length, matched: matched.length,
    useRate: ratio(acts.length - acts.filter((a) => !a.used).length, acts.length), adviceRate: ratio(advised.length, acts.length), matchRate: ratio(matched.length, advised.length),
    feat: avg(acts.map((a) => a.featScore)), setup: avg(acts.map((a) => a.setupScore)),
  };
}

/** Các tuần có activity, cũ → mới; `partial` = tuần chưa đủ 7 ngày dữ liệu (chưa tới Chủ nhật hoặc tuần đầu bị cắt). */
export function weeklyStats(acts) {
  const dated = acts.filter((a) => a.modified);
  if (!dated.length) return [];
  const last = dated.reduce((m, a) => (a.modified > m ? a.modified : m), ''), first = dated.reduce((m, a) => (a.modified < m ? a.modified : m), '9999');
  const groups = new Map();
  for (const a of dated) { const w = weekStart(a.modified); (groups.get(w) ?? groups.set(w, []).get(w)).push(a); }
  const weeks = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([start, list]) => {
    const end = iso(utc(start) + 6 * DAY);
    return { start, end, acts: list, ...statsOf(list), partial: end > last || start < first, small: list.length < MIN_WEEK_ACTS };
  });
  return weeks.map((w, i) => ({ ...w, prev: i ? weeks[i - 1] : null }));
}

/** Hai tuần để so sánh theo nhân sự: hai tuần đủ dữ liệu gần nhất (không thì hai tuần cuối). */
export function compareWeeks(weeks) {
  const full = weeks.filter((w) => !w.partial && !w.small);
  const pick = full.length >= 2 ? full.slice(-2) : weeks.slice(-2);
  return pick.length === 2 ? pick : null;
}

/** Theo nhân sự: chỉ số của hai tuần (a = tuần trước, b = tuần sau). */
export function peopleCompare(acts, [wa, wb]) {
  const by = new Map();
  for (const a of acts) {
    if (!a.modified) continue;
    const which = a.modified >= wa.start && a.modified <= wa.end ? 'a' : a.modified >= wb.start && a.modified <= wb.end ? 'b' : null;
    if (!which) continue;
    const p = by.get(a.code) ?? { code: a.code, name: a.name, a: [], b: [] };
    p[which].push(a);
    by.set(a.code, p);
  }
  return [...by.values()].map((p) => ({ code: p.code, name: p.name, a: statsOf(p.a), b: statsOf(p.b) })).sort((x, y) => (y.a.total + y.b.total) - (x.a.total + x.b.total));
}
