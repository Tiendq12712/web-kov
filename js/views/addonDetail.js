import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeAddonDetail } from '../addonDetail.js';
import { FULL } from '../addonScore.js';

const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const lostCell = (n) => (n ? html`<span class="addon-lost">−${num(n)}</span>` : html`<span class="muted">0</span>`);
const SHORT = { 'Kích hoạt payment thành công': 'Payment', 'Giới thiệu Kship': 'Kship', 'Giới thiệu Lending': 'Lending', 'Giới thiệu nâng gói': 'Nâng gói', 'Mua phần cứng': 'Phần cứng', 'Giới thiệu Thêm kho/thêm chi nhánh': 'Kho/CN', 'Giới thiệu Hotellink': 'Hotellink', 'Hướng dẫn KH HDDT/CKS thành công': 'HDDT/CKS', 'Chuyển lead ký mới': 'Lead ký mới', 'Chuyển lead tái ký': 'Lead tái ký' };

const reasonOf = (a) => {
  if (a.missing) return 'Không có trong báo cáo PBI (thiếu retailer) → trừ đủ';
  const x = a.note;
  if (!x) return a.status || '';
  if (a.type === 'kship') return [x.status || 'Chưa có trạng thái', x.cause].filter(Boolean).join(' · ');
  if (a.type === 'payment') return `${x.registered ? `Đăng ký ${x.registered}` : 'Chưa đăng ký'} · ${x.digi || 0} ngày có giao dịch`;
  return x.einvoice ? `${x.einvoice} hóa đơn điện tử` : 'Chưa phát sinh hóa đơn';
};

/** Tab "Chi tiết Add-on": thống kê toàn bộ add-on của team theo loại và theo nhân sự, và chi tiết từng act của một nhân sự. */
export function addonDetailView(data, ui, { manager, code, names, month, members }) {
  if (!manager && !code) return html`<p class="notice">Chưa nhận ra bạn trong danh sách nhân sự nên chưa hiện được add-on của bạn. Nhờ quản trị điền <strong>Đầu số</strong> cho tài khoản của bạn trong Thiết lập.</p>`;
  const person = manager ? (ui.person ?? 'all') : code, type = ui.type ?? 'all';
  const team = analyzeAddonDetail(data.rows, members, { month, code: manager ? null : code });
  const a = person === 'all' ? team : analyzeAddonDetail(data.rows, members, { month, code: person });
  if (!team.acts.length && !team.hasScores) return html`<p class="notice">Chưa có add-on nào trong tháng này (cột add-on của tab "Data Txx" và Sheet Addon).</p>`;
  const nm = (c, f) => names.get(c) ?? f;
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const acts = a.acts.filter((x) => type === 'all' || x.kind === type || x.type === type).sort((x, y) => (y.lost - x.lost) || (y.date ?? '').localeCompare(x.date ?? ''));
  const shown = acts.slice(0, 400);
  // Hai ô lọc xuất hiện ở đầu tab và ngay trên bảng chi tiết; dùng chung một trạng thái nên đổi ô nào cũng được.
  const filters = (suffix) => html`<div class="filters" role="search" aria-label="Lọc add-on">
      ${manager ? html`<label class="filter"><span>Nhân sự</span><select id="ad-person${suffix}" class="select">${opt('all', 'Cả team', person)}${team.people.map((p) => opt(p.code, `${nm(p.code, p.name)} (${p.code})`, person))}</select></label>` : ''}
      <label class="filter"><span>Loại add-on</span><select id="ad-type${suffix}" class="select">${opt('all', 'Tất cả loại', type)}${team.kinds.map((k) => opt(k, k, type))}</select></label>
      ${person !== 'all' || type !== 'all' ? html`<button class="link-btn filters__clear" type="button" data-ad-clear>Xóa lọc</button>` : ''}
    </div>`;
  const who = person === 'all' ? 'cả team' : nm(person, members.find((m) => m.code === person)?.name ?? person);
  return html`
    <div class="toolbar"><h2 class="section-title">Chi tiết Add-on${manager ? '' : ' của bạn'}</h2>
      <p class="muted">Tất cả add-on nhân sự chọn trong tháng. Mỗi add-on đủ ${FULL}đ, một act chọn nhiều add-on thì điểm cộng dồn (3 add-on = 15đ). Payment, Kship và HDDT/CKS lấy điểm thực đạt từ Sheet Addon; 7 loại còn lại mặc định ${FULL}đ/add-on.</p></div>
    ${filters('')}
    <div class="grid">
      ${stat('Add-on đã chọn', num(a.total.acts), `${who} · ${a.byType.filter((t) => t.acts).length} loại`)}
      ${a.hasScores ? stat('Điểm thực đạt', `${num(a.total.earned)} / ${num(a.total.full)}`, 'Mỗi add-on đủ 5đ, không giới hạn theo act', a.total.full && a.total.earned / a.total.full < 0.5 ? 'bad' : 'good') : ''}
      ${a.hasScores ? stat('Điểm bị trừ', a.total.lost ? `−${num(a.total.lost)}` : '0', a.total.missing ? `Gồm ${num(a.total.missing)} act thiếu retailer trong báo cáo PBI` : 'Đã trừ khỏi Add-on của KPI', a.total.lost ? 'warn' : 'good') : ''}
      ${stat('Add-on trong KPI', `${num(a.total.done)} / ${num(a.total.target)}`, a.total.target ? `${pct(a.total.done / a.total.target, 1)} chỉ tiêu (đã trừ điểm không đạt)` : '')}
    </div>
    <div class="toolbar"><h2 class="section-title">Theo loại add-on · ${who}</h2></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Loại add-on</th><th scope="col" class="right">Số add-on</th><th scope="col" class="right">Số nhân sự</th><th scope="col" class="right">Điểm đạt</th><th scope="col" class="right">Điểm trừ</th><th scope="col" class="right">Tỉ lệ đạt</th></tr></thead>
      <tbody>${a.byType.map((t) => html`<tr class="static"><td class="sticky-col"><strong>${t.kind}</strong></td><td class="right num">${num(t.acts)}</td><td class="right num">${num(t.people)}</td>
        ${t.scored ? html`<td class="right num">${num(t.earned)}/${num(t.acts * FULL)}</td><td class="right num">${lostCell(t.lost)}${t.missing ? html` <small class="muted">(${t.missing} thiếu retailer)</small>` : ''}</td><td class="right num strong">${t.acts ? pct(t.earned / (t.acts * FULL), 0) : '—'}</td>` : html`<td class="right muted" colspan="3">Chưa đọc được Sheet Addon, chưa có điểm thực đạt</td>`}</tr>`)}</tbody>
    </table></div>
    ${manager ? html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Số add-on theo từng loại. Bấm một dòng để xem chi tiết của nhân sự đó.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Tổng add-on</th>${team.kinds.map((k) => html`<th scope="col" class="right" title="${k}">${SHORT[k]}</th>`)}<th scope="col" class="right" title="Add-on trong Sheet KPI (tính đủ ${FULL}đ)">Sheet KPI</th><th scope="col" class="right">Điểm trừ</th><th scope="col" class="right">Thực đạt / chỉ tiêu</th><th scope="col" class="right">Tỉ lệ</th></tr></thead>
      <tbody>${team.people.map((p) => html`<tr class="clickable ${p.code === person ? 'is-selected' : ''}" data-addon-person="${p.code}" tabindex="0"><td class="sticky-col"><span class="person"><strong>${nm(p.code, p.name)}</strong><small>${p.code}</small></span></td>
        <td class="right num strong">${num(p.acts)}</td>${team.kinds.map((k) => html`<td class="right num">${p.counts[k] ? num(p.counts[k]) : html`<span class="muted">·</span>`}</td>`)}
        <td class="right num">${num(p.sheetDone)}</td><td class="right num">${lostCell(p.lost)}${p.missing ? html` <small class="muted" title="Act thiếu retailer trong báo cáo PBI">(${p.missing}⚠)</small>` : ''}</td><td class="right num">${num(p.done)} / ${num(p.target)}</td><td class="right num strong">${p.rate == null ? '—' : pct(p.rate, 0)}</td></tr>`)}</tbody>
    </table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Chi tiết từng add-on · ${who}</h2><p class="muted">${num(acts.length)} add-on${acts.length > shown.length ? ` (hiển thị ${num(shown.length)})` : ''}; add-on mất điểm xếp trước.</p></div>
    ${filters('2')}
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col">Ngày</th>${person === 'all' ? html`<th scope="col" class="sticky-col">Nhân sự</th>` : ''}<th scope="col">Loại add-on</th><th scope="col">Retailer</th><th scope="col" class="right">Điểm</th><th scope="col">Trạng thái / lý do</th></tr></thead>
      <tbody>${shown.length ? shown.map((x) => html`<tr class="static"><td class="num">${dmy(x.date)}</td>${person === 'all' ? html`<td class="sticky-col"><span class="person"><strong>${nm(x.code, x.name)}</strong><small>${x.code}</small></span></td>` : ''}<td>${x.kind}</td><td class="num">${x.retailer || '—'}</td>
        <td class="right num">${x.points == null ? html`<span class="muted">—</span>` : html`<span class="${x.lost ? 'addon-lost' : ''}">${x.points}/${FULL}</span>`}${x.missing ? html` <span class="badge badge--bad">Thiếu retailer</span>` : ''}</td><td><small>${reasonOf(x)}</small></td></tr>`)
        : html`<tr class="static"><td colspan="6" class="muted">Không có add-on nào khớp bộ lọc.</td></tr>`}</tbody>
    </table></div>`;
}
