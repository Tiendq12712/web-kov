/**
 * Thống kê data chuyển từ Offline sang Online: dấu hiệu là mô tả có "Chuyển đổi từ Offline sang Online".
 * Theo tháng, nguồn data, tỉnh/thành phố (và miền), ngành hàng, loại công việc.
 */
import { metrics } from './jobType.js';
import { taskStats } from './tasks.js';

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

/**
 * SC Offline chia 2 team theo địa bàn: từ Đà Nẵng trở ra phía bắc là Miền Bắc, phía nam Đà Nẵng là Miền Nam.
 * Tên tỉnh theo danh sách sau sáp nhập (Thanh Hóa, Nghệ An, Hà Tĩnh, Quảng Trị, Huế, Đà Nẵng… là Miền Bắc; Quảng Ngãi, Gia Lai, Khánh Hòa, Lâm Đồng… là Miền Nam).
 * Ô tỉnh trống thì chưa xếp được team. Tỉnh có tên lạ (không có trong danh sách miền Bắc) xếp vào Miền Nam.
 */
const TEAM_NORTH = [...NORTH, 'thanh hoa', 'nghe an', 'ha tinh', 'quang binh', 'quang tri', 'hue', 'da nang', 'quang nam'];
export const TEAM_NAMES = ['Miền Bắc', 'Miền Nam', 'Chưa có thông tin'];
export const teamOf = (province) => {
  const k = plain(provinceName(province));
  if (!k) return 'Chưa có thông tin';
  return TEAM_NORTH.some((x) => k.includes(x)) ? 'Miền Bắc' : 'Miền Nam';
};

export const sourceLabel = (s) => { const t = String(s || '').trim(); return t || '(Chưa gán nguồn)'; };
const sourceKey = (s) => plain(sourceLabel(s));

const count = (list, keyOf, labelOf) => {
  const map = new Map();
  for (const x of list) { const k = keyOf(x); const e = map.get(k) ?? { key: k, label: labelOf(x), n: 0 }; e.n += 1; map.set(k, e); }
  return map;
};
const industryOf = (r) => { const p = (r.product || '').trim().toLowerCase(); return p === 'fnb' ? 'FnB' : p === 'retail' ? 'Retail' : p === 'booking' ? 'Booking' : p ? r.product : 'Chưa phân loại'; };
const jobOf = (r) => /CSKH\s+(\S+)/i.exec(r.jobType ?? '')?.[1] ?? (r.jobType || 'Khác');   // "CSKH T15 - DVKH" -> T15

export function analyzeTransfer(raw, { month = 'all' } = {}) {
  // Ô tỉnh/thành trống thì lấy từ dòng khác có cùng Retailer ID (cùng một gian hàng).
  const known = new Map();
  for (const r of raw) if (r.province && r.retailer) known.set(r.retailer, r.province);
  let filled = 0;
  const all = raw.map((r) => { if (!r.province && r.retailer && known.has(r.retailer)) { filled += r.transfer ? 1 : 0; return { ...r, province: known.get(r.retailer), provinceFilled: true }; } return r; });
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
  // Kết nối thành công và impact của data chuyển (so với data thường cùng kỳ), theo tháng, nguồn, tỉnh, ngành hàng và loại công việc.
  byMonth.forEach((m) => { m.q = metrics(all.filter((r) => r.month === m.month && r.transfer)); });
  sources.forEach((e) => { e.q = metrics(xfer.filter((r) => sourceKey(r.source) === e.key)); });
  provs.forEach((e) => { e.q = metrics(xfer.filter((r) => plain(provinceName(r.province)) === e.key)); });
  industries.forEach((e) => { e.q = metrics(xfer.filter((r) => industryOf(r) === e.key)); });
  const jobs = [...count(xfer, jobOf, jobOf).values()].map((e) => ({ ...e, share: ratio(e.n, xfer.length), q: metrics(xfer.filter((r) => jobOf(r) === e.key)) })).sort((a, b) => b.n - a.n);
  const quality = { xfer: metrics(xfer), other: metrics(pool.filter((r) => !r.transfer)) };
  // Công việc hỗ trợ (tính trên data đã làm; một data có thể có nhiều công việc): số lượng, tỉ lệ, kết nối, impact; kèm tỉ lệ data có ghi công việc so với data thường.
  const tasks = { xfer: taskStats(xfer), other: taskStats(pool.filter((r) => !r.transfer)) };   // công việc hỗ trợ: data chuyển và data thường
  // Hai team SC Offline (Miền Bắc / Miền Nam): data chuyển, tổng data cùng địa bàn, kết nối, impact, công việc hỗ trợ.
  const teams = TEAM_NAMES.map((name) => {
    const x = xfer.filter((r) => teamOf(r.province) === name), total = pool.filter((r) => teamOf(r.province) === name).length;
    const top = (list, keyOf, labelOf) => [...count(list, keyOf, labelOf).values()].sort((a, b) => b.n - a.n).slice(0, 6).map((e) => ({ ...e, share: ratio(e.n, x.length) }));
    return {
      team: name, n: x.length, share: ratio(x.length, xfer.length), total, rate: name === 'Chưa có thông tin' ? null : ratio(x.length, total), done: x.filter((r) => r.status === 'Đã làm').length,
      q: metrics(x), tasks: taskStats(x), provinces: top(x, (r) => plain(provinceName(r.province)), (r) => provinceName(r.province) || 'Chưa có thông tin'), sources: top(x, (r) => sourceKey(r.source), (r) => sourceLabel(r.source)),
      byMonth: Object.fromEntries(months.map((m) => [m, x.filter((r) => r.month === m).length])),
    };
  }).filter((t) => t.n || t.team !== 'Chưa có thông tin');
  return { teams, quality, tasks, jobs, months, total: pool.length, xferCount: xfer.length, rate: ratio(xfer.length, pool.length), done: done.length, doneRate: ratio(done.length, xfer.length), byMonth, sources, provs, regions, industries, statuses, days, provCount: provs.filter((p) => p.key).length, filled: xfer.filter((r) => r.provinceFilled).length };
}
