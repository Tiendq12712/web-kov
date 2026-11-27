import { html } from '../dom.js';
import { num } from '../format.js';

const ICON = { bad: '⏰', warn: '⚠️', info: '💬' };

const OPEN_KEY = 'todo-open';
const isOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
/** Nhớ người dùng đang mở hay thu gọn thẻ để lần vẽ lại (và lần vào sau) giữ nguyên. */
export const rememberTodoOpen = (open) => { try { open ? localStorage.setItem(OPEN_KEY, '1') : localStorage.removeItem(OPEN_KEY); } catch { /* bỏ qua */ } };

const row = (i) => html`
  <li class="todo__item todo__item--${i.tone}">
    <span class="todo__icon" aria-hidden="true">${ICON[i.tone]}</span>
    <span class="todo__text"><strong>${i.count == null ? '' : `${num(i.count)} `}${i.text}</strong><small>${i.hint}</small></span>
    ${i.timesheet ? html`<button class="btn btn--ghost todo__go" type="button" data-timesheet="${i.timesheet}">Xem</button>`
      : html`<button class="btn btn--ghost todo__go" type="button" data-tab="${i.tab}">Xem</button>`}
  </li>`;
const body = (items) => (items.length ? html`<ul class="todo__list">${items.map(row)}</ul>`
  : html`<p class="notice notice--good">Hôm nay không có việc tồn nào. Tuyệt vời! 🎉</p>`);

/** Thẻ "Việc cần làm hôm nay"; không có việc nào thì chúc mừng. `fold`: thu gọn còn một dòng, bấm mới mở danh sách. */
export function todoCard(items, { fold = false } = {}) {
  if (!fold) {
    return html`
      <section class="card todo" aria-label="Việc cần làm hôm nay">
        <div class="card__head"><h3 class="card__title">Việc cần làm hôm nay</h3><span class="muted">${items.length ? `${items.length} mục` : ''}</span></div>
        ${body(items)}
      </section>`;
  }
  const urgent = items.filter((i) => i.tone === 'bad').length, rest = items.length - urgent;
  return html`
    <details class="card todo todo--fold" data-todo ${isOpen() ? 'open' : ''}>
      <summary class="todo__summary">
        <span class="card__title">Việc cần làm hôm nay</span>
        ${urgent ? html`<span class="badge badge--bad">${urgent} việc gấp</span>` : ''}
        ${rest ? html`<span class="badge badge--warn">${rest} cần lưu ý</span>` : ''}
        ${items.length ? '' : html`<span class="badge badge--good">Không có việc tồn</span>`}
        <span class="todo__toggle" aria-hidden="true"></span>
      </summary>
      ${body(items)}
    </details>`;
}
