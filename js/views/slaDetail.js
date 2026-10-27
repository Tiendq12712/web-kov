import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { computeSlaDetail } from '../slaDetail.js';
import { SLA_DAYS, WARN_DAYS, extraNote } from '../sla.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const dm = (iso) => (iso && iso !== '—' ? iso.split('-').slice(1).reverse().map(Number).join('/') : '—');
const dt = (ts) => (ts == null ? '—' : new Date(ts).toISOString().slice(0, 16).replace('T', ' ').split(' ').map((p, i) => (i ? p : p.split('-').reverse().join('/'))).join(' '));
const stat = (title, value, sub, tone = '', rate = null) => html`
  <div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3>
    <p class="big num">${value}${rate == null ? '' : html` <span class="sla-rate">${p1(rate)}</span>`}</p><p class="muted">${sub}</p></div>`;
const d1 = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));
const bad = (n) => (n ? html`<span class="badge badge--bad">${num(n)}</span>` : html`<span class="muted">0</span>`);
const warn = (n) => (n ? html`<span class="badge badge--warn">${num(n)}</span>` : html`<span class="muted">0</span>`);
const KIND = { 'late-done': ['bad', 'Đã làm nhưng trễ'], 'late-open': ['bad', 'Chưa xong, quá hạn'], soon: ['warn', 'Sắp trễ'], ok: ['good', 'Đúng hạn'] };

/** SLA theo từng data: (tương tác − tạo) > 7 ngày là trễ, tính cả data đã làm. */
export function slaDetailView(data, { month, manager, code, names }) {
  const a = computeSlaDetail(data.rows, { month, code: manager ? null : code });
  const t = a.totals;
  if (!t.total) return html`<p class="notice">Chưa có data chi tiết của tháng này (tab "Data Txx" của file KPI) để tính SLA theo thời gian tương tác.</p>`;
  return html`
    <div class="toolbar"><h2 class="section-title">SLA theo thời gian tương tác${manager ? '' : ' của bạn'}</h2>
      <p class="muted">Trễ khi <strong>ngày tương tác − ngày tạo &gt; ${SLA_DAYS} ngày</strong> (tính theo ngày lịch), gồm cả data đã làm. Data chưa xong tính đến hôm nay; data hủy không tính. Sắp trễ: chưa xong, đã qua từ ${SLA_DAYS - WARN_DAYS} đến ${SLA_DAYS} ngày. ${extraNote()}</p></div>
    <div class="grid">
      ${stat('Trễ SLA', num(t.late), `Đã làm nhưng trễ ${num(t.late_done)} · chưa xong quá hạn ${num(t.late_open)}`, 'bad', t.lateRate)}
      ${stat('Sắp trễ SLA', num(t.soon), `Chưa xong, đã qua ${SLA_DAYS - WARN_DAYS}–${SLA_DAYS} ngày`, 'warn', t.soonRate)}
      ${stat('Đúng hạn', num(t.ok), 'Trong hạn hoặc còn thời gian xử lý', 'good', t.total ? t.ok / t.total : null)}
      ${stat('Tổng data', num(t.total), a.cancelled ? `Không tính ${num(a.cancelled)} data hủy` : 'Tất cả data trong tháng')}
    </div>
    ${manager ? html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Tỉ lệ trễ = data trễ / tổng data của người đó.</p></div>
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Tổng data</th><th scope="col" class="right">Trễ SLA</th><th scope="col" class="right">Đã làm nhưng trễ</th><th scope="col" class="right">Chưa xong quá hạn</th><th scope="col" class="right">Sắp trễ</th><th scope="col" class="right">Tỉ lệ trễ</th></tr></thead>
      <tbody>${a.people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${names.get(p.code) ?? p.name}</strong>${p.code ? html`<small>${p.code}</small>` : ''}</span></td>
        <td class="right num">${num(p.total)}</td><td class="right num">${bad(p.late)}</td><td class="right num">${num(p.late_done)}</td><td class="right num">${num(p.late_open)}</td><td class="right num">${warn(p.soon)}</td><td class="right num strong">${p1(p.lateRate)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col">Tổng</td><td class="right num">${num(t.total)}</td><td class="right num">${num(t.late)}</td><td class="right num">${num(t.late_done)}</td><td class="right num">${num(t.late_open)}</td><td class="right num">${num(t.soon)}</td><td class="right num">${p1(t.lateRate)}</td></tr></tfoot>
    </table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Data đã làm bị trễ SLA${manager ? '' : ' của bạn'}</h2>
      <p class="muted">Chỉ tính data có tình trạng "Đã làm": trễ khi ngày tương tác − ngày tạo &gt; ${SLA_DAYS} ngày (ngày lịch). Tỉ lệ trễ = data đã làm trễ / data đã làm. Các cột 8, 9, 10, &gt;10 ngày là số ngày xử lý của những data đã trễ.</p></div>
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr>${manager ? html`<th scope="col" class="sticky-col">Nhân sự</th>` : ''}<th scope="col" class="right">Data đã làm</th><th scope="col" class="right">Đã làm trễ SLA</th><th scope="col" class="right">Tỉ lệ trễ</th><th scope="col" class="right">TB ngày xử lý</th><th scope="col" class="right">Trung vị</th><th scope="col" class="right">Lâu nhất</th><th scope="col" class="right">8 ngày</th><th scope="col" class="right">9 ngày</th><th scope="col" class="right">10 ngày</th><th scope="col" class="right">&gt;10 ngày</th></tr></thead>
      <tbody>${(manager ? a.donePeople : [a.doneTotals]).map((p) => html`<tr class="static">${manager ? html`<td class="sticky-col"><span class="person"><strong>${names.get(p.code) ?? p.name}</strong>${p.code ? html`<small>${p.code}</small>` : ''}</span></td>` : ''}
        <td class="right num">${num(p.done)}</td><td class="right num">${bad(p.late)}</td><td class="right num strong">${p1(p.lateRate)}</td><td class="right num">${d1(p.avg)}</td><td class="right num">${d1(p.median)}</td><td class="right num">${d1(p.max)}</td>
        <td class="right num">${num(p.b1)}</td><td class="right num">${num(p.b2)}</td><td class="right num">${num(p.b3)}</td><td class="right num">${num(p.b4)}</td></tr>`)}</tbody>
      ${manager ? html`<tfoot><tr><td class="sticky-col">Tổng</td><td class="right num">${num(a.doneTotals.done)}</td><td class="right num">${num(a.doneTotals.late)}</td><td class="right num">${p1(a.doneTotals.lateRate)}</td><td class="right num">${d1(a.doneTotals.avg)}</td><td class="right num">${d1(a.doneTotals.median)}</td><td class="right num">${d1(a.doneTotals.max)}</td><td class="right num">${num(a.doneTotals.b1)}</td><td class="right num">${num(a.doneTotals.b2)}</td><td class="right num">${num(a.doneTotals.b3)}</td><td class="right num">${num(a.doneTotals.b4)}</td></tr></tfoot>` : ''}
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo ngày tạo</h2><p class="muted">Data tạo ngày nào đang trễ hoặc sắp trễ.</p></div>
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr><th scope="col">Ngày tạo</th><th scope="col" class="right">Tổng data</th><th scope="col" class="right">Trễ SLA</th><th scope="col" class="right">Đã làm nhưng trễ</th><th scope="col" class="right">Chưa xong quá hạn</th><th scope="col" class="right">Sắp trễ</th><th scope="col" class="right">Tỉ lệ trễ</th></tr></thead>
      <tbody>${a.days.map((d) => html`<tr class="static"><td class="num">${dm(d.iso)}</td><td class="right num">${num(d.total)}</td><td class="right num">${bad(d.late)}</td><td class="right num">${num(d.late_done)}</td><td class="right num">${num(d.late_open)}</td><td class="right num">${warn(d.soon)}</td><td class="right num strong">${p1(d.lateRate)}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Nhân sự × ngày tạo</h2><p class="muted">Gồm cả data đã làm: số data trễ SLA (đỏ), kèm số sắp trễ (vàng, dấu +). Rê chuột vào ô để xem tách đã làm / chưa xong.</p></div>
    <div class="table-wrap"><table class="sla-table sla-matrix">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${a.matrixDays.map((d) => html`<th scope="col" class="right">${dm(d)}</th>`)}<th scope="col" class="right">Tổng</th></tr></thead>
      <tbody>${a.matrix.map((r) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${names.get(r.code) ?? r.name}</strong>${r.code ? html`<small>${r.code}</small>` : ''}</span></td>
        ${a.matrixDays.map((d) => { const c = r.cells[d]; return c.late || c.soon ? html`<td class="right num sla-cell ${c.late ? 'sla-cell--late' : 'sla-cell--soon'}" title="${c.late ? `Trễ ${c.late} (đã làm ${c.late_done} · chưa xong ${c.late_open})` : ''}${c.late && c.soon ? ' · ' : ''}${c.soon ? `Sắp trễ ${c.soon}` : ''}">${c.late ? num(c.late) : ''}${c.soon ? html`<small class="sla-soon">${c.late ? '+' : ''}${num(c.soon)}</small>` : ''}</td>` : html`<td class="right num muted">·</td>`; })}
        <td class="right num strong">${num(r.total)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col">Tổng</td>${a.matrixDays.map((d) => { const c = a.matrixTotals[d]; return html`<td class="right num">${num(c.late + c.soon)}</td>`; })}<td class="right num">${num(a.matrixTotal)}</td></tr></tfoot>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Data lâu nhất</h2><p class="muted">15 data có số ngày xử lý (ngày lịch) dài nhất.</p></div>
    <div class="table-wrap"><table class="sla-table">
      <thead><tr><th scope="col">Retailer</th>${manager ? html`<th scope="col">Nhân sự</th>` : ''}<th scope="col">Tạo</th><th scope="col">Tương tác</th><th scope="col" class="right">Số ngày</th><th scope="col">Tình trạng</th><th scope="col">Nguồn</th></tr></thead>
      <tbody>${a.longest.map((x) => html`<tr class="static"><td class="num">${x.retailer || '—'}</td>${manager ? html`<td>${names.get(/^(\d+)/.exec(x.handler)?.[1]) ?? x.handler.replace(/^\d+\s*-\s*/, '').split(' - ')[0]}${/^(\d+)/.exec(x.handler)?.[1] ? html` <small class="muted">${/^(\d+)/.exec(x.handler)[1]}</small>` : ''}</td>` : ''}<td class="num">${dt(x.createdTs)}</td><td class="num">${x.status === 'Đã làm' ? dt(x.modifiedTs) : 'Đến hôm nay'}</td><td class="right num strong">${String(x.elapsed)}</td>
        <td><span class="badge badge--${KIND[x.kind][0]}">${KIND[x.kind][1]}</span></td><td>${x.source}</td></tr>`)}</tbody>
    </table></div>`;
}
