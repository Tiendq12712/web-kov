import { html } from '../dom.js';
import { num as fmt } from '../format.js';
import { summarize } from '../hr.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const days = (v) => (v == null ? '—' : fmt(Math.round(v * 10) / 10));
const tone = (balance) => (balance < 0 ? 'is-bad' : balance < 1 ? 'is-warn' : '');

/** Tháng hiện tại (1–12) để tính "còn lại hiện tại"; năm khác năm của Sheet thì lấy cả năm. */
const nowMonth = (year) => { const d = new Date(); return d.getFullYear() === year ? d.getMonth() + 1 : 12; };

const stat = (title, value, sub, cls = '') => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num ${cls}">${value}</p><p class="muted">${sub}</p></div>`;

/** Các dòng của bảng quản lý, đã lọc theo ô tìm kiếm (tên, mã NV, đầu số) và khu vực. */
export function hrRows(hr, { q = '', region = 'all' }) {
  const needle = plain(q).trim(), upto = nowMonth(hr.year);
  return hr.people.filter((p) => (region === 'all' || p.region === region) && (!needle || plain(`${p.name} ${p.mnv} ${p.code}`).includes(needle)))
    .map((p) => ({ p, s: p.leave ? summarize(p.leave, upto) : null }));
}

export const hrRowsView = (hr, ui) => {
  const rows = hrRows(hr, ui);
  if (!rows.length) return html`<tr class="static"><td colspan="9" class="muted">Không có nhân sự nào khớp.</td></tr>`;
  return html`${rows.map(({ p, s }) => html`<tr class="static">
    <td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code ? `${p.code} · ` : ''}${p.mnv}</small></span></td>
    <td>${p.region || '—'}</td><td class="num">${p.level ?? '—'}</td>
    ${s ? html`<td class="num">${days(s.carry)}</td><td class="num">${days(s.added)}</td><td class="num">${days(s.used)}</td>
      <td class="num strong ${tone(s.balance)}">${days(s.balance)}</td><td class="num">${days(s.endOfYear)}</td>`
      : html`<td colspan="5" class="muted">Chưa có dữ liệu phép</td>`}</tr>`)}`;
};

/** Phép đã dùng theo tháng của toàn bộ nhân sự (ô có dùng phép được tô nổi). */
function usedMatrix(hr, upto) {
  const withLeave = hr.people.filter((p) => p.leave);
  return html`
    <div class="toolbar"><h2 class="section-title">Phép đã dùng theo tháng</h2><p class="muted">Số ngày phép đã dùng mỗi tháng (đến tháng ${upto})</p></div>
    <div class="table-wrap"><table class="day-table hr-matrix">
      <thead><tr><th class="sticky-col">Nhân sự</th>${MONTHS.map((m) => html`<th class="right">T${m}</th>`)}<th class="right">Tổng</th></tr></thead>
      <tbody>${withLeave.map((p) => {
        const by = new Map(p.leave.months.map((m) => [m.month, m.used]));
        const total = MONTHS.filter((m) => m <= upto).reduce((a, m) => a + (by.get(m) ?? 0), 0);
        return html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${p.name}</strong><small>${p.code}</small></span></td>
          ${MONTHS.map((m) => { const v = m <= upto ? by.get(m) : null; return html`<td class="right num ${v > 0 ? 'hr-used' : 'muted'}">${v > 0 ? days(v) : '·'}</td>`; })}
          <td class="right num strong">${days(total)}</td></tr>`;
      })}</tbody>
    </table></div>`;
}

/** Quản lý: tổng quan phép năm cả nhóm. */
function managerView(hr, ui) {
  const upto = nowMonth(hr.year);
  const sums = hr.people.filter((p) => p.leave).map((p) => ({ p, s: summarize(p.leave, upto) }));
  const regions = [...new Set(hr.people.map((p) => p.region).filter(Boolean))];
  const used = sums.reduce((a, x) => a + x.s.used, 0), left = sums.reduce((a, x) => a + x.s.balance, 0);
  const debt = sums.filter((x) => x.s.balance < 0);
  return html`
    <div class="toolbar"><h2 class="section-title">Nhân sự và phép năm ${hr.year}</h2><p class="muted">Số liệu đến tháng ${upto}</p></div>
    <div class="grid">
      ${stat('Nhân sự', hr.people.length, `${sums.length} người có dữ liệu phép`)}
      ${stat('Phép đã dùng', days(used), `Tổng đến tháng ${upto}`)}
      ${stat('Phép còn lại', days(left), 'Tổng số dư của cả nhóm')}
      ${stat('Nợ phép (số dư âm)', debt.length, debt.length ? debt.map((x) => x.p.name).join(', ') : 'Không có ai', debt.length ? 'is-bad' : 'is-good')}
    </div>
    <section class="card" aria-label="Bộ lọc"><div class="filters">
      <label class="filter filter--grow"><span>Tìm</span><input id="hr-search" class="search" type="search" placeholder="Tên, mã NV hoặc đầu số…" value="${ui.q}" autocomplete="off"></label>
      <label class="filter"><span>Khu vực</span><select class="select" id="hr-region"><option value="all">Tất cả</option>${regions.map((r) => html`<option value="${r}" ${r === ui.region ? 'selected' : ''}>${r}</option>`)}</select></label>
    </div></section>
    <div class="table-wrap"><table class="hr-table sortable">
      <thead><tr><th class="sticky-col">Nhân sự</th><th>Khu vực</th><th>Level</th><th>Tồn 2025</th><th>Phép thêm</th><th>Đã dùng</th><th>Còn lại</th><th>Cuối năm (dự kiến)</th></tr></thead>
      <tbody id="hr-rows">${hrRowsView(hr, ui)}</tbody>
    </table></div>
    <p class="muted table-hint">Còn lại = số dư tháng gần nhất có số liệu. Đỏ: nợ phép (âm), vàng: dưới 1 ngày.</p>
    ${usedMatrix(hr, upto)}`;
}

/** Nhân sự: chỉ phép năm của chính mình. */
function memberView(hr, code) {
  const me = hr.people.find((p) => p.code === String(code));
  if (!me?.leave) return html`<p class="notice">Chưa tìm thấy dữ liệu phép năm của bạn (cần đúng <strong>Đầu số</strong> trong tab Tài khoản và có tên trong Sheet nhân sự). Hãy liên hệ quản lý.</p>`;
  const upto = nowMonth(hr.year), s = summarize(me.leave, upto);
  return html`
    <div class="toolbar"><h2 class="section-title">Phép năm ${hr.year} của bạn</h2><p class="muted">${me.name} · ${me.mnv}${me.region ? ` · ${me.region}` : ''}</p></div>
    <div class="grid">
      ${stat('Phép còn lại', days(s.balance), `Số dư đến tháng ${upto}`, s.balance < 0 ? 'is-bad' : 'is-good')}
      ${stat('Đã dùng', days(s.used), `Năm ${hr.year} đến tháng ${upto}`)}
      ${stat('Phép được thêm', days(s.added), 'Cộng dồn các tháng')}
      ${stat('Tồn từ 2025', days(s.carry), 'Chuyển sang 2026')}
    </div>
    <div class="table-wrap"><table class="hr-table sortable">
      <thead><tr><th>Tháng</th><th>Phép thêm</th><th>Đã dùng</th><th>Còn lại</th></tr></thead>
      <tbody>${me.leave.months.filter((m) => m.balance != null || m.used != null).map((m) => html`<tr class="static">
        <td class="num" data-sort="${m.month}">Tháng ${m.month}</td><td class="num">${days(m.add)}</td><td class="num ${m.used > 0 ? 'hr-used' : ''}">${days(m.used)}</td>
        <td class="num strong ${tone(m.balance ?? 0)}">${days(m.balance)}</td></tr>`)}</tbody>
    </table></div>
    <p class="muted table-hint">Phép còn lại âm nghĩa là đang dùng vượt số phép được hưởng. Thấy số chưa đúng? Báo quản lý ở mục Chia sẻ.</p>`;
}

export function hrView(hr, ui, { manager, code }) {
  return manager ? managerView(hr, ui) : memberView(hr, code);
}
