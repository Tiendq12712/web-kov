import { html } from '../dom.js';
import { pct, num, hm, dayMonth } from '../format.js';
import { summarize, memberStatus, elapsedRatio } from '../metrics.js';
import { memberCompare, actBreakdown, chartCard } from './charts.js';
import { bar, meter, badge, statusBadge, passBadge, rateCell, updatedBanner } from './components.js';

const person = (m) => html`<span class="person"><strong>${m.name}</strong><small>${m.code} · Level ${m.level ?? '—'}</small></span>`;
const ctxOf = (team) => ({ mark: elapsedRatio(team.asOf) });
const cmp = (v) => (v == null ? -Infinity : v);

/** Cấu hình cột: thêm/bớt cột chỉ cần sửa tại đây. */
const COLUMNS = {
  name: { label: 'Nhân sự', sticky: true, sort: (m) => m.name, cell: person },
  kpi: {
    label: 'KPI tổng', sort: (m) => m.kpi,
    cell: (m, team) => meter('', m.kpi, { ...ctxOf(team), tone: memberStatus(m, team).key }),
  },
  status: { label: 'Tiến độ', sort: (m, team) => cmp(m.kpi) / elapsedRatio(team.asOf), cell: (m, team) => statusBadge(memberStatus(m, team)) },
  need: { label: 'Điều kiện cần', sort: (m) => m.need.rate, cell: (m) => rateCell(m.need) },
  main: { label: 'Điểm tổng 70%', sort: (m) => m.main.rate, cell: (m) => rateCell(m.main) },
  addon: { label: 'Add-on 30%', sort: (m) => m.addon.rate, cell: (m) => rateCell(m.addon) },
  act: { label: 'Act đã làm', sort: (m) => m.extra.actDone, cell: (m) => html`<span class="num">${num(m.extra.actDone)}${m.extra.assigned != null ? html` / ${num(m.extra.assigned)}` : ''}</span>` },
  impact: { label: 'Tỉ lệ impact', sort: (m) => m.extra.impactRate, cell: (m) => html`<span class="num">${pct(m.extra.impactRate)}</span>` },
  talk: { label: 'Talk time', sort: (m) => m.talk?.actual, cell: (m) => m.talk ? html`<span class="num">${hm(m.talk.actual)} / ${hm(m.talk.target)}</span> ${passBadge(m.talk.pass)}` : '' },
};
const KEYS = ['name', 'kpi', 'status', 'need', 'main', 'addon', 'act', 'impact', 'talk'];

const sortRows = (members, team, { key, dir }) => {
  const col = COLUMNS[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...members].sort((a, b) => {
    const x = col.sort(a, team), y = col.sort(b, team);
    return (typeof x === 'string' ? x.localeCompare(y, 'vi') : cmp(x) - cmp(y)) * sign;
  });
};

export const filterMembers = (team, query) => {
  const q = query.trim().toLowerCase();
  return q ? team.members.filter((m) => `${m.name} ${m.code}`.toLowerCase().includes(q)) : team.members;
};

const mean = (list) => { const v = list.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** Hàng "Trung bình" cuối bảng: trung bình các nhân sự đang hiển thị. */
const averageRow = (members, team) => {
  if (!members.length) return '';
  const rnd = (v) => (v == null ? v : Math.round(v));
  const block = (k) => ({ done: rnd(mean(members.map((m) => m[k].done))), target: rnd(mean(members.map((m) => m[k].target))), rate: mean(members.map((m) => m[k].rate)) });
  const cells = {
    name: html`<span class="person"><strong>Trung bình</strong><small>${members.length} nhân sự</small></span>`,
    kpi: html`<span class="num strong">${pct(mean(members.map((m) => m.kpi)), 1)}</span>`,
    status: '',
    need: rateCell(block('need')), main: rateCell(block('main')), addon: rateCell(block('addon')),
    act: html`<span class="num">${num(rnd(mean(members.map((m) => m.extra.actDone))))} / ${num(rnd(mean(members.map((m) => m.extra.assigned))))}</span>`,
    impact: html`<span class="num">${pct(mean(members.map((m) => m.extra.impactRate)))}</span>`,
    talk: members.some((m) => m.talk) ? html`<span class="num">${hm(mean(members.map((m) => m.talk?.actual)))} / ${hm(mean(members.map((m) => m.talk?.target)))}</span>` : '',
  };
  return html`<tr class="static avg-row">${KEYS.map((k) => html`<td class="${COLUMNS[k].sticky ? 'sticky-col' : ''}">${cells[k]}</td>`)}</tr>`;
};

export const rowsView = (team, query, sort) => {
  const list = filterMembers(team, query);
  return html`${sortRows(list, team, sort).map((m) => html`
    <tr data-member="${team.id}:${m.code}" tabindex="0">
      ${KEYS.map((k) => html`<td class="${COLUMNS[k].sticky ? 'sticky-col' : ''}">${COLUMNS[k].cell(m, team)}</td>`)}
    </tr>`)}${averageRow(list, team)}`;
};

const stat = (title, value, sub) => html`
  <div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

export function teamView(team, { query, sort }) {
  const s = summarize(team);
  const behind = team.members.filter((m) => memberStatus(m, team).key === 'bad').length;
  return html`
    ${updatedBanner([team])}
    <div class="grid">
      ${stat('KPI tổng team', pct(s.kpi, 1), html`${statusBadge(s.status)} · thời gian đã qua ${pct(s.elapsed)}`)}
      ${stat('Điểm tổng', num(s.main.done), `/ ${num(s.main.target)} (${pct(s.main.rate)}) · còn thiếu ${num(s.main.missing)}`)}
      ${stat('Add-on', num(s.addon.done), `/ ${num(s.addon.target)} (${pct(s.addon.rate)}) · còn thiếu ${num(s.addon.missing)}`)}
      ${stat('Nhân sự chậm tiến độ', `${behind}/${s.count}`, `Cập nhật ${team.updatedTime} ngày ${dayMonth(team.asOf)}`)}
    </div>
    <div class="charts">
      ${chartCard('Điểm tổng & Add-on theo nhân sự', memberCompare(team, s.elapsed), 'Đường nét đứt là mức thời gian đã trôi qua.')}
      ${chartCard('Cơ cấu khối lượng act', actBreakdown(team))}
    </div>
    <div class="toolbar">
      <h2 class="section-title">${team.name}</h2>
      <input class="search" id="search" type="search" placeholder="Tìm theo tên hoặc mã…" value="${query}" aria-label="Tìm nhân sự" autocomplete="off">
    </div>
    <div class="table-wrap">
      <table class="team-table">
        <thead><tr>${KEYS.map((k) => html`
          <th scope="col" aria-sort="${sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
            <button type="button" data-sort="${k}">${COLUMNS[k].label}</button>
          </th>`)}</tr></thead>
        <tbody id="rows">${rowsView(team, query, sort)}</tbody>
      </table>
    </div>`;
}
