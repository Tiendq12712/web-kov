/**
 * Thống kê SLA xử lý data ONL: mỗi lô data được chia vào một ngày phải xử lý xong trong 7 ngày.
 * Nguồn: bảng "Tồn (chưa + đang làm)" theo ngày chia của tab công việc — mỗi ô là số data của lô ngày đó còn tồn.
 */
export const SLA_DAYS = 7;     // hạn xử lý
export const WARN_DAYS = 2;    // còn tối đa 2 ngày là "sắp trễ"

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);

/** Trạng thái của một lô theo tuổi (số ngày kể từ ngày chia): trễ > 7 ngày, sắp trễ từ ngày thứ 5 đến ngày thứ 7. */
export const slaStatus = (age) => (age > SLA_DAYS ? 'late' : age >= SLA_DAYS - WARN_DAYS ? 'soon' : 'ok');

export const STATUS_LABELS = { late: 'Đã trễ SLA', soon: 'Sắp trễ SLA', ok: 'Trong hạn' };

/**
 * @param work   dữ liệu tab công việc (cần `backlogAll`)
 * @param asOf   ngày số liệu, 'YYYY-MM-DD'
 * @param month  tháng của báo cáo, 'YYYY-MM'
 * @returns { asOf, rows, totals, buckets } hoặc null nếu thiếu bảng tồn
 */
export function computeSla(work, asOf, month) {
  const block = work?.backlogAll;
  if (!block || !asOf) return null;
  const now = toDate(asOf);
  const dayCols = block.labels.map((l, i) => [l, i]).filter(([l]) => typeof l === 'number');
  const rows = block.members.map((m) => {
    const batches = dayCols.map(([day, i]) => {
      const count = m.values[i] ?? 0;
      if (!count) return null;
      const date = `${month}-${pad(day)}`;
      const age = Math.round((now - toDate(date)) / DAY_MS);
      const due = new Date(toDate(date).getTime() + SLA_DAYS * DAY_MS);
      return { day, date, count, age, left: SLA_DAYS - age, due: `${pad(due.getDate())}/${pad(due.getMonth() + 1)}`, status: slaStatus(age) };
    }).filter((b) => b && b.age >= 0);
    const by = (s) => sum(batches.filter((b) => b.status === s).map((b) => b.count));
    return { code: m.code, name: m.name, batches, late: by('late'), soon: by('soon'), ok: by('ok'), total: sum(batches.map((b) => b.count)) };
  });
  const totals = { late: sum(rows.map((r) => r.late)), soon: sum(rows.map((r) => r.soon)), ok: sum(rows.map((r) => r.ok)), total: sum(rows.map((r) => r.total)) };
  const ranges = [['0–2 ngày', 0, 2], ['3–4 ngày', 3, 4], [`5–${SLA_DAYS} ngày`, 5, SLA_DAYS], [`Trên ${SLA_DAYS} ngày`, SLA_DAYS + 1, Infinity]];
  const buckets = ranges.map(([label, lo, hi]) => ({ label, status: slaStatus(lo), count: sum(rows.flatMap((r) => r.batches.filter((b) => b.age >= lo && b.age <= hi).map((b) => b.count))) }));
  return { asOf, rows, totals, buckets, days: dayRows(rows) };
}

/** Gộp theo ngày chia các lô đã trễ hoặc sắp trễ (mọi nhân sự): lô cũ nhất ở trên. */
function dayRows(rows) {
  const byDay = new Map();
  for (const r of rows) {
    for (const b of r.batches.filter((x) => x.status !== 'ok')) {
      const d = byDay.get(b.day) ?? { ...b, count: 0, people: [] };
      d.count += b.count;
      d.people.push({ code: r.code, name: r.name, count: b.count });
      byDay.set(b.day, d);
    }
  }
  return [...byDay.values()].sort((a, b) => b.age - a.age);
}
