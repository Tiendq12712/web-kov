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

/** Tỷ lệ kèm con số: "30%" trên, "91/300" (thực đạt / chỉ tiêu) dưới. */
export const rateCell = (block) => html`
  <span class="rate"><strong class="num">${pct(block.rate)}</strong><small class="muted num">${num(block.done ?? 0)}/${num(block.target)}</small></span>`;
