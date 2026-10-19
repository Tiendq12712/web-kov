import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeControl, RULES, maskPhone } from '../control.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const cut = (n) => (n == null ? html`<span class="muted">—</span>` : n === 0 ? html`<span class="badge badge--good">Không trừ</span>` : html`<span class="badge badge--${n >= 50 ? 'bad' : 'warn'}">Trừ ${n}%</span>`);
const cnt = (n) => (n ? html`<span class="badge badge--bad">${num(n)}</span>` : html`<span class="muted">0</span>`);

/** Tab Kiểm soát: data nhân sự điền đúng quy trình chưa, tiến độ SLA và mức trừ theo quy định. */
export function controlView(data, ui, { manager, code, names, month }) {
  const a = analyzeControl(data.rows, { month, code: manager ? null : code });
  if (!manager && !code) return html`<p class="notice">Chưa nhận ra bạn trong danh sách nhân sự nên chưa hiện được kết quả kiểm soát của bạn. Nhờ quản trị điền <strong>Đầu số</strong> cho tài khoản của bạn trong Thiết lập.</p>`;
  if (!a.total && !a.live) return html`<p class="notice">Chưa có data chi tiết của tháng này (tab "Data Txx" của file KPI) để kiểm soát.</p>`;
  const rule = ui.rule ?? 'all', person = manager ? (ui.person ?? 'all') : 'all';
  const worst = [...a.byRule].filter((x) => !x.rule.soft).sort((x, y) => y.count - x.count)[0];
  const rows = (rule === 'all' ? a.flagged : a.flaggedAll).filter((f) => (rule === 'all' || f.found.some((x) => x.rule.id === rule)) && (person === 'all' || /^(\d+)/.exec(f.r.handler)?.[1] === person))
    .sort((x, y) => (y.r.createdTs ?? 0) - (x.r.createdTs ?? 0));
  const shown = rows.slice(0, 300);
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Kiểm soát data${manager ? '' : ' của bạn'}</h2>
      <p class="muted">Kiểm tra data "Đã làm" theo Quy trình ONLINE và Quy định xử lý vi phạm. Số liệu này là cảnh báo tự động, không thay cho việc quản lý rà soát trực tiếp.</p></div>
    <div class="grid">
      ${stat('Data đã làm', num(a.total), manager ? `${a.people.filter((p) => p.done).length} nhân sự` : 'Data bạn đã hoàn tất')}
      ${stat('Data có lỗi cần rà', num(a.flaggedCount), `${p1(a.errRate)} data đã làm`, a.errRate >= 0.2 ? 'bad' : a.errRate >= 0.08 ? 'warn' : 'good')}
      ${stat('Tiến độ SLA đạt', p1(a.slaRate), a.slaCut == null ? '' : a.slaCut === 0 ? 'Không bị trừ thưởng' : `Theo quy định: trừ ${a.slaCut}% thưởng`, a.slaCut ? (a.slaCut >= 50 ? 'bad' : 'warn') : 'good')}
      ${stat('Lỗi nhiều nhất', worst?.count ? num(worst.count) : '0', worst?.count ? worst.rule.label : 'Không có lỗi')}
    </div>
    <div class="toolbar"><h2 class="section-title">Lỗi theo quy tắc</h2><p class="muted">Một data có thể dính nhiều lỗi. Mức trừ là mức ghi trong quy định cho mỗi lần vi phạm.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Quy tắc</th><th scope="col" class="right">Mức trừ</th><th scope="col" class="right">Số data</th><th scope="col" class="right">% data đã làm</th><th scope="col">Quy định</th></tr></thead>
      <tbody>${a.byRule.map((x) => html`<tr class="static"><td class="sticky-col"><strong>${x.rule.label}</strong></td><td class="right">${x.rule.penalty}</td><td class="right num">${cnt(x.count)}</td><td class="right num">${p1(a.total ? x.count / a.total : null)}</td><td class="muted">${x.rule.hint}</td></tr>`)}</tbody>
    </table></div>
    ${manager ? html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">SLA đạt = data đúng hạn / tổng data (tính cả đã làm); mức trừ theo bảng: ≥ 98% không trừ, 95–98% trừ 10%, 90–95% trừ 30%, 80–90% trừ 50%, dưới 80% trừ 100%.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Data đã làm</th><th scope="col" class="right">Data có lỗi</th><th scope="col" class="right">Tỉ lệ lỗi</th>${RULES.filter((r) => !r.soft).map((r) => html`<th scope="col" class="right" title="${r.label}">${{ calls: 'Thiếu cuộc gọi', nocontact: 'Thiếu liên hệ', desc: 'Mô tả', ticket: 'Ticket', feature: 'Tính năng' }[r.id]}</th>`)}<th scope="col" class="right">SLA đạt</th><th scope="col" class="right">Mức trừ SLA</th></tr></thead>
      <tbody>${a.people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${names.get(p.code) ?? p.name}</strong>${p.code ? html`<small>${p.code}</small>` : ''}</span></td>
        <td class="right num">${num(p.done)}</td><td class="right num">${cnt(p.flagged)}</td><td class="right num strong">${p1(p.errRate)}</td>
        ${RULES.filter((r) => !r.soft).map((r) => html`<td class="right num">${cnt(p.byRule[r.id])}</td>`)}
        <td class="right num strong">${p1(p.slaRate)}</td><td class="right">${cut(p.slaCut)}</td></tr>`)}</tbody>
    </table></div>` : ''}
    <div class="toolbar"><h2 class="section-title">Chi tiết data cần rà</h2><p class="muted">${num(rows.length)} data${rows.length > shown.length ? ` (hiển thị ${num(shown.length)} data mới nhất)` : ''}. Số điện thoại trong mô tả được che.</p></div>
    <div class="filters" aria-label="Lọc chi tiết">
      <label class="filter"><span>Quy tắc</span><select id="ctl-rule" class="select">${opt('all', 'Tất cả quy tắc', rule)}${RULES.map((r) => opt(r.id, r.label, rule))}</select></label>
      ${manager ? html`<label class="filter"><span>Nhân sự</span><select id="ctl-person" class="select">${opt('all', 'Tất cả nhân sự', person)}${a.people.filter((p) => p.code).map((p) => opt(p.code, `${names.get(p.code) ?? p.name} (${p.code})`, person))}</select></label>` : ''}
    </div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col">Ngày tạo</th>${manager ? html`<th scope="col" class="sticky-col">Nhân sự</th>` : ''}<th scope="col">Retailer</th><th scope="col">Lỗi</th><th scope="col">Mô tả</th></tr></thead>
      <tbody>${shown.map((f) => html`<tr class="static"><td class="num">${dmy(f.r.created)}</td>${manager ? html`<td class="sticky-col"><strong>${names.get(/^(\d+)/.exec(f.r.handler)?.[1]) ?? f.r.handler.replace(/^\d+\s*-\s*/, '').split(' - ')[0]}</strong></td>` : ''}<td class="num">${f.r.retailer || '—'}</td>
        <td>${f.found.map((x) => html`<span class="badge badge--${x.rule.soft ? 'warn' : 'bad'}" title="${x.rule.label}">${x.note}</span> `)}</td><td class="muted ctl-desc">${maskPhone(f.r.desc).slice(0, 140)}${f.r.desc.length > 140 ? '…' : ''}</td></tr>`)}</tbody>
    </table></div>`;
}
