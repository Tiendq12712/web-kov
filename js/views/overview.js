import { html, raw } from '../dom.js';
import { pct, num, hm, dayMonth } from '../format.js';
import { summarize, combineTeams, projectedKpi, memberStatus, elapsedRatio, paceStatus } from '../metrics.js';
import { bar, badge, statusBadge, stackRow, legendList, rateCell, updatedBanner } from './components.js';
import { teamCompare, chartCard, lineChart } from './charts.js';
import { contactDonut, sourceDonut, statusDonut } from './donuts.js';
import { heatClass, alertClass, heatLegend, alertLegend, mean } from './heat.js';
import { workdaysByCode } from '../report.js';
import { findMember } from '../welcome.js';
import { computeSla } from '../sla.js';

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

const MEDALS = ['🥇', '🥈', '🥉'];

function memberRow({ team, member: m }, workdays, mode, podium) {
  const rank = podium.indexOf(m.kpi);   // 0, 1, 2 = top 1, 2, 3; -1 = ngoài top
  const elapsed = elapsedRatio(team.asOf);
  const status = memberStatus(m, team);
  const paint = mode === 'full' || mode === 'text' ? heatClass : mode === 'alert' ? alertClass : () => '';
  const bars = mode === 'bars';
  // `rate`: tỷ lệ so với thời gian đã qua; `inner`: nội dung ô.
  const rateCell_ = (inner, rate) => (bars ? withBar(inner, rate, elapsed, { mark: elapsed }) : inner);
  const cell = (value, heat = '') => html`<td class="right num ${heat}">${value}</td>`;
  const actRate = ratio(m.extra.actDone, m.extra.assigned);
  const talkRate = ratio(m.talk.actual, m.talk.target);
  const badgeFor = () => (mode === 'alert' && status.key !== 'bad' ? badge('neutral', status.label) : statusBadge(status));
  return html`
    <tr class="clickable" data-member="${team.id}:${m.code}" tabindex="0">
      <td class="sticky-col ${rank >= 0 ? `top top--${rank + 1}` : ''}"><span class="person"><strong>${rank >= 0 ? html`<span class="medal" role="img" aria-label="Top ${rank + 1} KPI tổng" title="Top ${rank + 1} KPI tổng">${MEDALS[rank]}</span> ` : ''}${m.name}</strong><small>${m.code} · Level ${m.level ?? '—'}${rank >= 0 ? ` · Top ${rank + 1} KPI` : ''}</small></span></td>
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

function fullRow({ team, member: m }, workdays, mode, podium) {
  const rank = podium.indexOf(m.kpi);
  const elapsed = elapsedRatio(team.asOf);
  const status = memberStatus(m, team);
  const paint = mode === 'full' || mode === 'text' ? heatClass : mode === 'alert' ? alertClass : () => '';
  const bars = mode === 'bars';
  const badgeFor = () => (mode === 'alert' && status.key !== 'bad' ? badge('neutral', status.label) : statusBadge(status));
  const cells = METRICS.flatMap(([, , read]) => {
    const x = read(m);
    const fmt = x.time ? hm : num;
    const missing = missingOf(x);
    const rateRef = x.time ? 1 : elapsed;
    return [
      html`<td class="right num grp">${fmt(x.target)}</td>`,
      html`<td class="right num strong">${fmt(x.done)}</td>`,
      html`<td class="right num ${missing ? '' : 'is-done'}">${missing ? fmt(missing) : '✓'}</td>`,
      html`<td class="right num ${paint(x.rate, rateRef)}">${bars ? withBar(pct(x.rate), x.rate, rateRef, { mark: rateRef }) : pct(x.rate)}</td>`,
    ];
  });
  return html`
    <tr class="clickable" data-member="${team.id}:${m.code}" tabindex="0">
      <td class="sticky-col ${rank >= 0 ? `top top--${rank + 1}` : ''}"><span class="person"><strong>${rank >= 0 ? html`<span class="medal" role="img" aria-label="Top ${rank + 1} KPI tổng" title="Top ${rank + 1} KPI tổng">${MEDALS[rank]}</span> ` : ''}${m.name}</strong><small>${m.code} · Level ${m.level ?? '—'}${rank >= 0 ? ` · Top ${rank + 1} KPI` : ''}</small></span></td>
      <td>${team.name.replace('Team ', '')}</td>
      <td class="right num ${paint(m.kpi, elapsed)}">${bars ? withBar(pct(m.kpi, 1), m.kpi, elapsed, { mark: elapsed }) : pct(m.kpi, 1)}</td>
      <td>${badgeFor()}</td>
      ${cells}
      <td class="right num grp">${num(workdays.get(m.code) ?? m.extra.workdays)}</td>
    </tr>`;
}

const sortHead = (key, label, osort, cls = '', extra = '') => html`
  <th scope="col" ${extra ? raw(extra) : ''} class="${cls}" aria-sort="${osort.key === key ? (osort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-osort="${key}">${label}</button></th>`;

/** Đầu bảng "Đầy đủ": hàng 1 là tên chỉ số (gộp 4 cột), hàng 2 là KPI / Thực đạt / Còn thiếu / Tỉ lệ. */
const fullHead = (osort) => html`
  <tr>
    ${sortHead('name', 'Nhân sự', osort, 'sticky-col', 'rowspan="2"')}${sortHead('team', 'Team', osort, '', 'rowspan="2"')}
    ${sortHead('kpi', 'KPI tổng', osort, 'right', 'rowspan="2"')}${sortHead('status', 'Tiến độ', osort, '', 'rowspan="2"')}
    ${METRICS.map(([, label]) => html`<th scope="colgroup" colspan="4" class="group-head">${label}</th>`)}
    ${sortHead('workdays', 'Ngày công', osort, 'right grp', 'rowspan="2"')}
  </tr>
  <tr>${METRICS.map(([id]) => SUBS.map(([sub, label], i) => sortHead(`${id}_${sub}`, label, osort, `right sub-head ${i === 0 ? 'grp' : ''}`)))}</tr>`;

const HEAT_MODES = [['bars', 'Thanh màu'], ['alert', 'Ít màu'], ['full', 'Nhiều màu'], ['text', 'Màu chữ']];
const barLegend = () => html`
  <ul class="legend heat-legend" aria-label="Chú thích màu">
    <li><i class="swatch" style="background: var(--good-fill)"></i>Đạt tiến độ</li>
    <li><i class="swatch" style="background: var(--warn-fill)"></i>Cần đẩy</li>
    <li><i class="swatch" style="background: var(--bad-fill)"></i>Chậm</li>
    <li class="muted">Vạch đen = mức thời gian đã qua của tháng (talk time: chỉ tiêu)</li>
  </ul>`;

/** Bộ lọc theo tình trạng của bảng nhân sự (chọn một). */
export const MEMBER_FILTERS = [
  ['all', 'Tất cả', () => true],
  ['good', 'Đạt tiến độ', ({ team, member }) => memberStatus(member, team).key === 'good'],
  ['warn', 'Cần đẩy', ({ team, member }) => memberStatus(member, team).key === 'warn'],
  ['bad', 'Chậm', ({ team, member }) => memberStatus(member, team).key === 'bad'],
  ['need', 'Chưa đạt ĐK cần', ({ member }) => member.need.pass === false],
  ['talk', 'Chưa đạt talk time', ({ member }) => member.talk.pass === false],
];
const plainText = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Cột của bảng nhân sự: nhãn, cách lấy giá trị để sắp xếp (chuỗi hoặc số). */
const MEMBER_COLUMNS = [
  { key: 'name', label: 'Nhân sự', sticky: true, align: '', value: ({ member }) => member.name },
  { key: 'team', label: 'Team', align: '', value: ({ team }) => team.name },
  { key: 'kpi', label: 'KPI tổng', value: ({ member }) => member.kpi },
  { key: 'status', label: 'Tiến độ', align: '', value: ({ team, member }) => ratio(member.kpi, elapsedRatio(team.asOf)) },
  { key: 'need', label: 'Điều kiện cần', value: ({ member }) => member.need.rate },
  { key: 'main', label: 'Điểm tổng', value: ({ member }) => member.main.rate },
  { key: 'addon', label: 'Add-on', value: ({ member }) => member.addon.rate },
  { key: 'act', label: 'Act đã làm', value: ({ member }) => ratio(member.extra.actDone, member.extra.assigned) },
  { key: 'talk', label: 'Talk time', value: ({ member }) => ratio(member.talk.actual, member.talk.target) },
  { key: 'workdays', label: 'Ngày công', value: ({ member }, workdays) => workdays.get(member.code) ?? member.extra.workdays },
].map((c) => ({ align: 'right', ...c }));
/** Bảng "Đầy đủ": mỗi chỉ số tách thành KPI (chỉ tiêu) | Thực đạt | Còn thiếu | Tỉ lệ. */
const METRICS = [
  ['need', 'Điều kiện cần', (m) => ({ target: m.need.target, done: m.need.done, rate: m.need.rate })],
  ['main', 'Điểm tổng', (m) => ({ target: m.main.target, done: m.main.done, rate: m.main.rate })],
  ['addon', 'Add-on', (m) => ({ target: m.addon.target, done: m.addon.done, rate: m.addon.rate })],
  ['act', 'Act', (m) => ({ target: m.extra.assigned, done: m.extra.actDone, rate: ratio(m.extra.actDone, m.extra.assigned) })],
  ['talk', 'Talk time', (m) => ({ target: m.talk.target, done: m.talk.actual, rate: ratio(m.talk.actual, m.talk.target), time: true })],
];
const SUBS = [['target', 'KPI'], ['done', 'Thực đạt'], ['missing', 'Còn thiếu'], ['rate', 'Tỉ lệ']];
const missingOf = (x) => Math.max((x.target ?? 0) - (x.done ?? 0), 0);
const FULL_SORT = METRICS.flatMap(([id, , read]) => SUBS.map(([sub]) => ({
  key: `${id}_${sub}`, value: ({ member }) => { const x = read(member); return sub === 'missing' ? missingOf(x) : x[sub]; },
})));
const SORT_COLUMNS = [...MEMBER_COLUMNS, ...FULL_SORT];
const sortValue = (v) => (v == null || Number.isNaN(v) ? -Infinity : v);

/** Các dòng sau khi lọc theo team, tình trạng và ô tìm kiếm (tên/mã), rồi sắp theo cột đang chọn. */
const filteredRows = (data, { filter, mstatus = 'all', mquery = '', osort = { key: 'kpi', dir: 'desc' } }, workdays = new Map()) => {
  const byStatus = MEMBER_FILTERS.find(([id]) => id === mstatus)?.[2] ?? (() => true);
  const q = plainText(mquery).trim();
  return data.teams.filter((t) => filter === 'all' || t.id === filter)
    .flatMap((team) => team.members.map((member) => ({ team, member })))
    .filter((row) => byStatus(row) && (!q || plainText(`${row.member.name} ${row.member.code}`).includes(q)))
    .sort((a, b) => {
      const col = SORT_COLUMNS.find((c) => c.key === osort.key) ?? MEMBER_COLUMNS[2];
      const x = col.value(a, workdays), y = col.value(b, workdays);
      const diff = typeof x === 'string' ? x.localeCompare(y, 'vi') : sortValue(x) - sortValue(y);
      return osort.dir === 'asc' ? diff : -diff;
    });
};

export function memberRowsView(data, ui, report) {
  const mode = HEAT_MODES.some(([id]) => id === ui.heat) ? ui.heat : 'bars';
  const workdays = report ? workdaysByCode(report) : new Map();
  const rows = filteredRows(data, ui, workdays);
  // Top 3 KPI tổng của toàn bộ Online (người bằng điểm cùng hạng), không đổi theo bộ lọc.
  const podium = [...new Set(data.teams.flatMap((t) => t.members.map((m) => m.kpi ?? 0)).filter((k) => k > 0))].sort((a, b) => b - a).slice(0, 3);
  const full = ui.tview === 'full';
  return rows.length ? html`${rows.map((row) => (full ? fullRow : memberRow)(row, workdays, mode, podium))}`
    : html`<tr class="static"><td colspan="${full ? 25 : 10}" class="muted">Không có nhân sự nào khớp bộ lọc.</td></tr>`;
}

function memberTable(data, ui, report) {
  const { filter, heat, mstatus = 'all', mquery = '' } = ui;
  const mode = HEAT_MODES.some(([id]) => id === heat) ? heat : 'bars';
  const total = data.teams.filter((t) => filter === 'all' || t.id === filter).reduce((n, t) => n + t.members.length, 0);
  const workdays = report ? workdaysByCode(report) : new Map();
  const shown = filteredRows(data, ui, workdays).length;
  const osort = ui.osort ?? { key: 'kpi', dir: 'desc' };
  const legend = { bars: barLegend, alert: () => alertLegend('mức thời gian đã qua của tháng (talk time: chỉ tiêu)'), full: () => heatLegend('mức thời gian đã qua của tháng (talk time: chỉ tiêu)'), text: () => heatLegend('mức thời gian đã qua của tháng (talk time: chỉ tiêu)') }[mode]();
  const view = ui.tview === 'full' ? 'full' : 'compact';
  const filtered = filter !== 'all' || mstatus !== 'all' || mquery.trim() !== '';
  const option = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
  return html`
    <section class="card">
      <div class="toolbar">
        <h2 class="section-title">Toàn bộ nhân sự</h2>
        <p class="muted" id="member-count">Hiển thị ${shown}/${total} nhân sự</p>
      </div>
      <div class="filters" role="search" aria-label="Lọc nhân sự">
        <label class="filter filter--grow"><span>Tìm</span>
          <input id="member-search" class="search" type="search" placeholder="Tên hoặc mã nhân sự…" value="${mquery}" autocomplete="off"></label>
        <label class="filter"><span>Team</span>
          <select id="member-team" class="select">${[{ id: 'all', name: 'Tất cả team' }, ...data.teams].map((t) => option(t.id, t.name, filter))}</select></label>
        <label class="filter"><span>Tình trạng</span>
          <select id="member-status" class="select">${MEMBER_FILTERS.map(([id, label]) => option(id, id === 'all' ? 'Tất cả tình trạng' : label, mstatus))}</select></label>
        ${filtered ? html`<button class="link-btn filters__clear" type="button" data-clear-filters>Xóa lọc</button>` : ''}
      </div>
      <div class="filters filters--view" aria-label="Cách hiển thị">
        <div class="filter"><span>Kiểu bảng</span>
          <div class="chips" role="group" aria-label="Kiểu bảng">
            ${[['compact', 'Tối giản'], ['full', 'Đầy đủ']].map(([id, label]) => html`<button class="chip" type="button" data-tview="${id}" aria-pressed="${id === view}">${label}</button>`)}
          </div></div>
        <label class="filter"><span>Cách tô màu</span>
          <select id="member-heat" class="select">${HEAT_MODES.map(([id, label]) => option(id, label, mode))}</select></label>
      </div>
      <div class="table-wrap"><table class="${mode === 'text' ? 'table--text' : ''} ${ui.tview === 'full' ? 'table--full' : ''}">
        <thead>${ui.tview === 'full' ? fullHead(osort) : html`<tr>${MEMBER_COLUMNS.map((c) => html`
          <th scope="col" class="${c.sticky ? 'sticky-col' : ''} ${c.align === 'right' ? 'right' : ''}" aria-sort="${osort.key === c.key ? (osort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
            <button type="button" data-osort="${c.key}">${c.label}</button>
          </th>`)}</tr>`}</thead>
        <tbody id="member-rows">${memberRowsView(data, ui, report)}</tbody>
      </table></div>
      <p class="muted table-hint">Bấm tiêu đề cột để sắp xếp · bấm một dòng để xem chi tiết.</p>
      <div class="${mode === 'text' ? 'legend--text' : ''}">${legend}</div>
    </section>`;
}

/** Trang Tổng quan: toàn cảnh KPI, công việc và năng suất; chi tiết từng team nằm ở các tab riêng. */
/** Thẻ KPI cá nhân của nhân sự đăng nhập (chỉ khi nhận ra được họ trong báo cáo). */
function myCard({ team, member: m }, report, sla) {
  const workdays = report ? workdaysByCode(report).get(m.code) : null;
  const hasSheet = Boolean(report?.timesheets?.[m.code]);
  const status = memberStatus(m, team);
  const elapsed = elapsedRatio(team.asOf);
  return html`
    <div class="card card--accent">
      <div class="card__head"><h3 class="card__title">KPI của bạn · ${m.name}</h3>${statusBadge(status)}</div>
      <p class="big num">${pct(m.kpi, 1)}</p>
      ${bar(m.kpi, { mark: elapsed, tone: status.key })}
      <dl class="kv">
        <dt>Thời gian đã qua</dt><dd class="num">${pct(elapsed)}</dd>
        <dt>Dự kiến cuối tháng</dt><dd class="num">${pct(projectedKpi(m.kpi, elapsed))}</dd>
        <dt>Điểm tổng</dt><dd class="num">${rateCell(m.main)}</dd>
        <dt>Add-on</dt><dd class="num">${rateCell(m.addon)}</dd>
        <dt>Act đã làm</dt><dd class="num">${num(m.extra.actDone)}/${num(m.extra.assigned)}</dd>
        ${workdays != null ? html`<dt>Ngày công</dt><dd class="num">${num(workdays)}</dd>` : ''}
        ${sla ? html`<dt>Data trễ SLA</dt><dd class="num ${sla.late ? 'is-bad' : ''}">${num(sla.late)} <span class="muted">(${pct(ratio(sla.late, sla.base), 1)})</span></dd><dt>Data sắp trễ SLA</dt><dd class="num ${sla.soon ? 'is-warn' : ''}">${num(sla.soon)} <span class="muted">(${pct(ratio(sla.soon, sla.base), 1)})</span></dd>` : ''}
      </dl>
      ${sla ? html`<button class="link-btn" type="button" data-tab="sla">Xem chi tiết SLA →</button>` : ''}
      ${hasSheet ? html`<button class="btn btn--ghost card__action" type="button" data-timesheet="${team.id}:${m.code}">Xem chi tiết công</button>` : ''}
    </div>`;
}

/** Nhân sự (quyền Thành viên) chỉ xem KPI cá nhân và bảng nhân sự; chỉ số tổng hợp và biểu đồ dành cho Quản trị/Admin. */
/** SLA của chính nhân sự (nếu tab công việc có bảng tồn theo ngày). */
function mySla(data, { member }) {
  const asOf = data.teams.map((t) => t.asOf).sort().at(-1);
  return computeSla(data.work, asOf, data.month)?.rows.find((r) => r.code === member.code) ?? null;
}

function memberOverview(data, ui, report) {
  const mine = findMember(ui.me.email, data.teams, ui.me.name, ui.me.code);
  return html`${updatedBanner(data.teams)}${mine ? html`<div class="grid">${myCard(mine, report, mySla(data, mine))}</div>` : ''}${memberTable(data, ui, report)}`;
}

export function overviewView(data, ui, report) {
  if (ui.me?.role === 'member') return memberOverview(data, ui, report);
  const all = combineTeams(data.teams);
  const summary = summarize(all);
  const stats = [...kpiStats(all, summary), ...workStats(data.work), ...reportStats(report)];

  return html`
    ${updatedBanner(data.teams)}
    <div class="grid">${teamCard(all, { all: true })}${data.teams.map((t) => teamCard(t))}</div>
    <p class="muted overview-note">Bấm một team để xem chi tiết.</p>
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
