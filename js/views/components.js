import { html } from '../dom.js';
import { pct, num } from '../format.js';

const clamp = (v) => Math.max(0, Math.min(1, v ?? 0));

/** Thanh tiến độ; `mark` (0–1) là vạch thời gian đã trôi qua trong tháng. */
export const bar = (value, { mark, tone } = {}) => html`
  <div class="bar ${tone ? `bar--${tone}` : ''}" role="img" aria-label="${pct(value)}">
    <div class="bar__fill" style="width:${clamp(value) * 100}%"></div>
    ${mark != null ? html`<div class="bar__mark" style="left:${clamp(mark) * 100}%" title="Thời gian đã qua: ${pct(mark)}"></div>` : ''}
  </div>`;

export const meter = (label, value, opts) => html`
  <div class="meter">
    <div class="meter__label"><span>${label}</span><strong class="num">${pct(value)}</strong></div>
    ${bar(value, opts)}
  </div>`;

export const badge = (tone, text) => html`<span class="badge badge--${tone}">${text}</span>`;
export const statusBadge = (status) => badge(status.key, status.label);
export const passBadge = (pass) =>
  pass == null ? badge('neutral', '—') : badge(pass ? 'good' : 'bad', pass ? 'Đạt' : 'Không đạt');

/** Thanh xếp chồng nhiều phần (đã làm / đang làm / chưa làm…); `label` hiện ở bên phải. */
export const stackRow = (name, parts, label) => {
  const total = parts.reduce((a, p) => a + (p.value ?? 0), 0);
  return html`
    <div class="stack-row">
      <span class="stack__name" title="${name}">${name}</span>
      <div class="stack">${parts.map((p) => html`
        <span class="stack__seg ${p.cls}" style="flex:${p.value}" title="${p.label}: ${num(p.value)} (${pct(total ? p.value / total : 0)})"></span>`)}</div>
      <span class="num muted">${label}</span>
    </div>`;
};

export const legendList = (items) => html`<ul class="legend">${items.map((i) => html`<li><i class="swatch ${i.cls}"></i>${i.label}</li>`)}</ul>`;

/** Dải nổi bật "Cập nhật lần cuối": xanh nếu cập nhật hôm nay, vàng nếu cũ hơn để nhân sự biết số liệu đã cũ. */
export function updatedBanner(teams) {
  const stamp = (t) => `${t.updatedTime} · ${t.asOf.split('-').slice(1).reverse().map(Number).join('/')}`;
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const y = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  const newest = teams.map((t) => t.asOf).sort().at(-1);
  const same = new Set(teams.map(stamp)).size === 1;
  const when = newest === today ? 'hôm nay' : newest === yesterday ? 'hôm qua' : '';
  const stale = newest < today;
  return html`
    <div class="updated ${stale ? 'is-stale' : 'is-fresh'}" role="status">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      <span class="updated__label">Báo cáo cập nhật lúc</span>
      <strong class="updated__time">${same ? stamp(teams[0]) : teams.map((t) => `${t.name.replace('Team ', '')}: ${stamp(t)}`).join(' — ')}</strong>
      ${when ? html`<span class="updated__rel">${when}</span>` : ''}
      ${stale ? html`<span class="updated__hint">Chưa có số liệu mới hôm nay</span>` : ''}
    </div>`;
}

/** Con số "91/300" (thực đạt / chỉ tiêu) nổi bật ở trên, tỷ lệ "30%" nhỏ hơn ở dưới. */
export const rateCell = (block) => html`
  <span class="rate"><strong class="num">${num(block.done ?? 0)}/${num(block.target)}</strong><small class="muted num">${pct(block.rate)}</small></span>`;
