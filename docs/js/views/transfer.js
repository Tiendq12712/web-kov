import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { chartCard, groupedColumns, lineChart } from './charts.js';
import { analyzeTransfer } from '../transfer.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const dm = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');
const stat = (title, value, sub) => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const bar = (v, max) => html`<div class="bar"><div class="bar__fill" style="width:${max ? (v / max) * 100 : 0}%"></div></div>`;
/** Chênh lệch số data giữa tháng này và tháng liền trước. */
const delta = (cur, prev) => { if (prev == null) return ''; const d = cur - prev; return d === 0 ? html`<small class="muted"> =</small>` : html`<small class="${d > 0 ? 'talk-bad' : 'talk-ok'}"> ${d > 0 ? '▲' : '▼'}${num(Math.abs(d))}</small>`; };

/** Báo cáo data chuyển từ Offline sang Online (dựa trên mô tả "Chuyển đổi từ Offline sang Online"). */
export function transferView(data, ui) {
  const month = ui.month === 'all' || data.months.includes(ui.month) ? ui.month : 'all';
  const a = analyzeTransfer(data.rows, { month });
  const mtext = month === 'all' ? data.months.map(mlabel).join(' + ') : mlabel(month);
  const topProv = a.provs.filter((p) => p.key).slice(0, 12);
  const maxProv = Math.max(...topProv.map((p) => p.n), 1);
  const maxSrc = Math.max(...a.sources.map((s) => s.n), 1);
  const noProvince = a.provs.find((p) => !p.key);
  return html`
    <div class="toolbar"><h2 class="section-title">Data chuyển từ Offline sang Online</h2>
      <p class="muted">Nhận diện bằng mô tả có "Chuyển đổi từ Offline sang Online" (${mtext}). Tỉ lệ chuyển = data chuyển / tổng data cùng kỳ (mọi tình trạng).</p></div>
    <div class="filters" aria-label="Chọn tháng"><label class="filter"><span>Tháng</span><select id="xfer-month" class="select">
      <option value="all" ${month === 'all' ? 'selected' : ''}>Tất cả (${data.months.map(mlabel).join(' + ')})</option>${data.months.slice().reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>${mlabel(m)}</option>`)}</select></label></div>
    <div class="grid">
      ${stat('Data chuyển sang Online', num(a.xferCount), `${p1(a.rate)} trên ${num(a.total)} data`)}
      ${stat('Đã xử lý', num(a.done), `${p1(a.doneRate)} data chuyển đã làm`)}
      ${stat('Số tỉnh/thành có data chuyển', num(a.provCount), noProvince ? `${num(noProvince.n)} data chưa có thông tin tỉnh/thành${a.filled ? ` (đã bổ sung ${num(a.filled)} data theo Retailer ID)` : ''}` : 'Tất cả data đều có tỉnh/thành')}
      ${stat('Nguồn chuyển nhiều nhất', a.sources[0]?.label ?? '—', a.sources[0] ? `${num(a.sources[0].n)} data (${p1(a.sources[0].share)} data chuyển)` : '')}
    </div>
    <div class="toolbar"><h2 class="section-title">Theo tháng</h2></div>
    <div class="charts">
      ${chartCard('Data chuyển theo tháng', groupedColumns({ categories: a.byMonth.map((m) => mlabel(m.month)), series: [{ name: 'Data chuyển', cls: 's3', values: a.byMonth.map((m) => m.xfer) }], ratio: false, format: (v) => num(v), values: true }), 'Số data có dấu hiệu chuyển từ Offline sang Online mỗi tháng.')}
      ${a.days.length > 1 ? chartCard('Data chuyển theo ngày tạo', lineChart({ labels: a.days.map((d) => dm(d.iso)), series: [{ name: 'Data chuyển', cls: 's3', values: a.days.map((d) => d.n) }], format: (v) => num(v), values: a.days.length <= 14 }), 'Số data chuyển được tạo mỗi ngày.') : ''}
    </div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Tháng</th><th scope="col" class="right">Tổng data</th><th scope="col" class="right">Data chuyển</th><th scope="col" class="right">Tỉ lệ chuyển</th><th scope="col" class="right">Đã làm</th><th scope="col" class="right">Tỉ lệ đã làm</th></tr></thead>
      <tbody>${a.byMonth.map((m, i) => html`<tr class="static"><td class="sticky-col"><strong>${mlabel(m.month)}</strong></td><td class="right num">${num(m.total)}</td><td class="right num strong">${num(m.xfer)}${delta(m.xfer, i ? a.byMonth[i - 1].xfer : null)}</td><td class="right num">${p1(m.rate)}</td><td class="right num">${num(m.done)}</td><td class="right num">${p1(m.doneRate)}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo khu vực (tỉnh/thành phố)</h2><p class="muted">Cột "Tỉ lệ" là data chuyển / tổng data của tỉnh đó (chỉ tính data có ghi tỉnh/thành). Ô tỉnh/thành trống trong Sheet được bổ sung từ dòng khác có cùng Retailer ID nếu có.</p></div>
    <div class="charts">
      ${chartCard('Top tỉnh/thành có data chuyển', html`<div class="hist">${topProv.map((p) => html`<div class="hist__row"><span title="${p.label}">${p.label}</span>${bar(p.n, maxProv)}<span class="num">${num(p.n)} <small class="muted">(${p1(p.share)})</small></span></div>`)}</div>`, '12 tỉnh/thành có nhiều data chuyển nhất trong kỳ.')}<span class="num">${num(r.n)} <small class="muted">(${p1(r.share)})</small></span></div>`)}</div>`, 'Gộp tỉnh/thành theo miền Bắc, Trung, Nam.')}
    </div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Tỉnh/Thành phố</th><th scope="col" class="right">Data chuyển</th><th scope="col" class="right">% data chuyển</th><th scope="col" class="right">Tổng data của tỉnh</th><th scope="col" class="right">Tỉ lệ</th>${data.months.map((m) => html`<th scope="col" class="right">${mlabel(m)}</th>`)}</tr></thead>
      <tbody>${a.provs.map((p) => html`<tr class="static"><td class="sticky-col"><strong>${p.label}</strong></td><td class="right num strong">${num(p.n)}</td><td class="right num">${p1(p.share)}</td><td class="right num">${p.total == null ? '—' : num(p.total)}</td><td class="right num">${p1(p.rate)}</td>${data.months.map((m, i) => html`<td class="right num">${num(p.byMonth[m] ?? 0)}${i ? delta(p.byMonth[m] ?? 0, p.byMonth[data.months[i - 1]] ?? 0) : ''}</td>`)}</tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col">Tổng</td><td class="right num">${num(a.xferCount)}</td><td class="right num">100%</td><td></td><td></td>${data.months.map((m) => html`<td class="right num">${num(a.provs.reduce((t, p) => t + (p.byMonth[m] ?? 0), 0))}</td>`)}</tr></tfoot>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo nguồn data</h2><p class="muted">"% của nguồn" là phần data của nguồn đó bị đánh dấu chuyển từ Offline.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nguồn data</th><th scope="col" class="right">Data chuyển</th><th scope="col" class="right">% data chuyển</th><th scope="col"></th><th scope="col" class="right">Tổng data của nguồn</th><th scope="col" class="right">% của nguồn</th></tr></thead>
      <tbody>${a.sources.map((s) => html`<tr class="static"><td class="sticky-col"><strong>${s.label}</strong></td><td class="right num strong">${num(s.n)}</td><td class="right num">${p1(s.share)}</td><td style="min-width:120px">${bar(s.n, maxSrc)}</td><td class="right num">${num(s.total)}</td><td class="right num">${p1(s.rate)}</td></tr>`)}</tbody>
    </table></div>
    <div class="charts">
      ${chartCard('Theo ngành hàng (Product)', html`<div class="hist">${a.industries.map((r) => html`<div class="hist__row"><span>${r.label}</span>${bar(r.n, a.industries[0].n)}<span class="num">${num(r.n)} <small class="muted">(${p1(r.share)})</small></span></div>`)}</div>`, 'Ngành hàng của data chuyển (FnB và Fnb được gộp).')}
      ${chartCard('Tình trạng xử lý', html`<div class="hist">${a.statuses.map((r) => html`<div class="hist__row"><span>${r.label}</span>${bar(r.n, Math.max(...a.statuses.map((x) => x.n), 1))}<span class="num">${num(r.n)} <small class="muted">(${p1(a.xferCount ? r.n / a.xferCount : null)})</small></span></div>`)}</div>`, 'Data chuyển đã được xử lý đến đâu.')}
    </div>`;
}
