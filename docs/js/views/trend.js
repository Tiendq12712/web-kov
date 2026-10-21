import { html } from '../dom.js';
import { num } from '../format.js';
import { lineChart, chartCard, sparkline } from './charts.js';
import { METRICS, series, lastN, movers, dayMatrix, trendInsights, fmtMetric, fmtDeltaMetric, toneOf } from '../history.js';

const dm = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');
const fmtOf = (m) => (v) => fmtMetric(m, v);
const RANGES = [['7', '7 ngày'], ['14', '14 ngày'], ['30', '30 ngày'], ['all', 'Tất cả']];
const arrow = (d) => (d > 0 ? '▲' : d < 0 ? '▼' : '•');
const deltaText = (m, d) => {
  if (d == null) return '—';
  return html`<span class="trend-delta ${d === 0 ? '' : toneOf(m, d) === 'good' ? 'is-good' : 'is-bad'}">${arrow(d)} ${d === 0 ? '0' : `${d > 0 ? '+' : '−'}${fmtDeltaMetric(m, d)}`}</span>`;
};

/** Thẻ từng chỉ số: giá trị mới nhất, thay đổi so với hôm trước và đường xu hướng nhỏ; bấm để chọn chỉ số. */
function metricCards(records, who, current) {
  return html`<div class="metric-cards" role="group" aria-label="Chọn chỉ số">${Object.entries(METRICS).map(([k, m]) => {
    const s = series(records, k, who), last = s.at(-1), prev = s.at(-2), d = last && prev ? last.value - prev.value : null;
    return html`<button class="metric-card ${k === current ? 'is-active' : ''}" type="button" data-trend-metric="${k}" aria-pressed="${k === current}">
      <span class="metric-card__title">${m.label}</span>
      <span class="metric-card__value num">${last ? fmtMetric(m, last.value) : '—'}</span>
      <span class="metric-card__delta">${d == null ? html`<span class="muted">chưa đủ ngày</span>` : html`${deltaText(m, d)} <small class="muted">so với hôm trước</small>`}</span>
      <span class="metric-card__spark tone-${d == null ? 'none' : toneOf(m, d) || 'none'}">${sparkline(s.slice(-14).map((p) => p.value))}</span>
    </button>`;
  })}</div>`;
}

/** Nhận định bằng lời (quản lý thấy cả nhân sự cải thiện / cần chú ý). */
const insightsCard = (items) => (items.length ? html`<section class="card insights" aria-label="Nhận định"><h2 class="section-title">Nhận định</h2>
  <ul class="insights__list">${items.map((i) => html`<li class="insights__item ${i.tone ? `insights__item--${i.tone}` : ''}">${i.text}</li>`)}</ul></section>` : '');

/** Hai cột: nhân sự cải thiện nhiều nhất và xấu đi nhiều nhất so với hôm trước. */
function moversCards(records, metric) {
  const m = METRICS[metric], all = movers(records, metric).filter((x) => x.delta !== 0);
  const good = all.filter((x) => toneOf(m, x.delta) === 'good').slice(0, 5), bad = [...all].reverse().filter((x) => toneOf(m, x.delta) === 'bad').slice(0, 5);
  if (!good.length && !bad.length) return '';
  const list = (rows, tone) => rows.length ? html`<ol class="movers__list">${rows.map((r) => html`<li><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span>
    <span class="movers__vals num">${fmtMetric(m, r.prev)} → <strong>${fmtMetric(m, r.last)}</strong></span>${deltaText(m, r.delta)}<span class="movers__spark tone-${tone}">${sparkline(r.values.slice(-10), { w: 70, h: 24 })}</span></li>`)}</ol>` : html`<p class="muted">Không có.</p>`;
  return html`<div class="movers"><section class="card movers__col movers__col--good"><h3 class="card__title">▲ Cải thiện nhiều nhất</h3><p class="muted">So với hôm trước · ${m.label}</p>${list(good, 'good')}</section>
    <section class="card movers__col movers__col--bad"><h3 class="card__title">▼ Cần chú ý</h3><p class="muted">Xấu đi nhiều nhất so với hôm trước</p>${list(bad, 'bad')}</section></div>`;
}

/** Bảng nhân sự × ngày: ô tô xanh/đỏ theo thay đổi so với ngày liền trước. */
function heatTable(records, metric, range) {
  const m = METRICS[metric], fmt = fmtOf(m);
  const { dates, rows } = dayMatrix(records, metric, range === 'all' ? 14 : Math.min(Number(range), 14));
  if (dates.length < 2 || !rows.length) return '';
  return html`
    <div class="toolbar"><h2 class="section-title">Nhân sự theo ngày</h2><p class="muted">${m.label} · ô xanh là cải thiện, ô đỏ là xấu đi so với ngày liền trước</p></div>
    <div class="table-wrap"><table class="trend-table heat-table">
      <thead><tr><th class="sticky-col">Nhân sự</th>${dates.map((d) => html`<th>${dm(d)}</th>`)}<th>Xu hướng</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
        ${r.cells.map((c) => html`<td class="num heat-cell ${c.delta ? `heat-cell--${toneOf(m, c.delta)}` : ''}" title="${c.delta == null ? '' : `${c.delta > 0 ? '+' : '−'}${fmtDeltaMetric(m, c.delta)}`}">${c.value == null ? '—' : fmt(c.value)}</td>`)}
        <td class="heat-spark">${sparkline(r.cells.map((c) => c.value), { w: 80, h: 24 })}</td></tr>`)}</tbody>
    </table></div>`;
}

/**
 * Xu hướng theo ngày. Quản lý chọn "Toàn bộ" hoặc một nhân sự; nhân sự chỉ thấy số liệu của mình.
 * `history` là các ảnh chụp đã lưu mỗi lần đồng bộ CRM.
 */
export function trendView(history, ui, { manager, code }) {
  const own = manager ? history : history.filter((r) => r.code === String(code));
  if (!manager && !code) return html`<p class="notice">Chưa nhận ra bạn trong báo cáo (thiếu <strong>Đầu số</strong> trong tab Tài khoản). Hãy liên hệ quản lý để được bổ sung.</p>`;
  const metric = METRICS[ui.metric] ? ui.metric : 'kpi';
  const m = METRICS[metric], fmt = fmtOf(m);
  const range = RANGES.some(([v]) => v === ui.range) ? ui.range : 'all';
  const who = manager ? ui.who : String(code);
  const full = series(own, metric, who), s = lastN(full, range);
  const people = [...new Map(own.map((r) => [r.code, r.name]))].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const days = new Set(own.map((r) => r.date)).size;
  const scopeName = who === 'all' ? 'Toàn đội' : (people.find(([c]) => c === who)?.[1] ?? 'Nhân sự');

  const controls = html`
    <div class="filters">
      <div class="filter"><span>Khoảng thời gian</span><div class="chips" role="group" aria-label="Khoảng thời gian">
        ${RANGES.map(([v, label]) => html`<button class="chip" type="button" data-trend-range="${v}" aria-pressed="${v === range}">${label}</button>`)}</div></div>
      ${manager ? html`<label class="filter"><span>Hiển thị</span><select class="select" id="trend-who">
        <option value="all" ${who === 'all' ? 'selected' : ''}>Toàn bộ nhân sự</option>
        ${people.map(([c, n]) => html`<option value="${c}" ${who === c ? 'selected' : ''}>${c} - ${n}</option>`)}</select></label>` : ''}
    </div>`;

  const recordBtn = manager ? html`<button class="btn btn--ghost" type="button" data-record-history>Lưu số liệu hôm nay vào lịch sử</button>` : '';
  if (full.length < 2) {
    return html`
      <div class="toolbar"><h2 class="section-title">Xu hướng theo ngày</h2></div>
      ${controls}
      <section class="card"><p class="muted">Chưa đủ dữ liệu để vẽ xu hướng: hiện có <strong>${days}</strong> ngày lưu lịch sử, cần ít nhất <strong>2 ngày</strong>.
        Mỗi lần bấm <strong>Đồng bộ CRM</strong> trong Thiết lập, web tự lưu số liệu của ngày đó.</p>${recordBtn}</section>`;
  }
  const first = s[0], last = s.at(-1), prev = full.at(-2);
  // Với chỉ số dạng tỉ lệ/trung bình, vẽ thêm đường trung bình đội để so khi xem một nhân sự.
  const teamLine = who !== 'all' && m.agg !== 'sum' ? new Map(series(own, metric, 'all').map((p) => [p.date, p.value])) : null;
  const chartSeries = [{ name: scopeName, cls: 's1', values: s.map((p) => p.value) }, ...(teamLine ? [{ name: 'Trung bình đội', cls: 's3', values: s.map((p) => teamLine.get(p.date) ?? p.value) }] : [])];
  return html`
    <div class="toolbar"><h2 class="section-title">Xu hướng theo ngày</h2><p class="muted">${scopeName} · ${days} ngày lưu lịch sử · đang xem ${s.length} ngày (${dm(first.date)} – ${dm(last.date)})</p></div>
    ${metricCards(own, who, metric)}
    ${controls}
    ${insightsCard(trendInsights(own, metric, who, scopeName))}
    ${chartCard(`${m.label} theo ngày`, lineChart({ labels: s.map((p) => dm(p.date)), series: chartSeries, format: fmt, values: s.length <= 14 }),
      who === 'all' ? (m.agg === 'sum' ? 'Tổng của toàn bộ nhân sự.' : 'Trung bình của toàn bộ nhân sự.') : (teamLine ? 'Đường cam là trung bình đội để so sánh.' : ''))}
    ${manager && who === 'all' ? moversCards(own, metric) : ''}
    ${manager && who === 'all' ? heatTable(own, metric, range) : ''}
    <div class="toolbar"><h2 class="section-title">Số liệu từng ngày</h2></div>
    <div class="table-wrap"><table class="trend-table sortable">
      <thead><tr><th>Ngày</th><th>${m.label}</th><th>Thay đổi so với ngày trước</th></tr></thead>
      <tbody>${[...s].reverse().map((p, i, arr) => html`<tr class="static"><td data-sort="${p.date.replace(/-/g, '')}">${dm(p.date)}</td><td class="num strong">${fmt(p.value)}</td>
        <td class="num" data-sort="${arr[i + 1] ? p.value - arr[i + 1].value : ''}">${arr[i + 1] ? deltaText(m, p.value - arr[i + 1].value) : (prev && full.indexOf(p) > 0 ? deltaText(m, p.value - full[full.indexOf(p) - 1].value) : '—')}</td></tr>`)}</tbody>
    </table></div>
    ${recordBtn}`;
}
