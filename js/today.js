/**
 * Dữ liệu cho trang "Hôm nay của tôi": gom từ KPI, SLA, data chi tiết, chấm call và lịch sử của chính nhân sự.
 * Mỗi phần nhận dữ liệu có thể chưa tải xong (null) để trang hiện dần, không phải chờ hết.
 */
import { classify } from './slaDetail.js';
import { slaDaysFor } from './sla.js';
import { analyzeControl } from './control.js';
import { analyzeCallScores, noteBlocks } from './callScores.js';
import { series } from './history.js';

const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';

/** Data của nhân sự chưa xong (chưa làm, đang làm), sắp từ gần hết hạn/trễ nhiều nhất: [{ r, kind, elapsed, limit, left }]. */
export function openItems(rows, code, now) {
  if (!rows) return null;
  const items = rows.filter((r) => codeOf(r.handler) === code && r.status !== 'Hủy' && r.status !== 'Đã làm')
    .map((r) => { const c = classify(r, now), limit = slaDaysFor(r.created); return { r, kind: c.kind, elapsed: c.elapsed, limit, left: c.elapsed == null ? null : limit - c.elapsed }; })
    .filter((x) => x.elapsed != null);
  const late = items.filter((x) => x.kind === 'late-open').length, soon = items.filter((x) => x.kind === 'soon').length;
  return { total: items.length, late, soon, list: items.sort((a, b) => a.left - b.left || (a.r.createdTs ?? 0) - (b.r.createdTs ?? 0)) };
}

/** Kết quả chấm call của nhân sự: thống kê và vài call gần nhất (kèm đoạn nhận xét ngắn). */
export function myScores(scoreRows, code) {
  if (!scoreRows) return null;
  const a = analyzeCallScores(scoreRows, { code });
  const recent = a.list.slice(0, 3).map((r) => ({ date: r.date, level: r.quality.level, score: r.score, reasons: r.quality.reasons, preview: previewOf(r) }));
  return { total: a.total, quality: a.quality, avgScore: a.avgScore, avgPenalty: a.avgPenalty, recent };
}
const previewOf = (r) => {
  const first = noteBlocks(r.note).filter((b) => !b.intro)[0] ?? noteBlocks(r.note)[0];
  const text = first ? `${first.label ? `${first.label}: ` : ''}${first.text}` : r.feedback;
  return String(text ?? '').slice(0, 160);
};

/** Kiểm soát của nhân sự (lỗi quy trình, SLA, mức trừ) và 3 lỗi hay gặp nhất. */
export function myControl(rows, month, code) {
  if (!rows) return null;
  const a = analyzeControl(rows, { month, code });
  const mine = a.people.find((p) => p.code === code) ?? null;
  const top = a.byRule.filter((x) => !x.rule.soft && x.count > 0).sort((x, y) => y.count - x.count).slice(0, 3).map((x) => ({ label: x.rule.label, count: x.count }));
  return { done: a.total, flagged: a.flaggedCount, errRate: a.errRate, slaRate: mine?.slaRate ?? a.slaRate, slaCut: mine?.slaCut ?? a.slaCut, top };
}

/** KPI mười bốn ngày gần nhất của nhân sự từ lịch sử đồng bộ. */
export function myTrend(history, code, days = 14) {
  if (!history) return null;
  const s = series(history.filter((r) => r.code === String(code)), 'kpi', String(code)).slice(-days);
  return { values: s.map((p) => p.value), dates: s.map((p) => p.date), delta: s.length >= 2 ? s.at(-1).value - s.at(-2).value : null };
}
