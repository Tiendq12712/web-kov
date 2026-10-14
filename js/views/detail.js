import { html } from '../dom.js';
import { pct, num, hm } from '../format.js';
import { memberStatus, elapsedRatio } from '../metrics.js';
import { meter, statusBadge, passBadge } from './components.js';
import { timesheetView } from './timesheet.js';

const section = (title, b, extra = '') => html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">${title}</h3>${extra}</div>
    ${meter('Hoàn thành', b.rate)}
    <dl class="kv">
      <dt>Thực đạt</dt><dd class="num">${num(b.done)}</dd>
      <dt>Mục tiêu</dt><dd class="num">${num(b.target)}</dd>
      <dt>Còn thiếu</dt><dd class="num">${num(b.missing)}</dd>
    </dl>
  </section>`;

const EXTRA_LABELS = [
  ['assigned', 'Act đã phân công', num], ['actDone', 'Act đã làm', num], ['doing', 'Act đang làm', num],
  ['notStarted', 'Data chưa làm', num], ['avgPerDay', 'TB act/ngày', num], ['progress', 'Tiến độ so với yêu cầu', pct],
  ['impactRate', 'Tỉ lệ impact', pct], ['workdays', 'Ngày công làm', num],
];

/** `workdays`: ngày công từ file năng suất (nếu đã tải), thay cho số trong bảng KPI. */
export function detailView(team, m, workdays, report) {
  const status = memberStatus(m, team);
  const extra = workdays == null ? m.extra : { ...m.extra, workdays };
  const extras = EXTRA_LABELS.filter(([key]) => extra[key] != null);
  return html`
    <div class="drawer__body">
      <div class="drawer__head">
        <div>
          <h2 class="section-title">${m.name}</h2>
          <p class="muted">${m.code} · ${m.role} · Level ${m.level ?? '—'} · ${team.name}</p>
        </div>
        <button class="icon-btn" type="button" data-close aria-label="Đóng">✕</button>
      </div>
      <div class="card">
        <div class="card__head"><h3 class="card__title">KPI tổng</h3>${statusBadge(status)}</div>
        <p class="big num">${pct(m.kpi, 1)}</p>
        <p class="muted">Thời gian đã qua của tháng: ${pct(elapsedRatio(team.asOf))}</p>
      </div>
      ${section('Điều kiện cần', m.need)}
      ${section('Điểm tổng (70%)', m.main)}
      ${section('Add-on (30%)', m.addon)}
      ${m.talk ? html`
        <section class="card">
          <div class="card__head"><h3 class="card__title">Talk time</h3>${passBadge(m.talk.pass)}</div>
          <dl class="kv"><dt>Thực đạt</dt><dd class="num">${hm(m.talk.actual)}</dd><dt>Mục tiêu</dt><dd class="num">${hm(m.talk.target)}</dd></dl>
        </section>` : ''}
      ${timesheetView(report, m.code)}
      <dl class="kv card">${extras.map(([k, label, fmt]) => html`<dt>${label}</dt><dd class="num">${fmt(extra[k])}</dd>`)}</dl>
    </div>`;
}
