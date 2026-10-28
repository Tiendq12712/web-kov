import { html } from '../dom.js';
import { CONFIG } from '../config.js';
import { num, pct } from '../format.js';
import { lineChart, chartCard } from './charts.js';
import { analyzeMismatch, CAUSES } from '../cinfoMismatch.js';
import { EVALS, evalOf } from '../mismatchEval.js';
import { weeklyStats, compareWeeks, peopleCompare, MIN_WEEK_ACTS } from '../cinfoWeekly.js';

/** Mục tiêu tỉ lệ SC dùng Customer Info; ≥ 95% xanh, từ mục tiêu tới 95% vàng, dưới mục tiêu đỏ. */
export const TARGET = 0.9;
const GOOD = 0.95;
const ratio = (a, b) => (b ? a / b : 0);
const tone = (r) => (r >= GOOD ? 'good' : r >= TARGET ? 'warn' : 'bad');

export const DEFAULT_FILTERS = { evalF: 'all', cFrom: '', cTo: '', mFrom: '', mTo: '', type: 'all', status: 'all', used: 'all', advice: 'all', match: 'all', sc: 'all' };

/** Lọc activity theo bộ lọc; nhân sự thường chỉ thấy activity của mình (`only` = đầu số). */
export function filterActs(data, f, only = null) {
  return data.acts.filter((a) => (!only || a.code === only)
    && (!f.cFrom || a.created >= f.cFrom) && (!f.cTo || a.created <= f.cTo)
    && (!f.mFrom || a.modified >= f.mFrom) && (!f.mTo || a.modified <= f.mTo)
    && (f.type === 'all' || a.type === f.type) && (f.status === 'all' || a.status === f.status)
    && (f.used === 'all' || a.used === (f.used === 'yes')) && (f.advice === 'all' || a.advised === (f.advice === 'yes'))
    && (f.match === 'all' || a.match === (f.match === '1')) && (f.sc === 'all' || a.code === f.sc));
}

const totalsOf = (acts) => ({
  total: acts.length, notUsed: acts.filter((a) => !a.used).length,
  advised: acts.filter((a) => a.advised).length, matched: acts.filter((a) => a.advised && a.match).length,
});

const dm = (isoDay) => `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`;
/** Chênh lệch so với kỳ trước: điểm phần trăm (hoặc điểm số), xanh khi cải thiện, đỏ khi xấu đi; `down` = chỉ số càng thấp càng tốt. */
const delta = (cur, prev, { down = false, points = false } = {}) => {
  if (cur == null || prev == null) return '';
  const d = points ? cur - prev : (cur - prev) * 100;
  if (Math.abs(d) < (points ? 0.05 : 0.05)) return html`<small class="delta">＝</small>`;
  const good = down ? d < 0 : d > 0;
  return html`<small class="delta delta--${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1).replace('.', ',')}${points ? '' : ' đ%'}</small>`;
};
const pc = (r) => (r == null ? '—' : pct(r, 1).replace('.', ','));
const sc = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));

/** So sánh theo tuần (T2–CN, theo ngày chỉnh sửa) và, với quản lý, so sánh hai tuần gần nhất theo từng nhân sự. */
function weeklySection(acts, manager) {
  const weeks = weeklyStats(acts);
  if (weeks.length < 2) return '';
  const pair = manager ? compareWeeks(weeks) : null;
  const people = pair ? peopleCompare(acts, pair) : [];
  // Biểu đồ: bỏ tuần quá ít act (nhiễu); tuần chưa đủ ngày đánh dấu * ở nhãn.
  const pts = weeks.filter((w) => !w.small);
  const labels = pts.map((w) => `${dm(w.start)}${w.partial ? '*' : ''}`);
  const percent = (v) => `${Math.round(v)}%`, p1c = (v) => `${v.toFixed(1).replace('.', ',')}%`;
  const val = (key, mult = 100) => pts.map((w) => (w[key] == null ? 0 : w[key] * mult));
  const charts = pts.length >= 2 ? html`
    <div class="grid cinfo-charts">
      ${chartCard('Tư vấn & khớp tính năng theo tuần', lineChart({ labels, format: percent, valueFormat: p1c, values: true, series: [{ name: '% act tư vấn tính năng', cls: 's1', values: val('adviceRate') }, { name: '% khớp / tư vấn', cls: 's3', values: val('matchRate') }] }), 'Càng cao càng tốt. Tuần có dấu * chưa đủ 7 ngày dữ liệu.')}
      ${chartCard('Act không dùng C-Info theo tuần', lineChart({ labels, format: percent, valueFormat: p1c, values: true, series: [{ name: '% act không dùng C-Info', cls: 's2', values: pts.map((w) => (w.useRate == null ? 0 : (1 - w.useRate) * 100)) }] }), 'Càng thấp càng tốt (mục tiêu dùng C-Info 90% trở lên).')}
      ${chartCard('Điểm trung bình theo tuần', lineChart({ labels, format: (v) => `${Math.round(v)}`, valueFormat: (v) => v.toFixed(1).replace('.', ','), values: true, series: [{ name: 'Điểm tính năng', cls: 's1', values: pts.map((w) => w.feat ?? 0) }, { name: 'Điểm setup', cls: 's4', values: pts.map((w) => w.setup ?? 0) }] }), 'Thang 100; tuần càng về sau điểm càng tăng là tốt.')}
    </div>` : '';
  const cell = (cur, prev, w, opts) => html`<td class="num">${pc(cur)}${w.small || (prev && prev.small) ? '' : delta(cur, prev, opts)}</td>`;
  return html`
    <div class="toolbar"><h2 class="section-title">So sánh theo tuần</h2>
      <p class="muted">Tính theo ngày chỉnh sửa act, mỗi tuần từ thứ 2 đến chủ nhật. Mũi tên là chênh lệch so với tuần trước (đ% = điểm phần trăm), xanh là tốt lên. Tuần dưới ${MIN_WEEK_ACTS} act hoặc chưa đủ ngày chỉ để tham khảo, không so chênh lệch.</p></div>
    ${charts}
    <div class="table-wrap"><table class="cinfo-table sortable">
      <thead><tr><th class="sticky-col">Tuần</th><th>Số act</th><th>% act dùng C-Info</th><th>% act tư vấn tính năng</th><th>% khớp / tư vấn</th><th>Điểm TB tính năng</th><th>Điểm TB setup</th></tr></thead>
      <tbody>${weeks.map((w) => { const pv = w.prev; return html`<tr class="static ${w.partial || w.small ? 'is-partial' : ''}">
        <td class="sticky-col"><strong>${dm(w.start)} – ${dm(w.end)}</strong>${w.partial ? html`<small class="cinfo-rate">chưa đủ tuần</small>` : w.small ? html`<small class="cinfo-rate">ít dữ liệu</small>` : ''}</td>
        <td class="num">${num(w.total)}</td>${cell(w.useRate, pv?.useRate, w)}${cell(w.adviceRate, pv?.adviceRate, w)}
        <td class="num">${pc(w.matchRate)}${w.small || pv?.small || w.advised < 10 || (pv && pv.advised < 10) ? '' : delta(w.matchRate, pv?.matchRate)}<small class="cinfo-rate">${w.matched}/${w.advised} act</small></td>
        <td class="num">${sc(w.feat)}${w.small || pv?.small ? '' : delta(w.feat, pv?.feat, { points: true })}</td><td class="num">${sc(w.setup)}${w.small || pv?.small ? '' : delta(w.setup, pv?.setup, { points: true })}</td></tr>`; })}</tbody>
    </table></div>
    ${pair && people.length ? html`
      <div class="toolbar"><h2 class="section-title">Theo nhân sự: ${dm(pair[0].start)}–${dm(pair[0].end)} so với ${dm(pair[1].start)}–${dm(pair[1].end)}</h2>
        <p class="muted">Hai tuần đủ dữ liệu gần nhất. Mỗi chỉ số: tuần trước → tuần sau. Người có dưới 10 act ở một tuần thì không so chênh lệch.</p></div>
      <div class="table-wrap"><table class="cinfo-table sortable">
        <thead><tr><th class="sticky-col">Nhân sự</th><th>Số act</th><th>% dùng C-Info</th><th>% tư vấn tính năng</th><th>% khớp / tư vấn</th></tr></thead>
        <tbody>${people.map((p) => { const ok = p.a.total >= 10 && p.b.total >= 10; return html`<tr class="static">
          <td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
          <td class="num">${p.a.total} → ${p.b.total}</td>
          <td class="num">${pc(p.a.useRate)} → ${pc(p.b.useRate)}${ok ? delta(p.b.useRate, p.a.useRate) : ''}</td>
          <td class="num">${pc(p.a.adviceRate)} → ${pc(p.b.adviceRate)}${ok ? delta(p.b.adviceRate, p.a.adviceRate) : ''}</td>
          <td class="num">${pc(p.a.matchRate)} → ${pc(p.b.matchRate)}${ok && p.a.advised >= 3 && p.b.advised >= 3 ? delta(p.b.matchRate, p.a.matchRate) : ''}<small class="cinfo-rate">${p.a.matched}/${p.a.advised} → ${p.b.matched}/${p.b.advised}</small></td></tr>`; })}</tbody>
      </table></div>` : ''}`;
}

const dmy = (isoDay) => (isoDay ? isoDay.split('-').reverse().join('/') : '—');
/** Danh sách tính năng gọn: chỉ hiện số lượng, bấm vào mới mở ra. */
const featCell = (items) => (items.length ? html`<details class="feat-list"><summary>${items.length} tính năng</summary><ul>${items.map((f) => html`<li>${f}</li>`)}</ul></details>` : html`<span class="muted">—</span>`);
const causeBadge = (id) => { const c = CAUSES.find(([k]) => k === id); return html`<span class="badge badge--${id === 'diff' ? 'warn' : 'bad'}" title="${c[2]}">${c[1]}</span>`; };

/** Ô đánh giá của quản lý: chọn kết luận và ghi chú ngắn. */
const evalCell = (a, rec) => { const data = (extra) => html`data-id="${a.id}" data-retailer="${a.retailer}" data-code="${a.code}" data-name="${a.name}" ${extra}`; return html`<td class="mm-eval">
  <select class="select heard-select ${rec ? `heard-select--${evalOf(rec.result)?.tone ?? ''}` : ''}" data-mm-select ${data('')} aria-label="Đánh giá retailer ${a.retailer}"><option value="">Chưa đánh giá</option>${EVALS.map((e) => html`<option value="${e.id}" ${rec?.result === e.id ? 'selected' : ''}>${e.label}</option>`)}</select>
  <input class="search mm-note" type="text" data-mm-note ${data('')} placeholder="Ghi chú…" value="${rec?.note ?? ''}" aria-label="Ghi chú cho retailer ${a.retailer}">
  ${rec ? html`<small class="muted">${rec.by?.split('@')[0] ?? ''} · ${rec.at ?? ''}</small>` : ''}</td>`; };

/** "Vì sao không khớp": act có tư vấn tính năng nhưng không khớp tính năng hệ thống gợi ý. */
function mismatchSection(acts, allActs, manager, { f, evals, notice }) {
  const m = analyzeMismatch(acts, allActs);
  if (!m.advised) return '';
  const evalFilter = manager ? (f.evalF ?? 'all') : 'all';
  const rows = m.bad.filter((a) => evalFilter === 'all' || (evalFilter === 'none' ? !evals.has(a.id) : evals.get(a.id)?.result === evalFilter));
  const shown = [...rows].sort((a, b) => (b.modified ?? '').localeCompare(a.modified ?? '')).slice(0, 300);
  const evalCount = (id) => m.bad.filter((a) => evals.get(a.id)?.result === id).length;
  const done = m.bad.filter((a) => evals.has(a.id)).length;
  return html`
    <div class="toolbar"><h2 class="section-title">Vì sao không khớp tính năng</h2>
      <p class="muted">${num(m.bad.length)}/${num(m.advised)} act có tư vấn tính năng không khớp tính năng hệ thống gợi ý (${pc(m.bad.length / m.advised)}). Mỗi act chỉ xếp vào một nguyên nhân. Phân loại là suy luận từ dữ liệu, không phải kết luận ai tư vấn sai.</p></div>
    <div class="grid">${CAUSES.map(([id, label, hint]) => html`<div class="card"><h3 class="card__title">${label}</h3><p class="big num">${num(m.byCause[id])}</p><p class="muted">${pc(m.bad.length ? m.byCause[id] / m.bad.length : 0)} số act không khớp · ${hint}</p></div>`)}</div>
    <div class="grid cinfo-charts">
      <section class="card"><h3 class="card__title">SC hay tư vấn nhưng hệ thống không gợi ý</h3>
        <div class="table-wrap"><table class="cinfo-table"><thead><tr><th class="sticky-col">Tính năng SC ghi</th><th>Số act</th></tr></thead>
          <tbody>${m.scOnly.map((x) => html`<tr class="static"><td class="sticky-col">${x.feature}${x.outside ? html` <span class="badge badge--bad" title="Chưa từng nằm trong danh mục gợi ý của hệ thống">ngoài danh mục</span>` : ''}</td><td class="num">${num(x.n)}</td></tr>`)}</tbody></table></div></section>
      <section class="card"><h3 class="card__title">Hệ thống hay gợi ý nhưng SC không tư vấn</h3>
        <div class="table-wrap"><table class="cinfo-table"><thead><tr><th class="sticky-col">Tính năng hệ thống gợi ý</th><th>Số act</th></tr></thead>
          <tbody>${m.rcmOnly.map((x) => html`<tr class="static"><td class="sticky-col">${x.feature}</td><td class="num">${num(x.n)}</td></tr>`)}</tbody></table></div></section>
    </div>
    ${manager ? html`
      <div class="table-wrap"><table class="cinfo-table sortable">
        <thead><tr><th class="sticky-col">Nhân sự</th><th>Act tư vấn</th><th>% khớp</th><th>SC không ghi</th><th>Ngoài danh mục</th><th>Khác gợi ý</th><th>Hệ thống không gợi ý</th><th>TB số tính năng SC ghi</th></tr></thead>
        <tbody>${m.people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
          <td class="num">${num(p.advised)}</td><td class="num">${pc(p.rate)}</td><td class="num">${p.causes['no-sc'] || '·'}</td><td class="num">${p.causes.outside || '·'}</td><td class="num">${p.causes.diff || '·'}</td><td class="num">${p.causes['no-rcm'] || '·'}</td><td class="num">${p.avgSc.toFixed(1).replace('.', ',')}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Chi tiết retailer không khớp</h2><p class="muted">${num(rows.length)} act${rows.length > shown.length ? ` (hiển thị ${num(shown.length)} act mới nhất)` : ''}. Chọn nhân sự ở ô bên dưới (dùng chung với ô "Tên SC" phía trên). Bấm "n tính năng" để xem danh sách.</p></div>
    ${manager ? html`
      ${notice ? html`<p class="notice" role="status">${notice}</p>` : ''}
      <div class="filters" aria-label="Lọc retailer không khớp">
        <label class="filter"><span>Nhân sự</span><select class="select" data-cinfo="sc">${[['all', 'Tất cả nhân sự'], ...[...new Map(allActs.map((a) => [a.code, a.name])).entries()].sort((x, y) => x[1].localeCompare(y[1], 'vi')).map(([c, n]) => [c, `${n} (${c})`])].map(([v, l]) => html`<option value="${v}" ${v === (f.sc ?? 'all') ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="filter"><span>Đánh giá của quản lý</span><select class="select" data-cinfo="evalF">${[['all', 'Tất cả'], ['none', `Chưa đánh giá (${m.bad.length - done})`], ...EVALS.map((e) => [e.id, `${e.label} (${evalCount(e.id)})`])].map(([v, l]) => html`<option value="${v}" ${v === evalFilter ? 'selected' : ''}>${l}</option>`)}</select></label>
        <p class="muted">Đã đánh giá ${num(done)}/${num(m.bad.length)} act. Đánh giá chỉ quản lý thấy, lưu ở tab "${CONFIG.tabs.mismatch}" của Sheet cấu hình.</p>
      </div>` : ''}
    <div class="table-wrap"><table class="cinfo-table">
      <thead><tr><th>Chỉnh sửa</th>${manager ? html`<th class="sticky-col">Nhân sự</th>` : ''}<th>Retailer</th><th>Nguyên nhân</th><th>SC tư vấn</th><th>Hệ thống gợi ý</th>${manager ? html`<th>Đánh giá của quản lý</th>` : ''}</tr></thead>
      <tbody>${shown.map((a) => html`<tr class="static"><td class="num">${dmy(a.modified)}</td>${manager ? html`<td class="sticky-col"><span class="person"><strong>${a.name}</strong><small>${a.code}</small></span></td>` : ''}<td class="num">${a.retailer}</td><td>${causeBadge(a.cause)}</td><td>${featCell(a.scFeatures)}</td><td>${featCell(a.rcmFeatures)}</td>${manager ? evalCell(a, evals.get(a.id)) : ''}</tr>`)}</tbody>
    </table></div>`;
}

/** Đồng hồ nửa vòng: tỉ lệ dùng Customer Info, vạch đen là mục tiêu. */
function gauge(rate) {
  const R = 80, cx = 100, cy = 100;
  const point = (r) => [cx - R * Math.cos(Math.PI * r), cy - R * Math.sin(Math.PI * r)];
  const arc = (from, to) => { const [x1, y1] = point(from), [x2, y2] = point(to); return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`; };
  const [tx1, ty1] = [cx - (R - 14) * Math.cos(Math.PI * TARGET), cy - (R - 14) * Math.sin(Math.PI * TARGET)];
  const [tx2, ty2] = [cx - (R + 14) * Math.cos(Math.PI * TARGET), cy - (R + 14) * Math.sin(Math.PI * TARGET)];
  return html`
    <svg class="gauge" viewBox="0 0 200 120" role="img" aria-label="Tỉ lệ SC sử dụng Customer Info ${pct(rate, 2)}, mục tiêu ${pct(TARGET)}">
      <path d="${arc(0, 1)}" class="gauge__track"/>
      <path d="${arc(0, Math.min(Math.max(rate, 0.001), 1))}" class="gauge__fill gauge__fill--${tone(rate)}"/>
      <line x1="${tx1}" y1="${ty1}" x2="${tx2}" y2="${ty2}" class="gauge__target"/>
      <text x="100" y="98" text-anchor="middle" class="gauge__value">${pct(rate, 2).replace('.', ',')}</text>
      <text x="14" y="116" class="gauge__min">0%</text><text x="186" y="116" text-anchor="end" class="gauge__max">100%</text>
    </svg>`;
}

const p1 = (r) => pct(r, 2).replace('.', ',');
const kpi = (title, value, cls = '', rate = null, of = '') => html`<div class="cinfo-kpi"><h3>${title}</h3><p class="cinfo-kpi__v ${cls}">${num(value)}</p>${rate == null ? '' : html`<p class="cinfo-kpi__p">${p1(rate)} <span>${of}</span></p>`}</div>`;
/** Ô số kèm tỉ lệ nhỏ bên dưới (rỗng nếu số bằng 0). */
const withRate = (value, rate) => (value ? html`<strong>${num(value)}</strong><small class="cinfo-rate">${p1(rate)}</small>` : '');

const option = (value, label, current) => html`<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
const select = (field, label, options, current) => html`
  <label class="filter"><span>${label}</span><select class="select" data-cinfo="${field}">${options.map(([v, l]) => option(v, l, current))}</select></label>`;
const dates = (label, fromKey, toKey, f, [min, max]) => html`
  <div class="filter"><span>${label}</span><div class="filter__range">
    <input type="date" class="search" data-cinfo="${fromKey}" value="${f[fromKey]}" min="${min}" max="${max}" aria-label="${label} từ ngày">
    <input type="date" class="search" data-cinfo="${toKey}" value="${f[toKey]}" min="${min}" max="${max}" aria-label="${label} đến ngày"></div></div>`;

/**
 * Báo cáo "Kết quả SC sử dụng Customer Info" (giống báo cáo Power BI): bộ lọc, 4 chỉ số, đồng hồ và bảng theo nhân sự.
 * Admin/Quản trị xem tất cả SC; nhân sự chỉ thấy phần của mình (nhận ra bằng đầu số).
 */
export function cinfoView(data, f, { manager, code, evals = new Map(), evalNotice = '' }) {
  if (!manager && !code) return html`<p class="notice">Chưa nhận ra bạn trong báo cáo (thiếu <strong>Đầu số</strong> trong tab Tài khoản). Hãy liên hệ quản lý để được bổ sung.</p>`;
  const only = manager ? null : String(code);
  const acts = filterActs(data, f, only);
  const t = totalsOf(acts);
  const rate = ratio(t.total - t.notUsed, t.total);
  const byPerson = new Map();
  for (const a of acts) {
    const p = byPerson.get(a.code) ?? { code: a.code, name: a.name, acts: [] };
    p.acts.push(a);
    byPerson.set(a.code, p);
  }
  const rows = [...byPerson.values()].map((p) => ({ ...p, ...totalsOf(p.acts) })).sort((a, b) => a.code.localeCompare(b.code));
  const people = manager ? [['all', 'Tất cả'], ...data.people.map((p) => [p.code, `${p.code} - ${p.name}`])] : null;
  return html`
    <div class="toolbar"><h2 class="section-title">Kết quả SC sử dụng Customer Info</h2>
      <p class="muted">${manager ? 'Toàn bộ SC' : 'Của bạn'} · mục tiêu ${pct(TARGET)}</p></div>
    <section class="card cinfo-filters" aria-label="Bộ lọc">
      <div class="filters">
        ${dates('Ngày tạo act', 'cFrom', 'cTo', f, data.createdRange)}${dates('Thời gian chỉnh sửa', 'mFrom', 'mTo', f, data.modifiedRange)}
        ${select('type', 'Loại công việc', [['all', 'Tất cả'], ...data.types.map((x) => [x, x])], f.type)}
        ${select('status', 'Trạng thái act', [['all', 'Tất cả'], ...data.statuses.map((x) => [x, x])], f.status)}
        ${select('used', 'used_stt', [['all', 'Tất cả'], ['yes', 'Có'], ['no', 'Không']], f.used)}
        ${select('advice', 'Tư vấn tính năng?', [['all', 'Tất cả'], ['yes', 'Có tư vấn tính năng'], ['no', 'Không tư vấn tính năng']], f.advice)}
        ${select('match', 'is_match_feature', [['all', 'Tất cả'], ['0', '0'], ['1', '1']], f.match)}
        ${people ? select('sc', 'Tên SC', people, f.sc) : ''}
        ${JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS) ? html`<button class="link-btn filters__clear" type="button" data-cinfo-clear>Xóa lọc</button>` : ''}
      </div></section>
    <div class="cinfo-top">
      <section class="card cinfo-kpis">${kpi('Số activity Fnb new', t.total)}${kpi('Không dùng C-Info', t.notUsed, 'is-bad', ratio(t.notUsed, t.total), 'tổng act')}${kpi('Act tư vấn tính năng', t.advised, '', ratio(t.advised, t.total), 'tổng act')}${kpi('Act TVTN theo RCM', t.matched, 'is-good', ratio(t.matched, t.advised), 'act tư vấn TN')}</section>
      <section class="card cinfo-gauge"><h3 class="card__title">% SC sử dụng Customer Info</h3>${gauge(rate)}<p class="muted">Mục tiêu ${pct(TARGET)} · ${rate >= TARGET ? 'đạt' : 'chưa đạt'}</p></section>
    </div>
    ${rows.length ? html`
      <div class="table-wrap"><table class="cinfo-table sortable">
        <thead><tr><th class="sticky-col">${manager ? 'Nhân sự' : 'Loại công việc'}</th><th>Số act Fnb new</th><th>Số act không dùng C-Info</th><th>% act dùng C-Info</th><th>Act có tư vấn tính năng</th><th>Act có tư vấn tính năng theo RCM</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr class="static">
          <td class="sticky-col"><span class="person"><strong>${r.name}</strong><small>${r.code}</small></span></td>
          <td class="num">${num(r.total)}</td><td class="num">${withRate(r.notUsed, ratio(r.notUsed, r.total))}</td>
          <td class="num cinfo-pct cinfo-pct--${tone(ratio(r.total - r.notUsed, r.total))}">${pct(ratio(r.total - r.notUsed, r.total), 2).replace('.', ',')}</td>
          <td class="num">${withRate(r.advised, ratio(r.advised, r.total))}</td><td class="num">${withRate(r.matched, ratio(r.matched, r.advised))}</td></tr>`)}</tbody>
        <tfoot><tr><td class="sticky-col"><strong>Tổng</strong></td><td class="num">${num(t.total)}</td><td class="num">${withRate(t.notUsed, ratio(t.notUsed, t.total))}</td>
          <td class="num cinfo-pct cinfo-pct--${tone(rate)}">${pct(rate, 2).replace('.', ',')}</td><td class="num">${withRate(t.advised, ratio(t.advised, t.total))}</td><td class="num">${withRate(t.matched, ratio(t.matched, t.advised))}</td></tr></tfoot>
      </table></div>
      <p class="muted">Act = activity. "Không dùng C-Info" là act có <code>used_stt</code> = Không. "Tư vấn tính năng" là act có công việc hỗ trợ <em>Tư vấn tính năng</em>; "theo RCM" là act tư vấn tính năng mà tính năng SC tư vấn khớp với tính năng RCM đề xuất (<code>is_match_feature</code> = 1). Tỉ lệ nhỏ bên dưới: "không dùng" và "tư vấn tính năng" tính trên tổng act; "theo RCM" tính trên số act tư vấn tính năng.</p>`
      : html`<p class="muted">Không có activity nào khớp bộ lọc.</p>`}
    ${weeklySection(acts, manager)}
    ${mismatchSection(acts, data.acts, manager, { f, evals, notice: evalNotice })}`;
}
