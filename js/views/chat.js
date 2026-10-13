import { html } from '../dom.js';
import { CHAT_MAX_LENGTH } from '../chat.js';

const bubble = (m) => html`
  <article class="msg">
    <header class="msg__head"><strong>${m.name || m.email}</strong><span class="muted">${m.at}</span>
      <span class="msg__tag ${m.reply ? 'is-done' : 'is-new'}">${m.reply ? 'Đã trả lời' : 'Chờ phản hồi'}</span></header>
    <p class="msg__text">${m.text}</p>
    ${m.reply ? html`<div class="msg__reply"><strong>${m.by}</strong> <span class="muted">${m.repliedAt}</span><p>${m.reply}</p></div>` : ''}
  </article>`;

const replyBox = (m) => html`
  <form class="msg__form" data-reply="${m.id}">
    <textarea class="msg__input" maxlength="${CHAT_MAX_LENGTH}" rows="2" placeholder="${m.reply ? 'Sửa phản hồi…' : 'Viết phản hồi cho ' + (m.name || m.email) + '…'}" aria-label="Phản hồi"></textarea>
    <button class="btn" type="submit">${m.reply ? 'Cập nhật' : 'Trả lời'}</button>
  </form>`;

/** Nhân sự: ô soạn tin + các tin của mình. Quản lý (Admin/Quản trị): mọi tin, kèm ô phản hồi. */
export function chatView({ items, error, loading, sending }, me, name, draft = '') {
  const manager = me.role !== 'member';
  const list = manager ? items : items?.filter((m) => m.email.toLowerCase() === me.email.toLowerCase());
  return html`
    <section class="card chat">
      <h2 class="big">${manager ? 'Chia sẻ từ nhân sự' : 'Chia sẻ khó khăn với quản lý'}</h2>
      <p class="muted">${manager
        ? 'Tin nhắn nhân sự gửi lên. Trả lời trực tiếp bên dưới — nhân sự sẽ thấy phản hồi khi mở lại tab này.'
        : 'Bạn đang gặp khó khăn về KPI, khách hàng hay công cụ? Hãy nói với quản lý — chỉ Admin và Quản trị đọc được tin này.'}</p>
      ${manager ? '' : html`
        <form class="msg__form" id="chat-form">
          <textarea class="msg__input" id="chat-input" maxlength="${CHAT_MAX_LENGTH}" rows="3" placeholder="Ví dụ: Tuần này em bị dồn nhiều khách chưa liên lạc được, em cần hỗ trợ…" aria-label="Nội dung chia sẻ">${draft}</textarea>
          <button class="btn" type="submit" ${sending ? 'disabled' : ''}>${sending ? 'Đang gửi…' : 'Gửi cho quản lý'}</button>
        </form>
        <p class="muted msg__hint">Lần đầu gửi, Google sẽ hỏi quyền ghi vào Sheet — bạn chỉ cần đồng ý.${name ? '' : ''}</p>`}
      ${error ? html`<p class="notice" role="alert">${error}</p>` : ''}
    </section>
    ${loading && !items ? html`<p class="muted" role="status">Đang tải tin nhắn…</p>` : ''}
    ${list?.length ? html`<div class="msgs">${[...list].reverse().map((m) => html`${bubble(m)}${manager ? replyBox(m) : ''}`)}</div>`
      : items ? html`<p class="muted">${manager ? 'Chưa có tin nhắn nào.' : 'Bạn chưa gửi tin nhắn nào.'}</p>` : ''}`;
}
