import { html } from '../dom.js';
import { num, pct, hm, monthLabel } from '../format.js';
import { ROWS, compareInsights } from '../compare.js';
import { groupedColumns, chartCard } from './charts.js';

const fmt = (kind, v) => (v == null ? '—' : kind === 'pct' ? pct(v, 1).replace('.', ',') : kind === 'time' ? hm(v) : num(Math.round(v * 10) / 10));

/** Chênh lệch (B → A) kèm màu: xanh nếu thay đổi theo hướng tốt, đỏ nếu xấu. `good`: true = tăng là tốt, false = giảm là tốt, null = trung tính. */
function delta(kind, a, b, good) {
  if (a == null || b == null) return { text: '—', tone: '', rel: '—' };
  const d = a - b;
  const up = d > 0, tone = d === 0 || good == null ? '' : (up === good ? 'is-good' : 'is-bad');
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '•';
  const abs = kind === 'pct' ? `${(Math.abs(d) * 100).toFixed(1).replace('.', ',')} đ.%` : kind === 'time' ? hm(Math.abs(d)) : num(Math.round(Math.abs(d) * 10) / 10);
  return { text: `${arrow} ${d === 0 ? '0' : abs}`, tone, rel: b ? `${d >= 0 ? '+' : '−'}${(Math.abs(d / b) * 100).toFixed(1).replace('.', ',')}%` : '—' };
}

const monthSelect = (id, label, months, value) => html`
  <label class="filter"><span>${label}</span><select class="select" id="${id}">${months.map((m) => html`<option value="${m.month}" ${m.month === value ? 'selected' : ''}>${monthLabel(m.month)}</option>`)}</select></label>`;

function personTable(a, b) {
  const rows = [...a.people.values()].map((pa) => {
    const pb = b.people.get(pa.code);
    return { ...pa, kpiB: pb?.kpi ?? null, lateB: pb?.late ?? null, talkB: pb?.talk ?? null, talkA: pa.talk };
  }).sort((x, y) => x.name.localeCompare(y.name, 'vi'));
  const cell = (kind, av, bv, good) => { const d = delta(kind, av, bv, good); return html`<td class="num" data-sort="${av != null && bv != null ? av - bv : ''}"><span class="trend-delta ${d.tone}">${d.text}</span></td>`; };
  return html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Chênh lệch từ ${monthLabel(b.month)} sang ${monthLabel(a.month)}</p></div>
    <div class="table-wrap"><table class="compare-table sortable">
      <thead><tr><th class="sticky-col">Nhân sự</th><th>KPI ${monthLabel(b.month).replace('Tháng ', 'T')}</th><th>KPI ${monthLabel(a.month).replace('Tháng ', 'T')}</th><th>Chênh lệch KPI</th><th>Data trễ SLA</th><th>Talktime TB/ngày</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static">
        <td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
        <td class="num">${fmt('pct', r.kpiB)}</td><td class="num strong">${fmt('pct', r.kpi)}</td>${cell('pct', r.kpi, r.kpiB, true)}
        ${cell('num', r.late, r.lateB, false)}${cell('time', r.talkA, r.talkB, true)}</tr>`)}</tbody>
    </table></div>`;
}

const CARD_ROWS = ['KPI tổng (trung bình)', 'Tỉ lệ trễ trên tổng chia', 'Call TB / ngày / người', 'Talktime TB / ngày', 'Tỉ lệ kết nối', 'Act đã làm'];
const short = (name) => name.split(' ').slice(-2).join(' ');

/** Thẻ chỉ số nổi bật: giá trị tháng này, tháng so sánh và chênh lệch có màu. */
function highlightCards(sa, sb, a, b) {
  const cards = CARD_ROWS.map((label) => ROWS.find((r) => r.label === label)).filter(Boolean).map((r) => {
    const va = r.get(sa), vb = r.get(sb);
    if (va == null && vb == null) return '';
    const d = delta(r.kind, va, vb, r.good);
    return html`<div class="card cmp-card"><h3 class="card__title">${r.label}</h3><p class="big num">${fmt(r.kind, va)}</p>
      <p class="cmp-card__row"><span class="trend-delta ${d.tone}">${d.text}</span> <span class="trend-delta ${d.tone}">${d.rel}</span></p>
      <p class="muted">${monthLabel(b)}: ${fmt(r.kind, vb)}</p></div>`;
  });
  return html`<div class="grid">${cards}</div>`;
}

/** Cột nhóm KPI từng nhân sự: tháng so sánh và tháng này cạnh nhau. */
function personChart(sa, sb, a, b) {
  const people = [...sa.people.values()].filter((p) => p.kpi != null || sb.people.get(p.code)?.kpi != null).sort((x, y) => (y.kpi ?? 0) - (x.kpi ?? 0));
  if (people.length < 2) return '';
  return chartCard('KPI từng nhân sự: hai tháng cạnh nhau', groupedColumns({
    categories: people.map((p) => short(p.name)),
    series: [{ name: monthLabel(b), cls: 's1', values: people.map((p) => sb.people.get(p.code)?.kpi ?? 0) }, { name: monthLabel(a), cls: 's2', values: people.map((p) => p.kpi ?? 0) }],
    values: people.length <= 10,
  }), 'Cột xanh dương là tháng so sánh, cột xanh lá là tháng này. Nhân sự chưa có KPI ở một tháng hiển thị 0.');
}

/** So sánh hai tháng: `a` là tháng đang xét (mới hơn), `b` là tháng so sánh. */
export function compareView({ months, a, b, data }) {
  const controls = html`
    <div class="filters">${monthSelect('compare-a', 'Tháng này', months, a)}${monthSelect('compare-b', 'So với tháng', months, b)}</div>`;
  if (a === b) return html`<div class="toolbar"><h2 class="section-title">So sánh hai tháng</h2></div>${controls}<p class="notice">Hãy chọn hai tháng khác nhau để so sánh.</p>`;
  if (!data) return html`<div class="toolbar"><h2 class="section-title">So sánh hai tháng</h2></div>${controls}<p class="muted" role="status">Đang tải dữ liệu hai tháng…</p>`;
  const [sa, sb] = [data.a, data.b];
  let group = '';
  return html`
    <div class="toolbar"><h2 class="section-title">So sánh hai tháng</h2><p class="muted">${monthLabel(b)} → ${monthLabel(a)}</p></div>
    ${controls}
    ${highlightCards(sa, sb, a, b)}
    <section class="card insights" aria-label="Nhận định"><h2 class="section-title">Nhận định</h2><ul class="insights__list">${compareInsights(sa, sb).map((i) => html`<li class="insights__item ${i.tone ? `insights__item--${i.tone}` : ''}">${i.text}</li>`)}</ul></section>
    ${personChart(sa, sb, a, b)}
    <div class="toolbar"><h2 class="section-title">Chi tiết từng chỉ số</h2></div>
    <div class="table-wrap"><table class="compare-table">
      <thead><tr><th class="sticky-col">Chỉ số</th><th>${monthLabel(b)}</th><th>${monthLabel(a)}</th><th>Chênh lệch</th><th>Thay đổi %</th></tr></thead>
      <tbody>${ROWS.map((r) => {
        const va = r.get(sa), vb = r.get(sb), d = delta(r.kind, va, vb, r.good);
        const head = r.group !== group ? html`<tr class="compare-group"><td colspan="5">${(group = r.group)}</td></tr>` : '';
        return html`${head}<tr class="static"><td class="sticky-col">${r.label}</td><td class="num">${fmt(r.kind, vb)}</td><td class="num strong">${fmt(r.kind, va)}</td>
          <td class="num"><span class="trend-delta ${d.tone}">${d.text}</span></td><td class="num"><span class="trend-delta ${d.tone}">${d.rel}</span></td></tr>`;
      })}</tbody>
    </table></div>
    <p class="muted">Xanh là thay đổi theo hướng tốt (KPI, năng suất tăng; data trễ giảm), đỏ là theo hướng xấu. Số liệu SLA mỗi tháng tính tại ngày cập nhật cuối của tháng đó. Mục trống (—) nghĩa là tháng đó không có dữ liệu mục này.</p>
    ${personTable(sa, sb)}`;
}
