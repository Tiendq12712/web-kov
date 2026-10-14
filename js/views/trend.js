import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { lineChart, chartCard } from './charts.js';
import { METRICS, series } from '../history.js';

const dm = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');
const fmtOf = (m) => (m.pct ? (v) => pct(v, 1).replace('.', ',') : (v) => num(Math.round(v * 10) / 10));
const deltaText = (m, d) => {
  if (d == null) return '—';
  const good = m.goodUp ? d > 0 : d < 0;
  const body = m.pct ? `${d > 0 ? '+' : ''}${(d * 100).toFixed(1).replace('.', ',')} đ.%` : `${d > 0 ? '+' : ''}${num(Math.round(d * 10) / 10)}`;
  return html`<span class="trend-delta ${d === 0 ? '' : good ? 'is-good' : 'is-bad'}">${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${body}</span>`;
};

/** Biến động từng nhân sự giữa hai ngày gần nhất (quản lý). */
function peopleTable(records, metric) {
  const m = METRICS[metric], fmt = fmtOf(m);
  const codes = [...new Map(records.map((r) => [r.code, r.name]))];
  const rows = codes.map(([code, name]) => {
    const s = series(records, metric, code);
    const last = s.at(-1), prev = s.at(-2);
    return { code, name, last: last?.value ?? null, prev: prev?.value ?? null, delta: last && prev ? last.value - prev.value : null };
  }).filter((r) => r.last != null);
  if (!rows.length) return '';
  return html`
    <div class="toolbar"><h2 class="section-title">Biến động theo nhân sự</h2><p class="muted">So sánh hai ngày gần nhất · ${m.label}</p></div>
    <div class="table-wrap"><table class="trend-table sortable">
      <thead><tr><th class="sticky-col">Nhân sự</th><th>Ngày trước</th><th>Mới nhất</th><th>Thay đổi</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
        <td class="num">${r.prev == null ? '—' : fmt(r.prev)}</td><td class="num strong">${fmt(r.last)}</td><td class="num" data-sort="${r.delta ?? ''}">${deltaText(m, r.delta)}</td></tr>`)}</tbody>
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
  const who = manager ? ui.who : String(code);
  const s = series(own, metric, who);
  const people = [...new Map(own.map((r) => [r.code, r.name]))].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  const days = new Set(own.map((r) => r.date)).size;

  const controls = html`
    <div class="filters">
      <div class="filter"><span>Chỉ số</span><div class="chips" role="group" aria-label="Chọn chỉ số">
        ${Object.entries(METRICS).map(([k, x]) => html`<button class="chip" type="button" data-trend-metric="${k}" aria-pressed="${k === metric}">${x.label}</button>`)}</div></div>
      ${manager ? html`<label class="filter"><span>Hiển thị</span><select class="select" id="trend-who">
        <option value="all" ${who === 'all' ? 'selected' : ''}>Toàn bộ nhân sự</option>
        ${people.map(([c, n]) => html`<option value="${c}" ${who === c ? 'selected' : ''}>${c} - ${n}</option>`)}</select></label>` : ''}
    </div>`;

  const recordBtn = manager ? html`<button class="btn btn--ghost" type="button" data-record-history>Lưu số liệu hôm nay vào lịch sử</button>` : '';
  if (s.length < 2) {
    return html`
      <div class="toolbar"><h2 class="section-title">Xu hướng theo ngày</h2></div>
      ${controls}
      <section class="card"><p class="muted">Chưa đủ dữ liệu để vẽ xu hướng: hiện có <strong>${days}</strong> ngày lưu lịch sử, cần ít nhất <strong>2 ngày</strong>.
        Mỗi lần bấm <strong>Đồng bộ CRM</strong> trong Thiết lập, web tự lưu số liệu của ngày đó.</p>${recordBtn}</section>`;
  }
  const first = s[0], last = s.at(-1), prev = s.at(-2);
  return html`
    <div class="toolbar"><h2 class="section-title">Xu hướng theo ngày</h2><p class="muted">${s.length} ngày · từ ${dm(first.date)} đến ${dm(last.date)}</p></div>
    ${controls}
    <div class="grid">
      <div class="card"><h3 class="card__title">Mới nhất (${dm(last.date)})</h3><p class="big num">${fmt(last.value)}</p><p class="muted">${m.label}</p></div>
      <div class="card"><h3 class="card__title">So với hôm trước</h3><p class="big num">${deltaText(m, last.value - prev.value)}</p><p class="muted">${dm(prev.date)}: ${fmt(prev.value)}</p></div>
      <div class="card"><h3 class="card__title">So với ngày đầu</h3><p class="big num">${deltaText(m, last.value - first.value)}</p><p class="muted">${dm(first.date)}: ${fmt(first.value)}</p></div>
    </div>
    ${chartCard(`${m.label} theo ngày`, lineChart({ labels: s.map((p) => dm(p.date)), series: [{ name: m.label, cls: 's1', values: s.map((p) => p.value) }], format: fmt }),
      who === 'all' ? (m.agg === 'sum' ? 'Tổng của toàn bộ nhân sự.' : 'Trung bình của toàn bộ nhân sự.') : '')}
    <div class="table-wrap"><table class="trend-table sortable">
      <thead><tr><th>Ngày</th><th>${m.label}</th><th>Thay đổi so với ngày trước</th></tr></thead>
      <tbody>${[...s].reverse().map((p, i, arr) => html`<tr class="static"><td data-sort="${p.date.replace(/-/g, '')}">${dm(p.date)}</td><td class="num strong">${fmt(p.value)}</td>
        <td class="num" data-sort="${arr[i + 1] ? p.value - arr[i + 1].value : ''}">${arr[i + 1] ? deltaText(m, p.value - arr[i + 1].value) : '—'}</td></tr>`)}</tbody>
    </table></div>
    ${manager && who === 'all' ? peopleTable(own, metric) : ''}
    ${recordBtn}`;
}
