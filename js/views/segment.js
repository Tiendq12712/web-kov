import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { chartCard, groupedColumns, lineChart } from './charts.js';
import { analyzeSegment, sourceOptions, sourceKey } from '../segment.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const stat = (title, value, sub) => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
/** Chênh lệch điểm % giữa tệp và toàn data (xanh khi tốt hơn). */
const delta = (a, b, { good = 'up' } = {}) => {
  if (a == null || b == null) return '';
  const d = a - b;
  if (Math.abs(d) < 0.0005) return html`<small class="muted"> =</small>`;
  const better = good === 'up' ? d > 0 : d < 0;
  return html`<small class="${better ? 'talk-ok' : 'talk-bad'}"> ${d > 0 ? '▲' : '▼'}${(Math.abs(d) * 100).toFixed(1).replace('.', ',')}</small>`;
};

/** Trang "Phân tích tệp data": chọn nguồn data và tháng, so sánh với toàn bộ data. */
export function segmentView(data, ui) {
  const opts = sourceOptions(data.rows);
  if (!opts.length) return html`<p class="notice">Chưa đọc được dữ liệu chi tiết (tab "Data Txx" của file KPI).</p>`;
  const key = opts.some((o) => o.key === ui.key) ? ui.key : (opts.find((o) => o.key === sourceKey('Fnb kitchen print fail')) ?? opts[0]).key;
  const label = opts.find((o) => o.key === key).label;
  const month = ui.month === 'all' || data.months.includes(ui.month) ? ui.month : 'all';
  const a = analyzeSegment(data.rows, { key, month });
  const { seg, all, rest } = a.m;
  const mtext = month === 'all' ? `${data.months.map(mlabel).join(' + ')}` : mlabel(month);
  const row = (title, f, fmt, good) => html`<tr class="static"><td class="sticky-col"><strong>${title}</strong></td><td class="right num strong">${fmt(seg[f])}${delta(seg[f], all[f], { good })}</td><td class="right num">${fmt(all[f])}</td><td class="right num">${fmt(rest[f])}</td></tr>`;
  const countRow = (title, f) => html`<tr class="static"><td class="sticky-col"><strong>${title}</strong></td><td class="right num strong">${num(seg[f])}</td><td class="right num">${num(all[f])}</td><td class="right num">${num(rest[f])}</td></tr>`;
  const share = (t) => html`<td class="right num strong">${p1(t.segShare)}</td><td class="right num">${p1(t.allShare)}</td><td class="right num ${t.times && t.times >= 2 ? 'talk-bad' : ''}">${t.times == null ? '—' : `${t.times.toFixed(1).replace('.', ',')}×`}</td>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Phân tích tệp data</h2>
      <p class="muted">Dữ liệu từ tab "Data Txx" của file KPI (${mtext}). So tệp được chọn với toàn bộ data cùng kỳ.</p></div>
    <div class="filters" aria-label="Chọn tệp và tháng">
      <label class="filter filter--grow"><span>Tệp data (Nguồn data)</span><select id="seg-source" class="select">${opts.map((o) => html`<option value="${o.key}" ${o.key === key ? 'selected' : ''}>${o.label} (${num(o.count)})</option>`)}</select></label>
      <label class="filter"><span>Tháng</span><select id="seg-month" class="select"><option value="all" ${month === 'all' ? 'selected' : ''}>Tất cả (${data.months.map(mlabel).join(' + ')})</option>${data.months.slice().reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${mlabel(m)}</option>`)}</select></label>
    </div>
    ${seg.n ? html`
    <div class="grid">
      ${stat(`Data tệp "${label}"`, num(seg.n), `${p1(seg.n / all.n)} toàn data · đã làm ${num(seg.done)} (${p1(seg.doneShare)})`)}
      ${stat('Kết nối thành công', p1(seg.connRate), `${num(seg.conn)}/${num(seg.contacted)} data đã liên hệ · toàn data ${p1(all.connRate)}`)}
      ${stat('Impact (KH SC tác động)', p1(seg.impactRate), `${num(seg.impact)} data · toàn data ${p1(all.impactRate)}`)}
      ${stat('Add-on', `${num(seg.addCount)} data`, `Tỉ lệ ${p1(seg.addRate)} trên ${num(seg.conn)} data kết nối · ${num(seg.addPts)} điểm · toàn data ${p1(all.addRate)} (${num(all.addCount)} data)`)}
    </div>
    <section class="card"><h3 class="card__title">Gợi ý hành động cho tệp</h3><ul class="advice">${a.advice.map((x) => html`<li class="advice--${x.tone}">${x.text}</li>`)}</ul></section>
    <div class="toolbar"><h2 class="section-title">So sánh với toàn bộ data</h2><p class="muted">Mũi tên ở cột tệp: tệp <strong>cao hơn (▲)</strong> hay <strong>thấp hơn (▼)</strong> toàn data bao nhiêu điểm %. Màu xanh = có lợi, đỏ = bất lợi (riêng tỉ lệ còn tồn và liên hệ không được thì cao hơn là bất lợi). "Các nguồn khác" = toàn data trừ tệp này.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Chỉ số</th><th scope="col" class="right">${label}</th><th scope="col" class="right">Toàn data</th><th scope="col" class="right">Các nguồn khác</th></tr></thead>
      <tbody>
        ${countRow('Tổng data', 'n')}${countRow('Đã làm', 'done')}${countRow('Còn tồn (chưa làm + đang làm)', 'open')}
        ${row('Tỉ lệ còn tồn', 'openShare', p1, 'down')}
        ${row('Tỉ lệ kết nối thành công', 'connRate', p1, 'up')}
        ${row('Liên hệ không được (không nghe máy, thuê bao, sai số)', 'failRate', p1, 'down')}
        ${row('Impact / data đã làm', 'impactRate', p1, 'up')}
        ${row('Impact / data kết nối', 'impactConnRate', p1, 'up')}
        ${row('Add-on / data kết nối thành công', 'addRate', p1, 'up')}
        ${countRow('Số data kết nối thành công (mẫu số của add-on)', 'conn')}
        ${countRow('Số data có add-on', 'addCount')}${countRow('Điểm add-on', 'addPts')}${countRow('Tổng điểm', 'points')}
        ${countRow('Tồn sắp trễ SLA (tuổi 5–7 ngày)', 'soon')}${countRow('Tồn đã trễ SLA (trên 7 ngày)', 'late')}
      </tbody></table></div>
    <div class="charts">
      ${chartCard('Tệp so với toàn data', groupedColumns({ categories: ['Kết nối', 'Impact', 'Add-on'], series: [{ name: label, cls: 's3', values: [seg.connRate ?? 0, seg.impactRate ?? 0, seg.addRate ?? 0] }, { name: 'Toàn data', cls: 's1', values: [all.connRate ?? 0, all.impactRate ?? 0, all.addRate ?? 0] }], values: true, valueFormat: (v) => pct(v, 1) }), 'Kết nối: trên data đã liên hệ · Impact: trên data đã làm · Add-on: trên data kết nối thành công.')}
      ${a.trend.length > 1 ? chartCard('Tệp qua các tháng', lineChart({ labels: a.trend.map((t) => mlabel(t.ym)), series: [{ name: 'Kết nối', cls: 's1', values: a.trend.map((t) => t.connRate ?? 0) }, { name: 'Impact', cls: 's2', values: a.trend.map((t) => t.impactRate ?? 0) }, { name: 'Add-on', cls: 's3', values: a.trend.map((t) => t.addRate ?? 0) }], format: (v) => pct(v), values: true, valueFormat: (v) => pct(v, 1) }), 'Ba chỉ số của tệp theo từng tháng.') : ''}
    </div>
    <div class="toolbar"><h2 class="section-title">Công việc hỗ trợ</h2><p class="muted">Trong data đã làm; một data có thể có nhiều công việc. ${p1(a.withTask.seg)} data đã làm của tệp có ghi công việc hỗ trợ (toàn data ${p1(a.withTask.all)}).</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Công việc hỗ trợ</th><th scope="col" class="right">Số data (tệp)</th><th scope="col" class="right">% tệp</th><th scope="col" class="right">% toàn data</th><th scope="col" class="right">Gấp</th></tr></thead>
      <tbody>${a.tasks.map((t) => html`<tr class="static"><td class="sticky-col"><strong>${t.name}</strong></td><td class="right num">${num(t.seg)}</td>${share(t)}</tr>`)}</tbody></table></div>
    <div class="toolbar"><h2 class="section-title">Tình trạng liên hệ</h2></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Tình trạng</th><th scope="col" class="right">Số data (tệp)</th><th scope="col" class="right">% tệp</th><th scope="col" class="right">% toàn data</th></tr></thead>
      <tbody>${a.contactMix.map((c) => html`<tr class="static"><td class="sticky-col"><strong>${c.name}</strong></td><td class="right num">${num(c.seg)}</td><td class="right num strong">${p1(c.segShare)}</td><td class="right num">${p1(c.allShare)}</td></tr>`)}</tbody></table></div>
    <div class="toolbar"><h2 class="section-title">Nguyên nhân (trong cuộc kết nối)</h2><p class="muted">So tỉ trọng của tệp với toàn data; "Gấp" từ 2 lần trở lên được tô đỏ.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nguyên nhân</th><th scope="col" class="right">Số data (tệp)</th><th scope="col" class="right">% tệp</th><th scope="col" class="right">% toàn data</th><th scope="col" class="right">Gấp</th></tr></thead>
      <tbody>${a.reasons.map((t) => html`<tr class="static"><td class="sticky-col">${t.name}</td><td class="right num">${num(t.seg)}</td>${share(t)}</tr>`)}</tbody></table></div>
    <div class="toolbar"><h2 class="section-title">Add-on</h2><p class="muted">Số data ghi nhận từng loại add-on (một data có thể có nhiều loại). Tệp: ${num(seg.addCount)} data có add-on, ${num(seg.addPts)} điểm.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Loại add-on</th><th scope="col" class="right">Tệp</th><th scope="col" class="right">Toàn data</th></tr></thead>
      <tbody>${a.addons.map((t) => html`<tr class="static"><td class="sticky-col">${t.name}</td><td class="right num strong">${num(t.seg)}</td><td class="right num">${num(t.all)}</td></tr>`)}</tbody></table></div>
    <div class="toolbar"><h2 class="section-title">Theo nhân sự xử lý</h2></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Data</th><th scope="col" class="right">Đã làm</th><th scope="col" class="right">Còn tồn</th><th scope="col" class="right">Tỉ lệ kết nối</th><th scope="col" class="right">Impact</th><th scope="col" class="right" title="Số data có add-on trên số data kết nối thành công">Add-on</th></tr></thead>
      <tbody>${a.handlers.map((h) => html`<tr class="static"><td class="sticky-col"><strong>${h.name}</strong></td><td class="right num">${num(h.n)}</td><td class="right num">${num(h.done)}</td><td class="right num">${num(h.open)}</td><td class="right num">${p1(h.connRate)}</td><td class="right num">${p1(h.impactRate)}</td><td class="right num">${p1(h.addRate)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="notice">Không có data của tệp "${label}" trong ${mtext}.</p>`}`;
}
