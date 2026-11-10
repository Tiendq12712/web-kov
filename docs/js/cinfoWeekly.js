/** So sánh Customer Info theo tuần (T2–CN) theo ngày chỉnh sửa của activity: dùng C-Info, tư vấn tính năng, khớp tính năng và điểm trung bình. */
const DAY = 86_400_000;
const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const weekStart = (day) => { const ms = utc(day); return iso(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY); };
const ratio = (a, b) => (b ? a / b : null);
const avg = (list) => { const v = list.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export const MIN_WEEK_ACTS = 30;   // tuần ít hơn số act này chỉ để tham khảo

export const MIN_MEASURED = 30;   // tuần có ít act đã đo impact hơn số này chỉ để tham khảo (act mới chưa đủ 7 ngày để đo)

export function statsOf(acts) {
  const advised = acts.filter((a) => a.advised);
  const matched = advised.filter((a) => a.match);
  const measured = acts.filter((a) => a.impact && a.impact !== 'N/A'), up = measured.filter((a) => a.impact === 'Tăng').length;
  return {
    measured: measured.length, up, upRate: ratio(up, measured.length),
    featGain: avg(acts.map((a) => a.featGain)), setupGain: avg(acts.map((a) => a.setupGain)),
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

/** Impact theo nhóm act: tư vấn khớp gợi ý, tư vấn không khớp, không tư vấn tính năng. */
export function impactGroups(acts) {
  const adv = acts.filter((a) => a.advised);
  return [
    ['Tư vấn khớp hệ thống gợi ý', statsOf(adv.filter((a) => a.match))],
    ['Tư vấn không khớp gợi ý', statsOf(adv.filter((a) => !a.match))],
    ['Không tư vấn tính năng', statsOf(acts.filter((a) => !a.advised))],
    ['Tất cả act', statsOf(acts)],
  ];
}

/** Thay đổi giữa hai tuần đủ dữ liệu gần nhất (tuần sau so với tuần trước); chỉ lấy chỉ số có đủ act để so (độ lệch dưới ngưỡng thì tuần ít act dao động mạnh). */
export function weekChanges(weeks) {
  const full = weeks.filter((w) => !w.partial && !w.small);
  if (full.length < 2) return null;
  const [a, b] = full.slice(-2);
  const rows = [
    ['useRate', '% act dùng Customer Info', true],
    ['adviceRate', '% act tư vấn tính năng', true],
    ['matchRate', '% khớp gợi ý hệ thống', a.advised >= 10 && b.advised >= 10],
    ['upRate', '% act tăng điểm sau 7 ngày', a.measured >= MIN_MEASURED && b.measured >= MIN_MEASURED],
  ];
  const changes = rows.filter(([key, , enough]) => enough && a[key] != null && b[key] != null)
    .map(([key, label]) => ({ key, label, from: a[key], to: b[key], delta: (b[key] - a[key]) * 100 }));
  return { a, b, changes };
}

export const MIN_PERSON_MEASURED = 8;   // một người cần ít nhất chừng này act đã đo impact ở mỗi tuần mới được xét xu hướng

/**
 * Nhân sự có % act tăng điểm giảm hai tuần liên tiếp (3 tuần gần nhất có đủ dữ liệu đo impact), tổng mức giảm từ 5 điểm % trở lên.
 * Trả về { weeks: [3 tuần], list: [{ code, name, rates: [r1, r2, r3] }] } hoặc null nếu chưa đủ tuần.
 */
export function impactDecline(acts, weeks = weeklyStats(acts)) {
  const usable = weeks.filter((w) => w.measured >= MIN_MEASURED).slice(-3);
  if (usable.length < 3) return null;
  const by = new Map();
  for (const a of acts) {
    if (!a.modified) continue;
    const i = usable.findIndex((w) => a.modified >= w.start && a.modified <= w.end);
    if (i < 0) continue;
    const p = by.get(a.code) ?? { code: a.code, name: a.name, weeks: [[], [], []] };
    p.weeks[i].push(a);
    by.set(a.code, p);
  }
  const list = [...by.values()].map((p) => ({ code: p.code, name: p.name, stats: p.weeks.map(statsOf) }))
    .filter((p) => p.stats.every((s) => s.measured >= MIN_PERSON_MEASURED))
    .map((p) => ({ code: p.code, name: p.name, rates: p.stats.map((s) => s.upRate) }))
    .filter(({ rates: [r1, r2, r3] }) => r2 < r1 && r3 < r2 && r1 - r3 >= 0.05)
    .sort((x, y) => (y.rates[0] - y.rates[2]) - (x.rates[0] - x.rates[2]));
  return { weeks: usable, list };
}
