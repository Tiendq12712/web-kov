/**
 * Cảnh báo tự động theo ngưỡng cho quản lý (hiện trong "Việc cần làm hôm nay" ở Tổng quan): nhân sự có tỉ lệ không nghe máy cao,
 * kết nối nhưng không impact cao, SLA dưới mức, lỗi quy trình cao, và số call chấm cần chấn chỉnh ngay.
 * Ngưỡng nằm trong CONFIG.alerts (js/config.js); mẫu quá ít (dưới mức tối thiểu) thì không cảnh báo để tránh báo oan.
 */
import { metrics } from './jobType.js';
import { analyzeCallScores } from './callScores.js';

export const DEFAULT_ALERTS = {
  noAnswerRate: 0.2, noAnswerMin: 30,   // không nghe máy ≥ 20% số data đã liên hệ, tối thiểu 30 data đã liên hệ
  noImpactRate: 0.6, noImpactMin: 30,   // kết nối nhưng không impact ≥ 60% số data kết nối, tối thiểu 30 data kết nối
  slaRate: 0.95,                        // tỉ lệ đạt SLA dưới 95% (từ mức này trở xuống bị trừ thưởng)
  errRate: 0.15, errMin: 20,            // lỗi quy trình ≥ 15% số data đã làm, tối thiểu 20 data đã làm
};

const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';
const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '');
const pc = (v) => `${(v * 100).toFixed(0)}%`;
const names = (list) => { const top = list.slice(0, 3).map((x) => `${x.name} (${x.text})`).join(', '); return list.length > 3 ? `${top}…` : top; };

/** @returns [{ tone, count, text, hint, tab }] */
export function computeAlerts({ rows = null, month, control = null, scores = null, nameFor = () => null, cfg = {} }) {
  const c = { ...DEFAULT_ALERTS, ...cfg }, out = [];
  if (rows?.length) {
    const byPerson = new Map();
    for (const r of rows) if (r.month === month && r.status !== 'Hủy') (byPerson.get(codeOf(r.handler)) ?? byPerson.set(codeOf(r.handler), []).get(codeOf(r.handler))).push(r);
    const stats = [...byPerson].filter(([code]) => code).map(([code, list]) => ({ code, name: nameFor(code) ?? nameOf(list[0].handler), m: metrics(list) }));
    const na = stats.filter((x) => x.m.contacted >= c.noAnswerMin && x.m.noAnswerRate >= c.noAnswerRate).sort((a, b) => b.m.noAnswerRate - a.m.noAnswerRate);
    if (na.length) out.push({ tone: 'warn', count: na.length, text: 'nhân sự có tỉ lệ không nghe máy cao', hint: `Từ ${pc(c.noAnswerRate)} data đã liên hệ: ${names(na.map((x) => ({ name: x.name, text: pc(x.m.noAnswerRate) })))}`, tab: 'jobs' });
    const ni = stats.filter((x) => x.m.conn >= c.noImpactMin && x.m.connNoImpact / x.m.conn >= c.noImpactRate).sort((a, b) => b.m.connNoImpact / b.m.conn - a.m.connNoImpact / a.m.conn);
    if (ni.length) out.push({ tone: 'warn', count: ni.length, text: 'nhân sự kết nối thành công nhưng không impact nhiều', hint: `Từ ${pc(c.noImpactRate)} data kết nối: ${names(ni.map((x) => ({ name: x.name, text: pc(x.m.connNoImpact / x.m.conn) })))}. Nên chọn call nghe lại`, tab: 'listen' });
  }
  if (control) {
    const sla = control.people.filter((p) => p.code && p.live > 0 && p.slaRate != null && p.slaRate < c.slaRate).sort((a, b) => a.slaRate - b.slaRate);
    if (sla.length) out.push({ tone: 'bad', count: sla.length, text: 'nhân sự đạt SLA dưới mức quy định', hint: `Dưới ${pc(c.slaRate)}, bị trừ thưởng: ${names(sla.map((p) => ({ name: nameFor(p.code) ?? p.name, text: pc(p.slaRate) })))}`, tab: 'sla' });
    const err = control.people.filter((p) => p.code && p.done >= c.errMin && p.errRate >= c.errRate).sort((a, b) => b.errRate - a.errRate);
    if (err.length) out.push({ tone: 'warn', count: err.length, text: 'nhân sự có tỉ lệ lỗi quy trình cao', hint: `Từ ${pc(c.errRate)} data đã làm: ${names(err.map((p) => ({ name: nameFor(p.code) ?? p.name, text: pc(p.errRate) })))}`, tab: 'control' });
  }
  if (scores?.length) {
    const a = analyzeCallScores(scores, {});
    const urgent = a.people.filter((p) => p.urgent > 0).sort((x, y) => y.urgent - x.urgent);
    if (a.quality.urgent) out.push({ tone: 'bad', count: a.quality.urgent, text: 'call chấm cần chấn chỉnh ngay', hint: `Nhân sự: ${names(urgent.map((p) => ({ name: nameFor(p.code) ?? p.name, text: String(p.urgent) })))}`, tab: 'callctl' });
  }
  return out;
}
