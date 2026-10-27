import { html } from '../dom.js';
import { num as fmt } from '../format.js';
import { leaveStatus, statusOf, STATUS, usageRate, monthTotals, regionStats, hrInsights, LOW_BALANCE, HIGH_BALANCE } from '../hr.js';
import { chartCard, groupedColumns, donutChart, sparkline } from './charts.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const days = (v) => (v == null ? '—' : fmt(Math.round(v * 10) / 10));
const pc = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const tone = (balance) => (balance < 0 ? 'is-bad' : balance < LOW_BALANCE ? 'is-warn' : '');

/** Tháng hiện tại (1–12) để tính "còn lại hiện tại"; năm khác năm của Sheet thì lấy cả năm. */
const nowMonth = (year) => { const d = new Date(); return d.getFullYear() === year ? d.getMonth() + 1 : 12; };

/** Ô phép tồn năm trước: còn bao nhiêu, hạn 31/3 (còn mấy ngày) hoặc đã mất bao nhiêu do quá hạn. */
const carryCell = (s) => {
  if (!s.carry) return html`<span class="muted">—</span>`;
  const note = s.expired > 0 ? html`<span class="badge badge--bad">mất ${days(s.expired)}</span>` : s.carryLeft > 0
    ? html`<span class="badge badge--warn" title="Dùng trước hết ngày 31/3; quá hạn sẽ mất">còn ${days(s.carryLeft)}${s.daysToDeadline != null ? ` · ${s.daysToDeadline} ngày` : ''}</span>` : html`<span class="badge badge--good">đã dùng hết</span>`;
  return html`<span class="num">${days(s.carry)}</span><small class="hr-carry-note">${note}</small>`;
};
const stat = (title, value, sub, cls = '') => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num ${cls}">${value}</p><p class="muted">${sub}</p></div>`;
const statusBadge = (st) => html`<span class="badge badge--${STATUS[st].tone === 'info' ? 'neutral' : STATUS[st].tone}">${STATUS[st].label}</span>`;
const bar = (v, max, t = '') => html`<div class="bar ${t ? `bar--${t}` : ''}"><div class="bar__fill" style="width:${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%"></div></div>`;
const insightsCard = (items) => (items.length ? html`<section class="card insights" aria-label="Nhận định"><h2 class="section-title">Nhận định</h2>
  <ul class="insights__list">${items.map((i) => html`<li class="insights__item ${i.tone && i.tone !== 'info' ? `insights__item--${i.tone === 'bad' ? 'bad' : i.tone === 'warn' ? 'bad' : 'good'}` : ''}">${i.text}</li>`)}</ul></section>` : '');

/** Các dòng của bảng quản lý, đã lọc theo ô tìm kiếm (tên, mã NV, đầu số), khu vực và tình trạng. */
export function hrRows(hr, { q = '', region = 'all', status = 'all' }) {
  const needle = plain(q).trim(), upto = nowMonth(hr.year);
  return hr.people.filter((p) => (region === 'all' || p.region === region) && (!needle || plain(`${p.name} ${p.mnv} ${p.code}`).includes(needle)))
    .map((p) => ({ p, s: p.leave ? leaveStatus(p.leave, upto, hr.year) : null }))
    .filter(({ s }) => status === 'all' || (s && statusOf(s.effective) === status));
}

export const hrRowsView = (hr, ui) => {
  const rows = hrRows(hr, ui);
  if (!rows.length) return html`<tr class="static"><td colspan="10" class="muted">Không có nhân sự nào khớp.</td></tr>`;
  return html`${rows.map(({ p, s }) => {
    const rate = s ? usageRate(s) : null, st = s ? statusOf(s.effective) : null;
    const balances = p.leave ? p.leave.months.map((m) => m.balance) : [];
    return html`<tr class="static">
      <td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code ? `${p.code} · ` : ''}${p.mnv}</small></span></td>
      <td>${p.region || '—'}</td>
      ${s ? html`<td>${statusBadge(st)}</td><td class="hr-carry">${carryCell(s)}</td><td class="num">${days(s.carry + s.added)}</td>
        <td class="hr-use"><span class="num">${days(s.used)}</span>${bar(rate ?? 0, 1, rate >= 1 ? 'bad' : rate >= 0.8 ? 'warn' : '')}<small class="muted">${pc(rate)}</small></td>
        <td class="num strong ${tone(s.effective)}" data-sort="${s.effective}" title="${s.expired > 0 ? `Số dư theo Sheet (đã trừ ${days(s.expired)} ngày phép tồn hết hạn từ tháng 4)` : ''}">${days(s.effective)}</td><td class="num">${days(s.endOfYear)}</td>
        <td class="hr-spark tone-${st === 'debt' ? 'bad' : st === 'low' ? 'none' : 'good'}">${sparkline(balances, { w: 84, h: 26 })}</td>`
        : html`<td colspan="7" class="muted">Chưa có dữ liệu phép</td>`}</tr>`;
  })}`;
};

/**
 * Phép đã dùng theo tháng của từng người. Mỗi tháng được cộng thêm phép; giữa T3 và T4 là mốc hết hạn phép tồn năm trước (31/3):
 * còn lại hết T3, phần tồn mất sau mốc, và phép năm nay còn lại sau mốc. Ô tô đậm dần theo số ngày nghỉ.
 */
function usedMatrix(hr, upto) {
  const withLeave = hr.people.filter((p) => p.leave);
  const max = Math.max(1, ...withLeave.flatMap((p) => p.leave.months.filter((m) => m.month <= upto).map((m) => m.used ?? 0)));
  const prev = hr.year - 1;
  const adds = withLeave.flatMap((p) => p.leave.months.map((m) => m.add).filter((v) => v > 0)), typical = adds.length ? [...new Set(adds)].sort((a, b) => adds.filter((x) => x === b).length - adds.filter((x) => x === a).length)[0] : 1;
  const cell = (m, by) => { const v = m <= upto ? by.get(m) : null; return html`<td class="right num ${v > 0 ? 'hr-used' : 'muted'}" ${v > 0 ? html`style="--i:${(v / max).toFixed(2)}"` : ''}>${v > 0 ? days(v) : '·'}</td>`; };
  const cut = (v, cls = '') => html`<td class="right num hr-cut ${cls}">${v == null ? '·' : days(v)}</td>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Phép đã dùng theo tháng</h2><p class="muted">Mỗi tháng được cộng thêm ${days(typical)} ngày phép. Ô tháng là số ngày đã dùng (đến tháng ${upto}), càng đậm càng nghỉ nhiều. Cụm giữa T3 và T4 là <strong>mốc hết 31/3</strong>: phép tồn ${prev} còn dư sau mốc này sẽ mất.</p></div>
    <div class="table-wrap"><table class="day-table hr-matrix">
      <thead><tr><th class="sticky-col">Nhân sự</th><th class="right hr-carry-col">Tồn ${prev}</th>${[1, 2, 3].map((m) => html`<th class="right">T${m}</th>`)}
        <th class="right hr-cut hr-cut--head" title="Tổng phép còn lại cuối tháng 3 (tồn + phép được thêm − đã dùng)">Còn lại hết T3</th><th class="right hr-cut hr-cut--head" title="Phần phép tồn ${prev} chưa dùng hết trước 31/3: mất">Tồn ${prev} mất</th><th class="right hr-cut hr-cut--head" title="Phép ${hr.year} còn lại sau khi tồn ${prev} hết hạn">Phép ${hr.year} còn sau T3</th>
        ${MONTHS.filter((m) => m > 3).map((m) => html`<th class="right">T${m}</th>`)}<th class="right">Tổng đã dùng</th><th class="right">Còn lại hiện tại</th></tr></thead>
      <tbody>${withLeave.map((p) => {
        const by = new Map(p.leave.months.map((m) => [m.month, m.used])), s = leaveStatus(p.leave, upto, hr.year);
        const total = MONTHS.filter((m) => m <= upto).reduce((a, m) => a + (by.get(m) ?? 0), 0);
        return html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
          <td class="right num hr-carry-col">${s.carry ? days(s.carry) : '·'}</td>
          ${[1, 2, 3].map((m) => cell(m, by))}
          ${cut(s.q1Balance)}${s.q1Lost > 0 ? html`<td class="right num hr-cut"><span class="badge badge--bad">mất ${days(s.q1Lost)}</span></td>` : cut(s.carry ? 0 : null)}${cut(s.q1Own, s.q1Own != null && s.q1Own < 0 ? 'is-bad' : 'strong')}
          ${MONTHS.filter((m) => m > 3).map((m) => cell(m, by))}
          <td class="right num strong">${days(total)}</td>
          <td class="right num strong ${tone(s.effective)}">${days(s.effective)}</td></tr>`;
      })}</tbody>
    </table></div>
    <p class="muted table-hint">Còn lại hết T3 = tồn ${prev} + phép được thêm T1–T3 − đã dùng T1–T3 (theo Sheet). Phép tồn ${prev} được dùng trước; phần còn dư sau 31/3 mất, nên "Phép ${hr.year} còn sau T3" = còn lại hết T3 − tồn mất. "Còn lại hiện tại" là số dư tháng gần nhất theo Sheet, từ tháng 4 Sheet đã trừ phần tồn mất.</p>`;
}

/** Biểu đồ số dư phép từng nhân sự: thanh theo số ngày còn lại, đỏ khi nợ, cam khi sắp hết. */
function balanceChart(sums) {
  const list = [...sums].sort((a, b) => a.s.effective - b.s.effective), max = Math.max(1, ...list.map((x) => Math.abs(x.s.effective)));
  return html`<div class="hist hr-hist">${list.map(({ p, s }) => {
    const st = statusOf(s.effective);
    return html`<div class="hist__row"><span title="${p.name}">${p.name}</span>${bar(Math.abs(s.effective), max, st === 'debt' ? 'bad' : st === 'low' ? 'warn' : '')}<span class="num ${tone(s.effective)}">${days(s.effective)} <small class="muted">ngày</small></span></div>`;
  })}</div>`;
}

/** Quản lý: tổng quan phép năm cả nhóm. */
function managerView(hr, ui) {
  const upto = nowMonth(hr.year), status = ['all', 'debt', 'low', 'ok', 'high'].includes(ui.status) ? ui.status : 'all';
  const sums = hr.people.filter((p) => p.leave).map((p) => ({ p, s: leaveStatus(p.leave, upto, hr.year) }));
  const regions = [...new Set(hr.people.map((p) => p.region).filter(Boolean))];
  const used = sums.reduce((a, x) => a + x.s.used, 0), left = sums.reduce((a, x) => a + x.s.effective, 0);
  const count = (st) => sums.filter((x) => statusOf(x.s.effective) === st).length;
  const debt = sums.filter((x) => x.s.effective < 0), months = monthTotals(hr.people, upto), rs = regionStats(hr.people, upto, hr.year);
  const pendingCarry = sums.reduce((a, x) => a + x.s.carryLeft, 0), lostCarry = sums.reduce((a, x) => a + x.s.expired, 0), pendingPeople = sums.filter((x) => x.s.carryLeft > 0).length, lostPeople = sums.filter((x) => x.s.expired > 0).length;
  const daysLeft = sums.find((x) => x.s.daysToDeadline != null)?.s.daysToDeadline;
  const chip = (id, label, n) => html`<button class="chip" type="button" data-hr-status="${id}" aria-pressed="${id === status}">${label}${n == null ? '' : html` <b>${n}</b>`}</button>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Nhân sự và phép năm ${hr.year}</h2><p class="muted">Số liệu đến tháng ${upto}</p></div>
    <p class="notice hr-policy">Quy định: phép năm được dùng đến hết tháng 3 năm sau; hết hạn không dùng thì coi như mất. Phép tồn ${hr.year - 1} được dùng trước (các ngày nghỉ tháng 1–3 trừ vào tồn trước); hết 31/3/${hr.year} còn dư là mất, Mỗi tháng được cộng thêm phép; số "Còn lại" lấy theo Sheet (từ tháng 4 Sheet đã trừ phần tồn mất). Phép ${hr.year} dùng được đến hết 31/3/${hr.year + 1}.</p>
    <div class="grid">
      ${stat('Nhân sự', hr.people.length, `${sums.length} người có dữ liệu phép`)}
      ${stat('Phép đã dùng', days(used), `Trung bình ${days(sums.length ? used / sums.length : 0)} ngày/người đến tháng ${upto}`)}
      ${stat('Phép còn lại', days(left), 'Tổng số dư của cả nhóm theo Sheet')}
      ${pendingCarry > 0 ? stat(`Tồn ${hr.year - 1} sắp hết hạn`, days(pendingCarry), `${pendingPeople} người, hạn 31/3/${hr.year}${daysLeft != null ? ` (còn ${daysLeft} ngày)` : ''}`, 'is-warn') : stat(`Tồn ${hr.year - 1} đã mất`, days(lostCarry), lostPeople ? `${lostPeople} người không dùng hết trước 31/3/${hr.year}` : 'Không ai mất phép tồn', lostCarry ? 'is-bad' : 'is-good')}
      ${stat('Nợ phép', debt.length, debt.length ? debt.map((x) => x.p.name).join(', ') : 'Không có ai', debt.length ? 'is-bad' : 'is-good')}
      ${stat('Sắp hết phép', count('low'), `Còn dưới ${LOW_BALANCE} ngày`, count('low') ? 'is-warn' : '')}
      ${stat('Còn nhiều phép', count('high'), `Từ ${HIGH_BALANCE} ngày, nên khuyến khích nghỉ`)}
    </div>
    ${insightsCard(hrInsights(hr.people, upto, hr.year))}
    <div class="charts">
      ${chartCard('Phép đã dùng theo tháng', groupedColumns({ categories: months.map((m) => `T${m.month}`), series: [{ name: 'Đã dùng (ngày)', cls: 's2', values: months.map((m) => m.used) }], ratio: false, format: (v) => days(v), values: true }), 'Tổng số ngày phép cả nhóm đã dùng mỗi tháng.')}
      ${chartCard('Số dư phép từng nhân sự', balanceChart(sums), 'Số ngày phép còn lại; đỏ: nợ phép, cam: sắp hết.')}
      ${rs.length > 1 ? chartCard('Theo khu vực', html`<div class="table-wrap"><table class="connect-table"><thead><tr><th class="sticky-col">Khu vực</th><th class="right">Nhân sự</th><th class="right">Đã dùng</th><th class="right">Còn lại</th><th class="right">Nợ phép</th></tr></thead>
        <tbody>${rs.map((r) => html`<tr class="static"><td class="sticky-col"><strong>${r.region}</strong></td><td class="right num">${r.n}</td><td class="right num">${days(r.used)}</td><td class="right num ${tone(r.balance)}">${days(r.balance)}</td><td class="right num">${r.debt || '—'}</td></tr>`)}</tbody></table></div>`, 'Phép đã dùng và còn lại cộng theo khu vực.') : ''}
    </div>
    <section class="card" aria-label="Bộ lọc"><div class="filters">
      <label class="filter filter--grow"><span>Tìm</span><input id="hr-search" class="search" type="search" placeholder="Tên, mã NV hoặc đầu số…" value="${ui.q}" autocomplete="off"></label>
      <label class="filter"><span>Khu vực</span><select class="select" id="hr-region"><option value="all">Tất cả</option>${regions.map((r) => html`<option value="${r}" ${r === ui.region ? 'selected' : ''}>${r}</option>`)}</select></label>
      <div class="filter"><span>Tình trạng</span><div class="chips" role="group" aria-label="Lọc theo tình trạng phép">${chip('all', 'Tất cả', null)}${chip('debt', 'Nợ phép', count('debt'))}${chip('low', 'Sắp hết', count('low'))}${chip('ok', 'Bình thường', count('ok'))}${chip('high', 'Còn nhiều', count('high'))}</div></div>
    </div></section>
    <div class="table-wrap"><table class="hr-table sortable">
      <thead><tr><th class="sticky-col">Nhân sự</th><th>Khu vực</th><th>Tình trạng</th><th>Tồn ${hr.year - 1}</th><th>Phép được hưởng</th><th>Đã dùng</th><th>Còn lại</th><th>Cuối năm (dự kiến)</th><th>Số dư 12 tháng</th></tr></thead>
      <tbody id="hr-rows">${hrRowsView(hr, ui)}</tbody>
    </table></div>
    <p class="muted table-hint">Phép được hưởng = tồn ${hr.year - 1} + phép được thêm đến tháng ${upto}. Còn lại = số dư tháng gần nhất có số liệu theo Sheet (từ tháng 4 đã trừ phép tồn hết hạn). Đỏ: nợ phép (âm), cam: dưới ${LOW_BALANCE} ngày.</p>
    ${usedMatrix(hr, upto)}`;
}

/** Nhân sự: chỉ phép năm của chính mình. */
function memberView(hr, code) {
  const me = hr.people.find((p) => p.code === String(code));
  if (!me?.leave) return html`<p class="notice">Chưa tìm thấy dữ liệu phép năm của bạn (cần đúng <strong>Đầu số</strong> trong tab Tài khoản và có tên trong Sheet nhân sự). Hãy liên hệ quản lý.</p>`;
  const upto = nowMonth(hr.year), s = leaveStatus(me.leave, upto, hr.year), st = statusOf(s.effective), rate = usageRate(s), prev = hr.year - 1;
  const cols = me.leave.months.filter((m) => m.balance != null || m.used != null);
  const msg = st === 'debt' ? `Bạn đang dùng vượt ${days(-s.effective)} ngày phép so với số được hưởng.` : st === 'low' ? `Bạn sắp hết phép (còn ${days(s.effective)} ngày), cân nhắc khi xin nghỉ.`
    : st === 'high' ? `Bạn còn ${days(s.effective)} ngày phép, nên sắp xếp nghỉ để không dồn cuối năm.` : `Bạn còn ${days(s.effective)} ngày phép, dự kiến cuối năm còn ${days(s.endOfYear)} ngày.`;
  // Phép tồn năm trước: dùng trước, hết 31/3 còn dư là mất.
  const carryNote = !s.carry ? '' : s.expired > 0
    ? html`<p class="notice hr-carry-alert hr-carry-alert--bad"><strong>Đã mất ${days(s.expired)} ngày phép tồn ${prev}.</strong> Bạn có ${days(s.carry)} ngày tồn, đã dùng ${days(s.carryUsed)} ngày trong tháng 1–3 và phần còn lại hết hạn ngày 31/3/${hr.year} (quy định: phép năm dùng đến hết tháng 3 năm sau, quá hạn coi như mất).</p>`
    : s.carryLeft > 0
      ? html`<p class="notice hr-carry-alert"><strong>Còn ${days(s.carryLeft)} ngày phép tồn ${prev} cần dùng trước 31/3/${hr.year}${s.daysToDeadline != null ? ` (còn ${s.daysToDeadline} ngày)` : ''}.</strong> Bạn có ${days(s.carry)} ngày tồn, đã dùng ${days(s.carryUsed)} ngày; quá hạn sẽ mất. Phép tồn được dùng trước, rồi mới tới phép ${hr.year}.</p>`
      : html`<p class="notice notice--good">Bạn đã dùng hết ${days(s.carry)} ngày phép tồn ${prev} trước hạn 31/3/${hr.year}, không mất ngày nào.</p>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Phép năm ${hr.year} của bạn</h2><p class="muted">${me.name} · ${me.mnv}${me.region ? ` · ${me.region}` : ''}</p></div>
    <section class="card hr-hero">
      ${donutChart({ segments: [{ label: 'Đã dùng', value: Math.max(s.used, 0), cls: 's2' }, { label: 'Còn lại', value: Math.max(s.effective, 0), cls: 's1' }], center: { value: days(s.effective), label: 'ngày còn lại' }, format: (v) => days(v) })}
      <div class="hr-hero__text"><p>${statusBadge(st)}</p><p class="hr-hero__msg">${msg}</p>
        <p class="muted">Đã dùng ${days(s.used)} / ${days(s.carry + s.added)} ngày được hưởng đến tháng ${upto} (${pc(rate)}).</p></div>
    </section>
    ${carryNote}
    <div class="grid">
      ${stat('Phép còn lại', days(s.effective), `Số dư đến tháng ${upto}${s.expired > 0 ? ` (Sheet đã trừ ${days(s.expired)} ngày tồn hết hạn)` : ''}`, s.effective < 0 ? 'is-bad' : 'is-good')}
      ${stat('Đã dùng', days(s.used), `Năm ${hr.year} đến tháng ${upto}`)}
      ${stat('Phép được thêm', days(s.added), 'Cộng dồn các tháng')}
      ${stat(`Tồn từ ${prev}`, days(s.carry), s.expired > 0 ? `Đã dùng ${days(s.carryUsed)}, mất ${days(s.expired)} (hết hạn 31/3)` : s.carryLeft > 0 ? `Đã dùng ${days(s.carryUsed)}, còn ${days(s.carryLeft)} (hạn 31/3)` : s.carry ? 'Đã dùng hết' : 'Không có', s.expired > 0 ? 'is-bad' : s.carryLeft > 0 ? 'is-warn' : '')}
    </div>
    ${chartCard('Phép dùng và số dư theo tháng', groupedColumns({ categories: cols.map((m) => `T${m.month}`), series: [{ name: 'Đã dùng', cls: 's2', values: cols.map((m) => m.used ?? 0) }, { name: 'Số dư cuối tháng', cls: 's1', values: cols.map((m) => Math.max(m.balance ?? 0, 0)) }], ratio: false, format: (v) => days(v), values: cols.length <= 8 }), 'Cột xanh lá: ngày phép đã dùng; cột xanh dương: số dư còn lại cuối mỗi tháng.')}
    <div class="table-wrap"><table class="hr-table sortable">
      <thead><tr><th>Tháng</th><th>Phép thêm</th><th>Đã dùng</th><th>Còn lại</th></tr></thead>
      <tbody>${cols.map((m) => html`<tr class="static">
        <td class="num" data-sort="${m.month}">Tháng ${m.month}</td><td class="num">${days(m.add)}</td><td class="num ${m.used > 0 ? 'hr-used' : ''}" ${m.used > 0 ? html`style="--i:0.6"` : ''}>${days(m.used)}</td>
        <td class="num strong ${tone(m.balance ?? 0)}">${days(m.balance)}</td></tr>`)}</tbody>
    </table></div>
    <p class="muted table-hint">Phép còn lại âm nghĩa là đang dùng vượt số phép được hưởng. Thấy số chưa đúng? Báo quản lý ở mục Chia sẻ.</p>`;
}

export function hrView(hr, ui, { manager, code }) {
  return manager ? managerView(hr, ui) : memberView(hr, code);
}
