import { loadMessages, sendMessage, GENERAL, buildThreads, unreadInfo, markSeen, visible, startable } from './chat.js';
import { chatView } from './views/chat.js';

const POLL_MS = 15_000;      // đang mở tab Chia sẻ: kiểm tra tin mới mỗi 15 giây
const IDLE_EVERY = 3;        // ở tab khác: cứ 3 lượt (45 giây) mới kiểm tra một lần
const narrow = () => matchMedia('(max-width: 640px)').matches;
const lower = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Trạng thái và thao tác của tab Chia sẻ. `onChange('badge' | 'view')` báo cho ứng dụng vẽ lại
 * (huy hiệu chưa đọc trên tab, hoặc nội dung hội thoại đang mở).
 */
export function createChat({ getMe, getAccounts, getName, onChange, onAuthExpired, isOpen }) {
  const fresh = () => ({ items: null, loading: false, error: '', sending: false, active: null, drafts: {}, started: [], mobileList: getMe()?.role !== 'member' });
  let c = fresh();
  let timer = null;

  const members = () => (getAccounts() ?? []).filter((a) => a.role === 'member')
    .map((a) => ({ email: lower(a.email), name: a.name || a.email.split('@')[0] }));
  const threads = () => buildThreads(c.items ?? [], getMe(), members(), c.started);
  const unread = () => (c.items ? unreadInfo(c.items, getMe()) : { total: 0, by: {} });

  async function refresh({ silent = false } = {}) {
    if (c.loading) return;
    c.loading = true;
    if (!silent) c.error = '';
    try {
      const items = await loadMessages();
      const changed = !c.items || items.length !== c.items.length;
      c.items = items;
      onChange('badge');
      if (changed) onChange('view');
    } catch (err) {
      if (err.code === 'auth') return onAuthExpired(err.message);
      if (!silent) c.error = err.message;
      if (!silent) onChange('view');
    } finally {
      c.loading = false;
    }
  }

  function chooseActive(list) {
    const me = getMe();
    if (c.active && list.some((t) => t.key === c.active)) return c.active;
    const by = unread().by;
    const firstUnread = list.find((t) => by[t.key]);
    return me.role === 'member' ? lower(me.email) : (firstUnread ?? list[0]).key;
  }

  return {
    /** Số tin chưa đọc (hiện trên tab Chia sẻ). */
    unread: () => unread().total,
    view() {
      const me = getMe();
      if (!c.items && !c.loading && !c.error) refresh();
      const list = threads();
      c.active = chooseActive(list);
      const messages = (c.items ?? []).filter((m) => m.channel === c.active && visible(me, m));
      const showing = !(narrow() && c.mobileList);
      if (c.items && showing) markSeen(me, c.active, c.items);   // đang xem hội thoại này nên coi như đã đọc
      return chatView({
        threads: list, active: c.active, startable: getMe().role === 'member' ? [] : startable(c.items ?? [], members()).filter((m) => !c.started.includes(m.email)), messages, unread: unread().by, me, draft: c.drafts[c.active] ?? '',
        error: c.error, loading: c.loading, sending: c.sending, mobileList: c.mobileList,
      });
    },
    refresh,
    open(key) { c.active = key; c.mobileList = false; onChange('view'); onChange('badge'); },
    back() { c.mobileList = true; onChange('view'); },
    /** Quản lý bắt đầu nhắn cho một nhân sự chưa có hội thoại. */
    start(email) { const key = lower(email); if (!c.started.includes(key)) c.started.push(key); c.active = key; c.mobileList = false; onChange('view'); },
    setDraft(text) { if (c.active) c.drafts[c.active] = text; },
    async send(text) {
      const me = getMe();
      if (c.sending || !text.trim()) return;
      c.sending = true; c.error = ''; c.drafts[c.active] = text; onChange('view');
      try {
        const message = await sendMessage({ channel: c.active, me, name: getName(), text });
        c.drafts[c.active] = '';
        c.items = [...(c.items ?? []), message];
      } catch (err) {
        c.error = err.message;
      } finally {
        c.sending = false;
        onChange('view');
        onChange('badge');
      }
    },
    watch() {
      this.stop();
      refresh({ silent: true });
      let tick = 0;
      timer = setInterval(() => {
        tick += 1;
        if (!document.hidden && (isOpen() || tick % IDLE_EVERY === 0)) refresh({ silent: true });
      }, POLL_MS);
      document.addEventListener('visibilitychange', this.onVisible = () => { if (!document.hidden) refresh({ silent: true }); });
    },
    stop() { clearInterval(timer); document.removeEventListener('visibilitychange', this.onVisible); },
    reset() { this.stop(); c = fresh(); },
  };
}
