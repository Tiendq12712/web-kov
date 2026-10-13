import { html } from '../dom.js';
import { pct, num, hm, dayMonth } from '../format.js';
import { summarize, combineTeams, projectedKpi, memberStatus, elapsedRatio, paceStatus } from '../metrics.js';
import { bar, badge, statusBadge, stackRow, legendList, rateCell } from './components.js';
import { teamCompare, chartCard, lineChart } from './charts.js';
import { contactDonut, sourceDonut, statusDonut } from './donuts.js';
import { heatClass, alertClass, heatLegend, alertLegend, mean } from './heat.js';
import { workdaysByCode } from '../report.js';

const sum = (list, pick) => list.reduce((a, m) => a + (pick(m) ?? 0), 0);
const ratio = (a, b) => (b ? a / b : 0);

/* ---------- Thẻ team ---------- */
const teamCard = (team, { all = false } = {}) => {
  const s = summarize(team);
  const body = html`
    <div class="card__head">
      <h3 class="card__title">${team.name}</h3>
      ${statusBadge(s.status)}
    </div>
    <p class="big num">${pct(s.kpi, 1)}</p>
    ${bar(s.kpi, { mark: s.elapsed, tone: s.status.key })}
    <dl class="kv">
      <dt>Thời gian đã qua</dt><dd class="num">${pct(s.elapsed)}</dd>
      <dt>Dự kiến cuối tháng</dt><dd class="num">${pct(projectedKpi(s.kpi, s.elapsed))}</dd>
      <dt>Điểm tổng</dt><dd class="num">${num(s.main.done)} / ${num(s.main.target)}</dd>
      <dt>Add-on</dt><dd class="num">${num(s.addon.done)} / ${num(s.addon.target)}</dd>
      <dt>Nhân sự</dt><dd>${s.count}</dd>
    </dl>`;
  return all
    ? html`<div class="card card--accent">${body}</div>`
    : html`<button class="card card--link" data-tab="${team.id}" type="button">${body}</button>`;
};

/* ---------- Các con số chính ---------- */
const stat = (title, value, sub) => html`
  <div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

function kpiStats(all, summary) {
  const m = all.members;
  const assigned = sum(m, (x) => x.extra.assigned), done = sum(m, (x) => x.extra.actDone);
  const open = sum(m, (x) => x.extra.doing) + sum(m, (x) => x.extra.notStarted);
  const count = (pick) => m.filter(pick).length;
  const slow = count((x) => memberStatus(x, all).key === 'bad');
  return [
    stat('Act đã làm', `${num(done)} / ${num(assigned)}`, `${pct(ratio(done, assigned), 1)} số act được phân công`),
    stat('Act còn tồn', num(open), `${num(sum(m, (x) => x.extra.doing))} đang làm · ${num(sum(m, (x) => x.extra.notStarted))} chưa làm`),
    stat('Điều kiện cần', pct(summary.need.rate, 1), `${num(summary.need.done)} / ${num(summary.need.target)} · ${count((x) => x.need.pass)}/${m.length} nhân sự đã đạt`),
    stat('Đạt talk time', `${count((x) => x.talk.pass)} / ${m.length}`, 'nhân sự đạt chỉ tiêu talk time'),
    stat('Nhân sự chậm tiến độ', `${slow} / ${m.length}`, `KPI dưới ${pct(0.7)} mức thời gian đã qua (${pct(summary.elapsed)})`),
  ];
}

/** Tổng số cuộc gọi đã làm = cộng các kết quả (không dùng cột "Tổng", có dòng bị trống). */
export const contactTotals = (contact) => {
  const outcomes = contact.labels.map((l, i) => i).filter((i) => contact.labels[i] !== 'Tổng');
  return {
    connected: sum(contact.groups, (g) => g.values[0]),
    attempts: sum(contact.groups, (g) => sum(outcomes, (i) => g.values[i])),
  };
};

function workStats(work) {
  if (!work) return [];
  const stats = [];
  if (work.contact) {
    const { connected, attempts } = contactTotals(work.contact);
    stats.push(stat('Kết nối thành công', pct(ratio(connected, attempts), 1), `${num(connected)} / ${num(attempts)} cuộc gọi của data đã làm`));
  }
  const cpa = work.callsPerAct;
  if (cpa) {
    const col = (label) => sum(cpa.members, (m) => m.values[cpa.labels.indexOf(label)]);
    stats.push(stat('TB call / ACT', num(ratio(col('Tổng cuộc gọi'), col('Tổng act'))), `${num(col('Tổng cuộc gọi'))} cuộc gọi · ${num(col('Tổng act'))} ACT`));
  }
  return stats;
}

function reportStats(report) {
  if (!report) return [];
  const m = report.members;
  return [
    stat('Call TB / người / ngày', num(mean(m.map((x) => x.calls ?? 0))), `${m.length} nhân sự có dữ liệu năng suất`),
    stat('Talktime TB / ngày', hm(mean(m.map((x) => x.talk ?? 0))), `${m.filter((x) => x.talkOk).length} / ${m.length} đạt chỉ tiêu`),
  ];
}

/* ---------- Biểu đồ ---------- */
const actParts = (members) => [
  { value: sum(members, (m) => m.extra.actDone), cls: 's2', label: 'Đã làm' },
  { value: sum(members, (m) => m.extra.doing), cls: 's1', label: 'Đang làm' },
  { value: sum(members, (m) => m.extra.notStarted), cls: 's4', label: 'Chưa làm' },
];
const ACT_LEGEND = [{ cls: 's2', label: 'Đã làm' }, { cls: 's1', label: 'Đang làm' }, { cls: 's4', label: 'Chưa làm' }];

const actStructure = (teams, all) => html`
  <div class="chart"><div class="stack-list">${[...teams, all].map((t) => {
    const parts = actParts(t.members);
    return stackRow(t.name, parts, pct(ratio(parts[0].value, sum(parts, (p) => p.value))));
  })}</div>${legendList(ACT_LEGEND)}</div>`;

const hourChart = (report) => lineChart({
  labels: report.hours.map((h) => h.replace('h', '')),
  series: [['nam', 's1'], ['bac', 's3']].filter(([r]) => report.averages[r]).map(([r, cls]) => ({ name: report.regions[r], cls, values: report.averages[r].hourly })),
  format: (v) => num(v),
});

/* ---------- Bảng tổng hợp toàn bộ nhân sự ---------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v ?? 0));

/** Kiểu "Thanh màu": con số kèm một thanh mảnh, màu theo mức so với tham chiếu (thời gian đã qua hoặc chỉ tiêu). */
const withBar = (inner, value, reference, { mark } = {}) => html`
  <div class="cell-bar">${inner}${bar(clamp01(value), { mark, tone: paceStatus(value, reference).key })}</div>`;

function memberRow({ team, member: m }, workdays, mode) {
  const elapsed = elapsedRatio(team.asOf);
  const status = memberStatus(m, team);
  const paint = mode === 'full' ? heatClass : mode === 'alert' ? alertClass : () => '';
  const bars = mode === 'bars';
  // `rate`: tỷ lệ so với thời gian đã qua; `inner`: nội dung ô.
  const rateCell_ = (inner, rate) => (bars ? withBar(inner, rate, elapsed, { mark: elapsed }) : inner);
  const cell = (value, heat = '') => html`<td class="right num ${heat}">${value}</td>`;
  const actRate = ratio(m.extra.actDone, m.extra.assigned);
  const talkRate = ratio(m.talk.actual, m.talk.target);
  const badgeFor = () => (mode === 'alert' && status.key !== 'bad' ? badge('neutral', status.label) : statusBadge(status));
  return html`
    <tr class="clickable" data-member="${team.id}:${m.code}" tabindex="0">
      <td class="sticky-col"><span class="person"><strong>${m.name}</strong><small>${m.code} · Level ${m.level ?? '—'}</small></span></td>
      <td>${team.name.replace('Team ', '')}</td>
      ${cell(rateCell_(pct(m.kpi, 1), m.kpi), paint(m.kpi, elapsed))}
      <td>${badgeFor()}</td>
      ${cell(rateCell_(rateCell(m.need), m.need.rate), paint(m.need.rate, elapsed))}
      ${cell(rateCell_(rateCell(m.main), m.main.rate), paint(m.main.rate, elapsed))}
      ${cell(rateCell_(rateCell(m.addon), m.addon.rate), paint(m.addon.rate, elapsed))}
      ${cell(rateCell_(`${num(m.extra.actDone)}/${num(m.extra.assigned)}`, actRate), paint(actRate, elapsed))}
      ${cell(bars ? withBar(`${hm(m.talk.actual)} / ${hm(m.talk.target)}`, talkRate, 1) : `${hm(m.talk.actual)} / ${hm(m.talk.target)}`, paint(m.talk.actual, m.talk.target))}
      ${cell(num(workdays.get(m.code) ?? m.extra.workdays))}
    </tr>`;
}

const HEAT_MODES = [['bars', 'Thanh màu'], ['alert', 'Ít màu'], ['full', 'Nhiều màu']];
const barLegend = () => html`
  <ul class="legend heat-legend" aria-label="Chú thích màu">
    <li><i class="swatch" style="background: var(--good-fill)"></i>Đạt tiến độ</li>
    <li><i class="swatch" style="background: var(--warn-fill)"></i>Cần đẩy</li>
    <li><i class="swatch" style="background: var(--bad-fill)"></i>Chậm</li>
    <li class="muted">Vạch đen = mức thời gian đã qua của tháng (talk time: chỉ tiêu)</li>
  </ul>`;

function memberTable(data, { filter, heat }, report) {
  const mode = HEAT_MODES.some(([id]) => id === heat) ? heat : 'bars';
  const workdays = report ? workdaysByCode(report) : new Map();
  const rows = data.teams.filter((t) => filter === 'all' || t.id === filter)
    .flatMap((team) => team.members.map((member) => ({ team, member })))
    .sort((a, b) => b.member.kpi - a.member.kpi);
  const legend = { bars: barLegend, alert: () => alertLegend('mức thời gian đã qua của tháng (talk time: chỉ tiêu)'), full: () => heatLegend('mức thời gian đã qua của tháng (talk time: chỉ tiêu)') }[mode]();
  return html`
    <section class="card">
      <div class="toolbar">
        <h2 class="section-title">Toàn bộ nhân sự</h2>
        <div class="chips" role="group" aria-label="Lọc theo team">
          ${[{ id: 'all', name: 'Tất cả' }, ...data.teams].map((t) => html`
            <button class="chip" type="button" data-filter="${t.id}" aria-pressed="${t.id === filter}">${t.name}</button>`)}
        </div>
      </div>
      <div class="toolbar">
        <p class="muted">Sắp theo KPI tổng. Bấm một dòng để xem chi tiết.</p>
        <div class="chips" role="group" aria-label="Kiểu tô màu">
          ${HEAT_MODES.map(([id, label]) => html`
            <button class="chip" type="button" data-heat="${id}" aria-pressed="${id === mode}">${label}</button>`)}
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="sticky-col">Nhân sự</th><th>Team</th><th class="right">KPI tổng</th><th>Tiến độ</th><th class="right">Điều kiện cần</th>
          <th class="right">Điểm tổng</th><th class="right">Add-on</th><th class="right">Act đã làm</th><th class="right">Talk time</th><th class="right">Ngày công</th></tr></thead>
        <tbody>${rows.map((row) => memberRow(row, workdays, mode))}</tbody>
      </table></div>
      ${legend}
    </section>`;
}

/** Trang Tổng quan: toàn cảnh KPI, công việc và năng suất; chi tiết từng team nằm ở các tab riêng. */
export function overviewView(data, ui, report) {
  const all = combineTeams(data.teams);
  const summary = summarize(all);
  const stats = [...kpiStats(all, summary), ...workStats(data.work), ...reportStats(report)];

  return html`
    <div class="grid">${teamCard(all, { all: true })}${data.teams.map((t) => teamCard(t))}</div>
    <p class="muted overview-note">Cập nhật ${data.teams.map((t) => `${t.name.replace('Team ', '')}: ${t.updatedTime} · ${dayMonth(t.asOf)}`).join(' — ')}. Bấm một team để xem chi tiết.</p>
    <div class="grid">${stats}</div>
    <div class="charts">
      ${chartCard('So sánh tỷ lệ hoàn thành giữa các team', teamCompare(data.teams, data.teams.map(summarize)))}
      ${chartCard('Cơ cấu act theo team', actStructure(data.teams, all), 'Đã làm / đang làm / chưa làm trên tổng act được phân công.')}
      ${data.work?.contact ? chartCard('Tình trạng kết nối', contactDonut(data.work.contact), 'Kết quả cuộc gọi của data đã làm, gộp các nhóm CSKH.') : ''}
      ${data.work?.dataBySource ? chartCard('Nguồn data (T15 · NA · OI)', sourceDonut(data.work), 'Số data được chia theo nhóm CSKH từ đầu tháng.') : ''}
      ${data.work?.status ? chartCard('Tình trạng xử lý', statusDonut(data.work), 'Đã làm / đang làm / chưa làm trên tổng data được chia.') : ''}
      ${report ? chartCard('Call TB theo khung giờ', hourChart(report), 'Số call trung bình mỗi người mỗi ngày trong từng khung giờ.') : ''}
    </div>
    ${memberTable(data, ui, report)}`;
}
