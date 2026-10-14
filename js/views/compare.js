import { html } from '../dom.js';
import { num, pct, hm, monthLabel } from '../format.js';
import { ROWS } from '../compare.js';

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
