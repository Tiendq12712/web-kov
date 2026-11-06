import { html } from '../dom.js';
import { num } from '../format.js';
import { lineChart, chartCard, sparkline } from './charts.js';
import { weeklyStats, impactGroups, statsOf, MIN_WEEK_ACTS, MIN_MEASURED } from '../cinfoWeekly.js';
import { countedActs } from '../pbi.js';
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


const pc = (r) => (r == null ? '—' : `${(r * 100).toFixed(1).replace('.', ',')}%`);
const gain = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')}`);
const gainCls = (v) => (v == null || v === 0 ? '' : v > 0 ? 'is-good' : 'is-bad');
const dmIso = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Customer Info theo tuần (theo ngày chỉnh sửa act): tỉ lệ tư vấn tính năng, khớp gợi ý hệ thống và impact
 * (điểm tính năng/setup sau 7 ngày so với ngày act). Lấy từ dữ liệu Power BI nên có sẵn lịch sử, không cần chờ lưu từng ngày.
 */
function cinfoTrend(pbi, who) {
  if (!pbi) return '';   // chưa tải xong (hoặc chưa có link PBI): mục này hiện khi có dữ liệu
  const acts = countedActs(pbi.acts).filter((a) => who === 'all' || a.code === who);
  const weeks = weeklyStats(acts);
  if (!acts.length || !weeks.length) return '';
  const rated = weeks.filter((w) => !w.small), impacted = weeks.filter((w) => w.measured >= MIN_MEASURED);
  const label = (w) => `${dmIso(w.start)}${w.partial ? '*' : ''}`;
  const percent = (v) => `${Math.round(v)}%`, p1 = (v) => `${v.toFixed(1).replace('.', ',')}%`, pts1 = (v) => v.toFixed(1).replace('.', ',');
  const charts = html`<div class="grid cinfo-charts">
    ${rated.length >= 2 ? chartCard('Tư vấn tính năng & khớp gợi ý theo tuần', lineChart({ labels: rated.map(label), format: percent, valueFormat: p1, values: true, series: [
      { name: '% act tư vấn tính năng', cls: 's1', values: rated.map((w) => (w.adviceRate ?? 0) * 100) }, { name: '% khớp / tư vấn', cls: 's2', values: rated.map((w) => (w.matchRate ?? 0) * 100) }] })) : ''}
    ${impacted.length >= 2 ? chartCard('% act có điểm tăng sau 7 ngày', lineChart({ labels: impacted.map(label), format: percent, valueFormat: p1, values: true, series: [{ name: '% act tăng điểm', cls: 's1', values: impacted.map((w) => (w.upRate ?? 0) * 100) }] })) : ''}
    ${impacted.length >= 2 ? chartCard('Điểm tăng thêm sau 7 ngày (trung bình)', lineChart({ labels: impacted.map(label), format: (v) => `${Math.round(v)}`, valueFormat: pts1, values: true, series: [
      { name: 'Điểm tính năng', cls: 's1', values: impacted.map((w) => w.featGain ?? 0) }, { name: 'Điểm setup', cls: 's2', values: impacted.map((w) => w.setupGain ?? 0) }] })) : ''}
  </div>`;
  const groups = impactGroups(acts);
  const people = who === 'all' ? [...acts.reduce((m, a) => (m.get(a.code)?.acts.push(a) ?? m.set(a.code, { code: a.code, name: a.name, acts: [a] }), m), new Map()).values()]
    .map((p) => ({ ...p, ...statsOf(p.acts) })).sort((a, b) => b.total - a.total) : [];
  return html`
    <div class="toolbar"><h2 class="section-title">Customer Info & impact theo tuần</h2>
      <p class="muted">Theo ngày chỉnh sửa act, mỗi tuần từ thứ 2 đến chủ nhật. Impact là mức tăng điểm của retailer sau 7 ngày kể từ act; act mới chưa đủ 7 ngày thì chưa đo được. Tuần có dấu * chưa đủ ngày; tuần dưới ${MIN_WEEK_ACTS} act hoặc dưới ${MIN_MEASURED} act đã đo bị ẩn khỏi biểu đồ.</p></div>
    ${charts}
    <div class="table-wrap"><table class="trend-table sortable">
      <thead><tr><th class="sticky-col">Tuần</th><th>Số act</th><th>% tư vấn tính năng</th><th>% khớp / tư vấn</th><th>Đã đo impact</th><th>% act tăng điểm</th><th>Δ điểm tính năng</th><th>Δ điểm setup</th></tr></thead>
      <tbody>${[...weeks].reverse().map((w) => html`<tr class="static ${w.partial || w.small || w.measured < MIN_MEASURED ? 'is-partial' : ''}">
        <td class="sticky-col"><strong>${dmIso(w.start)} – ${dmIso(w.end)}</strong>${w.partial ? html`<small class="cinfo-rate">chưa đủ tuần</small>` : w.small ? html`<small class="cinfo-rate">ít dữ liệu</small>` : ''}</td>
        <td class="num">${num(w.total)}</td><td class="num">${pc(w.adviceRate)}</td><td class="num">${pc(w.matchRate)}<small class="cinfo-rate">${w.matched}/${w.advised} act</small></td>
        <td class="num">${num(w.measured)}</td><td class="num">${pc(w.upRate)}</td>
        <td class="num"><span class="trend-delta ${gainCls(w.featGain)}">${gain(w.featGain)}</span></td><td class="num"><span class="trend-delta ${gainCls(w.setupGain)}">${gain(w.setupGain)}</span></td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo cách tư vấn: có theo gợi ý thì impact cao hơn không?</h2>
      <p class="muted">So sánh nhóm, chưa loại trừ khác biệt giữa các retailer nên chưa chứng minh được quan hệ nhân quả. Nhóm ít act đã đo thì kết quả dao động.</p></div>
    <div class="table-wrap"><table class="trend-table">
      <thead><tr><th class="sticky-col">Nhóm act</th><th>Số act</th><th>Đã đo impact</th><th>% act tăng điểm</th><th>Δ điểm tính năng</th><th>Δ điểm setup</th></tr></thead>
      <tbody>${groups.map(([name, g]) => html`<tr class="static"><td class="sticky-col"><strong>${name}</strong></td><td class="num">${num(g.total)}</td><td class="num">${num(g.measured)}</td><td class="num">${pc(g.upRate)}</td>
        <td class="num"><span class="trend-delta ${gainCls(g.featGain)}">${gain(g.featGain)}</span></td><td class="num"><span class="trend-delta ${gainCls(g.setupGain)}">${gain(g.setupGain)}</span></td></tr>`)}</tbody>
    </table></div>
    ${people.length ? html`
      <div class="toolbar"><h2 class="section-title">Impact theo nhân sự</h2><p class="muted">Toàn bộ act đã hoàn tất trong dữ liệu Power BI. Bấm tiêu đề cột để sắp xếp.</p></div>
      <div class="table-wrap"><table class="trend-table sortable">
        <thead><tr><th class="sticky-col">Nhân sự</th><th>Số act</th><th>% tư vấn tính năng</th><th>% khớp / tư vấn</th><th>Đã đo impact</th><th>% act tăng điểm</th><th>Δ điểm tính năng</th><th>Δ điểm setup</th></tr></thead>
        <tbody>${people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
          <td class="num">${num(p.total)}</td><td class="num" data-sort="${p.adviceRate ?? -1}">${pc(p.adviceRate)}</td><td class="num" data-sort="${p.matchRate ?? -1}">${pc(p.matchRate)}</td>
          <td class="num">${num(p.measured)}</td><td class="num" data-sort="${p.upRate ?? -1}">${pc(p.upRate)}</td>
          <td class="num" data-sort="${p.featGain ?? -999}"><span class="trend-delta ${gainCls(p.featGain)}">${gain(p.featGain)}</span></td><td class="num" data-sort="${p.setupGain ?? -999}"><span class="trend-delta ${gainCls(p.setupGain)}">${gain(p.setupGain)}</span></td></tr>`)}</tbody>
      </table></div>` : ''}`;
}

/**
 * Xu hướng theo ngày. Quản lý chọn "Toàn bộ" hoặc một nhân sự; nhân sự chỉ thấy số liệu của mình.
 * `history` là các ảnh chụp đã lưu mỗi lần đồng bộ CRM.
 */
export function trendView(history, ui, { manager, code, pbi = null }) {
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
        Mỗi lần bấm <strong>Đồng bộ CRM</strong> trong Thiết lập, web tự lưu số liệu của ngày đó.</p>${recordBtn}</section>
      ${cinfoTrend(pbi, who)}`;
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
    ${cinfoTrend(pbi, who)}
    ${recordBtn}`;
}
