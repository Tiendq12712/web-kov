/**
 * Phân tích một "tệp data" (cột Nguồn data) trong tab chi tiết "Data Txx" của file KPI:
 * công việc hỗ trợ, tỉ lệ kết nối, impact, add-on, tồn đọng, rồi so với toàn bộ data.
 */
import { SLA_DAYS, WARN_DAYS } from './sla.js';

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
export const ADDONS = ['Kích hoạt payment thành công', 'Giới thiệu Kship', 'Giới thiệu Lending', 'Giới thiệu nâng gói', 'Mua phần cứng', 'Giới thiệu Thêm kho/thêm chi nhánh', 'Giới thiệu Hotellink', 'Hướng dẫn KH HDDT/CKS thành công', 'Chuyển lead ký mới', 'Chuyển lead tái ký'];
const one = (v) => v === 1 || v === true || String(v).trim() === '1';
const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);

/** Thời điểm (ms) từ ô ngày giờ: số của Google Sheets, "2026-10-16 05:25 AM" hoặc "9/30/2026 5:04"; không đọc được thì null. */
export function tsOf(v) {
  if (typeof v === 'number') return Math.round((v - 25569) * 86_400_000);
  const t = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i.exec(t);
  if (m) {
    let h = Number(m[4] ?? 0);
    if (m[6]) h = (h % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0);
    return Date.UTC(+m[1], +m[2] - 1, +m[3], h, Number(m[5] ?? 0));
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i.exec(t);
  if (m) {
    let a = +m[1], b = +m[2];   // mặc định tháng/ngày/năm (kiểu Mỹ); nếu số đầu > 12 thì là ngày/tháng/năm
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    let h = Number(m[4] ?? 0);
    if (m[6]) h = (h % 12) + (m[6].toUpperCase() === 'PM' ? 12 : 0);
    return Date.UTC(+m[3], mo - 1, d, h, Number(m[5] ?? 0));
  }
  return null;
}
function dateOf(v) {
  const ts = tsOf(v);
  if (ts == null) return { ym: '', iso: '' };
  const d = new Date(ts);
  return { ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, iso: d.toISOString().slice(0, 10) };
}

/** Một tab Data → danh sách dòng gọn. */
export function parseDetail(rows, month) {
  const head = (rows[0] ?? []).map(plain);
  const at = (name) => head.indexOf(plain(name));
  const col = { desc: at('Mô tả'), calls: at('Số cuộc gọi thực hiện'), feature: at('Tính năng'), featureGroup: at('Nhóm tính năng'), usage: at('Tình trạng sử dụng phần mềm'), created: at('Thời gian tạo'), modified: at('Thời gian tương tác') >= 0 ? at('Thời gian tương tác') : at('Thời gian chỉnh sửa'), retailer: at('Retailer ID'), task: at('Công việc hỗ trợ'), source: at('Nguồn data'), handler: at('Người xử lý'), status: at('Tình trạng xử lý'), contact: at('Tình trạng liên hệ'), reason: at('Nguyên nhân'), impact: at('KH SC tác động'), addPts: at('Điểm add on'), points: at('Tổng điểm') };
  if (col.source < 0 || col.status < 0) return [];
  const addCols = ADDONS.map((n) => ({ n, i: at(n) })).filter((c) => c.i >= 0);
  const out = [];
  for (const r of rows.slice(1)) {
    if (!r.length || !String(r[col.status] ?? '').trim()) continue;
    const d = dateOf(r[col.created]);
    out.push({
      desc: col.desc >= 0 ? String(r[col.desc] ?? '').trim().slice(0, 800) : '', calls: col.calls >= 0 ? Number(r[col.calls]) || 0 : null,
      feature: col.feature >= 0 ? String(r[col.feature] ?? '').trim() : '', featureGroup: col.featureGroup >= 0 ? String(r[col.featureGroup] ?? '').trim() : '', usage: col.usage >= 0 ? String(r[col.usage] ?? '').trim() : '',
      month: month ?? d.ym, created: d.iso, retailer: col.retailer >= 0 ? String(r[col.retailer] ?? '') : '', createdTs: tsOf(r[col.created]), modifiedTs: col.modified >= 0 ? tsOf(r[col.modified]) : null,
      source: String(r[col.source] ?? '').trim() || '(Chưa gán nguồn)',
      tasks: String(r[col.task] ?? '').split('|##|').map((t) => t.trim()).filter(Boolean),
      handler: String(r[col.handler] ?? '').trim(), status: String(r[col.status] ?? '').trim(), contact: String(r[col.contact] ?? '').trim(),
      reason: String(r[col.reason] ?? '').trim(), impact: one(r[col.impact]), addPts: Number(r[col.addPts]) || 0, points: Number(r[col.points]) || 0,
      add: addCols.filter((c) => one(r[c.i])).map((c) => c.n),
    });
  }
  return out;
}

/** Gộp các cách viết khác nhau của một nguồn (Fnb / FNB). */
export const sourceKey = (s) => plain(s);

export function sourceOptions(rows) {
  const map = new Map();
  for (const r of rows) {
    const k = sourceKey(r.source), e = map.get(k) ?? { key: k, labels: new Map(), count: 0 };
    e.count += 1; e.labels.set(r.source, (e.labels.get(r.source) ?? 0) + 1); map.set(k, e);
  }
  return [...map.values()].map((e) => ({ key: e.key, label: [...e.labels].sort((a, b) => b[1] - a[1])[0][0], count: e.count })).sort((a, b) => b.count - a.count);
}

export function metrics(rows, today) {
  const done = rows.filter((r) => r.status === 'Đã làm');
  const contacted = rows.filter((r) => r.contact);
  const conn = rows.filter((r) => r.contact === 'Kết nối thành công');
  const addRows = rows.filter((r) => r.add.length || r.addPts > 0);
  const open = rows.filter((r) => r.status === 'Chưa làm' || r.status === 'Đang làm');
  const age = (r) => (r.created ? Math.round((new Date(today) - new Date(r.created)) / 86_400_000) : 0);
  const fail = contacted.filter((r) => ['Không nghe máy', 'Thuê bao', 'Sai số'].includes(r.contact));
  return {
    n: rows.length, done: done.length, open: open.length, todo: rows.filter((r) => r.status === 'Chưa làm').length,
    contacted: contacted.length, conn: conn.length, connRate: ratio(conn.length, contacted.length),
    impact: rows.filter((r) => r.impact).length, impactRate: ratio(done.filter((r) => r.impact).length, done.length), impactConnRate: ratio(conn.filter((r) => r.impact).length, conn.length),
    addCount: addRows.length, addRate: ratio(addRows.length, conn.length), addPts: sum(rows.map((r) => r.addPts)), points: sum(rows.map((r) => r.points)),
    failCount: fail.length, failRate: ratio(fail.length, contacted.length),
    soon: open.filter((r) => age(r) >= SLA_DAYS - WARN_DAYS && age(r) <= SLA_DAYS).length, late: open.filter((r) => age(r) > SLA_DAYS).length,
    doneShare: ratio(done.length, rows.length), openShare: ratio(open.length, rows.length),
  };
}

const distribution = (rows, pick, base) => {
  const map = new Map();
  for (const r of rows) for (const k of pick(r)) map.set(k, (map.get(k) ?? 0) + 1);
  return map;
};

export function analyzeSegment(all, { key, month = 'all', today = new Date().toISOString().slice(0, 10) } = {}) {
  const inMonth = month === 'all' ? all : all.filter((r) => r.month === month);
  const seg = inMonth.filter((r) => sourceKey(r.source) === key);
  const rest = inMonth.filter((r) => sourceKey(r.source) !== key);
  const m = { seg: metrics(seg, today), all: metrics(inMonth, today), rest: metrics(rest, today) };
  const segDone = seg.filter((r) => r.status === 'Đã làm'), allDone = inMonth.filter((r) => r.status === 'Đã làm');

  const taskRow = (name, a, b) => ({ name, seg: a, all: b, segShare: ratio(a, segDone.length), allShare: ratio(b, allDone.length), times: ratio(ratio(a, segDone.length), ratio(b, allDone.length)) });
  const st = distribution(segDone, (r) => r.tasks), at = distribution(allDone, (r) => r.tasks);
  const tasks = [...st].map(([k, v]) => taskRow(k, v, at.get(k) ?? 0)).sort((a, b) => b.seg - a.seg);
  const withTask = { seg: ratio(segDone.filter((r) => r.tasks.length).length, segDone.length), all: ratio(allDone.filter((r) => r.tasks.length).length, allDone.length) };

  const segConn = seg.filter((r) => r.contact === 'Kết nối thành công'), allConn = inMonth.filter((r) => r.contact === 'Kết nối thành công');
  const sr = distribution(segConn.filter((r) => r.reason), (r) => [r.reason]), ar = distribution(allConn.filter((r) => r.reason), (r) => [r.reason]);
  const reasons = [...sr].map(([k, v]) => ({ name: k, seg: v, all: ar.get(k) ?? 0, segShare: ratio(v, segConn.length), allShare: ratio(ar.get(k) ?? 0, allConn.length) })).sort((a, b) => b.seg - a.seg);
  reasons.forEach((r) => { r.times = ratio(r.segShare, r.allShare); });

  const contactMix = ['Kết nối thành công', 'Không nghe máy', 'Thuê bao', 'Hẹn liên hệ sau', 'Sai số'].map((k) => ({ name: k, seg: seg.filter((r) => r.contact === k).length, all: inMonth.filter((r) => r.contact === k).length }));
  const segContacted = m.seg.contacted, allContacted = m.all.contacted;
  contactMix.forEach((c) => { c.segShare = ratio(c.seg, segContacted); c.allShare = ratio(c.all, allContacted); });

  const sa = distribution(seg, (r) => r.add), aa = distribution(inMonth, (r) => r.add);
  const addons = ADDONS.map((k) => ({ name: k, seg: sa.get(k) ?? 0, all: aa.get(k) ?? 0 })).filter((a) => a.seg || a.all).sort((a, b) => b.all - a.all);

  const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2 ($1)').trim() : '(Chưa giao nhân sự)');
  const byHandler = new Map();
  for (const r of seg) { const k = nameOf(r.handler); (byHandler.get(k) ?? byHandler.set(k, []).get(k)).push(r); }
  const handlers = [...byHandler].map(([name, rows]) => ({ name, ...metrics(rows, today) })).sort((a, b) => b.done - a.done);

  const monthsList = [...new Set(all.map((r) => r.month).filter(Boolean))].sort();
  const trend = monthsList.map((ym) => ({ ym, ...metrics(all.filter((r) => r.month === ym && sourceKey(r.source) === key), today), allConn: metrics(all.filter((r) => r.month === ym), today).connRate, allImpact: metrics(all.filter((r) => r.month === ym), today).impactRate, allAdd: metrics(all.filter((r) => r.month === ym), today).addRate }));

  const out = { m, tasks, withTask, reasons, contactMix, addons, handlers, trend, segDone: segDone.length, segConn: segConn.length };
  out.advice = advise(out);
  return out;
}

const pc = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
function advise(a) {
  const out = [], { seg, all, rest } = a.m;
  if (!seg.n) return out;
  if (all.addRate && seg.addRate != null && seg.addRate < all.addRate * 0.6) out.push({ tone: 'bad', text: `Add-on của tệp chỉ ${pc(seg.addRate)} data kết nối thành công (${seg.addCount} data), thấp hơn mức chung ${pc(all.addRate)}. Cần kịch bản giới thiệu thêm sản phẩm ngay trong cuộc gọi hỗ trợ (đặc biệt khi khách cần thiết bị hoặc nâng cấp).` });
  else if (all.addRate && seg.addRate != null && seg.addRate >= all.addRate) out.push({ tone: 'good', text: `Add-on của tệp ${pc(seg.addRate)}, bằng hoặc cao hơn mức chung ${pc(all.addRate)}.` });
  const hot = a.tasks.filter((t) => t.segShare >= 0.08 && t.times && t.times >= 2.5);
  hot.slice(0, 2).forEach((t) => out.push({ tone: 'warn', text: `Công việc "${t.name}" chiếm ${pc(t.segShare)} data đã làm của tệp, gấp ${t.times.toFixed(1).replace('.', ',')} lần toàn data: nên có hướng dẫn xử lý chuẩn (tài liệu/kịch bản) để rút ngắn thời gian và giảm phụ thuộc kỹ thuật.` }));
  const reason = a.reasons.find((r) => r.segShare >= 0.05 && r.times && r.times >= 2 && !/bình thường/i.test(r.name));
  if (reason) out.push({ tone: 'warn', text: `Nguyên nhân "${reason.name}" chiếm ${pc(reason.segShare)} cuộc kết nối của tệp (toàn data ${pc(reason.allShare)}). Đây là điểm tập trung: xây quy trình xử lý và khai thác cơ hội bán thêm từ nguyên nhân này.` });
  if (all.connRate != null && seg.connRate != null && seg.connRate < all.connRate - 0.03) out.push({ tone: 'warn', text: `Tỉ lệ kết nối của tệp ${pc(seg.connRate)}, thấp hơn toàn data ${pc(all.connRate)} (${((all.connRate - seg.connRate) * 100).toFixed(1).replace('.', ',')} điểm %): gọi lại ở khung giờ khác cho nhóm không nghe máy/thuê bao.` });
  if (seg.failRate >= 0.2) out.push({ tone: 'info', text: `${pc(seg.failRate)} data đã liên hệ không kết nối được (${seg.failCount} data): lên lịch gọi lại lần 2–3 vào khung giờ khác (10–11h, 16–17h thường kết nối tốt).` });
  if (all.impactRate != null && seg.impactRate != null && seg.impactRate < all.impactRate - 0.03) out.push({ tone: 'warn', text: `Impact của tệp ${pc(seg.impactRate)} data đã làm, thấp hơn toàn data ${pc(all.impactRate)}.` });
  if (seg.openShare != null && rest.openShare != null && seg.openShare > rest.openShare + 0.05) out.push({ tone: 'warn', text: `${pc(seg.openShare)} data của tệp còn tồn (chưa làm/đang làm), cao hơn các nguồn khác ${pc(rest.openShare)}; ${seg.soon} data tuổi 5–7 ngày (sắp trễ SLA)${seg.late ? `, ${seg.late} data đã trễ` : ''}. Ưu tiên xử lý các data sắp trễ trước.` });
  out.push({ tone: 'info', text: 'Theo dõi hằng tuần 3 chỉ số của tệp so với toàn data: tỉ lệ kết nối, impact và add-on.' });
  return out;
}
