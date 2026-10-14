import { html } from '../dom.js';
import { num } from '../format.js';

const ICON = { bad: '⏰', warn: '⚠️', info: '💬' };

/** Thẻ "Việc cần làm hôm nay"; không có việc nào thì chúc mừng. */
export function todoCard(items) {
  return html`
    <section class="card todo" aria-label="Việc cần làm hôm nay">
      <div class="card__head"><h3 class="card__title">Việc cần làm hôm nay</h3><span class="muted">${items.length ? `${items.length} mục` : ''}</span></div>
      ${items.length ? html`<ul class="todo__list">${items.map((i) => html`
        <li class="todo__item todo__item--${i.tone}">
          <span class="todo__icon" aria-hidden="true">${ICON[i.tone]}</span>
          <span class="todo__text"><strong>${i.count == null ? '' : `${num(i.count)} `}${i.text}</strong><small>${i.hint}</small></span>
          ${i.timesheet ? html`<button class="btn btn--ghost todo__go" type="button" data-timesheet="${i.timesheet}">Xem</button>`
            : html`<button class="btn btn--ghost todo__go" type="button" data-tab="${i.tab}">Xem</button>`}
        </li>`)}</ul>`
        : html`<p class="notice notice--good">Hôm nay không có việc tồn nào. Tuyệt vời! 🎉</p>`}
    </section>`;
}
