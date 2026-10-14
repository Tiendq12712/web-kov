import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { chartCard, groupedColumns, lineChart } from './charts.js';
import { heatClass, heatLegend, mean } from './heat.js';
import { stackRow, legendList as legend } from './components.js';
import { contactDonut, sourceDonut } from './donuts.js';

/** Các bảng ma trận (nhân sự × ngày) có thể chuyển qua lại. */
const MATRICES = {
  backlogAll: { label: 'Tồn (chưa + đang làm)', invert: true },
  backlogTodo: { label: 'Tồn (chưa làm)', invert: true },
  assigned: { label: 'Data đã chia', invert: false },
};
const SOURCE_SHORT = (label) => label.replace(/^CSKH\s*/, '').replace(/\s*-\s*DVKH$/, '');
const CONTACT_CLASSES = ['s2', 's1', 's3', 's4'];   // kết nối, thuê bao, không nghe máy, sai số

const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);
const ratio = (a, b) => (b ? a / b : 0);
const indexOf = (block, label) => block.labels.indexOf(label);

/** Gộp các bảng theo mã nhân sự thành một dòng cho mỗi người. */
function buildRows(work, selected) {
  const cpa = work.callsPerAct;
  const acts = cpa ? indexOf(cpa, 'Tổng act') : -1;
  const calls = cpa ? indexOf(cpa, 'Tổng cuộc gọi') : -1;
  const byCode = (block) => new Map((block?.members ?? []).map((m) => [m.code, m.values]));
  const call = byCode(cpa);
  return work.status.members.filter((m) => selected(m.code)).map(({ code, name, values: [done, doing, todo, total] }) => {
    const c = call.get(code);
    return {
      code, name, done, doing, todo, total, pctDone: ratio(done, total),
      acts: c?.[acts] ?? 0, calls: c?.[calls] ?? 0, avgCalls: ratio(c?.[calls] ?? 0, c?.[acts] ?? 0),
    };
  });
}

/* ---------- Thành phần nhỏ ---------- */
const stat = (title, value, sub) => html`
  <div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

/* ---------- Thẻ tổng hợp ---------- */
function cards(rows, work) {
  const total = sum(rows.map((r) => r.total));
  const done = sum(rows.map((r) => r.done));
  const open = sum(rows.map((r) => r.doing + r.todo));
  const acts = sum(rows.map((r) => r.acts));
  const calls = sum(rows.map((r) => r.calls));
  const contact = work.contact;
  const connected = contact ? sum(contact.groups.map((g) => g.values[0])) : 0;
  // Cộng các kết quả cuộc gọi thay vì cột "Tổng" (có dòng bị bỏ trống trong Sheet).
  const attempts = contact ? sum(contact.groups.map((g) => sum(g.values.filter((_, i) => contact.labels[i] !== 'Tổng')))) : 0;
  return html`
    <div class="grid">
      ${stat('Tổng data được chia', num(total), `${rows.length} nhân sự`)}
      ${stat('Tỉ lệ hoàn thành', pct(ratio(done, total), 1), `${num(done)} data đã làm`)}
      ${stat('Data còn tồn', num(open), `${num(sum(rows.map((r) => r.todo)))} chưa làm · ${num(sum(rows.map((r) => r.doing)))} đang làm`)}
      ${stat('Kết nối thành công', pct(ratio(connected, attempts), 1), `${num(connected)} / ${num(attempts)} data đã làm`)}
      ${stat('TB call / ACT', num(ratio(calls, acts)), `${num(calls)} cuộc gọi · ${num(acts)} ACT`)}
    </div>`;
}

/* ---------- Biểu đồ ---------- */
const progressChart = (rows) => html`
  <div class="chart"><div class="stack-list">${[...rows].sort((a, b) => b.pctDone - a.pctDone).map((r) =>
    stackRow(`${r.name} (${r.code})`, [
      { value: r.done, cls: 's2', label: 'Đã làm' }, { value: r.doing, cls: 's1', label: 'Đang làm' }, { value: r.todo, cls: 's4', label: 'Chưa làm' },
    ], pct(r.pctDone)))}</div>
    ${legend([{ cls: 's2', label: 'Đã làm' }, { cls: 's1', label: 'Đang làm' }, { cls: 's4', label: 'Chưa làm' }])}</div>`;

function contactChart(contact) {
  if (!contact) return html`<p class="muted">Chưa có dữ liệu tình trạng liên hệ.</p>`;
  const labels = contact.labels.filter((l) => l !== 'Tổng');
  const lines = [...contact.groups, { name: 'Tổng', values: labels.map((_, i) => sum(contact.groups.map((g) => g.values[i]))) }];
  return html`
    <div class="chart"><div class="stack-list">${lines.map((g) => {
      const total = sum(g.values.slice(0, labels.length));
      return stackRow(SOURCE_SHORT(g.name), labels.map((l, i) => ({ value: g.values[i] ?? 0, cls: CONTACT_CLASSES[i], label: l })), pct(ratio(g.values[0], total)));
    })}</div>
    ${legend(labels.map((l, i) => ({ cls: CONTACT_CLASSES[i], label: l })))}</div>`;
}

/** Data được chia mỗi ngày so với phần còn tồn của ngày đó. */
function dailyChart(work, selected) {
  const days = Array.from({ length: work.lastDay }, (_, i) => i);
  const perDay = (block) => days.map((d) => sum(block.members.filter((m) => selected(m.code)).map((m) => m.values[d])));
  return groupedColumns({
    categories: days.map((d) => String(d + 1)),
    series: [{ name: 'Data được chia', cls: 's1', values: perDay(work.assigned) }, { name: 'Còn tồn (chưa + đang làm)', cls: 's3', values: perDay(work.backlogAll) }],
    ratio: false, format: (v) => num(v),
  });
}

const industryChart = (work) => {
  const block = work.dataByIndustry;
  if (!block) return html`<p class="muted">Chưa có dữ liệu ngành hàng.</p>`;
  return lineChart({
    labels: Array.from({ length: work.lastDay }, (_, i) => String(i + 1)),
    series: block.groups.map((g, i) => ({ name: g.name, cls: ['s1', 's2', 's3'][i % 3], values: g.values.slice(0, work.lastDay).map((v) => v ?? 0) })),
    format: (v) => num(v),
  });
};

/** Phân bố số cuộc gọi trên mỗi ACT (1, 2, 3… cuộc). */
function callsDistribution(work, selected) {
  const block = work.callsPerAct;
  if (!block) return html`<p class="muted">Chưa có dữ liệu số cuộc gọi.</p>`;
  const buckets = block.labels.filter((l) => typeof l === 'number');
  const counts = buckets.map((_, i) => sum(block.members.filter((m) => selected(m.code)).map((m) => m.values[i])));
  const total = sum(counts);
  return groupedColumns({
    categories: buckets.map(String),
    series: [{ name: 'Tỉ lệ ACT theo số cuộc gọi', cls: 's2', values: counts.map((c) => ratio(c, total)) }],
    ratio: false, format: (v) => pct(v),
  });
}

function sourcesChart(work, rows) {
  const block = work.sources;
  if (!block) return html`<p class="muted">Chưa có dữ liệu nguồn data.</p>`;
  const labels = block.labels.filter((l) => l !== 'Grand Total');
  const byCode = new Map(block.members.map((m) => [m.code, m.values]));
  const classes = ['s1', 's2', 's3'];
  return html`
    <div class="chart"><div class="stack-list">${rows.map((r) => {
      const v = byCode.get(r.code) ?? [];
      return stackRow(`${r.name} (${r.code})`, labels.map((l, i) => ({ value: v[i] ?? 0, cls: classes[i], label: SOURCE_SHORT(l) })), num(sum(v.slice(0, labels.length))));
    })}</div>
    ${legend(labels.map((l, i) => ({ cls: classes[i], label: SOURCE_SHORT(l) })))}</div>`;
}

/* ---------- Bảng chi tiết nhân sự ---------- */
const COLUMNS = {
  name: { label: 'Nhân sự', sticky: true, sort: (r) => r.name, cell: (r) => html`<span class="person"><strong>${r.name}</strong><small>${r.code}</small></span>` },
  total: { label: 'Đã chia', num: true, sort: (r) => r.total, cell: (r) => num(r.total) },
  done: { label: 'Đã làm', num: true, sort: (r) => r.done, cell: (r) => num(r.done) },
  doing: { label: 'Đang làm', num: true, sort: (r) => r.doing, cell: (r) => num(r.doing) },
  todo: { label: 'Chưa làm', num: true, sort: (r) => r.todo, cell: (r) => num(r.todo), heat: (r, ref) => heatClass(r.todo, ref.todo, { invert: true }) },
  pctDone: { label: '% hoàn thành', num: true, sort: (r) => r.pctDone, cell: (r) => pct(r.pctDone, 1), heat: (r, ref) => heatClass(r.pctDone, ref.pctDone) },
  acts: { label: 'Số ACT', num: true, sort: (r) => r.acts, cell: (r) => num(r.acts) },
  calls: { label: 'Số cuộc gọi', num: true, sort: (r) => r.calls, cell: (r) => num(r.calls) },
  avgCalls: { label: 'TB call/ACT', num: true, sort: (r) => r.avgCalls, cell: (r) => num(r.avgCalls), heat: (r, ref) => heatClass(r.avgCalls, ref.avgCalls) },
};
const KEYS = Object.keys(COLUMNS);

const sortedRows = (rows, { key, dir }) => {
  const col = COLUMNS[key];
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = col.sort(a), y = col.sort(b);
    return (typeof x === 'string' ? x.localeCompare(y, 'vi') : x - y) * sign;
  });
};

export const workRowsView = (work, ui, people) => {
  const rows = buildRows(work, selector(ui, people));
  const ref = { todo: mean(rows.map((r) => r.todo)), pctDone: mean(rows.map((r) => r.pctDone)), avgCalls: mean(rows.map((r) => r.avgCalls)) };
  const q = ui.query.trim().toLowerCase();
  return sortedRows(rows.filter((r) => !q || `${r.name} ${r.code}`.toLowerCase().includes(q)), ui.sort).map((r) => html`
    <tr class="static">${KEYS.map((k) => html`<td class="${COLUMNS[k].num ? 'right num' : ''} ${COLUMNS[k].sticky ? 'sticky-col' : ''} ${COLUMNS[k].heat?.(r, ref) ?? ''}">${COLUMNS[k].cell(r)}</td>`)}</tr>`);
};

/* ---------- Bảng ma trận nhân sự × ngày ---------- */
function matrixTable(work, ui, selected) {
  const info = MATRICES[ui.matrix];
  const block = work[ui.matrix];
  if (!block) return html`<p class="muted">Chưa có dữ liệu.</p>`;
  const members = block.members.filter((m) => selected(m.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  // Hiện đủ các ngày trong tháng (theo số cột ngày của bảng), không cắt ở ngày cuối cùng đã có data.
  const days = Array.from({ length: block.labels.filter((l) => typeof l === 'number').length || work.lastDay }, (_, i) => i);
  // Các nhóm (Chăm sóc khách hàng SC Miền Nam / Miền Bắc / T15) không thuộc riêng ai nên chỉ hiện khi xem tất cả team.
  const groups = ui.team === 'all' ? block.groups : [];
  const all = [...members, ...groups];
  const reference = mean(members.flatMap((m) => days.map((d) => m.values[d])).filter((v) => v > 0));
  const heat = (v) => (info.invert && v > 0 ? heatClass(v, reference, { invert: true }) : '');
  const cell = (v, klass = '') => html`<td class="right num ${v ? klass : 'muted'}">${v ? num(v) : '·'}</td>`;
  return html`
    <div class="table-wrap"><table class="day-table">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${days.map((d) => html`<th scope="col" class="right">${d + 1}</th>`)}<th scope="col" class="right">Tổng</th></tr></thead>
      <tbody>${members.map((m) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${m.name}</strong><small>${m.code}</small></span></td>
        ${days.map((d) => cell(m.values[d], heat(m.values[d])))}${cell(sum(days.map((d) => m.values[d])))}</tr>`)}
        ${groups.map((g) => html`<tr class="static group-row"><td class="sticky-col"><span class="person"><strong>${g.name}</strong><small>Nhóm</small></span></td>
          ${days.map((d) => cell(g.values[d]))}${cell(sum(days.map((d) => g.values[d])))}</tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col">Tổng</td>${days.map((d) => cell(sum(all.map((m) => m.values[d]))))}
        ${cell(sum(all.flatMap((m) => days.map((d) => m.values[d]))))}</tr></tfoot>
    </table></div>
    ${info.invert ? heatLegend('trung bình các ô có data tồn', { invert: true }) : html`<p class="muted">Số data được chia cho mỗi người theo ngày.</p>`}`;
}

/** Bảng chia data: mỗi người được chia bao nhiêu data, từ nguồn nào (T15 · NA · OI) và đã xử lý tới đâu. */
function divideTable(work, rows) {
  const block = work.sources;
  const labels = block ? block.labels.filter((l) => l !== 'Grand Total') : [];
  const byCode = new Map((block?.members ?? []).map((m) => [m.code, m.values]));
  const people = [...rows].sort((a, b) => b.total - a.total);
  const fromSource = (r, i) => byCode.get(r.code)?.[i] ?? 0;
  const col = (title) => html`<th scope="col" class="right">${title}</th>`;
  const totals = (get) => sum(people.map(get));
  return html`
    <div class="toolbar"><h2 class="section-title">Bảng chia data</h2><p class="muted">Số data mỗi nhân sự được chia từ đầu tháng</p></div>
    <div class="table-wrap"><table class="divide-table">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th>${labels.map((l) => col(SOURCE_SHORT(l)))}${col('Tổng đã chia')}${col('Đã làm')}${col('Đang làm')}${col('Chưa làm')}${col('% hoàn thành')}</tr></thead>
      <tbody>${people.map((r) => html`<tr class="static">
        <td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
        ${labels.map((_, i) => html`<td class="right num">${num(fromSource(r, i))}</td>`)}
        <td class="right num strong">${num(r.total)}</td><td class="right num">${num(r.done)}</td><td class="right num">${num(r.doing)}</td><td class="right num">${num(r.todo)}</td>
        <td class="right num">${pct(r.pctDone, 1)}</td></tr>`)}</tbody>
      <tfoot><tr><td class="sticky-col"><strong>Tổng</strong></td>${labels.map((_, i) => html`<td class="right num">${num(totals((r) => fromSource(r, i)))}</td>`)}
        <td class="right num strong">${num(totals((r) => r.total))}</td><td class="right num">${num(totals((r) => r.done))}</td><td class="right num">${num(totals((r) => r.doing))}</td><td class="right num">${num(totals((r) => r.todo))}</td>
        <td class="right num">${pct(ratio(totals((r) => r.done), totals((r) => r.total)), 1)}</td></tr></tfoot>
    </table></div>
    ${block ? '' : html`<p class="muted">Chưa tìm thấy bảng chia data theo nguồn trong tab; hiển thị tổng theo tình trạng xử lý.</p>`}`;
}

const selector = (ui, people) => (code) => ui.team === 'all' || people.get(code)?.team === ui.team;

/* ---------- Trang báo cáo ---------- */
export function workView(work, ui, people, teams) {
  const selected = selector(ui, people);
  const rows = buildRows(work, selected);
  const ariaSort = (k) => (ui.sort.key === k ? (ui.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  return html`
    <div class="toolbar">
      <h2 class="section-title">Theo dõi công việc</h2>
      <div class="chips" role="group" aria-label="Lọc theo team">
        ${[{ id: 'all', name: 'Tất cả' }, ...teams].map((t) => html`
          <button class="chip" type="button" data-wteam="${t.id}" aria-pressed="${t.id === ui.team}">${t.name}</button>`)}
      </div>
    </div>
    ${cards(rows, work)}
    ${divideTable(work, rows)}
    <div class="charts">
      ${work.contact ? chartCard('Tình trạng kết nối', contactDonut(work.contact), 'Kết quả cuộc gọi của data đã làm, gộp các nhóm CSKH.') : ''}
      ${work.dataBySource ? chartCard('Nguồn data (T15 · NA · OI)', sourceDonut(work), 'Số data được chia theo nhóm CSKH từ đầu tháng.') : ''}
      ${chartCard('Tiến độ xử lý theo nhân sự', progressChart(rows), 'Tỉ lệ data đã làm / đang làm / chưa làm trên tổng data được chia.')}
      ${chartCard('Tình trạng liên hệ theo nhóm CSKH', contactChart(work.contact), 'Kết quả cuộc gọi của data đã làm; số bên phải là tỉ lệ kết nối thành công.')}
      ${chartCard('Data được chia và còn tồn theo ngày', dailyChart(work, selected), 'Cột vàng càng thấp so với cột xanh là ngày đó được xử lý càng tốt.')}
      ${chartCard('Data theo ngành hàng', industryChart(work), 'Số data mỗi ngành hàng được chia theo ngày.')}
      ${chartCard('Số cuộc gọi trên mỗi ACT', callsDistribution(work, selected), 'Tỉ lệ ACT cần 1, 2, 3… cuộc gọi để xử lý xong.')}
      ${chartCard('Nguồn data theo nhân sự', sourcesChart(work, rows), 'Data nhận từ các nhóm CSKH T15, NA, OI.')}
    </div>
    <div class="toolbar">
      <h2 class="section-title">Phân bổ theo ngày</h2>
      <div class="chips" role="group" aria-label="Chọn bảng">
        ${Object.entries(MATRICES).map(([k, m]) => html`
          <button class="chip" type="button" data-wmatrix="${k}" aria-pressed="${k === ui.matrix}">${m.label}</button>`)}
      </div>
    </div>
    ${matrixTable(work, ui, selected)}
    <div class="toolbar">
      <h2 class="section-title">Chi tiết nhân sự</h2>
      <input class="search" id="work-search" type="search" placeholder="Tìm theo tên hoặc mã…" value="${ui.query}" aria-label="Tìm nhân sự" autocomplete="off">
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${KEYS.map((k) => html`
        <th scope="col" class="${COLUMNS[k].num ? 'right' : ''}" aria-sort="${ariaSort(k)}"><button type="button" data-wsort="${k}">${COLUMNS[k].label}</button></th>`)}</tr></thead>
      <tbody id="work-rows">${workRowsView(work, ui, people)}</tbody>
    </table></div>
    ${heatLegend('trung bình nhóm (% hoàn thành, TB call/ACT; data chưa làm càng ít càng tốt)')}`;
}
