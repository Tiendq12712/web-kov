import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { SLA_DAYS, WARN_DAYS, STATUS_LABELS } from '../sla.js';

const TONE = { late: 'bad', soon: 'warn', ok: 'good' };
const ratio = (a, b) => (b ? a / b : 0);
const dm = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');

const stat = (title, value, sub, tone = '', rate = null) => html`
  <div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3>
    <p class="big num">${value}${rate == null ? '' : html` <span class="sla-rate">${pct(rate, 1)}</span>`}</p><p class="muted">${sub}</p></div>`;

const cards = (t) => html`
  <div class="grid">
    ${stat('Đã trễ SLA', num(t.late), `Quá ${SLA_DAYS} ngày mà chưa xử lý xong · tỉ lệ trên tổng data được chia`, 'bad', ratio(t.late, t.base))}
    ${stat('Sắp trễ SLA', num(t.soon), `Còn tối đa ${WARN_DAYS} ngày là tới hạn · tỉ lệ trên tổng data được chia`, 'warn', ratio(t.soon, t.base))}
    ${stat('Còn trong hạn', num(t.ok), `Còn hơn ${WARN_DAYS} ngày để xử lý · tỉ lệ trên tổng data được chia`, 'good', ratio(t.ok, t.base))}
    ${stat('Tổng data được chia', num(t.base), `Còn tồn ${num(t.total)} (chưa làm hoặc đang làm)`)}
  </div>`;

/** Cột phân bố tuổi data tồn: càng về phải càng gần/quá hạn. */
const ageBars = (buckets) => {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return html`<div class="sla-age">${buckets.map((b) => html`
    <div class="sla-age__row"><span>${b.label}</span>
      <div class="bar bar--${TONE[b.status]}"><span class="bar__fill" style="width: ${(b.count / max) * 100}%"></span></div>
      <strong class="num">${num(b.count)}</strong></div>`)}</div>`;
};

const badge = (count, tone) => (count ? html`<span class="badge badge--${tone}">${num(count)}</span>` : html`<span class="muted">0</span>`);

const leftText = (b) => (b.left < 0 ? `Trễ ${-b.left} ngày` : b.left === 0 ? 'Hết hạn hôm nay' : `Còn ${b.left} ngày`);

/** Quản lý: data trễ/sắp trễ theo ngày chia — còn bao nhiêu ngày để xử lý, và ai đang giữ lô nào. */
function dayDetail(sla) {
  if (!sla.days.length) return html`<p class="notice notice--good">Không có data nào trễ hoặc sắp trễ SLA. 🎉</p>`;
  const people = sla.rows.filter((r) => r.late + r.soon > 0).sort((a, b) => b.late - a.late || b.soon - a.soon);
  const cell = (p, d) => { const n = p.batches.find((b) => b.day === d.day && b.status !== 'ok')?.count; return n ? html`<td class="right num sla-cell sla-cell--${d.status}">${num(n)}</td>` : html`<td class="right muted">·</td>`; };
  return html`
    <div class="toolbar"><h2 class="section-title">Chi tiết data trễ và sắp trễ theo ngày</h2><p class="muted">Lô cũ nhất ở trên · tính đến ${dm(sla.now)}</p></div>
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr><th>Ngày chia</th><th>Hạn xử lý</th><th>Thời gian còn lại</th><th class="right">SL data tồn</th><th class="right">Tỉ lệ</th><th class="right">Số người giữ</th><th>Tình trạng</th></tr></thead>
      <tbody>${sla.days.map((d) => html`<tr class="static sla-row sla-row--${d.status}">
        <td>${dm(d.date)} <span class="muted">(${d.age} ngày trước)</span></td><td>${d.due}</td><td><strong>${leftText(d)}</strong></td>
        <td class="right num strong">${num(d.count)}</td><td class="right num">${pct(ratio(d.count, sla.totals.base), 1)}</td><td class="right num">${d.people.length}</td>
        <td><span class="badge badge--${TONE[d.status]}">${STATUS_LABELS[d.status]}</span></td></tr>`)}</tbody>
      <tfoot><tr><td colspan="3"><strong>Tổng</strong></td><td class="right num strong">${num(sla.days.reduce((a, d) => a + d.count, 0))}</td><td class="right num">${pct(ratio(sla.days.reduce((a, d) => a + d.count, 0), sla.totals.base), 1)}</td><td colspan="2"></td></tr></tfoot>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Nhân sự × ngày chia</h2><p class="muted">Chỉ các lô đã trễ hoặc sắp trễ; số trên đầu cột là thời gian còn lại</p></div>
    <div class="table-wrap"><table class="sla-table sla-matrix">
      <thead><tr><th class="sticky-col" rowspan="2">Nhân sự</th>${sla.days.map((d) => html`<th class="right sla-cell--${d.status}">${dm(d.date)}</th>`)}<th class="right" rowspan="2">Tổng</th></tr>
        <tr>${sla.days.map((d) => html`<th class="right sla-left sla-cell--${d.status}">${d.left < 0 ? `trễ ${-d.left}n` : `còn ${d.left}n`}</th>`)}</tr></thead>
      <tbody>${people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
        ${sla.days.map((d) => cell(p, d))}<td class="right num strong">${num(p.late + p.soon)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col"><strong>Tổng</strong></td>${sla.days.map((d) => html`<td class="right num">${num(d.count)}</td>`)}<td class="right num strong">${num(sla.days.reduce((a, d) => a + d.count, 0))}</td></tr></tfoot>
    </table></div>`;
}

/** Quản lý: mọi nhân sự, xếp theo số data đã trễ nhiều nhất. */
function managerTable(sla) {
  const rows = [...sla.rows].sort((a, b) => b.late - a.late || b.soon - a.soon);
  return html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Xếp theo số data đã trễ SLA</p></div>
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr><th class="sticky-col">Nhân sự</th><th class="right">Đã trễ SLA</th><th class="right">Tỉ lệ trễ</th><th class="right">Sắp trễ SLA</th><th class="right">Tỉ lệ sắp trễ</th><th class="right">Trong hạn</th><th class="right">Tổng tồn</th><th class="right">Tổng đã chia</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static">
        <td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
        <td class="right num">${badge(r.late, 'bad')}</td><td class="right num sla-pct sla-pct--bad">${pct(ratio(r.late, r.base), 1)}</td>
        <td class="right num">${badge(r.soon, 'warn')}</td><td class="right num sla-pct sla-pct--warn">${pct(ratio(r.soon, r.base), 1)}</td>
        <td class="right num">${num(r.ok)}</td><td class="right num strong">${num(r.total)}</td><td class="right num">${num(r.base)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col"><strong>Tổng</strong></td><td class="right num">${num(sla.totals.late)}</td><td class="right num">${pct(ratio(sla.totals.late, sla.totals.base), 1)}</td>
        <td class="right num">${num(sla.totals.soon)}</td><td class="right num">${pct(ratio(sla.totals.soon, sla.totals.base), 1)}</td>
        <td class="right num">${num(sla.totals.ok)}</td><td class="right num strong">${num(sla.totals.total)}</td><td class="right num">${num(sla.totals.base)}</td></tr></tfoot>
    </table></div>`;
}

/** Từng lô data (theo ngày chia) còn tồn của một người, lô cũ nhất ở trên. */
function batchTable(batches, asOf) {
  if (!batches.length) return html`<p class="notice notice--good">Không có data tồn — bạn không có data nào trễ hoặc sắp trễ SLA. 🎉</p>`;
  const rows = [...batches].sort((a, b) => b.age - a.age);
  return html`
    <div class="table-wrap"><table class="sla-table sortable">
      <thead><tr><th>Ngày chia</th><th class="right">Số data còn tồn</th><th>Hạn xử lý</th><th>Tình trạng</th></tr></thead>
      <tbody>${rows.map((b) => html`<tr class="static sla-row sla-row--${b.status}">
        <td>${dm(b.date)} <span class="muted">(${b.age} ngày trước)</span></td><td class="right num strong">${num(b.count)}</td><td>${b.due}</td>
        <td><span class="badge badge--${TONE[b.status]}">${leftText(b)}</span></td></tr>`)}</tbody>
    </table></div>
    <p class="muted">Tính đến ${dm(asOf)}. Hạn xử lý = ngày chia + ${SLA_DAYS} ngày.</p>`;
}

const explain = html`<p class="muted">SLA xử lý data ONL là <strong>${SLA_DAYS} ngày</strong> kể từ ngày được chia.
  <strong>Đã trễ</strong>: quá ${SLA_DAYS} ngày mà chưa xử lý xong. <strong>Sắp trễ</strong>: còn ${WARN_DAYS} ngày hoặc ít hơn. Chỉ tính data được chia trong tháng đang xem.</p>`;

/**
 * Quản lý (Admin/Quản trị): báo cáo tổng. Nhân sự: chỉ phần của mình (nhận ra bằng đầu số).
 */
export function slaView(sla, { manager, code }) {
  if (!sla) return html`<p class="notice">Chưa có bảng tồn theo ngày trong tab công việc nên chưa thống kê được SLA.</p>`;
  const asOfNote = html`<p class="muted">Hạn tính đến <strong>${dm(sla.now)}</strong>${sla.now !== sla.asOf ? html` · số liệu đồng bộ ngày ${dm(sla.asOf)}` : ''}.</p>`;
  if (manager) {
    return html`
      <div class="toolbar"><h2 class="section-title">SLA data còn tồn (chưa làm + đang làm)</h2>${asOfNote}</div>
      ${explain}${cards(sla.totals)}
      <section class="card"><h3 class="card__title">Tuổi của data còn tồn</h3>${ageBars(sla.buckets)}</section>
      ${managerTable(sla)}
      ${dayDetail(sla)}`;
  }
  const mine = sla.rows.find((r) => r.code === String(code));
  if (!mine) return html`<p class="notice">Chưa nhận ra bạn trong báo cáo (thiếu <strong>Đầu số</strong> trong tab Tài khoản). Hãy liên hệ quản lý để được bổ sung.</p>`;
  return html`
    <div class="toolbar"><h2 class="section-title">SLA data còn tồn của bạn</h2>${asOfNote}</div>
    ${explain}${cards(mine)}
    <section class="card"><h3 class="card__title">Data còn tồn theo ngày chia</h3>${batchTable(mine.batches, sla.now)}</section>`;
}
