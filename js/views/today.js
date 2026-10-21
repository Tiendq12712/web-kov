import { html } from '../dom.js';
import { num, pct, dayMonth } from '../format.js';
import { bar, statusBadge } from './components.js';
import { sparkline } from './charts.js';
import { todoCard } from './todo.js';
import { memberStatus, projectedKpi, elapsedRatio } from '../metrics.js';
import { QUALITY } from '../callScores.js';
import { impactClass } from './overview.js';
import { workdaysByCode } from '../report.js';

const loading = (what) => html`<p class="muted" role="status">Đang tải ${what}…</p>`;
const dmy = (iso) => (iso ? iso.split('-').slice(1).reverse().join('/') : '—');
const p1 = (v) => (v == null ? '—' : pct(v, 1));
const firstName = (name) => String(name ?? '').trim().split(/\s+/).at(-1);
const GREETING = () => { const h = new Date().getHours(); return h < 11 ? 'Chào buổi sáng' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'; };
const todayText = () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });

function kpiCard({ team, member: m }, report) {
  const status = memberStatus(m, team), elapsed = elapsedRatio(team.asOf);
  const workdays = report ? workdaysByCode(report).get(m.code) : null;
  return html`<section class="card card--accent today-kpi">
    <div class="card__head"><h3 class="card__title">KPI tháng của bạn</h3>${statusBadge(status)}</div>
    <p class="big num">${pct(m.kpi, 1)}</p>
    ${bar(m.kpi, { mark: elapsed, tone: status.key })}
    <dl class="kv">
      <dt>Thời gian đã qua</dt><dd class="num">${pct(elapsed)}</dd>
      <dt>Dự kiến cuối tháng</dt><dd class="num">${pct(projectedKpi(m.kpi, elapsed))}</dd>
      <dt>Điểm tổng</dt><dd class="num">${num(m.main.done)} / ${num(m.main.target)}</dd>
      <dt>Add-on</dt><dd class="num">${num(m.addon.done)} / ${num(m.addon.target)}</dd>
      <dt>Act đã làm</dt><dd class="num">${num(m.extra.actDone)} / ${num(m.extra.assigned)}</dd>
      <dt>% Impact</dt><dd class="num ${impactClass(m.extra.impactRate)}">${p1(m.extra.impactRate)}</dd>
      ${workdays != null ? html`<dt>Ngày công</dt><dd class="num">${num(workdays)}</dd>` : ''}
    </dl>
  </section>`;
}

function trendCard(trend) {
  if (trend === undefined) return '';
  if (trend === null) return html`<section class="card"><h3 class="card__title">KPI 14 ngày gần nhất</h3>${loading('lịch sử')}</section>`;
  if (trend.values.length < 2) return html`<section class="card"><h3 class="card__title">KPI 14 ngày gần nhất</h3><p class="muted">Chưa đủ ngày lưu lịch sử để vẽ xu hướng.</p></section>`;
  const d = trend.delta;
  return html`<section class="card"><h3 class="card__title">KPI ${trend.values.length} ngày gần nhất</h3>
    <div class="today-spark tone-${d > 0 ? 'good' : d < 0 ? 'bad' : 'none'}">${sparkline(trend.values, { w: 240, h: 56 })}</div>
    <p class="muted">${dmy(trend.dates[0])} → ${dmy(trend.dates.at(-1))} · ${d == null ? '' : d === 0 ? 'không đổi so với hôm trước' : `${d > 0 ? '▲ tăng' : '▼ giảm'} ${(Math.abs(d) * 100).toFixed(1).replace('.', ',')} điểm % so với hôm trước`}</p></section>`;
}

function openCard(open) {
  if (open === undefined) return '';
  if (open === null) return html`<section class="card today-wide"><h3 class="card__title">Data cần xử lý trước</h3>${loading('data chi tiết')}</section>`;
  const list = open.list.filter((x) => x.kind !== 'ok').slice(0, 10), rest = open.total - list.length;
  return html`<section class="card today-wide"><div class="card__head"><h3 class="card__title">Data cần xử lý trước</h3><button class="link-btn" type="button" data-tab="sla">Xem SLA →</button></div>
    <p class="today-counts"><span class="badge badge--${open.late ? 'bad' : 'good'}">${num(open.late)} đã trễ</span> <span class="badge badge--${open.soon ? 'warn' : 'good'}">${num(open.soon)} sắp trễ</span> <span class="muted">${num(open.total)} data chưa xong tháng này</span></p>
    ${list.length ? html`<div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col">Retailer</th><th scope="col">Ngày tạo</th><th scope="col">Tình trạng</th><th scope="col" class="right">Đã qua</th><th scope="col">Hạn SLA</th></tr></thead>
      <tbody>${list.map((x) => html`<tr class="static"><td class="num">${x.r.retailer || '—'}</td><td class="num">${dmy(x.r.created)}</td><td>${x.r.status}</td><td class="right num">${x.elapsed} ngày</td>
        <td><span class="badge badge--${x.kind === 'late-open' ? 'bad' : 'warn'}">${x.left < 0 ? `Trễ ${-x.left} ngày` : x.left === 0 ? 'Hết hạn hôm nay' : `Còn ${x.left} ngày`}</span></td></tr>`)}</tbody></table></div>
      ${rest > 0 ? html`<p class="muted">… và ${num(rest)} data khác chưa gần hạn.</p>` : ''}`
      : html`<p class="notice notice--good">Không có data nào trễ hoặc sắp trễ SLA. Tốt lắm! 🎉</p>`}</section>`;
}

function scoreCard(sc, hasScores) {
  if (!hasScores) return '';
  if (sc === null) return html`<section class="card"><h3 class="card__title">Chấm call gần đây</h3>${loading('kết quả chấm call')}</section>`;
  if (!sc.total) return html`<section class="card"><h3 class="card__title">Chấm call gần đây</h3><p class="muted">Chưa có call nào của bạn được chấm.</p></section>`;
  return html`<section class="card"><div class="card__head"><h3 class="card__title">Chấm call gần đây</h3><button class="link-btn" type="button" data-tab="callctl">Xem chi tiết →</button></div>
    <p class="today-counts"><span class="badge badge--${sc.quality.urgent ? 'bad' : 'good'}">${num(sc.quality.urgent)} cần chấn chỉnh</span> <span class="badge badge--${sc.quality.weak ? 'warn' : 'good'}">${num(sc.quality.weak)} chưa tốt</span> <span class="badge badge--good">${num(sc.quality.good)} tốt</span>
      <span class="muted">${num(sc.total)} call đã chấm${sc.avgScore != null ? ` · điểm TB ${sc.avgScore.toFixed(1).replace('.', ',')}` : ''}</span></p>
    <ul class="today-calls">${sc.recent.map((c) => html`<li class="today-call today-call--${c.level}"><div><strong>${dmy(c.date)}</strong> <span class="cs-verdict cs-verdict--${c.level}">${QUALITY[c.level].label}</span>${c.score ? html` <span class="cs-score">${'★'.repeat(c.score)}</span>` : ''}</div>
      ${c.preview ? html`<p class="muted">${c.preview}${c.preview.length >= 160 ? '…' : ''}</p>` : ''}</li>`)}</ul></section>`;
}

function controlCard(ctl) {
  if (ctl === undefined) return '';
  if (ctl === null) return html`<section class="card"><h3 class="card__title">Kiểm soát của bạn</h3>${loading('dữ liệu kiểm soát')}</section>`;
  if (!ctl.done) return html`<section class="card"><h3 class="card__title">Kiểm soát của bạn</h3><p class="muted">Chưa có data đã làm trong tháng để kiểm tra.</p></section>`;
  return html`<section class="card"><div class="card__head"><h3 class="card__title">Kiểm soát của bạn</h3><button class="link-btn" type="button" data-tab="control">Xem chi tiết →</button></div>
    <dl class="kv"><dt>Data đã làm</dt><dd class="num">${num(ctl.done)}</dd>
      <dt>Data cần rà lại</dt><dd class="num ${ctl.flagged ? 'is-bad' : ''}">${num(ctl.flagged)} <span class="muted">(${p1(ctl.errRate)})</span></dd>
      <dt>Đạt SLA</dt><dd class="num">${p1(ctl.slaRate)} ${ctl.slaCut ? html`<span class="badge badge--${ctl.slaCut >= 50 ? 'bad' : 'warn'}">trừ ${ctl.slaCut}%</span>` : ctl.slaCut === 0 ? html`<span class="badge badge--good">không trừ</span>` : ''}</dd></dl>
    ${ctl.top.length ? html`<p class="muted">Lỗi hay gặp:</p><ul class="today-top">${ctl.top.map((t) => html`<li>${t.label} <strong>${num(t.count)}</strong></li>`)}</ul>` : html`<p class="muted">Không có lỗi quy trình nào. 👍</p>`}</section>`;
}

/**
 * Trang "Hôm nay của tôi": mọi thứ nhân sự cần xem mỗi ngày trên một màn hình.
 * ctx: { found, report, todoItems, open, scores, hasScores, control, trend, month } — phần chưa tải xong là null.
 */
export function todayView({ found, report, todoItems, open, scores, hasScores, control, trend, month, me }) {
  if (!found) return html`<p class="notice">Chưa nhận ra bạn trong báo cáo KPI nên chưa dựng được trang riêng. Nhờ quản trị điền <strong>Đầu số</strong> cho tài khoản của bạn trong Thiết lập → Tài khoản.</p>`;
  const name = firstName(me?.name || found.member.name);
  return html`
    <div class="today-hero"><div><p class="muted">${todayText()}</p><h2 class="section-title">${GREETING()}, ${name}!</h2></div>
      <p class="muted">${found.team.name} · số liệu ${dayMonth(found.team.asOf)}</p></div>
    <div class="today-grid">
      ${kpiCard(found, report)}
      ${todoCard(todoItems)}
      ${trendCard(trend)}
      ${openCard(open)}
      ${scoreCard(scores, hasScores)}
      ${controlCard(control)}
    </div>`;
}
