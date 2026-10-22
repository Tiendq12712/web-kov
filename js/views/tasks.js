import { html } from '../dom.js';
import { num, pct } from '../format.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const bar = (v, max, tone = '') => html`<div class="bar ${tone ? `bar--${tone}` : ''}"><div class="bar__fill" style="width:${max ? Math.min(100, (v / max) * 100) : 0}%"></div></div>`;

/**
 * Biểu đồ thanh các công việc hỗ trợ nhiều nhất. stats: kết quả taskStats; null = đang tải; undefined = chưa có dữ liệu chi tiết.
 */
export function taskChart(stats, { limit = 8 } = {}) {
  if (stats === undefined) return html`<p class="muted">Chưa có dữ liệu chi tiết (tab "Data Txx") để thống kê công việc hỗ trợ.</p>`;
  if (stats === null) return html`<p class="muted" role="status">Đang tải dữ liệu chi tiết…</p>`;
  if (!stats.list.length) return html`<p class="muted">Chưa có công việc hỗ trợ nào được ghi trong kỳ này.</p>`;
  const top = stats.list.slice(0, limit), max = top[0]?.n ?? 1;
  return html`
    <p class="muted">${num(stats.withTask)} / ${num(stats.done)} data đã làm có ghi công việc hỗ trợ (${p1(stats.withTaskRate)}); tổng ${num(stats.totalTasks)} công việc.</p>
    <div class="hist">${top.map((t) => html`<div class="hist__row"><span title="${t.task}">${t.task}</span>${bar(t.n, max)}<span class="num">${num(t.n)} <small class="muted">(${p1(t.share)} · impact ${p1(t.impactRate)})</small></span></div>`)}</div>`;
}
