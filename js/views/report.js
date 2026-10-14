import { timesheetView } from './timesheet.js';
import { html } from '../dom.js';
import { num, pct, hm } from '../format.js';
import { bar, badge } from './components.js';
import { chartCard, groupedColumns, lineChart } from './charts.js';
import { heatClass, heatLegend, mean } from './heat.js';

/** Chỉ số xu hướng theo tuần: cách lấy giá trị và định dạng. */
const WEEK_METRICS = {
  calls: { label: 'Tổng call / ngày', pick: (m) => m.calls, format: (v) => num(v) },
  talk: { label: 'Talktime / ngày (phút)', pick: (m) => m.talk / 60, format: (v) => `${Math.round(v)}p` },
  rate: { label: 'Tỉ lệ kết nối', pick: (m) => m.rate, format: (v) => pct(v) },
};
/** Chỉ số của bảng theo ngày. */
const DAY_METRICS = {
  calls: { label: 'Số call', pick: (d) => d.calls, format: (v) => num(v) },
  success: { label: 'Call kết nối', pick: (d) => d.success, format: (v) => num(v) },
  talk: { label: 'Talktime', pick: (d) => d.talk, format: (v) => hm(v) },
};
const REGION_CLASS = { nam: 's1', bac: 's3' };
const REGION_SHORT = { nam: 'Miền Nam', bac: 'Miền Bắc' };

const inRegion = (report, region) => report.members.filter((m) => region === 'all' || m.region === region);
const regionKeys = (region) => (region === 'all' ? ['nam', 'bac'] : [region]);
const context = (report, names) => ({ report, nameOf: (m) => names.get(m.code) ?? m.name });
const shortName = (name) => name.split(' ').slice(-2).join(' ');
const byName = (c) => (a, b) => c.nameOf(a).localeCompare(c.nameOf(b), 'vi');
const lastDay = (report, members) =>
  Math.max(0, ...members.flatMap((m) => (report.days[m.code] ?? []).map((d) => d.day)));

/** Mức tham chiếu để tô màu: trung bình của nhóm đang xem. */
const referenceOf = (members) => ({
  calls: mean(members.map((m) => m.calls ?? 0)),
  success: mean(members.map((m) => m.success ?? 0)),
  rate: mean(members.map((m) => m.rate ?? 0)),
});

/* ---------- Bảng nhân sự ---------- */
const COLUMNS = {
  name: { label: 'Nhân sự', sticky: true, sort: (m, c) => c.nameOf(m), cell: (m, c) => html`<span class="person"><strong>${c.nameOf(m)}</strong><small>${m.code}</small></span>` },
  region: { label: 'Khu vực', sort: (m) => m.region, cell: (m) => REGION_SHORT[m.region] },
  level: { label: 'Level', num: true, sort: (m) => m.level, cell: (m) => m.level ?? '—' },
  workdays: { label: 'Ngày công', num: true, sort: (m) => m.workdays, cell: (m) => num(m.workdays) },
  calls: { label: 'Call/ngày', num: true, sort: (m) => m.calls, cell: (m) => num(m.calls), heat: (m, ref) => heatClass(m.calls, ref.calls) },
  success: { label: 'Kết nối/ngày', num: true, sort: (m) => m.success, cell: (m) => num(m.success), heat: (m, ref) => heatClass(m.success, ref.success) },
  rate: { label: 'Tỉ lệ kết nối', num: true, sort: (m) => m.rate, cell: (m) => pct(m.rate, 1), heat: (m, ref) => heatClass(m.rate, ref.rate) },
  talk: { label: 'Talktime TB', num: true, sort: (m) => m.talk, cell: (m) => hm(m.talk), heat: (m) => heatClass(m.talk, m.kpiTalk) },
  kpiTalk: { label: 'KPI talktime', num: true, sort: (m) => m.kpiTalk, cell: (m) => hm(m.kpiTalk) },
  result: { label: 'Kết quả', sort: (m) => Number(m.talkOk), cell: (m) => badge(m.talkOk ? 'good' : 'bad', m.talkOk ? 'Đạt' : 'Không đạt') },
  talkPerCall: { label: 'Talktime/call', num: true, sort: (m) => m.talkPerCall, cell: (m) => `${m.talkPerCall ?? '—'}s` },
};
const KEYS = Object.keys(COLUMNS);

const sorted = (members, { key, dir }, c) => {
  const col = COLUMNS[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...members].sort((a, b) => {
    const x = col.sort(a, c) ?? -Infinity, y = col.sort(b, c) ?? -Infinity;
    return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * sign;
  });
};

export const reportRowsView = (report, ui, names) => {
  const c = context(report, names);
  const group = inRegion(report, ui.region);
  const ref = referenceOf(group);
  const q = ui.query.trim().toLowerCase();
  const members = group.filter((m) => !q || `${c.nameOf(m)} ${m.code}`.toLowerCase().includes(q));
  return sorted(members, ui.sort, c).map((m) => html`
    <tr class="clickable" data-rmember="${m.code}" tabindex="0">
      ${KEYS.map((k) => {
        const col = COLUMNS[k];
        return html`<td class="${col.num ? 'right num' : ''} ${col.sticky ? 'sticky-col' : ''} ${col.heat?.(m, ref) ?? ''}">${col.cell(m, c)}</td>`;
      })}
    </tr>`);
};

/* ---------- Thẻ tổng hợp ---------- */
const stat = (title, value, sub) => html`
  <div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

const cards = (members) => {
  const calls = mean(members.map((m) => m.calls ?? 0));
  const success = mean(members.map((m) => m.success ?? 0));
  const passed = members.filter((m) => m.talkOk).length;
  return html`
    <div class="grid">
      ${stat('Tổng call TB / người / ngày', num(calls), `${members.length} nhân sự`)}
      ${stat('Call kết nối TB / ngày', num(success), `Tỉ lệ ${pct(calls ? success / calls : 0, 1)}`)}
      ${stat('Talktime TB / ngày', hm(mean(members.map((m) => m.talk ?? 0))), `Talktime/call ${Math.round(mean(members.map((m) => m.talkPerCall ?? 0)))}s`)}
      ${stat('Đạt KPI talktime', `${passed}/${members.length}`, `${pct(members.length ? passed / members.length : 0)} nhân sự đạt`)}
    </div>`;
};

/* ---------- Biểu đồ ---------- */
const hourChart = (report, region) => lineChart({
  labels: report.hours.map((h) => h.replace('h', '')),
  series: regionKeys(region).map((r) => ({ name: report.regions[r], cls: REGION_CLASS[r], values: report.averages[r].hourly })),
  format: (v) => num(v),
});

const talkRanking = (members, c) => {
  const rows = [...members].sort((a, b) => b.talk - a.talk);
  const max = Math.max(...rows.flatMap((m) => [m.talk, m.kpiTalk ?? 0]), 1);
  return html`
    <ol class="rank">${rows.map((m, i) => html`
      <li class="rank__item rank__item--static">
        <span class="muted num">${i + 1}</span>
        <span class="rank__name" title="${c.nameOf(m)} (${m.code})">${c.nameOf(m)} <small class="muted">${m.code}</small></span>
        ${bar(m.talk / max, { mark: (m.kpiTalk ?? 0) / max, tone: m.talkOk ? 'good' : 'bad' })}
        <strong class="num">${hm(m.talk)}</strong>
      </li>`)}</ol>`;
};

/** Call TB mỗi người làm việc theo từng ngày, theo khu vực. */
const dailyTrend = (report, members, region) => {
  const worked = (day) => members.some((m) => report.days[m.code]?.find((d) => d.day === day)?.calls);
  const days = Array.from({ length: lastDay(report, members) }, (_, i) => i + 1).filter(worked);   // bỏ ngày không ai làm
  return lineChart({
    labels: days.map(String),
    series: regionKeys(region).map((r) => ({
      name: report.regions[r], cls: REGION_CLASS[r],
      values: days.map((day) => mean(members.filter((m) => m.region === r)
        .map((m) => report.days[m.code]?.find((d) => d.day === day)?.calls).filter(Boolean))),
    })),
    format: (v) => num(v),
  });
};

const memberCalls = (members, c) => {
  const rows = [...members].sort((a, b) => b.calls - a.calls);
  const avg = mean(rows.map((m) => m.calls ?? 0));
  return groupedColumns({
    categories: rows.map((m) => shortName(c.nameOf(m))),
    series: [{ name: 'Call/ngày', cls: 's1', values: rows.map((m) => m.calls ?? 0) }, { name: 'Kết nối/ngày', cls: 's2', values: rows.map((m) => m.success ?? 0) }],
    line: avg, lineLabel: `TB ${num(avg)}`, ratio: false, format: (v) => num(v),
  });
};

const weekChart = (report, region, metricKey) => {
  const metric = WEEK_METRICS[metricKey];
  return report.weeks.length ? lineChart({
    labels: report.weeks.map((w) => w.label.replace(/\s*\(.*\)/, '')),
    series: regionKeys(region).map((r) => ({
      name: report.regions[r], cls: REGION_CLASS[r], values: report.weeks.map((w) => metric.pick(w.averages[r] ?? {})),
    })),
    format: metric.format,
  }) : html`<p class="muted">Chưa có dữ liệu theo tuần.</p>`;
};

/** Bản đồ nhiệt: nhân sự × khung giờ (call TB/ngày), tô theo mức TB các khung giờ có call. */
const hourHeatmap = (report, members, c) => {
  const reference = mean(members.flatMap((m) => m.hourly).filter((v) => v > 0));
  return html`
    <div class="table-wrap"><table class="heat-table">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${report.hours.map((h) => html`<th scope="col">${h.replace('h', '')}</th>`)}</tr></thead>
      <tbody>${[...members].sort(byName(c)).map((m) => html`<tr class="static">
        <td class="sticky-col"><span class="person"><strong>${c.nameOf(m)}</strong><small>${m.code}</small></span></td>
        ${m.hourly.map((v) => html`<td class="num ${v ? heatClass(v, reference) : 'muted'}">${v ? num(v) : '·'}</td>`)}</tr>`)}</tbody>
    </table></div>
    ${heatLegend('trung bình các khung giờ có call')}`;
};

/* ---------- Bảng theo ngày: nhân sự bên trái, cột là ngày ---------- */
function dailyTable(report, ui, c) {
  const members = [...inRegion(report, ui.region)].sort(byName(c));
  const metric = DAY_METRICS[ui.dayMetric];
  const days = Array.from({ length: lastDay(report, members) }, (_, i) => i + 1);
  const valueOf = (m, day) => {
    const d = report.days[m.code]?.find((x) => x.day === day);
    return d && d.calls ? metric.pick(d) ?? 0 : null;
  };
  const grid = members.map((m) => days.map((day) => valueOf(m, day)));
  const present = (list) => list.filter((v) => v != null);
  const sum = (list) => present(list).reduce((a, b) => a + b, 0);
  const avg = (list) => (present(list).length ? sum(list) / present(list).length : null);
  const tableMean = mean(present(grid.flat()));
  // Talktime so với chỉ tiêu của từng người; số call/kết nối so với trung bình cả bảng.
  const heat = (v, m) => heatClass(v, ui.dayMetric === 'talk' ? m.kpiTalk : tableMean);
  const cell = (v, klass = '') => html`<td class="right num ${klass} ${v == null ? 'muted' : ''}">${v == null ? '—' : metric.format(v)}</td>`;
  const column = (i) => grid.map((row) => row[i]);

  return html`
    <div class="toolbar">
      <h2 class="section-title">Thống kê theo ngày</h2>
      <div class="chips" role="group" aria-label="Chỉ số theo ngày">
        ${Object.entries(DAY_METRICS).map(([k, m]) => html`
          <button class="chip" type="button" data-daymetric="${k}" aria-pressed="${k === ui.dayMetric}">${m.label}</button>`)}
      </div>
    </div>
    <div class="table-wrap"><table class="day-table">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>
        ${days.map((d) => html`<th scope="col" class="right">${d}</th>`)}
        <th scope="col" class="right">Tổng</th><th scope="col" class="right">TB/ngày</th></tr></thead>
      <tbody>${members.map((m, r) => html`
        <tr class="static"><td class="sticky-col"><span class="person"><strong>${c.nameOf(m)}</strong><small>${m.code}</small></span></td>
          ${grid[r].map((v) => cell(v, heat(v, m)))}
          ${cell(present(grid[r]).length ? sum(grid[r]) : null)}${cell(avg(grid[r]), heat(avg(grid[r]), m))}</tr>`)}</tbody>
      <tfoot>
        <tr><td class="sticky-col">Tổng team</td>${days.map((_, i) => cell(present(column(i)).length ? sum(column(i)) : null))}
          ${cell(sum(grid.flat()))}${cell(null)}</tr>
        <tr><td class="sticky-col">TB / người</td>${days.map((_, i) => cell(avg(column(i))))}${cell(null)}${cell(avg(grid.map((row) => avg(row))))}</tr>
      </tfoot>
    </table></div>
    ${heatLegend(ui.dayMetric === 'talk' ? 'chỉ tiêu talktime của từng người' : 'trung bình các ô trong bảng')}`;
}

/* ---------- Trang báo cáo ---------- */
export function reportView(report, ui, names) {
  const c = context(report, names);
  const members = inRegion(report, ui.region);
  const ariaSort = (k) => (ui.sort.key === k ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  return html`
    <div class="toolbar">
      <h2 class="section-title">Báo cáo năng suất</h2>
      <div class="chips" role="group" aria-label="Lọc theo khu vực">
        ${[['all', 'Tất cả'], ['nam', report.regions.nam], ['bac', report.regions.bac]].map(([id, label]) => html`
          <button class="chip" type="button" data-region="${id}" aria-pressed="${id === ui.region}">${label}</button>`)}
      </div>
    </div>
    ${cards(members)}
    <div class="charts">
      ${chartCard('Cuộc gọi trung bình theo khung giờ', hourChart(report, ui.region), 'Số call TB mỗi ngày trong từng khung giờ.')}
      ${chartCard('Talktime so với KPI', talkRanking(members, c), 'Vạch đen là chỉ tiêu talktime của từng người; xanh = đạt, đỏ = chưa đạt.')}
      ${chartCard('Xu hướng call theo ngày', dailyTrend(report, members, ui.region), 'Call TB của mỗi người có làm việc trong ngày.')}
      ${chartCard('Call theo nhân sự', memberCalls(members, c), 'Đường nét đứt là mức trung bình của nhóm.')}
    </div>
    ${chartCard('Bản đồ nhiệt: khung giờ làm việc', hourHeatmap(report, members, c), 'Ô xanh đậm là khung giờ năng suất cao, đỏ là thấp; “·” là không có call.')}
    ${chartCard('Xu hướng theo tuần', html`
      <div class="toolbar"><label class="muted" for="week-metric">Chỉ số</label>
        <select id="week-metric" class="select">${Object.entries(WEEK_METRICS).map(([k, m]) =>
          html`<option value="${k}" ${k === ui.weekMetric ? 'selected' : ''}>${m.label}</option>`)}</select></div>
      ${weekChart(report, ui.region, ui.weekMetric)}`)}
    ${dailyTable(report, ui, c)}
    <div class="toolbar">
      <h2 class="section-title">Chi tiết nhân sự</h2>
      <input class="search" id="report-search" type="search" placeholder="Tìm theo tên hoặc mã…" value="${ui.query}" aria-label="Tìm nhân sự" autocomplete="off">
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${KEYS.map((k) => html`
        <th scope="col" class="${COLUMNS[k].num ? 'right' : ''}" aria-sort="${ariaSort(k)}"><button type="button" data-rsort="${k}">${COLUMNS[k].label}</button></th>`)}</tr></thead>
      <tbody id="report-rows">${reportRowsView(report, ui, names)}</tbody>
    </table></div>
    ${heatLegend('trung bình nhóm (call, kết nối, tỉ lệ) và chỉ tiêu talktime')}`;
}

/** Ngăn chi tiết: biểu đồ và bảng theo ngày của một nhân sự. */
export function reportDetailView(report, code, names) {
  const m = report.members.find((x) => x.code === code);
  const c = context(report, names);
  const days = report.days[code] ?? [];
  return html`
    <div class="drawer__body">
      <div class="drawer__head">
        <div><h2 class="section-title">${c.nameOf(m)}</h2>
          <p class="muted">${m.code} · Level ${m.level ?? '—'} · ${report.regions[m.region]} · ${num(m.workdays)} ngày công</p></div>
        <button class="icon-btn" type="button" data-close aria-label="Đóng">✕</button>
      </div>
      <div class="card"><div class="card__head"><h3 class="card__title">Talktime TB / ngày</h3>${badge(m.talkOk ? 'good' : 'bad', m.talkOk ? 'Đạt' : 'Không đạt')}</div>
        <p class="big num">${hm(m.talk)}</p><p class="muted">Chỉ tiêu ${hm(m.kpiTalk)} · ${num(m.calls)} call/ngày · kết nối ${pct(m.rate, 1)}</p></div>
      ${timesheetView(report, code)}
      ${days.length ? chartCard('Call theo ngày', groupedColumns({
        categories: days.map((d) => String(d.day)),
        series: [{ name: 'Tổng call', cls: 's1', values: days.map((d) => d.calls) }, { name: 'Kết nối', cls: 's2', values: days.map((d) => d.success ?? 0) }],
        ratio: false, format: (v) => num(v),
      })) : ''}
      ${days.length ? html`<div class="table-wrap"><table>
        <thead><tr><th>Ngày</th><th class="right">Call</th><th class="right">Kết nối</th><th class="right">Tỉ lệ</th><th class="right">Talktime</th><th class="right">Công</th></tr></thead>
        <tbody>${days.map((d) => html`<tr class="static"><td>${d.day}</td><td class="right num">${d.calls}</td><td class="right num">${d.success ?? '—'}</td>
          <td class="right num">${d.rate == null ? '—' : pct(d.rate)}</td><td class="right num">${hm(d.talk)}</td><td class="right num">${d.work}</td></tr>`)}</tbody>
      </table></div>` : html`<p class="muted">Chưa có dữ liệu theo ngày.</p>`}
    </div>`;
}
