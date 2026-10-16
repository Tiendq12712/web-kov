import { html } from '../dom.js';
import { num, pct, hm } from '../format.js';
import { badge } from './components.js';
import { chartCard, lineChart, donutChart, groupedColumns } from './charts.js';
import { analyzeCalls, analyzeMonths, SHORT_OPTIONS, LONG_OPTIONS } from '../calls.js';

const sec = (s) => {
  if (s == null) return '—';
  const total = Math.round(s), m = Math.floor(total / 60), r = total % 60;
  return m ? (r ? `${m}p${String(r).padStart(2, '0')}s` : `${m}p`) : `${r}s`;
};
const STATUS = { short: ['bad', 'Cần coaching'], mid: ['warn', 'Bình thường'], long: ['good', 'Tốt'] };
const stat = (title, value, sub) => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const monthLabel = (m) => (m === 'all' ? 'tất cả các tháng' : m ? `tháng ${Number(m.slice(5))}/${m.slice(0, 4)}` : '');

/** Phân tích từng cuộc gọi: tỉ lệ kết nối, cuộc kết nối nhưng đàm thoại ngắn, ai ngắt máy, khung giờ và lý do không kết nối. */
export function connectCallsView(data, ui, wanted, names) {
  if (!data.calls.length) return html`<p class="notice">Sheet "Dữ liệu call" chưa có cuộc gọi nào.</p>`;
  const month = ui.month === 'all' ? 'all' : data.months.includes(ui.month) ? ui.month : data.months.includes(wanted) ? wanted : data.months.at(-1);
  const switcher = html`<div class="chips" role="group" aria-label="Kiểu xem">
    ${[['month', 'Theo tháng'], ['trend', 'Qua các tháng']].map(([id, label]) => html`<button class="chip" type="button" data-cview="${id}" aria-pressed="${(ui.view ?? 'month') === id}">${label}</button>`)}</div>`;
  const body = (ui.view ?? 'month') === 'trend' ? trendView(data, ui, names) : monthView(data, ui, month, names);
  const sources = (data.sources ?? []).map((x) => `${x.tab}: ${num(x.calls)} cuộc${x.calls ? ` (${x.months.map((m) => `T${Number(m.slice(5))}`).join(', ')})` : ' · không đọc được'}`).join(' · ');
  return html`<div class="toolbar"><h2 class="section-title">Chất lượng cuộc gọi kết nối</h2>${switcher}</div>${sources ? html`<p class="muted">Dữ liệu call đã đọc: ${sources}</p>` : ''}${body}`;
}

const pctText = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const deltaCell = (cur, prev, { good }) => {
  if (cur == null || prev == null) return '';
  const d = cur - prev;
  if (Math.abs(d) < 0.0005) return html`<small class="muted"> =</small>`;
  const better = good === 'up' ? d > 0 : d < 0;
  return html`<small class="${better ? 'talk-ok' : 'talk-bad'}"> ${d > 0 ? '▲' : '▼'}${(Math.abs(d) * 100).toFixed(1).replace('.', ',')}</small>`;
};
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;

/** Đánh giá tỉ lệ qua các tháng: toàn team và từng nhân sự (kèm chênh lệch so với tháng trước). */
function trendView(data, ui, names) {
  const t = analyzeMonths(data.calls, { shortSec: ui.shortSec });
  const labels = t.months.map(mlabel);
  const row = (title, key, fmt, good) => html`<tr class="static"><td class="sticky-col"><strong>${title}</strong></td>
    ${t.team.map((m, i) => html`<td class="right num">${fmt(m[key])}${i ? deltaCell(m[key], t.team[i - 1][key], { good }) : ''}</td>`)}</tr>`;
  const matrix = (title, key, good, note) => html`
    <div class="toolbar"><h2 class="section-title">${title}</h2><p class="muted">${note}</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${labels.map((l) => html`<th scope="col" class="right">${l}</th>`)}</tr></thead>
      <tbody>${t.agents.map((a) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${names.get(a.code) ?? a.name}</strong><small>${a.code}</small></span></td>
        ${a.perMonth.map((m, i) => html`<td class="right num">${m ? pctText(m[key]) : '—'}${m && i && a.perMonth[i - 1] ? deltaCell(m[key], a.perMonth[i - 1][key], { good }) : ''}</td>`)}</tr>`)}</tbody>
    </table></div>`;
  return html`
    <p class="muted">So sánh ${labels.join(' → ')}. Cuộc "ngắn" là kết nối thành công nhưng đàm thoại dưới ${sec(ui.shortSec)}. Mũi tên là chênh lệch so với tháng liền trước (điểm %).</p>
    <div class="filters"><label class="filter"><span>Ngắn: dưới</span><select id="connect-short" class="select">${SHORT_OPTIONS.map((v) => html`<option value="${v}" ${v === ui.shortSec ? 'selected' : ''}>${sec(v)}</option>`)}</select></label></div>
    <section class="card"><h3 class="card__title">Đánh giá</h3><ul class="advice">${t.advice.map((x) => html`<li class="advice--${x.tone}">${x.text}</li>`)}</ul></section>
    <div class="toolbar"><h2 class="section-title">Toàn team qua các tháng</h2></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Chỉ số</th>${labels.map((l) => html`<th scope="col" class="right">${l}</th>`)}</tr></thead>
      <tbody>
        <tr class="static"><td class="sticky-col"><strong>Tổng cuộc gọi</strong></td>${t.team.map((m) => html`<td class="right num">${num(m.calls)}</td>`)}</tr>
        <tr class="static"><td class="sticky-col"><strong>Kết nối thành công</strong></td>${t.team.map((m) => html`<td class="right num">${num(m.success)}</td>`)}</tr>
        ${row('Tỉ lệ kết nối', 'rate', (v) => pctText(v), 'up')}
        ${row('Tỉ lệ cuộc kết nối ngắn', 'shortShare', (v) => pctText(v), 'down')}
        ${row('Khách ngắt máy', 'customerEndShare', (v) => pctText(v, 0), 'down')}
        ${row('Không liên lạc được / không nghe máy', 'unreachableShare', (v) => pctText(v), 'down')}
        ${row('Lỗi tổng đài / hệ thống', 'technicalShare', (v) => pctText(v), 'down')}
        <tr class="static"><td class="sticky-col"><strong>Đàm thoại TB</strong></td>${t.team.map((m) => html`<td class="right num">${sec(m.avg)}</td>`)}</tr>
        <tr class="static"><td class="sticky-col"><strong>Đàm thoại trung vị</strong></td>${t.team.map((m) => html`<td class="right num">${sec(m.median)}</td>`)}</tr>
        <tr class="static"><td class="sticky-col"><strong>Số ngày có data</strong></td>${t.team.map((m) => html`<td class="right num">${m.days}</td>`)}</tr>
      </tbody></table></div>
    <div class="charts">
      ${chartCard('Tỉ lệ kết nối qua các tháng', lineChart({ labels, series: [{ name: 'Tỉ lệ kết nối', cls: 's1', values: t.team.map((m) => m.rate) }], format: (v) => pct(v), values: true, valueFormat: (v) => pct(v, 1) }))}
      ${chartCard(`Tỉ lệ cuộc ngắn (< ${sec(ui.shortSec)}) qua các tháng`, lineChart({ labels, series: [{ name: 'Tỉ lệ ngắn', cls: 's3', values: t.team.map((m) => m.shortShare) }], format: (v) => pct(v), values: true, valueFormat: (v) => pct(v, 1) }))}
    </div>
    ${matrix('Tỉ lệ kết nối theo nhân sự', 'rate', 'up', 'Càng cao càng tốt; mũi tên xanh là cải thiện so với tháng trước.')}
    ${matrix('Tỉ lệ cuộc kết nối ngắn theo nhân sự', 'shortShare', 'down', 'Càng thấp càng tốt; mũi tên xanh là giảm so với tháng trước.')}`;
}

function monthView(data, ui, month, names) {
  const all = month === 'all';
  const a = analyzeCalls(data.calls, { month: all ? null : month, shortSec: ui.shortSec, longSec: ui.longSec });
  const nameOf = (r) => names.get(r.code) ?? r.name;
  const dayLabel = (d) => (all ? `${d.day}/${Number(d.ym.slice(5))}` : String(d.day));
  const { totals } = a;
  const maxHist = Math.max(...a.hist.map((h) => h.count), 1);
  const FAIL_CLS = { denied: 's5', unreachable: 's3', timeout: 's6', cancel: 's4' };
  const resultSegments = [{ label: 'Kết nối thành công', cls: 's2', value: totals.success }, ...a.failures.map((f) => ({ label: f.label, cls: FAIL_CLS[f.key] ?? 's1', value: f.count }))];
  const lengthSegments = [{ label: `Ngắn (< ${sec(ui.shortSec)})`, cls: 's3', value: a.buckets.short.success }, { label: 'Trung bình', cls: 's1', value: a.buckets.mid.success }, { label: `Dài (≥ ${sec(ui.longSec)})`, cls: 's2', value: a.buckets.long.success }];
  const hourRows = a.hours.filter((h) => h.calls >= 50);
  const rows = [...a.rows].sort((x, y) => (y.shortShare ?? -1) - (x.shortShare ?? -1));
  const maxShort = Math.max(...rows.map((r) => r.shortShare ?? 0), 0.01);
  const option = (list, current) => list.map((v) => html`<option value="${v}" ${v === current ? 'selected' : ''}>${sec(v)}</option>`);
  const bucketNote = (b) => (b === 'short' ? `dưới ${sec(ui.shortSec)}` : b === 'long' ? `từ ${sec(ui.longSec)}` : `${sec(ui.shortSec)} – ${sec(ui.longSec)}`);
  return html`
    <p class="muted">${monthLabel(month)}: phân tích từng cuộc gọi từ Sheet "Dữ liệu call". Cuộc "ngắn" là kết nối thành công nhưng đàm thoại ngắn: dấu hiệu khách bắt máy nhưng không muốn trao đổi.</p>
    <div class="filters" aria-label="Tháng và ngưỡng phân loại">
      <label class="filter"><span>Tháng</span><select id="connect-month" class="select"><option value="all" ${all ? 'selected' : ''}>Tất cả (${mlabel(data.months[0])} → ${mlabel(data.months.at(-1))})</option>${data.months.slice().reverse().map((m) => html`<option value="${m}" ${m === month ? 'selected' : ''}>Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}</option>`)}</select></label>
      <label class="filter"><span>Ngắn: dưới</span><select id="connect-short" class="select">${option(SHORT_OPTIONS, ui.shortSec)}</select></label>
      <label class="filter"><span>Dài: từ</span><select id="connect-long" class="select">${option(LONG_OPTIONS, ui.longSec)}</select></label>
    </div>
    <div class="grid">
      ${stat('Tổng cuộc gọi', num(totals.calls), `${totals.people} nhân sự`)}
      ${stat('Kết nối thành công', num(totals.success), `Tỉ lệ ${pct(totals.rate ?? 0, 1)}`)}
      ${stat('Đàm thoại TB / trung vị', `${sec(totals.avg)} / ${sec(totals.median)}`, `Tổng talktime ${hm(totals.talk)}`)}
      ${stat(`Kết nối nhưng ngắn (< ${sec(ui.shortSec)})`, pct(a.shortShare, 1), `${num(a.shortCount)} cuộc · khách ngắt máy ${pct(a.shortCustomerEndShare, 0)}`)}
      ${stat('Khách ngắt máy', pct(a.customerEndShare, 1), 'Trong các cuộc kết nối thành công')}
    </div>
    <div class="charts">
      ${chartCard('Kết quả các cuộc gọi', donutChart({ segments: resultSegments, center: { value: pct(totals.rate ?? 0, 0), label: 'kết nối' } }), 'Tỉ lệ kết nối thành công và lý do không kết nối.')}
      ${chartCard('Cuộc kết nối theo thời gian đàm thoại', donutChart({ segments: lengthSegments, center: { value: pct(a.shortShare, 0), label: 'cuộc ngắn' } }), `Ngắn: dưới ${sec(ui.shortSec)} · Dài: từ ${sec(ui.longSec)}.`)}
      ${chartCard('Theo khung giờ', groupedColumns({ categories: hourRows.map((h) => h.slot.replace('h', '')), series: [{ name: 'Tỉ lệ kết nối', cls: 's1', values: hourRows.map((h) => h.rate) }, { name: `Tỉ lệ cuộc ngắn (< ${sec(ui.shortSec)})`, cls: 's3', values: hourRows.map((h) => h.shortShare ?? 0) }], values: true, valueFormat: (v) => pct(v, 1) }), 'Chỉ các khung giờ có từ 50 cuộc gọi trở lên.')}
      ${chartCard('Tỉ lệ cuộc ngắn theo nhân sự', html`<div class="hist">${rows.map((r) => html`<div class="hist__row"><span title="${nameOf(r)}">${nameOf(r).split(' ').slice(-2).join(' ')}</span>
        <div class="bar ${r.status === 'short' ? 'bar--bad' : ''}"><div class="bar__fill" style="width:${((r.shortShare ?? 0) / maxShort) * 100}%"></div></div><span class="num">${r.shortShare == null ? '—' : pct(r.shortShare, 1)}</span></div>`)}</div>`, 'Đỏ: cao hơn team từ 8 điểm % (cần coaching).')}
    </div>
    <section class="card"><h3 class="card__title">Gợi ý hành động</h3>
      <ul class="advice">${a.advice.map((x) => html`<li class="advice--${x.tone}">${x.text}</li>`)}</ul></section>
    <section class="card"><h3 class="card__title">Phân bố thời gian đàm thoại của cuộc kết nối</h3>
      <div class="hist">${a.hist.map((h) => html`<div class="hist__row"><span>${h.label}</span>
        <div class="bar ${h.short ? 'bar--bad' : ''}"><div class="bar__fill" style="width:${(h.count / maxHist) * 100}%"></div></div>
        <span class="num">${num(h.count)} <small class="muted">(${pct(totals.success ? h.count / totals.success : 0, 1)})</small></span></div>`)}</div>
      <ul class="legend">${['short', 'mid', 'long'].map((b, i) => html`<li><i class="swatch s${[4, 1, 2][i]}"></i><strong>${{ short: 'Ngắn', mid: 'Trung bình', long: 'Dài' }[b]}</strong> ${bucketNote(b)}: ${num(a.buckets[b].success)} cuộc (${pct(totals.success ? a.buckets[b].success / totals.success : 0, 1)})</li>`)}</ul>
    </section>
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Xếp theo tỉ lệ cuộc kết nối ngắn cao nhất; "Cần coaching" khi cao hơn team từ 8 điểm % (tối thiểu 30 cuộc kết nối).</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Tổng call</th><th scope="col" class="right">Kết nối</th><th scope="col" class="right">Tỉ lệ kết nối</th>
        <th scope="col" class="right">TB đàm thoại</th><th scope="col" class="right">Trung vị</th><th scope="col" class="right">Cuộc ngắn</th><th scope="col" class="right">Tỉ lệ ngắn</th><th scope="col" class="right">Khách ngắt</th><th scope="col">Đánh giá</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${nameOf(r)}</strong><small>${r.code}</small></span></td>
        <td class="right num">${num(r.calls)}</td><td class="right num">${num(r.success)}</td><td class="right num">${r.rate == null ? '—' : pct(r.rate, 1)}</td>
        <td class="right num">${sec(r.avg)}</td><td class="right num">${sec(r.median)}</td><td class="right num">${num(r.shortCount)}</td>
        <td class="right num strong ${r.status === 'short' ? 'talk-bad' : r.status === 'long' ? 'talk-ok' : ''}">${r.shortShare == null ? '—' : pct(r.shortShare, 1)}</td>
        <td class="right num">${r.customerEndShare == null ? '—' : pct(r.customerEndShare, 0)}</td>
        <td>${badge(STATUS[r.status][0], STATUS[r.status][1])}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo khung giờ</h2><p class="muted">Giờ nào khách bắt máy nhiều và có trao đổi.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col">Khung giờ</th><th scope="col" class="right">Tổng call</th><th scope="col" class="right">Kết nối</th><th scope="col" class="right">Tỉ lệ kết nối</th><th scope="col" class="right">Tỉ lệ cuộc ngắn</th></tr></thead>
      <tbody>${a.hours.map((h) => html`<tr class="static"><td><strong>${h.slot}</strong></td><td class="right num">${num(h.calls)}</td><td class="right num">${num(h.success)}</td><td class="right num">${pct(h.rate, 1)}</td>
        <td class="right num ${h.calls >= 100 && h.shortShare != null && h.shortShare >= a.shortShare + 0.06 ? 'talk-bad' : ''}">${h.shortShare == null ? '—' : pct(h.shortShare, 1)}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Cuộc gọi không kết nối</h2><p class="muted">${num(a.failedCount)} cuộc không thành công · lỗi tổng đài/hệ thống thật chỉ chiếm ${pct(a.technicalShare, 1)} tổng cuộc gọi; phần lớn do phía khách.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col">Lý do</th><th scope="col">Giải thích</th><th scope="col" class="right">Số cuộc</th><th scope="col" class="right">Tỉ lệ</th></tr></thead>
      <tbody>${a.failures.map((f) => html`<tr class="static"><td><strong>${f.label}</strong></td><td class="muted">${f.hint}</td><td class="right num">${num(f.count)}</td><td class="right num">${pct(f.share, 1)}</td></tr>`)}</tbody>
    </table></div>
    ${a.daily.length > 1 ? chartCard('Tỉ lệ kết nối theo ngày', lineChart({ labels: a.daily.map((d, i) => (all && i % 7 ? "" : dayLabel(d))), series: [{ name: 'Tỉ lệ kết nối', cls: 's1', values: a.daily.map((d) => d.rate) }], format: (v) => pct(v) }), all ? 'Toàn team, theo từng ngày của tất cả các tháng.' : 'Toàn team, theo từng ngày trong tháng.') : ''}
    ${a.daily.length > 1 ? chartCard('Đàm thoại TB / cuộc kết nối theo ngày', lineChart({ labels: a.daily.map((d, i) => (all && i % 7 ? "" : dayLabel(d))), series: [{ name: 'Giây / cuộc', cls: 's3', values: a.daily.map((d) => Math.round(d.avg)) }], format: (v) => sec(v) }), 'Ngày nào thấp bất thường: khả năng cao là chất lượng data hoặc khung giờ gọi.') : ''}`;
}
