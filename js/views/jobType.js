import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeJobTypes } from '../jobType.js';
import { taskTrend } from '../tasks.js';
import { lineChart, chartCard } from './charts.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const noAns = (rate) => (rate == null ? html`<span class="muted">—</span>` : html`<span class="badge badge--${rate >= 0.15 ? 'bad' : rate >= 0.08 ? 'warn' : 'good'}">${p1(rate)}</span>`);

/** Tab "Theo loại công việc": so sánh CSKH T15 / OI / NA… về tình trạng liên hệ, impact, add-on; chia theo ngành hàng, công việc hỗ trợ, nhân sự. */
const METRICS = { share: ['% data đã làm', 'share'], conn: ['Tỉ lệ kết nối', 'connRate'], impact: ['Tỉ lệ impact', 'impactRate'] };

/** Bảng xu hướng công việc hỗ trợ qua các tháng (mỗi dòng một công việc) kèm biểu đồ đường cho các công việc nhiều nhất. */
function trendSection(data, ui, names) {
  const code = ui.person && ui.person !== 'all' ? ui.person : '';
  const metric = METRICS[ui.metric] ? ui.metric : 'share', key = METRICS[metric][1];
  const people = new Map();
  for (const r of data.rows) { const m = /^(\d+)\s*-\s*(.+?)(?:\s*-|$)/.exec(r.handler ?? ''); if (m && !people.has(m[1])) people.set(m[1], names.get(m[1]) ?? m[2]); }
  const t = taskTrend(data.rows, data.months, code);
  const cell = (c) => (c ? p1(c[key]) : '—');
  const delta = (task) => {
    const v = task.cells.map((c) => c?.[key]).filter((x) => x != null);
    if (v.length < 2) return html`<span class="muted">—</span>`;
    const d = (v.at(-1) - v.at(-2)) * 100;
    return html`<span class="badge badge--${Math.abs(d) < 0.5 ? 'warn' : d > 0 ? 'good' : 'bad'}">${d > 0 ? '▲' : d < 0 ? '▼' : '■'} ${Math.abs(d).toFixed(1)} đ</span>`;
  };
  const top = t.list.filter((x) => x.cells.filter(Boolean).length >= 2).slice(0, 4);
  const chart = top.length && t.months.length > 1 ? chartCard(`Xu hướng ${METRICS[metric][0].toLowerCase()}`, lineChart({ labels: t.months.map(mlabel), format: (v) => pct(v, 0), series: top.map((x, i) => ({ name: x.task, cls: `s${i + 1}`, values: x.cells.map((c) => c?.[key] ?? 0) })) }), `${top.length} công việc nhiều nhất; tháng không có dữ liệu tính 0.`) : '';
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Công việc hỗ trợ qua từng tháng</h2>
      <p class="muted">Tỉ lệ chọn từng công việc trên data đã làm của mỗi tháng (không phụ thuộc bộ lọc tháng, ngành hàng ở trên). Một data có thể có nhiều công việc.</p></div>
    <div class="filters" aria-label="Lọc xu hướng công việc">
      <label class="filter"><span>Chỉ số</span><select id="jt-tmetric" class="select">${Object.entries(METRICS).map(([k, [label]]) => opt(k, label, metric))}</select></label>
      <label class="filter"><span>Nhân sự</span><select id="jt-tperson" class="select">${opt('all', 'Tất cả nhân sự', code || 'all')}${[...people].sort((a, b) => a[1].localeCompare(b[1], 'vi')).map(([c, n]) => opt(c, `${c} · ${n}`, code))}</select></label>
    </div>
    ${chart}
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Công việc hỗ trợ</th>${t.months.map((m) => html`<th scope="col" class="right">${mlabel(m)}</th>`)}<th scope="col" class="right">So tháng trước</th></tr></thead>
      <tbody>${t.list.map((x) => html`<tr class="static"><td class="sticky-col"><strong>${x.task}</strong></td>${x.cells.map((c) => html`<td class="right num">${cell(c)}${c ? html` <small class="muted">${num(c.n)}</small>` : ''}</td>`)}<td class="right">${delta(x)}</td></tr>`)}</tbody>
      <tfoot><tr class="static avg-row"><td class="sticky-col"><strong>Data đã làm · % có ghi công việc</strong></td>${t.done.map((d, i) => html`<td class="right num">${num(d)} <small class="muted">${p1(t.withTaskRate[i])}</small></td>`)}<td></td></tr></tfoot>
    </table></div>`;
}

export function jobTypeView(data, ui, { names }) {
  const months = data.months, month = ui.month && (ui.month === 'all' || months.includes(ui.month)) ? ui.month : months.at(-1);
  const first = analyzeJobTypes(data.rows, { month });
  const product = ui.product === 'all' || first.industries.includes(ui.product) ? ui.product : 'all';
  const a = analyzeJobTypes(data.rows, { month, product, job: ui.job });
  const job = a.sel;
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const nm = (p) => names.get(p.code) ?? p.name;
  const row = (label, m, strong = false) => html`<tr class="static ${strong ? 'avg-row' : ''}"><td class="sticky-col"><strong>${label}</strong></td>
    <td class="right num">${num(m.n)}</td><td class="right num">${num(m.done)}</td><td class="right num">${num(m.contacted)}</td><td class="right num">${num(m.conn)}</td><td class="right num">${p1(m.connRate)}</td>
    <td class="right num">${num(m.noAnswer)}</td><td class="right">${noAns(m.noAnswerRate)}</td><td class="right num">${num(m.offline + m.later + m.wrong)}</td><td class="right num">${p1(m.impactRate)}</td><td class="right num">${num(m.connNoImpact)}</td><td class="right num">${p1(m.addRate)}</td></tr>`;
  const HEAD = html`<th scope="col" class="right">Tổng data</th><th scope="col" class="right">Đã làm</th><th scope="col" class="right">Đã liên hệ</th><th scope="col" class="right">Kết nối TC</th><th scope="col" class="right">Tỉ lệ kết nối</th><th scope="col" class="right">Không nghe máy</th><th scope="col" class="right">% không nghe máy</th><th scope="col" class="right">Thuê bao, hẹn, sai số</th><th scope="col" class="right">Impact (đã làm)</th><th scope="col" class="right">Kết nối không impact</th><th scope="col" class="right">Add-on / kết nối</th>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Thống kê theo loại công việc</h2>
      <p class="muted">So sánh các loại công việc của data (CSKH T15, OI, NA…). Tỉ lệ kết nối và không nghe máy tính trên data đã có tình trạng liên hệ; impact tính trên data đã làm; add-on tính trên data kết nối thành công.</p></div>
    <div class="filters" aria-label="Lọc thống kê">
      <label class="filter"><span>Tháng</span><select id="jt-month" class="select">${opt('all', 'Tất cả tháng', month)}${[...months].reverse().map((m) => opt(m, mlabel(m), month))}</select></label>
      <label class="filter"><span>Ngành hàng</span><select id="jt-product" class="select">${opt('all', 'Tất cả ngành', product)}${first.industries.map((i) => opt(i, i, product))}</select></label>
    </div>
    <div class="grid">
      ${stat('Tổng data', num(a.total.n), `${num(a.total.done)} đã làm · ${num(a.total.cancel)} hủy`)}
      ${stat('Tỉ lệ kết nối', p1(a.total.connRate), `${num(a.total.conn)} / ${num(a.total.contacted)} data đã liên hệ`)}
      ${stat('Không nghe máy', p1(a.total.noAnswerRate), `${num(a.total.noAnswer)} data`, a.total.noAnswerRate >= 0.15 ? 'bad' : a.total.noAnswerRate >= 0.08 ? 'warn' : 'good')}
      ${stat('Impact', p1(a.total.impactRate), `${num(a.total.impact)} / ${num(a.total.done)} data đã làm`)}
    </div>
    <div class="toolbar"><h2 class="section-title">Theo loại công việc${product === 'all' ? '' : ` · ${product}`}</h2></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Loại công việc</th>${HEAD}</tr></thead>
      <tbody>${a.byJob.map((j) => row(`CSKH ${j.job}`, j))}</tbody>
      <tfoot><tr class="static avg-row"><td class="sticky-col"><strong>Tổng</strong></td><td class="right num">${num(a.total.n)}</td><td class="right num">${num(a.total.done)}</td><td class="right num">${num(a.total.contacted)}</td><td class="right num">${num(a.total.conn)}</td><td class="right num">${p1(a.total.connRate)}</td><td class="right num">${num(a.total.noAnswer)}</td><td class="right">${noAns(a.total.noAnswerRate)}</td><td class="right num">${num(a.total.offline + a.total.later + a.total.wrong)}</td><td class="right num">${p1(a.total.impactRate)}</td><td class="right num">${num(a.total.connNoImpact)}</td><td class="right num">${p1(a.total.addRate)}</td></tr></tfoot>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Không nghe máy theo ngành hàng</h2><p class="muted">Mỗi ô: % không nghe máy (số data không nghe máy / số data đã liên hệ). Không phụ thuộc bộ lọc ngành hàng ở trên.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Loại công việc</th>${first.industries.map((i) => html`<th scope="col" class="right">${i}</th>`)}</tr></thead>
      <tbody>${a.matrix.map((m) => html`<tr class="static"><td class="sticky-col"><strong>CSKH ${m.job}</strong></td>${first.industries.map((i) => { const c = m.cells[i]; return html`<td class="right">${c.contacted ? html`${noAns(c.noAnswerRate)} <small class="muted">${num(c.noAnswer)}/${num(c.contacted)}</small>` : html`<span class="muted">—</span>`}</td>`; })}</tr>`)}</tbody>
    </table></div>
    ${job ? html`
    <div class="toolbar"><h2 class="section-title">Chi tiết loại công việc: CSKH ${job}</h2>
      <label class="filter"><span>Chọn loại</span><select id="jt-job" class="select">${a.jobs.map((j) => opt(j, `CSKH ${j}`, job))}</select></label></div>
    <div class="toolbar"><h3 class="section-title">Công việc hỗ trợ</h3><p class="muted">Trên ${num(a.doneSel)} data đã làm. Một data có thể có nhiều công việc hỗ trợ nên tổng các dòng lớn hơn số data.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Công việc hỗ trợ</th><th scope="col" class="right">Số data</th><th scope="col" class="right">% data đã làm</th><th scope="col" class="right">Tỉ lệ kết nối</th><th scope="col" class="right">Impact</th><th scope="col" class="right">Add-on</th></tr></thead>
      <tbody>${a.tasks.map((t) => html`<tr class="static"><td class="sticky-col"><strong>${t.task}</strong></td><td class="right num">${num(t.n)}</td><td class="right num">${p1(t.share)}</td><td class="right num">${p1(t.connRate)}</td><td class="right num">${p1(t.impactRate)}</td><td class="right num">${p1(t.addRate)}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h3 class="section-title">Theo nhân sự</h3><p class="muted">Sắp theo % không nghe máy (cao → thấp).</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${HEAD}</tr></thead>
      <tbody>${a.byPerson.map((p) => row(nm(p), p))}</tbody>
    </table></div>` : ''}
    ${trendSection(data, ui, names)}`;
}
