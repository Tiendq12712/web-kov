import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeJobTypes } from '../jobType.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const noAns = (rate) => (rate == null ? html`<span class="muted">—</span>` : html`<span class="badge badge--${rate >= 0.15 ? 'bad' : rate >= 0.08 ? 'warn' : 'good'}">${p1(rate)}</span>`);

/** Tab "Theo loại công việc": so sánh CSKH T15 / OI / NA… về tình trạng liên hệ, impact, add-on; chia theo ngành hàng, công việc hỗ trợ, nhân sự. */
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
    </table></div>` : ''}`;
}
