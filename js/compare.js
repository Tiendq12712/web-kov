import { summarize, combineTeams } from './metrics.js';
import { computeSla } from './sla.js';
import { monthLabel } from './format.js';

const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const finite = (list) => list.filter((v) => typeof v === 'number' && Number.isFinite(v));

/** Tóm tắt một tháng: chỉ số KPI, năng suất, SLA và số liệu từng người (để so sánh với tháng khác). */
export function summarizeMonth(month, data, report) {
  const s = summarize(combineTeams(data.teams));
  const members = data.teams.flatMap((t) => t.members);
  const asOf = data.teams.map((t) => t.asOf).sort().at(-1);
  const sla = computeSla(data.work, asOf, month);
  const slaBy = new Map((sla?.rows ?? []).map((r) => [r.code, r]));
  const repBy = new Map((report?.members ?? []).map((m) => [m.code, m]));
  const people = new Map(members.map((m) => [m.code, {
    code: m.code, name: m.name, kpi: m.kpi ?? null,
    late: slaBy.get(m.code)?.late ?? null, talk: repBy.get(m.code)?.talk ?? null,
  }]));
  const rep = report ? {
    calls: mean(finite(report.members.map((m) => m.calls))), talk: mean(finite(report.members.map((m) => m.talk))),
    rate: mean(finite(report.members.map((m) => m.rate))), workdays: mean(finite(report.members.map((m) => m.workdays))),
  } : null;
  return {
    month, asOf, people,
    kpi: {
      kpi: mean(finite(members.map((m) => m.kpi))), need: s.need.rate, main: s.main.rate, addon: s.addon.rate,
      actDone: members.reduce((a, m) => a + (m.extra?.actDone ?? 0), 0), people: members.length,
    },
    rep,
    sla: sla ? { late: sla.totals.late, soon: sla.totals.soon, base: sla.totals.base, lateRate: sla.totals.base ? sla.totals.late / sla.totals.base : null } : null,
  };
}

/** Các dòng của bảng so sánh: nhóm, nhãn, cách lấy giá trị, kiểu hiển thị và "tăng là tốt" (null = trung tính). */
export const ROWS = [
  { group: 'KPI', label: 'KPI tổng (trung bình)', kind: 'pct', good: true, get: (s) => s.kpi.kpi },
  { group: 'KPI', label: 'Điều kiện cần', kind: 'pct', good: true, get: (s) => s.kpi.need },
  { group: 'KPI', label: 'Điểm tổng', kind: 'pct', good: true, get: (s) => s.kpi.main },
  { group: 'KPI', label: 'Add-on', kind: 'pct', good: true, get: (s) => s.kpi.addon },
  { group: 'KPI', label: 'Act đã làm', kind: 'num', good: true, get: (s) => s.kpi.actDone },
  { group: 'KPI', label: 'Số nhân sự', kind: 'num', good: null, get: (s) => s.kpi.people },
  { group: 'Năng suất', label: 'Call TB / ngày / người', kind: 'num', good: true, get: (s) => s.rep?.calls },
  { group: 'Năng suất', label: 'Talktime TB / ngày', kind: 'time', good: true, get: (s) => s.rep?.talk },
  { group: 'Năng suất', label: 'Tỉ lệ kết nối', kind: 'pct', good: true, get: (s) => s.rep?.rate },
  { group: 'Năng suất', label: 'Ngày công TB', kind: 'num', good: null, get: (s) => s.rep?.workdays },
  { group: 'SLA', label: 'Data đã trễ SLA', kind: 'num', good: false, get: (s) => s.sla?.late },
  { group: 'SLA', label: 'Data sắp trễ SLA', kind: 'num', good: false, get: (s) => s.sla?.soon },
  { group: 'SLA', label: 'Tổng data được chia', kind: 'num', good: null, get: (s) => s.sla?.base },
  { group: 'SLA', label: 'Tỉ lệ trễ trên tổng chia', kind: 'pct', good: false, get: (s) => s.sla?.lateRate },
];

/** Nhận định bằng lời khi so sánh tháng `a` (mới) với tháng `b`: [{ tone, text }]. */
export function compareInsights(a, b) {
  const out = [], A = monthLabel(a.month), B = monthLabel(b.month);
  const pp = (d) => `${(Math.abs(d) * 100).toFixed(1).replace('.', ',')} điểm %`;
  const rel = (va, vb) => (vb ? `${va >= vb ? '+' : '−'}${(Math.abs(va / vb - 1) * 100).toFixed(1).replace('.', ',')}%` : '');
  const kpiA = a.kpi.kpi, kpiB = b.kpi.kpi;
  if (kpiA != null && kpiB != null) {
    const d = kpiA - kpiB;
    out.push({ tone: d === 0 ? '' : d > 0 ? 'good' : 'bad', text: `KPI trung bình ${A} đạt ${(kpiA * 100).toFixed(1).replace('.', ',')}%, ${d === 0 ? 'bằng' : d > 0 ? `cao hơn ${pp(d)} so với` : `thấp hơn ${pp(d)} so với`} ${B} (${(kpiB * 100).toFixed(1).replace('.', ',')}%). Lưu ý tháng chưa kết thúc thì KPI chưa đủ để so ngang.` });
  }
  if (a.sla?.lateRate != null && b.sla?.lateRate != null) {
    const d = a.sla.lateRate - b.sla.lateRate;
    out.push({ tone: d === 0 ? '' : d < 0 ? 'good' : 'bad', text: `Tỉ lệ data trễ SLA ${A}: ${(a.sla.lateRate * 100).toFixed(1).replace('.', ',')}% (${d === 0 ? 'không đổi' : d < 0 ? `giảm ${pp(d)}` : `tăng ${pp(d)}`} so với ${B}).` });
  }
  if (a.rep?.calls != null && b.rep?.calls != null) out.push({ tone: a.rep.calls >= b.rep.calls ? 'good' : 'bad', text: `Call trung bình mỗi người mỗi ngày: ${Math.round(a.rep.calls * 10) / 10} ở ${A} so với ${Math.round(b.rep.calls * 10) / 10} ở ${B} (${rel(a.rep.calls, b.rep.calls)}).` });
  const both = [...a.people.values()].map((p) => ({ name: p.name, d: p.kpi != null && b.people.get(p.code)?.kpi != null ? p.kpi - b.people.get(p.code).kpi : null })).filter((x) => x.d != null).sort((x, y) => y.d - x.d);
  const up = both.filter((x) => x.d > 0).slice(0, 3), down = [...both].reverse().filter((x) => x.d < 0).slice(0, 3);
  const list = (arr) => arr.map((x) => `${x.name} (${x.d > 0 ? '+' : '−'}${pp(x.d)})`).join(', ');
  if (up.length) out.push({ tone: 'good', text: `Nhân sự tăng KPI nhiều nhất: ${list(up)}.` });
  if (down.length) out.push({ tone: 'bad', text: `Nhân sự giảm KPI nhiều nhất: ${list(down)}.` });
  return out;
}
