import { html, raw, escape } from '../dom.js';
import { pct, num } from '../format.js';

/** Biểu đồ SVG/CSS thuần, không thư viện. Giá trị tỷ lệ 0–1. */
const W = 640, H = 260, PAD = { t: 16, r: 12, b: 44, l: 40 };

/** Làm tròn lên một giá trị "đẹp" cho trục (1, 2, 5 × 10ⁿ). */
const niceCeil = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
};

const shortName = (name) => name.split(' ').slice(-2).join(' ');

const axisLabel = (label, x, y, rotate) => rotate
  ? `<text class="axis" x="${x}" y="${y}" text-anchor="end" transform="rotate(-40 ${x} ${y})">${label}</text>`
  : `<text class="axis" x="${x}" y="${y + 6}" text-anchor="middle">${label}</text>`;

const legend = (series) => html`
  <ul class="legend">${series.map((s) => html`<li><i class="swatch ${s.cls}"></i>${s.name}</li>`)}</ul>`;

/** Cột nhóm; `line` là vạch ngang (thời gian đã qua). */
export function groupedColumns({ categories, series, line, lineLabel, format = pct, ratio = true, values = false, valueFormat }) {
  const peak = Math.max(...series.flatMap((s) => s.values), line ?? 0);
  const top = ratio ? Math.ceil(Math.max(1, peak) * 4) / 4 : niceCeil(peak);
  const rotate = categories.length > 8 && Math.max(...categories.map((c) => String(c).length)) > 4;   // nhiều cột + nhãn dài: xoay để không chồng nhau
  const bottom = rotate ? 84 : PAD.b;
  const height = H + bottom - PAD.b;
  const iw = W - PAD.l - PAD.r, ih = height - PAD.t - bottom;
  const y = (v) => PAD.t + ih * (1 - v / top);
  const slot = iw / categories.length;
  const bw = Math.min(26, (slot * 0.7) / series.length);
  const ticks = Array.from({ length: 5 }, (_, i) => (top * i) / 4);

  const cols = categories.map((cat, ci) => {
    const x0 = PAD.l + slot * ci + (slot - bw * series.length) / 2;
    return series.map((s, si) => {
      const v = s.values[ci], x = x0 + bw * si;
      const label = values ? `<text class="val" x="${x + (bw - 2) / 2}" y="${y(v) - 4}" text-anchor="middle">${(valueFormat ?? format)(v)}</text>` : '';
      return `<rect class="${s.cls}" x="${x}" y="${y(v)}" width="${bw - 2}" height="${PAD.t + ih - y(v)}" rx="3"><title>${escape(cat)} · ${escape(s.name)}: ${format(v)}</title></rect>${label}`;
    }).join('') + axisLabel(escape(cat), PAD.l + slot * (ci + 0.5), PAD.t + ih + 16, rotate);
  }).join('');

  const grid = ticks.map((t) => `<line class="grid-line" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${PAD.l - 6}" y="${y(t) + 4}" text-anchor="end">${format(t)}</text>`).join('');
  const mark = line != null
    ? `<line class="time-line" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(line)}" y2="${y(line)}"/><text class="axis time-label" x="${W - PAD.r}" y="${y(line) - 5}" text-anchor="end">${lineLabel ?? `Thời gian đã qua ${pct(line)}`}</text>` : '';

  return html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${height}" role="img" aria-label="Biểu đồ cột nhóm">${raw(grid + cols + mark)}</svg>
      ${legend(series)}
    </div>`;
}

/** Biểu đồ so sánh tỷ lệ hoàn thành giữa các team. */
export const teamCompare = (teams, summaries) => groupedColumns({
  categories: teams.map((t) => t.name.replace('Team ', '')),
  series: [
    { name: 'Điều kiện cần', cls: 's1', values: summaries.map((s) => s.need.rate) },
    { name: 'Điểm tổng', cls: 's2', values: summaries.map((s) => s.main.rate) },
    { name: 'Add-on', cls: 's3', values: summaries.map((s) => s.addon.rate) },
  ],
});

/** Điểm tổng vs Add-on của từng nhân sự trong team. */
export const memberCompare = (team, elapsed) => groupedColumns({
  categories: team.members.map((m) => shortName(m.name)),
  series: [
    { name: 'Điểm tổng', cls: 's2', values: team.members.map((m) => m.main.rate) },
    { name: 'Add-on', cls: 's3', values: team.members.map((m) => m.addon.rate) },
  ],
  line: elapsed,
});

/** Cơ cấu act (đã làm / đang làm / chưa làm) — chỉ team online có dữ liệu này. */
export function actBreakdown(team) {
  const rows = team.members.filter((m) => m.extra.assigned);
  if (!rows.length) return '';
  const seg = (cls, label, v, total) =>
    html`<span class="stack__seg ${cls}" style="flex:${v}" title="${label}: ${num(v)} (${pct(v / total)})"></span>`;
  return html`
    <div class="chart">
      <div class="stack-list">${rows.map((m) => {
        const { assigned: a, actDone: d, doing: g, notStarted: n } = m.extra;
        return html`
          <div class="stack-row">
            <span class="stack__name">${shortName(m.name)}</span>
            <div class="stack">${seg('s2', 'Đã làm', d, a)}${seg('s1', 'Đang làm', g, a)}${seg('s4', 'Chưa làm', n, a)}</div>
            <span class="num muted">${num(d)}/${num(a)}</span>
          </div>`;
      })}</div>
      ${legend([{ name: 'Đã làm', cls: 's2' }, { name: 'Đang làm', cls: 's1' }, { name: 'Chưa làm', cls: 's4' }])}
    </div>`;
}

export const chartCard = (title, body, hint = '') => html`
  <section class="card"><h2 class="section-title">${title}</h2>${hint ? html`<p class="muted">${hint}</p>` : ''}${body}</section>`;

/** Biểu đồ đường nhiều chuỗi (xu hướng theo khung giờ / theo tuần). */
export function lineChart({ labels, series, format = (v) => String(v), values = false, valueFormat }) {
  const top = niceCeil(Math.max(...series.flatMap((s) => s.values)));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const INSET = 28;   // chừa chỗ cho nhãn đầu/cuối không bị cắt
  const x = (i) => PAD.l + INSET + (labels.length === 1 ? (iw - 2 * INSET) / 2 : ((iw - 2 * INSET) * i) / (labels.length - 1));
  const y = (v) => PAD.t + ih * (1 - v / top);
  const grid = Array.from({ length: 5 }, (_, i) => (top * i) / 4).map((t) =>
    `<line class="grid-line" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${PAD.l - 6}" y="${y(t) + 4}" text-anchor="end">${format(t)}</text>`).join('');
  const step = labels.length > 16 ? 2 : 1;   // nhiều nhãn: hiện cách một nhãn
  const axis = labels.map((l, i) => (i % step ? '' : `<text class="axis" x="${x(i)}" y="${H - 22}" text-anchor="middle">${escape(l)}</text>`)).join('');
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const dots = s.values.map((v, i) => `<circle class="dot ${s.cls}" cx="${x(i)}" cy="${y(v)}" r="3.5"><title>${escape(labels[i])} · ${escape(s.name)}: ${format(v)}</title></circle>`).join('');
    const nums = values && s.values.length <= 14 ? s.values.map((v, i) => `<text class="val" x="${x(i)}" y="${y(v) - 9}" text-anchor="middle">${(valueFormat ?? format)(v)}</text>`).join('') : '';
    return `<polyline class="line ${s.cls}" points="${pts}"/>${dots}${nums}`;
  }).join('');
  return html`
    <div class="chart">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ đường">${raw(grid + axis + lines)}</svg>
      ${legend(series)}
    </div>`;
}

/** Biểu đồ tròn (donut) kèm chú giải có số lượng và tỷ lệ. `center` hiện ở giữa vòng. */
export function donutChart({ segments, center, format = (v) => num(v) }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const R = 44, C = 2 * Math.PI * R, GAP = total ? 1.5 : 0;
  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const len = Math.max((s.value / total) * C - GAP, 0.5);
    const arc = `<circle class="donut__arc ${s.cls}" cx="60" cy="60" r="${R}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"><title>${escape(s.label)}: ${format(s.value)} (${pct(s.value / total, 1)})</title></circle>`;
    offset += (s.value / total) * C;
    return arc;
  }).join('');
  return html`
    <div class="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label="Biểu đồ tròn">
        <circle class="donut__track" cx="60" cy="60" r="${R}"/>
        ${raw(arcs)}
        <text class="donut__value" x="60" y="58" text-anchor="middle">${center.value}</text>
        <text class="donut__label" x="60" y="74" text-anchor="middle">${center.label}</text>
      </svg>
      <ul class="donut__legend">${segments.map((s) => html`
        <li><i class="swatch ${s.cls}"></i><span>${s.label}</span><strong class="num">${format(s.value)}</strong><span class="muted num">${pct(total ? s.value / total : 0, 1)}</span></li>`)}
      </ul>
    </div>`;
}
