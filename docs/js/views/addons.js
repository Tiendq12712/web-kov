import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { chartCard, groupedColumns, donutChart } from './charts.js';
import { analyzeAddons } from '../addons.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const stat = (title, value, sub) => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

/** Trang Add-on: nhân sự chọn bao nhiêu add-on và bao nhiêu được ghi nhận. Quản lý xem cả team, nhân sự xem phần của mình. */
export function addonView(data, ui, { manager, code, names }) {
  if (!data.rows.length) return html`<p class="notice">Tab "Chi tiết addon" chưa có dữ liệu.</p>`;
  const month = ui.month === 'all' || data.months.includes(ui.month) ? ui.month : 'all';
  const f = { type: ui.type ?? 'all', person: manager ? (ui.person ?? 'all') : 'all', status: ui.status ?? 'all', q: ui.q ?? '' };
  const a = analyzeAddons(data.rows, { month, code: manager ? null : code, filters: f });
  const t = a.total;
  const nameOf = (p) => names.get(p.key) ?? p.label;
  const mtext = month === 'all' ? data.months.map(mlabel).join(' + ') : mlabel(month);
  const opt = (value, label, cur) => html`<option value="${value}" ${value === cur ? 'selected' : ''}>${label}</option>`;
  const active = f.type !== 'all' || f.person !== 'all' || f.status !== 'all' || f.q.trim() !== '';
  const filters = html`<div class="filters" role="search" aria-label="Bộ lọc add-on">
    <label class="filter"><span>Tháng</span><select id="addon-month" class="select"><option value="all" ${month === 'all' ? 'selected' : ''}>Tất cả (${data.months.map(mlabel).join(' + ')})</option>${data.months.slice().reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${mlabel(m)}</option>`)}</select></label>
    <label class="filter"><span>Loại add-on</span><select id="addon-type" class="select">${opt('all', 'Tất cả loại', f.type)}${a.options.types.map((t) => opt(t, t, f.type))}</select></label>
    ${manager ? html`<label class="filter"><span>Nhân sự</span><select id="addon-person" class="select">${opt('all', 'Tất cả nhân sự', f.person)}${a.options.people.map(([c, n]) => opt(c, `${names.get(c) ?? n} (${c})`, f.person))}</select></label>` : ''}
    <label class="filter"><span>Trạng thái</span><select id="addon-status" class="select">${opt('all', 'Tất cả', f.status)}${opt('recorded', 'Được ghi nhận', f.status)}${opt('missed', 'Chưa được ghi nhận', f.status)}</select></label>
    <label class="filter filter--grow"><span>Tìm</span><input id="addon-search" class="search" type="search" placeholder="Retailer, ticket, lý do…" value="${f.q}" autocomplete="off"></label>
    ${active ? html`<button class="link-btn filters__clear" type="button" data-addon-clear>Xóa lọc</button>` : ''}
  </div>`;
  if (!manager && !code) return html`<div class="toolbar"><h2 class="section-title">Add-on</h2></div><p class="notice">Chưa nhận ra bạn trong danh sách nhân sự nên chưa hiện được add-on của bạn. Nhờ quản trị điền Đầu số cho tài khoản của bạn trong Thiết lập.</p>`;
  const palette = ['s1', 's2', 's3', 's4', 's5', 's6'];
  return html`
    <div class="toolbar"><h2 class="section-title">${manager ? 'Add-on nhân sự' : 'Add-on của bạn'}</h2>
      <p class="muted">Add-on nhân sự đã chọn và số được ghi nhận (${mtext}). Được ghi nhận khi có điểm SC (is_impact = Yes). Tháng tính theo ngày tương tác cuối.</p></div>
    ${filters}
    ${t.chosen ? html`
    ${active ? html`<p class="muted">Đang lọc: hiển thị ${num(t.chosen)} add-on khớp bộ lọc.</p>` : ''}
    <div class="grid">
      ${stat('Add-on đã chọn', num(t.chosen), manager ? `${a.people.length} nhân sự` : 'Số add-on bạn đã chọn')}
      ${stat('Được ghi nhận', num(t.recorded), `Tỉ lệ ${p1(t.rate)} trên số đã chọn`)}
      ${stat('Chưa được ghi nhận', num(t.missed), t.chosen ? `${p1(t.missed / t.chosen)} số đã chọn` : '')}
      ${stat('Điểm add-on', num(t.points), 'Tổng sc_points đã ghi nhận')}
    </div>
    <section class="card"><h3 class="card__title">Nhận xét</h3><ul class="advice">${a.advice.map((x) => html`<li class="advice--${x.tone}">${x.text}</li>`)}</ul></section>
    <div class="charts">
      ${chartCard('Đã chọn và được ghi nhận theo loại add-on', groupedColumns({ categories: a.types.map((x) => x.label.length > 16 ? `${x.label.slice(0, 15)}…` : x.label), series: [{ name: 'Đã chọn', cls: 's1', values: a.types.map((x) => x.chosen) }, { name: 'Được ghi nhận', cls: 's2', values: a.types.map((x) => x.recorded) }], ratio: false, format: (v) => num(v), values: true }), 'Số lượng add-on theo từng loại.')}
      ${chartCard('Kết quả ghi nhận', donutChart({ segments: [{ label: 'Được ghi nhận', cls: 's2', value: t.recorded }, ...a.reasons.map((r, i) => ({ label: r.reason.length > 46 ? `${r.reason.slice(0, 45)}…` : r.reason, cls: palette[(i + 2) % palette.length], value: r.count }))], center: { value: p1(t.rate), label: 'ghi nhận' } }), 'Add-on chưa ghi nhận chia theo lý do.')}
      ${a.trend.length > 1 ? chartCard('Qua các tháng', groupedColumns({ categories: a.trend.map((x) => mlabel(x.ym)), series: [{ name: 'Đã chọn', cls: 's1', values: a.trend.map((x) => x.chosen) }, { name: 'Được ghi nhận', cls: 's2', values: a.trend.map((x) => x.recorded) }], ratio: false, format: (v) => num(v), values: true }), 'Số add-on đã chọn và được ghi nhận theo từng tháng.') : ''}
    </div>
    ${manager ? html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Số add-on đã chọn, được ghi nhận, tỉ lệ và điểm.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Đã chọn</th><th scope="col" class="right">Được ghi nhận</th><th scope="col" class="right">Chưa ghi nhận</th><th scope="col" class="right">Tỉ lệ ghi nhận</th><th scope="col" class="right">Điểm</th></tr></thead>
      <tbody>${a.people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${nameOf(p)}</strong><small>${p.key}</small></span></td>
        <td class="right num">${num(p.chosen)}</td><td class="right num strong">${num(p.recorded)}</td><td class="right num ${p.missed ? 'talk-bad' : ''}">${num(p.missed)}</td><td class="right num">${p1(p.rate)}</td><td class="right num">${num(p.points)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col">Tổng</td><td class="right num">${num(t.chosen)}</td><td class="right num">${num(t.recorded)}</td><td class="right num">${num(t.missed)}</td><td class="right num">${p1(t.rate)}</td><td class="right num">${num(t.points)}</td></tr></tfoot>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Nhân sự × loại add-on</h2><p class="muted">Mỗi ô: được ghi nhận / đã chọn.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${a.typeNames.map((n) => html`<th scope="col" class="right">${n}</th>`)}</tr></thead>
      <tbody>${a.people.map((p) => html`<tr class="static"><td class="sticky-col"><strong>${nameOf(p)}</strong></td>${a.typeNames.map((n) => { const c = p.byType[n]; return html`<td class="right num ${c.chosen ? '' : 'muted'}">${c.chosen ? `${c.recorded}/${c.chosen}` : '·'}</td>`; })}</tr>`)}</tbody>
    </table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Theo loại add-on</h2></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Loại add-on</th><th scope="col" class="right">Đã chọn</th><th scope="col" class="right">Được ghi nhận</th><th scope="col" class="right">Chưa ghi nhận</th><th scope="col" class="right">Tỉ lệ ghi nhận</th><th scope="col" class="right">Điểm</th></tr></thead>
      <tbody>${a.types.map((x) => html`<tr class="static"><td class="sticky-col"><strong>${x.label}</strong></td><td class="right num">${num(x.chosen)}</td><td class="right num strong">${num(x.recorded)}</td><td class="right num ${x.missed ? 'talk-bad' : ''}">${num(x.missed)}</td><td class="right num">${p1(x.rate)}</td><td class="right num">${num(x.points)}</td></tr>`)}</tbody>
    </table></div>
    ${a.reasons.length ? html`
    <div class="toolbar"><h2 class="section-title">Add-on chưa được ghi nhận</h2><p class="muted">Lý do theo cột reason của Sheet.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Lý do</th><th scope="col" class="right">Số add-on</th><th scope="col" class="right">Tỉ lệ</th><th scope="col">Loại add-on</th></tr></thead>
      <tbody>${a.reasons.map((r) => html`<tr class="static"><td class="sticky-col">${r.reason}</td><td class="right num">${num(r.count)}</td><td class="right num">${p1(r.share)}</td><td class="muted">${r.types.join(', ')}</td></tr>`)}</tbody>
    </table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Chi tiết từng add-on</h2><p class="muted">${num(a.detail.length)} dòng, mới nhất ở trên.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col">Ngày</th>${manager ? html`<th scope="col" class="sticky-col">Nhân sự</th>` : ''}<th scope="col">Loại add-on</th><th scope="col">Retailer</th><th scope="col">Ticket</th><th scope="col">Trạng thái</th><th scope="col" class="right">Điểm</th><th scope="col">Lý do</th></tr></thead>
      <tbody>${a.detail.map((x) => html`<tr class="static"><td class="num">${dmy(x.date)}</td>${manager ? html`<td class="sticky-col"><strong>${names.get(x.code) ?? x.name}</strong></td>` : ''}<td>${x.addon}</td><td class="num">${x.retailer}</td><td class="num">${x.ticket || '—'}</td>
        <td><span class="badge badge--${x.recorded ? 'good' : 'bad'}">${x.recorded ? 'Được ghi nhận' : 'Chưa ghi nhận'}</span></td><td class="right num">${num(x.points)}</td><td class="muted">${x.reason}</td></tr>`)}</tbody>
    </table></div>` : html`<p class="notice">Không có add-on nào khớp bộ lọc trong ${mtext}.</p>`}`;
}
