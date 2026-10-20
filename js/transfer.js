/**
 * Thống kê data chuyển từ Offline sang Online: dấu hiệu là mô tả có "Chuyển đổi từ Offline sang Online".
 * Theo tháng, nguồn data, tỉnh/thành phố (và miền), ngành hàng, loại công việc.
 */
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const ratio = (a, b) => (b ? a / b : null);

/** Tên tỉnh/thành bỏ tiền tố "Tỉnh"/"Thành phố". */
export const provinceName = (p) => String(p || '').replace(/^(thành phố|tỉnh|tp\.?)\s+/i, '').trim();

const NORTH = ['ha noi', 'hai phong', 'quang ninh', 'bac ninh', 'thai nguyen', 'phu tho', 'lao cai', 'tuyen quang', 'cao bang', 'lang son', 'lai chau', 'dien bien', 'son la', 'hung yen', 'ninh binh', 'bac giang', 'vinh phuc', 'hai duong', 'thai binh', 'nam dinh', 'ha nam', 'bac kan', 'ha giang', 'yen bai', 'hoa binh'];
const SOUTH = ['ho chi minh', 'dong nai', 'tay ninh', 'can tho', 'vinh long', 'dong thap', 'ca mau', 'an giang', 'binh duong', 'ba ria', 'vung tau', 'long an', 'tien giang', 'ben tre', 'tra vinh', 'soc trang', 'bac lieu', 'kien giang', 'hau giang', 'binh phuoc', 'binh duong'];
const CENTRAL = ['thanh hoa', 'nghe an', 'ha tinh', 'quang tri', 'quang binh', 'hue', 'da nang', 'quang nam', 'quang ngai', 'binh dinh', 'phu yen', 'gia lai', 'kon tum', 'dak lak', 'dak nong', 'khanh hoa', 'ninh thuan', 'binh thuan', 'lam dong'];
/** Miền: Bắc / Trung / Nam (theo tên tỉnh, cả tên cũ và tên sau sáp nhập); không nhận ra thì "Khác". */
export const regionOf = (province) => {
  const k = plain(provinceName(province));
  if (!k) return 'Chưa có thông tin';
  const has = (list) => list.some((x) => k.includes(x));
  return has(NORTH) ? 'Miền Bắc' : has(CENTRAL) ? 'Miền Trung' : has(SOUTH) ? 'Miền Nam' : 'Khác';
};

export const sourceLabel = (s) => { const t = String(s || '').trim(); return t || '(Chưa gán nguồn)'; };
const sourceKey = (s) => plain(sourceLabel(s));

const count = (list, keyOf, labelOf) => {
  const map = new Map();
  for (const x of list) { const k = keyOf(x); const e = map.get(k) ?? { key: k, label: labelOf(x), n: 0 }; e.n += 1; map.set(k, e); }
  return map;
};
const industryOf = (r) => { const p = (r.product || '').trim().toLowerCase(); return p === 'fnb' ? 'FnB' : p === 'retail' ? 'Retail' : p === 'booking' ? 'Booking' : p ? r.product : 'Chưa phân loại'; };
const jobOf = (r) => (/T15/i.test(r.jobType ?? '') ? 'T15' : /OI/i.test(r.jobType ?? '') ? 'OI' : /NA/i.test(r.jobType ?? '') ? 'NA' : r.jobType || 'Khác');

export function analyzeTransfer(all, { month = 'all' } = {}) {
  const months = [...new Set(all.map((r) => r.month).filter(Boolean))].sort();
  const pool = month === 'all' ? all : all.filter((r) => r.month === month);
  const xfer = pool.filter((r) => r.transfer);
  const done = xfer.filter((r) => r.status === 'Đã làm');
  const stat = (list) => ({ total: list.length, xfer: list.filter((r) => r.transfer).length });

  const byMonth = months.map((m) => { const l = all.filter((r) => r.month === m); const s = stat(l); const x = l.filter((r) => r.transfer); return { month: m, ...s, rate: ratio(s.xfer, s.total), done: x.filter((r) => r.status === 'Đã làm').length, doneRate: ratio(x.filter((r) => r.status === 'Đã làm').length, x.length) }; });

  const srcTotal = count(pool, (r) => sourceKey(r.source), (r) => sourceLabel(r.source));
  const sources = [...count(xfer, (r) => sourceKey(r.source), (r) => sourceLabel(r.source)).values()].map((e) => ({ ...e, share: ratio(e.n, xfer.length), total: srcTotal.get(e.key)?.n ?? e.n, rate: ratio(e.n, srcTotal.get(e.key)?.n ?? e.n) })).sort((a, b) => b.n - a.n);

  const provTotal = count(pool.filter((r) => r.province), (r) => plain(provinceName(r.province)), (r) => provinceName(r.province));
  const provs = [...count(xfer, (r) => plain(provinceName(r.province)), (r) => provinceName(r.province) || 'Chưa có thông tin').values()].map((e) => ({
    ...e, label: e.key ? e.label : 'Chưa có thông tin', region: regionOf(e.label), share: ratio(e.n, xfer.length), total: provTotal.get(e.key)?.n ?? null, rate: provTotal.get(e.key)?.n ? e.n / provTotal.get(e.key).n : null,
    byMonth: Object.fromEntries(months.map((m) => [m, xfer.filter((r) => r.month === m && plain(provinceName(r.province)) === e.key).length])),
  })).sort((a, b) => b.n - a.n);
  const regions = [...count(xfer, (r) => regionOf(r.province), (r) => regionOf(r.province)).values()].map((e) => ({ ...e, share: ratio(e.n, xfer.length) })).sort((a, b) => b.n - a.n);

  const industries = [...count(xfer, industryOf, industryOf).values()].map((e) => ({ ...e, share: ratio(e.n, xfer.length) })).sort((a, b) => b.n - a.n);
  const statuses = ['Đã làm', 'Đang làm', 'Chưa làm', 'Hủy'].map((k) => ({ label: k, n: xfer.filter((r) => r.status === k).length }));
  const dayMap = new Map();
  for (const r of xfer) { const k = r.created || '—'; dayMap.set(k, (dayMap.get(k) ?? 0) + 1); }
  const days = [...dayMap].filter(([k]) => k !== '—').sort((a, b) => a[0].localeCompare(b[0])).map(([iso, n]) => ({ iso, n }));
  return { months, total: pool.length, xferCount: xfer.length, rate: ratio(xfer.length, pool.length), done: done.length, doneRate: ratio(done.length, xfer.length), byMonth, sources, provs, regions, industries, statuses, days, provCount: provs.filter((p) => p.key).length };
}
