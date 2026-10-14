import { summarize, combineTeams } from './metrics.js';
import { computeSla } from './sla.js';

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
