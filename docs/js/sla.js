/**
 * Thống kê SLA xử lý data ONL: mỗi lô data được chia vào một ngày phải xử lý xong trong 7 ngày.
 * Nguồn: bảng "Tồn (chưa + đang làm)" theo ngày chia của tab công việc — mỗi ô là số data của lô ngày đó còn tồn.
 */
export const SLA_DAYS = 7;     // hạn xử lý
export const WARN_DAYS = 2;    // còn tối đa 2 ngày là "sắp trễ"
/** Ngày tạo được cộng thêm hạn (ngày): data tạo ngày đó có hạn SLA = 7 + số ngày cộng thêm. Mặc định như dưới; tab "Gia hạn SLA" trong Sheet cấu hình ghi đè (xem setSlaExtra). */
const DEFAULT_EXTRA = { '2026-10-15': 3 };
export let SLA_EXTRA = { ...DEFAULT_EXTRA };

/** Ngày dạng 2026-10-15, 15/10/2026 hoặc 15/10 (không ghi năm thì lấy năm hiện tại) -> 'YYYY-MM-DD'; không hiểu thì null. */
export function parseSlaDate(text, year = new Date().getFullYear()) {
  const t = String(text ?? '').trim(), pad2 = (n) => String(n).padStart(2, '0');
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(t);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  return `${y}-${pad2(m[2])}-${pad2(m[1])}`;
}

/** Áp các dòng [ngày, số ngày cộng thêm] đọc từ Sheet: ghi đè mặc định; số ngày 0 là bỏ gia hạn của ngày đó. */
export function setSlaExtra(rows) {
  const next = { ...DEFAULT_EXTRA };
  for (const [date, days] of rows) {
    const iso = parseSlaDate(date), n = Number(String(days).replace(',', '.'));
    if (iso && Number.isFinite(n) && n >= 0) next[iso] = n;
  }
  SLA_EXTRA = next;
}
export const slaDaysFor = (iso) => SLA_DAYS + (SLA_EXTRA[String(iso ?? '').slice(0, 10)] ?? 0);

const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');
const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);

/** Trạng thái của một lô theo tuổi (số ngày kể từ ngày chia): trễ > 7 ngày, sắp trễ từ ngày thứ 5 đến ngày thứ 7. */
export const slaStatus = (age, limit = SLA_DAYS) => (age > limit ? 'late' : age >= limit - WARN_DAYS ? 'soon' : 'ok');

export const STATUS_LABELS = { late: 'Đã trễ SLA', soon: 'Sắp trễ SLA', ok: 'Trong hạn' };

/** Tuổi lô tính đến hôm nay (giờ máy) nếu đang xem tháng hiện tại và số liệu cũ hơn hôm nay; số liệu chưa kịp đồng bộ thì hạn vẫn chạy theo lịch. */
const effectiveNow = (asOf, month, live) => {
  if (!live) return asOf;
  const t = new Date(), iso = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  return iso.slice(0, 7) === month && iso > asOf ? iso : asOf;
};

/**
 * @param work   dữ liệu tab công việc (cần `backlogAll`)
 * @param asOf   ngày số liệu, 'YYYY-MM-DD'
 * @param month  tháng của báo cáo, 'YYYY-MM'
 * @returns { asOf, rows, totals, buckets } hoặc null nếu thiếu bảng tồn
 */
export function computeSla(work, asOf, month, { live = true } = {}) {
  const block = work?.backlogAll;
  if (!block || !asOf) return null;
  const nowIso = effectiveNow(asOf, month, live), now = toDate(nowIso);
  const dayCols = block.labels.map((l, i) => [l, i]).filter(([l]) => typeof l === 'number');
  // Tổng data được chia trong tháng của từng người: mẫu số của các tỉ lệ (không có thì tạm tính trên tổng data tồn).
  const assignedCols = work.assigned ? work.assigned.labels.map((l, i) => [l, i]).filter(([l]) => typeof l === 'number').map(([, i]) => i) : [];
  const assignedBy = new Map((work.assigned?.members ?? []).map((m) => [m.code, sum(assignedCols.map((i) => m.values[i]))]));
  const rows = block.members.map((m) => {
    const batches = dayCols.map(([day, i]) => {
      const count = m.values[i] ?? 0;
      if (!count) return null;
      const date = `${month}-${pad(day)}`;
      const age = Math.round((now - toDate(date)) / DAY_MS);
      const limit = slaDaysFor(date);
      const due = new Date(toDate(date).getTime() + limit * DAY_MS);
      return { day, date, count, age, limit, left: limit - age, due: `${pad(due.getDate())}/${pad(due.getMonth() + 1)}`, status: slaStatus(age, limit) };
    }).filter((b) => b && b.age >= 0);
    const by = (s) => sum(batches.filter((b) => b.status === s).map((b) => b.count));
    const total = sum(batches.map((b) => b.count));
    const assigned = assignedBy.get(m.code) ?? 0;
    return { code: m.code, name: m.name, batches, late: by('late'), soon: by('soon'), ok: by('ok'), total, assigned, base: assigned || total };
  });
  const totals = { late: sum(rows.map((r) => r.late)), soon: sum(rows.map((r) => r.soon)), ok: sum(rows.map((r) => r.ok)), total: sum(rows.map((r) => r.total)), assigned: sum(rows.map((r) => r.assigned)) };
  totals.base = rows.reduce((a, r) => a + r.base, 0);
  const ranges = [['0–2 ngày', 0, 2], ['3–4 ngày', 3, 4], [`5–${SLA_DAYS} ngày`, 5, SLA_DAYS], [`Trên ${SLA_DAYS} ngày`, SLA_DAYS + 1, Infinity]];
  const buckets = ranges.map(([label, lo, hi]) => ({ label, status: slaStatus(lo), count: sum(rows.flatMap((r) => r.batches.filter((b) => b.age >= lo && b.age <= hi).map((b) => b.count))) }));
  return { asOf, now: nowIso, rows, totals, buckets, days: dayRows(rows) };
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

/** Câu mô tả các ngày được gia hạn, ví dụ "Data tạo ngày 15/10 được cộng thêm 3 ngày (hạn 10 ngày)."; rỗng nếu không có. */
export const extraNote = () => Object.entries(SLA_EXTRA).filter(([, n]) => n > 0).sort()
  .map(([iso, n]) => `Data tạo ngày ${iso.slice(8)}/${iso.slice(5, 7)} được cộng thêm ${n} ngày (hạn ${SLA_DAYS + n} ngày).`).join(' ');

/**
 * SLA tính thẳng từ data chi tiết (Data Txx): data chưa xong (không phải "Đã làm" hoặc "Hủy") của tháng, tuổi theo ngày lịch từ ngày tạo đến hôm nay,
 * hạn 7 ngày (+ ngày được gia hạn). Cùng quy tắc với báo cáo SLA từng data nên không lệch khi bảng tồn trong tab KPI chưa kịp đồng bộ
 * (ví dụ data đóng đúng ngày thứ 7 nhưng bảng tồn cũ vẫn tính là còn mở và đã sang ngày thứ 8).
 * Trả về cùng dạng với computeSla; `now` mặc định là giờ địa phương hiện tại.
 */
export function computeSlaFromDetail(rows, asOf, month, { now = Date.now() - new Date().getTimezoneOffset() * 60_000 } = {}) {
  if (!rows || !asOf) return null;
  const dayNo = (ts) => Math.floor(ts / DAY_MS), nowDay = dayNo(now);
  const nowIso = new Date(nowDay * DAY_MS).toISOString().slice(0, 10);
  const people = new Map();
  const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';
  const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '(Chưa giao nhân sự)');
  for (const r of rows) {
    if (r.month !== month || r.status === 'Hủy' || r.createdTs == null) continue;
    const code = codeOf(r.handler) || '(pool)';
    const p = people.get(code) ?? people.set(code, { code: code === '(pool)' ? '' : code, name: nameOf(r.handler), assigned: 0, open: new Map() }).get(code);
    p.assigned += 1;
    if (r.status === 'Đã làm') continue;
    const day = Number(r.created.slice(8, 10));
    p.open.set(day, { date: r.created, count: (p.open.get(day)?.count ?? 0) + 1, age: nowDay - dayNo(r.createdTs) });
  }
  const out = [...people.values()].map((p) => {
    const batches = [...p.open].map(([day, b]) => {
      const limit = slaDaysFor(b.date), due = new Date(Date.parse(`${b.date}T00:00:00Z`) + limit * DAY_MS);
      return { day, date: b.date, count: b.count, age: b.age, limit, left: limit - b.age, due: `${pad(due.getUTCDate())}/${pad(due.getUTCMonth() + 1)}`, status: slaStatus(b.age, limit) };
    }).filter((b) => b.age >= 0).sort((a, b) => a.day - b.day);
    const by = (st) => sum(batches.filter((b) => b.status === st).map((b) => b.count)), total = sum(batches.map((b) => b.count));
    return { code: p.code, name: p.name, batches, late: by('late'), soon: by('soon'), ok: by('ok'), total, assigned: p.assigned, base: p.assigned || total };
  }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const totals = { late: sum(out.map((r) => r.late)), soon: sum(out.map((r) => r.soon)), ok: sum(out.map((r) => r.ok)), total: sum(out.map((r) => r.total)), assigned: sum(out.map((r) => r.assigned)) };
  totals.base = out.reduce((a, r) => a + r.base, 0);
  const ranges = [['0–2 ngày', 0, 2], ['3–4 ngày', 3, 4], [`5–${SLA_DAYS} ngày`, 5, SLA_DAYS], [`Trên ${SLA_DAYS} ngày`, SLA_DAYS + 1, Infinity]];
  const buckets = ranges.map(([label, lo, hi]) => ({ label, status: slaStatus(lo), count: sum(out.flatMap((r) => r.batches.filter((b) => b.age >= lo && b.age <= hi).map((b) => b.count))) }));
  return { asOf, now: nowIso, rows: out, totals, buckets, days: dayRows(out), fromDetail: true };
}
