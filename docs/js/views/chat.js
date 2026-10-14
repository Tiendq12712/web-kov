import { html } from '../dom.js';
import { CHAT_MAX_LENGTH } from '../chat.js';

const initial = (name) => (name?.trim()[0] ?? '?').toUpperCase();
const preview = (m) => (m ? `${m.email ? '' : ''}${m.text.length > 46 ? `${m.text.slice(0, 46)}…` : m.text}` : 'Chưa có tin nhắn');

const threadItem = (t, { active, unread }) => html`
  <button class="chatlist__item ${t.key === active ? 'is-active' : ''}" type="button" data-chat-open="${t.key}" aria-current="${t.key === active}">
    <span class="chatlist__avatar ${t.general ? 'is-general' : ''}" aria-hidden="true">${t.general ? '#' : initial(t.label)}</span>
    <span class="chatlist__text"><strong>${t.label}</strong><small>${preview(t.last)}</small></span>
    ${unread[t.key] ? html`<span class="chat-badge" aria-label="${unread[t.key]} tin chưa đọc">${unread[t.key]}</span>` : html`<time>${t.last?.at?.split(' ')[0] ?? ''}</time>`}
  </button>`;

const bubble = (m, me) => {
  const mine = m.email === me.email.toLowerCase();
  return html`
    <div class="msg ${mine ? 'is-mine' : ''}">
      <div class="msg__bubble">
        ${mine ? '' : html`<span class="msg__who">${m.name || m.email || 'Quản lý'}${m.role !== 'member' ? html` <em class="msg__role">Quản lý</em>` : ''}</span>`}
        <p class="msg__text">${m.text}</p>
        <time class="msg__time">${m.at}</time>
      </div>
    </div>`;
};

/**
 * Hội thoại: bên trái là danh sách (Cả nhóm + riêng tư), bên phải là nội dung và ô soạn tin.
 * Trên điện thoại chỉ hiện một bên: danh sách hoặc hội thoại (nút ← để quay lại).
 */
export function chatView({ threads, active, messages, unread, me, draft, error, loading, sending, mobileList, startable = [] }) {
  const thread = threads.find((t) => t.key === active);
  const manager = me.role !== 'member';
  const note = thread?.general ? 'Cả nhóm cùng thấy tin nhắn trong kênh này.'
    : manager ? `Riêng tư giữa ${thread?.label ?? 'nhân sự'} và quản lý (Admin, Quản trị).` : 'Riêng tư: chỉ bạn và quản lý (Admin, Quản trị) thấy.';
  return html`
    <section class="chatbox ${mobileList ? 'is-list' : 'is-thread'}">
      <aside class="chatlist" aria-label="Danh sách hội thoại">
        ${startable.length ? html`<label class="chatlist__new"><span class="visually-hidden">Nhắn cho nhân sự</span>
          <select id="chat-new" class="select"><option value="">＋ Nhắn cho nhân sự…</option>${startable.map((m) => html`<option value="${m.email}">${m.name}</option>`)}</select></label>` : ''}
        ${threads.map((t) => threadItem(t, { active, unread }))}
      </aside>
      <div class="chatpane">
        <header class="chatpane__head">
          <button class="icon-btn chatpane__back" type="button" data-chat-back aria-label="Về danh sách hội thoại">←</button>
          <div><h2 class="chatpane__title">${thread?.label ?? ''}</h2><p class="muted">${note}</p></div>
        </header>
        <div class="chatpane__messages" id="chat-messages" tabindex="0" aria-live="polite">
          ${loading && !messages.length ? html`<p class="muted">Đang tải tin nhắn…</p>`
            : messages.length ? messages.map((m) => bubble(m, me)) : html`<p class="muted chatpane__empty">Chưa có tin nhắn nào. Hãy là người nhắn đầu tiên.</p>`}
        </div>
        ${error ? html`<p class="notice" role="alert">${error}</p>` : ''}
        <form class="chatpane__form" data-chat-form data-channel="${active}">
          <textarea id="chat-input" class="msg__input" maxlength="${CHAT_MAX_LENGTH}" rows="2" placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)" aria-label="Tin nhắn">${draft}</textarea>
          <button class="btn" type="submit" ${sending ? 'disabled' : ''}>${sending ? 'Đang gửi…' : 'Gửi'}</button>
        </form>
      </div>
    </section>`;
}
