/**
 * Kết nối Zalo với khách: Sheet "Zalo và hotline" (mỗi dòng một retailer nhân sự đã kết bạn Zalo) đối chiếu với data nhân sự (tab Data Txx).
 * Impact = cột "KH SC tác động" của data nhân sự: sau cuộc liên hệ khách có chuyển biến SC ghi nhận được (dùng thêm tính năng, kích hoạt dịch vụ…).
 */
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Các tab của Sheet Zalo (mỗi tab: mảng dòng) → danh sách retailer đã được liên hệ qua Zalo. */
export function parseZalo(sets) {
  const out = [], seen = new Set();
  for (const rows of sets) {
    const head = (rows[0] ?? []).map(plain);
    const at = (...names) => head.findIndex((h) => names.some((n) => h.startsWith(n)));
    const col = { retailer: at('retailer'), name: at('ten gh', 'ten gian'), phone: at('sdt'), connect: at('tinh trang ket noi'), reply: at('tinh trang phan hoi'), date: at('ngay ket ban'), note: at('ghi chu') };
    if (col.retailer < 0 || col.connect < 0) continue;
    const get = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
    for (const r of rows.slice(1)) {
      const retailer = get(r, col.retailer);
      if (!/^\d+$/.test(retailer) || seen.has(retailer)) continue;
      seen.add(retailer);
      const connect = get(r, col.connect), reply = get(r, col.reply);
      out.push({ retailer, name: get(r, col.name), phone: get(r, col.phone), connect, reply, date: get(r, col.date), note: get(r, col.note), accepted: plain(connect).startsWith('dong y'), replied: plain(reply) === 'co phan hoi' });
    }
  }
  return out;
}

const codeOf = (h) => /^(\d+)\s*-/.exec(h ?? '')?.[1] ?? '';
const rate = (a, b) => (b ? a / b : null);

/** Chỉ số của một nhóm retailer đã ghép với data nhân sự. */
function group(items) {
  const found = items.filter((x) => x.job), done = found.filter((x) => x.job.status === 'Đã làm');
  const conn = found.filter((x) => x.job.contact === 'Kết nối thành công');
  const impact = found.filter((x) => x.job.impact), impactDone = done.filter((x) => x.job.impact);
  return { n: items.length, found: found.length, done: done.length, conn: conn.length, impact: impact.length, impactDone: impactDone.length, impactRate: rate(impactDone.length, done.length), impactAll: rate(impact.length, found.length) };
}

/** Nguồn data của ca: ca chưa gán nguồn mà thuộc loại công việc T15 thì nguồn là T15. */
export const sourceOf = (job) => {
  if (!job) return '';
  const unset = !job.source || /^\(Chưa gán nguồn\)$/i.test(job.source);
  return unset && /\bT15\b/i.test(job.jobType ?? '') ? 'T15' : job.source;
};

/** Đối chiếu từng retailer của Zalo với data nhân sự: lấy ca mới nhất của retailer đó. */
export function analyzeZalo(zalo, detail, f = {}) {
  const latest = new Map();
  const wanted = new Set(zalo.map((z) => z.retailer));
  for (const r of detail ?? []) {
    const id = String(r.retailer ?? '').trim();
    if (!wanted.has(id)) continue;
    const cur = latest.get(id);
    if (!cur || (r.createdTs ?? 0) > (cur.createdTs ?? 0)) latest.set(id, r);
  }
  const every = zalo.map((z) => ({ ...z, job: latest.get(z.retailer) ?? null, source: sourceOf(latest.get(z.retailer)), product: latest.get(z.retailer)?.product ?? '', code: codeOf(latest.get(z.retailer)?.handler) }));
  const options = { persons: [...new Map(every.filter((x) => x.code).map((x) => [x.code, /^\d+\s*-\s*([^-]+)/.exec(x.job.handler)?.[1]?.trim() ?? x.code])).entries()].map(([code, name]) => ({ code, name })), products: [...new Set(every.map((x) => x.product).filter(Boolean))].sort(), sources: [...new Set(every.map((x) => x.source).filter(Boolean))].sort() };
  const keep = (x) => (!f.accept || f.accept === 'all' || (f.accept === 'yes') === x.accepted) && (!f.reply || f.reply === 'all' || (f.reply === 'yes') === x.replied)
    && (!f.person || f.person === 'all' || x.code === f.person) && (!f.product || f.product === 'all' || x.product === f.product) && (!f.source || f.source === 'all' || x.source === f.source)
    && (!f.impact || f.impact === 'all' || (f.impact === 'yes' ? Boolean(x.job?.impact) : Boolean(x.job) && !x.job.impact));
  const items = every, shown = every.filter(keep);   // thống kê tính trên toàn bộ retailer; bộ lọc chỉ áp dụng cho bảng từng retailer
  const by = (pred) => group(items.filter(pred));
  // Hai tình trạng kết bạn, mỗi tình trạng lại chia thành có / không phản hồi: bốn nhóm lá không giao nhau, cộng lại bằng tổng.
  const groups = [
    { key: 'all', level: 0, label: 'Tất cả retailer Zalo', ...by(() => true) },
    { key: 'acc', level: 1, label: 'Đồng ý kết bạn', ...by((x) => x.accepted) },
    { key: 'acc_rep', level: 2, leaf: true, label: 'Có phản hồi', ...by((x) => x.accepted && x.replied) },
    { key: 'acc_norep', level: 2, leaf: true, label: 'Không phản hồi', ...by((x) => x.accepted && !x.replied) },
    { key: 'noacc', level: 1, label: 'Chưa đồng ý kết bạn', ...by((x) => !x.accepted) },
    { key: 'noacc_rep', level: 2, leaf: true, label: 'Có phản hồi', ...by((x) => !x.accepted && x.replied) },
    { key: 'noacc_norep', level: 2, leaf: true, label: 'Không phản hồi', ...by((x) => !x.accepted && !x.replied) },
  ];
  const codes = [...new Set(items.map((x) => x.code).filter(Boolean))];
  const people = codes.map((code) => {
    const mine = items.filter((x) => x.code === code);
    return { code, name: /^\d+\s*-\s*([^-]+)/.exec(mine[0].job.handler)?.[1]?.trim() ?? code, accepted: mine.filter((x) => x.accepted).length, replied: mine.filter((x) => x.replied).length, ...group(mine) };
  }).sort((a, b) => b.n - a.n);
  return { items, shown, groups, people, options, total: every.length, missing: items.filter((x) => !x.job) };
}
