import { loadMonths, reloadMonths, loadMonth, loadReport, hasReport, clearCache, snapshotData, restoreData, hasPbi, loadPbi } from './data.js';
import { CONFIG } from './config.js';
import { getSession, getRemembered, signIn, signOut, loadGis } from './auth.js';
import { saveSnapshot, loadSnapshot, clearSnapshot } from './snapshot.js';
import { loadAccounts, findAccount, canOpenSettings } from './directory.js';
import { html, mount, raw } from './dom.js';
import { monthLabel } from './format.js';
import { overviewView, memberRowsView } from './views/overview.js';
import { teamView, rowsView } from './views/team.js';
import { detailView } from './views/detail.js';
import { workView, workRowsView } from './views/work.js';
import { reportView, reportRowsView, reportDetailView } from './views/report.js';
import { workdaysByCode } from './report.js';
import { createSettings } from './settingsController.js';
import { createChat } from './chatController.js';
import { computeSla } from './sla.js';
import { slaView } from './views/sla.js';
import { cinfoView, DEFAULT_FILTERS } from './views/cinfo.js';
import { trendView } from './views/trend.js';
import { loadHistory, recordHistory, buildSnapshot } from './history.js';
import { buildTodo } from './todo.js';
import { findMember, showWelcome, hideWelcome } from './welcome.js';
import { startTour, tourSeen } from './tour.js';
import './mobileShell.js';
import { applyTableSorts } from './tableSort.js';

const $ = (id) => document.getElementById(id);
const els = { view: $('view'), tabs: $('tabs'), month: $('month'), detail: $('detail'), bottomNav: $('bottom-nav'), logout: $('logout'), welcome: $('welcome') };

/** Lưu lựa chọn giao diện của riêng trình duyệt này; lỗi (chế độ riêng tư…) thì dùng mặc định. */
function readPref(key, fallback) {
  try { return localStorage.getItem(`kpi.${key}`) ?? fallback; } catch { return fallback; }
}

const state = {
  month: null, data: null,
  tab: 'overview',           // 'overview' | 'work' | 'report' | 'settings' | team id
  tview: readPref('tview', 'compact'),   // bảng nhân sự: compact (tối giản) | full (đầy đủ)
  osort: { key: 'kpi', dir: 'desc' },   // sắp xếp bảng nhân sự trang tổng quan
  mstatus: 'all', mquery: '',   // lọc tình trạng + tìm kiếm ở bảng nhân sự trang tổng quan
  filter: 'all',             // bộ lọc team ở bảng nhân sự trang tổng quan
  heat: readPref('heat2', 'bars'),   // kiểu màu bảng: bars (thanh màu) | alert (ít màu) | full (nhiều màu)
  query: '',
  sort: { key: 'kpi', dir: 'desc' },
  report: { data: null, loading: false, error: '', region: 'all', weekMetric: 'calls', dayMetric: 'calls', query: '', sort: { key: 'talk', dir: 'desc' } },
  work: { team: 'all', matrix: 'backlogAll', query: '', sort: { key: 'pctDone', dir: 'desc' } },
  cinfo: { data: null, loading: false, error: '', f: { ...DEFAULT_FILTERS } },   // báo cáo Customer Info (PBI) + bộ lọc
  trend: { data: null, loading: false, error: '', metric: 'kpi', who: 'all' },   // xu hướng theo ngày (lịch sử đồng bộ)
  todo: null,                // "Việc cần làm hôm nay" của trang Tổng quan
  accounts: [],              // danh sách tài khoản (để Admin/Quản trị chọn nhân sự trong tab Chia sẻ)
  me: null,                  // { email, role } — role: admin | manager | member
};

/** Ngày số liệu mới nhất trong các team (mốc tính tuổi data cho SLA). */
const latestAsOf = (data) => data.teams.map((t) => t.asOf).sort().at(-1);

/** Đầu số của người đang đăng nhập (ưu tiên cột Đầu số trong tab Tài khoản). */
const myCode = () => state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code;

const team = () => state.data?.teams.find((t) => t.id === state.tab);

/* ---------- Routing: #/<tháng>/<tab> ---------- */
const readHash = () => {
  const [month, tab] = location.hash.replace(/^#\/?/, '').split('/');
  return { month, tab };
};
const writeHash = () => history.replaceState(null, '', `#/${state.month}/${state.tab}`);

/* ---------- Render ---------- */
const ICONS = {
  overview: '<path d="M4 13h6V4H4zM14 20h6V4h-6zM4 20h6v-4H4z"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11a3 3 0 1 0 0-6M18 14.5c2.2.6 3.5 2.4 3.5 5.5"/>',
  report: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  cinfo: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  trend: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  sla: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 3h6"/>',
  work: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 15l2.5 2.5L16 13"/>',
};
const tabIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] ?? ICONS.team}</svg>`);

/** Cùng một danh sách tab: thanh ngang trên desktop, thanh dưới cùng trên mobile. */
function renderTabs() {
  const tabs = [{ id: 'overview', name: 'Tổng quan' }, ...state.data.teams];
  if (state.data.work) tabs.push({ id: 'work', name: 'Theo dõi công việc', short: 'Công việc' });
  if (state.data.work?.backlogAll) tabs.push({ id: 'sla', name: 'SLA' });
  if (hasPbi()) tabs.push({ id: 'cinfo', name: 'Customer Info', short: 'C-Info' });
  if (state.me?.role !== 'member') tabs.push({ id: 'trend', name: 'Xu hướng' });   // chỉ Admin/Quản trị
  if (hasReport(state.month)) tabs.push({ id: 'report', name: 'Năng suất' });
  tabs.push({ id: 'chat', name: 'Chia sẻ' });
  const current = (t) => (t.id === state.tab ? html`aria-current="page"` : '');
  const unread = state.me ? chat.unread() : 0;
  const badge = (t) => (t.id === 'chat' && unread ? html`<span class="chat-badge" aria-label="${unread} tin chưa đọc">${unread > 99 ? '99+' : unread}</span>` : '');
  mount(els.tabs, html`${tabs.map((t) => html`
    <button class="tab" type="button" data-tab="${t.id}" ${current(t)}>${t.name}${badge(t)}</button>`)}`);
  mount(els.bottomNav, html`${tabs.map((t) => html`
    <button class="bottom-nav__item" type="button" data-tab="${t.id}" ${current(t)}>
      <span class="bottom-nav__icon">${tabIcon(t.id)}${badge(t)}</span><span>${t.short ?? t.name.replace('Team ', '')}</span>
    </button>`)}`);
}

/** Tên có dấu của nhân sự lấy từ báo cáo KPI (theo mã), vì Sheet năng suất ghi tên không dấu. */
const kpiNames = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, m.name])));

/** Mã nhân sự -> { name, team } từ báo cáo KPI, để lọc theo team ở các tab khác. */
const kpiPeople = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, { name: m.name, team: t.id }])));

/** Tải một tab theo yêu cầu rồi nhớ lại; dùng chung cho Công việc và Năng suất. */
function lazyTab(slice, tab, loader, render) {
  if (slice.data) return render(slice.data);
  if (slice.error) return html`<p class="notice" role="alert">${slice.error}</p>`;
  if (!slice.loading) {
    slice.loading = true;
    const month = state.month;
    loader(month)
      .then((data) => { if (month === state.month) slice.data = data; })
      .catch((err) => { if (err.code === 'auth') authLost(err.message); else slice.error = err.message; })
      .finally(() => { slice.loading = false; if (state.tab === tab && state.month === month) renderView(); });
  }
  return html`<p class="muted" role="status">Đang tải dữ liệu…</p>`;
}

/** Hội thoại (Cả nhóm + riêng tư): trạng thái nằm trong chatController. */
const myName = () => state.me.name || findMember(state.me.email, state.data.teams, state.me.name, state.me.code)?.member.name || state.me.email.split('@')[0];

/**
 * Vẽ lại mà giữ nguyên chữ đang nhập dở trong các ô (form Thiết lập…): dùng cho các lần vẽ lại tự động
 * (lấy lại tiêu điểm cửa sổ, làm mới token, job xong) — không dùng sau khi người dùng bấm Lưu/Thêm.
 */
function withKeptInputs(render) {
  const key = (el) => `${el.form?.dataset.sform ?? ''}|${el.form?.dataset.key ?? ''}|${el.name || el.id}`;
  const saved = [...els.view.querySelectorAll('input, textarea, select')].filter((el) => el.name || el.id)
    .map((el) => ({ key: key(el), value: el.value, checked: el.checked, focused: el === document.activeElement, caret: el.selectionStart }));
  render();
  const fresh = new Map([...els.view.querySelectorAll('input, textarea, select')].filter((el) => el.name || el.id).map((el) => [key(el), el]));
  for (const s of saved) {
    const el = fresh.get(s.key);
    if (!el || el.type === 'password' && !s.value) continue;
    if (el.type === 'checkbox' || el.type === 'radio') continue;   // trạng thái bật/tắt lấy từ dữ liệu mới
    if (el.value !== s.value) el.value = s.value;
    if (s.focused) { el.focus(); try { el.setSelectionRange(s.caret, s.caret); } catch { /* ô không hỗ trợ con trỏ */ } }
  }
}

/** Vẽ lại hội thoại/huy hiệu khi có tin mới, giữ nguyên chữ đang gõ và vị trí con trỏ. */
function onChatChange(kind) {
  if (!state.me || !state.data) return;
  if (kind === 'badge') { renderTabs(); applyTitle(); return; }
  if (state.tab !== 'chat') return;
  const box = $('chat-input'), focused = box && document.activeElement === box, caret = box?.selectionStart;
  const list = $('chat-messages'), nearBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  renderView();
  const after = $('chat-input');
  if (focused && after) { after.focus(); after.setSelectionRange(caret, caret); }
  const msgs = $('chat-messages');
  if (msgs && nearBottom) msgs.scrollTop = msgs.scrollHeight;
}
const chat = createChat({
  getMe: () => state.me, getAccounts: () => state.accounts, getName: myName,
  onChange: onChatChange, onAuthExpired: (message) => authLost(message), isOpen: () => state.tab === 'chat',
});
const renderChat = () => chat.view();
let baseTitle = document.title;
const applyTitle = () => { const n = state.me ? chat.unread() : 0; document.title = n ? `(${n}) ${baseTitle}` : baseTitle; };

const renderWork = () => workView(state.data.work, state.work, kpiPeople(), state.data.teams.map(({ id, name }) => ({ id, name })));

/** Tổng quan cũng cần dữ liệu năng suất: tải nền (không chặn trang), có rồi thì vẽ lại. Không có hoặc lỗi thì bỏ qua phần đó. */
function preloadReport() {
  const r = state.report;
  if (r.data) return r.data;
  if (hasReport(state.month) && !r.loading && !r.error) {
    r.loading = true;
    const month = state.month;
    loadReport(month)
      .then((data) => { if (month === state.month) r.data = data; })
      .catch((err) => { r.error = err.message; })
      .finally(() => { r.loading = false; if (state.tab === 'overview' && state.month === month) renderView(); });
  }
  return null;
}

/** Báo cáo năng suất tải theo yêu cầu (lần đầu mở tab) rồi được nhớ lại. */
const renderReport = () => lazyTab(state.report, 'report', loadReport, (data) => reportView(data, state.report, kpiNames()));

const canSettings = () => canOpenSettings(state.me?.role);

/** Trang đang mở -> { view, title }. */
function currentPage() {
  const t = team();
  if (state.tab === 'overview') {
    state.todo = buildTodo({ me: state.me, found: findMember(state.me.email, state.data.teams, state.me.name, state.me.code), data: state.data, report: state.report.data, pbi: state.cinfo.data, unread: chat.unread() });
  }
  const report = preloadReport();   // ngày công và năng suất lấy từ file năng suất, nên luôn tải nền
  if (state.tab === 'settings') return { view: settings.view(), title: 'Thiết lập' };
  if (state.tab === 'report') return { view: renderReport(), title: 'Năng suất' };
  if (state.tab === 'chat') return { view: renderChat(), title: 'Chia sẻ' };
  if (state.tab === 'trend' && state.me.role !== 'member') return { view: lazyTab(state.trend, 'trend', loadHistory, (h) => trendView(h, state.trend, { manager: state.me.role !== 'member', code: myCode() })), title: 'Xu hướng' };
  if (state.tab === 'cinfo') return { view: lazyTab(state.cinfo, 'cinfo', loadPbi, (d) => cinfoView(d, state.cinfo.f, { manager: state.me.role !== 'member', code: state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code })), title: 'Customer Info' };
  if (state.tab === 'sla') return { view: slaView(computeSla(state.data.work, latestAsOf(state.data), state.month), { manager: state.me.role !== 'member', code: state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code }), title: 'SLA' };
  if (state.tab === 'work') return { view: renderWork(), title: 'Theo dõi công việc' };
  if (t) return { view: teamView(t, state), title: t.name };
  return { view: overviewView(state.data, state, report), title: 'Tổng quan' };
}

function renderView() {
  if (!state.data) {   // chưa có báo cáo nào: chỉ còn trang Thiết lập (dành cho Admin / Quản trị)
    els.tabs.replaceChildren();
    els.bottomNav.replaceChildren();
    mount(els.view, settings.view());
    baseTitle = 'Thiết lập · Report SC ONLINE'; applyTitle();
    return;
  }
  const page = currentPage();
  mount(els.view, page.view);
  renderTabs();
  applyTableSorts(els.view);
  baseTitle = `${page.title} · ${monthLabel(state.month)} · Report SC ONLINE`;
  applyTitle();
  writeHash();
  if (state.tab === 'chat') { const msgs = $('chat-messages'); if (msgs) msgs.scrollTop = msgs.scrollHeight; }
}

async function setMonth(ym, { boot = false } = {}) {
  state.month = ym;
  if (!boot) mount(els.view, html`<p class="muted" role="status">Đang tải dữ liệu từ Google Sheet…</p>`);
  let report = null;
  try {
    // Lúc khởi động: tải song song KPI + năng suất để hiện đủ một lần, không nhảy số.
    const [data, rep] = await Promise.all([
      loadMonth(ym),
      boot && hasReport(ym) ? (setBoot('Đang tải báo cáo năng suất…', 3), loadReport(ym).catch(() => null)) : null,
    ]);
    state.data = data;
    report = rep;
  } catch (err) {
    return err.code === 'auth' ? authLost(err.message) : showError(err.message);
  }
  els.month.value = ym;
  Object.assign(state.report, { data: report, error: '', query: '' });
  state.work.query = '';
  const validTab = (state.tab === 'work' && state.data.work) || (state.tab === 'settings' && canSettings()) || state.tab === 'chat' || (state.tab === 'sla' && state.data.work?.backlogAll) || (state.tab === 'cinfo' && hasPbi()) || (state.tab === 'trend' && state.me.role !== 'member') || (state.tab === 'report' && hasReport(ym)) || team();
  if (state.tab !== 'overview' && !validTab) state.tab = 'overview';
  renderView();
}

function setTab(tab) {
  state.tab = tab;
  if (tab === 'trend') state.trend.error = '';
  if (tab === 'chat') chat.refresh({ silent: true });
  state.query = '';
  renderView();
  window.scrollTo({ top: 0 });
  els.view.scrollTo({ top: 0 });   // điện thoại: nội dung cuộn trong khung #view
}

/* ---------- Chi tiết nhân sự ---------- */
function openMember(ref, { timesheet = false } = {}) {
  const [teamId, code] = ref.split(':');
  const t = state.data.teams.find((x) => x.id === teamId);
  const member = t.members.find((m) => m.code === code);
  const workdays = state.report.data ? workdaysByCode(state.report.data).get(member.code) : undefined;
  mount(els.detail, detailView(t, member, workdays, state.report.data));
  els.detail.showModal();
  if (timesheet) {   // mở sẵn bảng công và cuộn tới đó
    const sheet = els.detail.querySelector('details.timesheet');
    if (sheet) { sheet.open = true; sheet.scrollIntoView({ block: 'start' }); }
  }
}

function openReportMember(code) {
  mount(els.detail, reportDetailView(state.report.data, code, kpiNames()));
  els.detail.showModal();
}

/* ---------- Sự kiện (ủy quyền, không gắn từng phần tử) ---------- */
document.addEventListener('click', (e) => {
  const hit = (sel) => e.target.closest(sel);
  if (hit('[data-close]') || e.target === els.detail) return els.detail.close();
  if (hit('[data-tab]')) { e.preventDefault(); els.detail.close(); return setTab(hit('[data-tab]').dataset.tab); }
  if (hit('[data-timesheet]')) return openMember(hit('[data-timesheet]').dataset.timesheet, { timesheet: true });
  if (hit('[data-member]')) return openMember(hit('[data-member]').dataset.member);
  if (hit('[data-heat]')) {
    state.heat = hit('[data-heat]').dataset.heat;
    try { localStorage.setItem('kpi.heat2', state.heat); } catch {}
    return renderView();
  }
  if (hit('[data-osort]')) {
    const key = hit('[data-osort]').dataset.osort;
    state.osort = { key, dir: state.osort.key === key && state.osort.dir === 'desc' ? 'asc' : 'desc' };
    return renderView();
  }
  if (hit('[data-trend-metric]')) { state.trend.metric = hit('[data-trend-metric]').dataset.trendMetric; return renderView(); }
  if (hit('[data-record-history]')) return recordHistoryNow();
  if (hit('[data-cinfo-clear]')) { state.cinfo.f = { ...DEFAULT_FILTERS }; return renderView(); }
  if (hit('[data-clear-filters]')) { Object.assign(state, { filter: 'all', mstatus: 'all', mquery: '' }); return renderView(); }
  if (hit('[data-tview]')) {
    state.tview = hit('[data-tview]').dataset.tview;
    try { localStorage.setItem('kpi.tview', state.tview); } catch {}
    return renderView();
  }
  if (hit('[data-mstatus]')) { state.mstatus = hit('[data-mstatus]').dataset.mstatus; return renderView(); }
  if (hit('[data-filter]')) { state.filter = hit('[data-filter]').dataset.filter; return renderView(); }
  if (hit('[data-sort]')) {
    const key = hit('[data-sort]').dataset.sort;
    state.sort = { key, dir: state.sort.key === key && state.sort.dir === 'desc' ? 'asc' : 'desc' };
    return renderView();
  }
});

document.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('tr[data-member], tr[data-rmember]');
  if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  if (row.dataset.rmember) openReportMember(row.dataset.rmember); else openMember(row.dataset.member);
});

// Tìm kiếm chỉ vẽ lại phần thân bảng để giữ focus và tránh render thừa.
document.addEventListener('input', (e) => {
  if (e.target.id === 'report-search') {
    state.report.query = e.target.value;
    return mount($('report-rows'), reportRowsView(state.report.data, state.report, kpiNames()));
  }
  if (e.target.id === 'member-search') {   // chỉ vẽ lại thân bảng để giữ con trỏ gõ
    state.mquery = e.target.value;
    mount($('member-rows'), memberRowsView(state.data, state, state.report.data));
    $('member-count').textContent = `Hiển thị ${$('member-rows').querySelectorAll('tr.clickable').length}/${state.data.teams.reduce((n, t) => n + (state.filter === 'all' || t.id === state.filter ? t.members.length : 0), 0)} nhân sự`;
    return;
  }
  if (e.target.id === 'work-search') {
    state.work.query = e.target.value;
    return mount($('work-rows'), workRowsView(state.data.work, state.work, kpiPeople()));
  }
  if (e.target.id !== 'search') return;
  state.query = e.target.value;
  mount($('rows'), rowsView(team(), state.query, state.sort));
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'trend-who') { state.trend.who = e.target.value; return renderView(); }
  const cinfoField = e.target.dataset?.cinfo;
  if (cinfoField) { state.cinfo.f[cinfoField] = e.target.value || (e.target.type === 'date' ? '' : 'all'); return renderView(); }
  const id = e.target.id;
  if (id === 'member-team') { state.filter = e.target.value; return renderView(); }
  if (id === 'member-status') { state.mstatus = e.target.value; return renderView(); }
  if (id === 'member-heat') {
    state.heat = e.target.value;
    try { localStorage.setItem('kpi.heat2', state.heat); } catch {}
    return renderView();
  }
  if (id !== 'week-metric') return;
  state.report.weekMetric = e.target.value;
  renderView();
});

document.addEventListener('click', (e) => {
  const hit = (sel) => e.target.closest(sel);
  if (hit('[data-region]')) { state.report.region = hit('[data-region]').dataset.region; return renderView(); }
  if (hit('[data-wteam]')) { state.work.team = hit('[data-wteam]').dataset.wteam; return renderView(); }
  if (hit('[data-wmatrix]')) { state.work.matrix = hit('[data-wmatrix]').dataset.wmatrix; return renderView(); }
  if (hit('[data-wsort]')) {
    const key = hit('[data-wsort]').dataset.wsort;
    const { sort } = state.work;
    state.work.sort = { key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' };
    return renderView();
  }
  if (hit('[data-daymetric]')) { state.report.dayMetric = hit('[data-daymetric]').dataset.daymetric; return renderView(); }
  if (hit('[data-rsort]')) {
    const key = hit('[data-rsort]').dataset.rsort;
    const { sort } = state.report;
    state.report.sort = { key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' };
    return renderView();
  }
  if (hit('[data-rmember]')) openReportMember(hit('[data-rmember]').dataset.rmember);
});

document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-chat-form]')) return;
  e.preventDefault();
  chat.send(e.target.querySelector('textarea').value);
});
document.addEventListener('keydown', (e) => {   // Enter gửi tin, Shift+Enter xuống dòng
  if (e.target.id !== 'chat-input' || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  e.target.form.requestSubmit();
});
document.addEventListener('input', (e) => { if (e.target.id === 'chat-input') chat.setDraft(e.target.value); });
document.addEventListener('change', (e) => { if (e.target.id === 'chat-new' && e.target.value) chat.start(e.target.value); });
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-chat-open]');
  if (open) return chat.open(open.dataset.chatOpen);
  if (e.target.closest('[data-chat-back]')) chat.back();
});

els.welcome.addEventListener('click', (e) => {
  const act = e.target.closest('[data-welcome]')?.dataset.welcome;
  if (!act) return;
  hideWelcome(els.welcome);
  if (act === 'chat') setTab('chat'); else if (act === 'sla') setTab('sla'); else if (!tourSeen()) startTour();
});
$('help').addEventListener('click', startTour);

els.month.addEventListener('change', () => setMonth(els.month.value));

$('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = (root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
});

/* ---------- Thiết lập (Tài khoản, Cấu hình, Đồng bộ CRM) ---------- */
let monthList = [];   // các tháng nhận được từ danh sách link (để trang Thiết lập hiển thị)
function fillMonths(months) {
  monthList = months;
  mount(els.month, html`${months.map((m) => html`<option value="${m.month}">${monthLabel(m.month)}</option>`)}`);
}

/** Link báo cáo vừa đổi: dựng lại danh sách tháng, giữ tháng đang xem nếu còn. */
async function refreshMonths() {
  reloadMonths();
  const months = await loadMonths();
  fillMonths(months);
  if (!months.length) { state.data = null; return; }
  if (months.some((m) => m.month === state.month)) { els.month.value = state.month; return; }
  state.month = months[0].month;
  state.data = await loadMonth(state.month);
  els.month.value = state.month;
}

/** Lưu ảnh chụp số liệu của ngày số liệu hiện tại vào tab Lịch sử (sau mỗi lần đồng bộ CRM hoặc khi quản lý bấm nút). */
async function saveHistory() {
  const pbi = hasPbi() ? await loadPbi().catch(() => null) : null;
  const n = await recordHistory(buildSnapshot({ data: state.data, month: state.month, date: latestAsOf(state.data), pbi }));
  Object.assign(state.trend, { data: null, error: '' });
  return n;
}
async function recordHistoryNow() {
  try { await saveHistory(); } catch (err) { state.trend.error = `Không lưu được lịch sử: ${err.message}`; }
  renderView();
}

/** Tải sẵn dữ liệu Customer Info (nếu có) để "Việc cần làm" biết số act chưa dùng; vẽ lại Tổng quan khi có. */
function preloadPbi() {
  if (!hasPbi() || state.cinfo.data) return;
  loadPbi().then((d) => { state.cinfo.data = d; if (state.tab === 'overview') renderView(); }).catch(() => {});
}

const settings = createSettings({
  getMe: () => state.me,
  getMonths: () => monthList,
  rerender: ({ keep = false } = {}) => { if (state.tab === 'settings' || !state.data) (keep ? withKeptInputs(renderView) : renderView()); },
  onAuthExpired: (message) => authLost(message),
  onLinksChanged: refreshMonths,
  onHistory: saveHistory,
  onSynced: async () => { clearCache(); state.data = await loadMonth(state.month); },
});

/* ---------- Đăng nhập ---------- */
/** Nút đăng xuất luôn hiện khi còn phiên đăng nhập, kể cả lúc đang báo lỗi. */
function syncLogout() {
  const email = getSession()?.email ?? (staleSession ? state.me?.email : null);   // đang dùng dữ liệu đã lưu vẫn coi là đã đăng nhập
  els.logout.hidden = !email;
  $('user').hidden = !email;
  $('settings-btn').hidden = !(email && canSettings());
  if (email) {
    els.logout.title = `Đăng xuất (${email}) để đăng nhập bằng tài khoản khác`;
    $('user-email').textContent = email;
    $('user-avatar').textContent = email[0].toUpperCase();
  }
}

const showError = (message) => {
  syncLogout();
  mount(els.view, html`<p class="notice" role="alert">${message}</p>`);
};

function showLogin(message = '') {
  setBoot();
  const remembered = getRemembered();   // đã đăng nhập hôm nay nhưng token hết hạn: chỉ cần bấm Tiếp tục
  els.logout.hidden = true;
  $('user').hidden = true;
  $('settings-btn').hidden = true;
  els.tabs.replaceChildren();
  els.bottomNav.replaceChildren();
  mount(els.view, html`
    <section class="card login">
      <h2 class="big">Đăng nhập để xem báo cáo</h2>
      <p class="muted">Chỉ tài khoản <strong>@${CONFIG.allowedDomain}</strong> đã được cấp quyền mới truy cập được. Chưa có quyền? Hãy liên hệ Tiến (<a href="mailto:tien.dq@kiotviet.com">tien.dq@kiotviet.com</a>).</p>
      ${message ? html`<p class="notice" role="alert">${message}</p>` : ''}
      ${remembered
        ? html`<button class="btn" id="login" data-resume type="button">Tiếp tục với ${remembered.email}</button>
               <p class="muted login__legal"><button class="link-btn" id="login-other" type="button">Dùng tài khoản khác</button></p>`
        : html`<button class="btn" id="login" type="button">Đăng nhập bằng Google</button>`}
      <p class="muted login__legal"><a href="privacy.html">Chính sách quyền riêng tư</a> · <a href="terms.html">Điều khoản dịch vụ</a></p>
    </section>`);
}

async function handleLogin(button, { resume = false } = {}) {
  button.disabled = true;
  try {
    await signIn({ resume });
    clearCache();
    await start();
  } catch (err) {
    showLogin(err.message);
  }
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'login') handleLogin(e.target, { resume: e.target.hasAttribute('data-resume') });
  if (e.target.id === 'login-other') { clearSnapshot(); signOut(); showLogin(); }
});
els.logout.addEventListener('click', () => { hideWelcome(els.welcome); chat.reset(); clearSnapshot(); disarmRefresh(); signOut(); clearCache(); settings.reset(); state.me = null; state.data = null; showLogin(); });

/* ---------- Khởi động ---------- */
/** Email phải có trong tab "Tài khoản" của Sheet cấu hình; quyền lấy từ cột "Phân quyền". */
async function authorize() {
  const email = getSession().email;
  const accounts = await loadAccounts();
  state.accounts = accounts;
  const account = findAccount(accounts, email);
  if (!account) {
    signOut();
    showLogin('Email của bạn chưa được cấp quyền. Hãy liên hệ Admin để được thêm vào danh sách tài khoản.');
    return false;
  }
  state.me = { email, role: account.role, name: account.name, gender: account.gender, code: account.code };
  return true;
}

/** Màn hình chờ toàn trang: che giao diện cho tới khi dữ liệu chính sẵn sàng. */
const boot = $('boot');
function setBoot(text, step) {
  if (step === undefined) {   // tắt
    document.body.classList.remove('is-booting');
    boot.hidden = true;
    return;
  }
  document.body.classList.add('is-booting');
  boot.hidden = false;
  $('boot-text').textContent = text;
  boot.querySelectorAll('.boot__step').forEach((li, i) => {
    li.classList.toggle('is-done', i + 1 < step);
    li.classList.toggle('is-active', i + 1 === step);
  });
}

async function start() {
  setBoot('Đang xác thực tài khoản…', 1);
  try { await startApp(); } finally { setBoot(); }
  greet();
  if (state.me && state.data) { chat.watch(); persistSnapshot(); preloadPbi(); }   // thăm dò tin mới + lưu bản dữ liệu hôm nay
}

/** Thẻ chào mừng theo tiến độ của chính người đăng nhập; chỉ hiện một lần cho mỗi lần đăng nhập. */
function greet() {
  if (!state.data || !state.me || state.tab === 'settings') return;
  showWelcome(els.welcome, { me: state.me, found: findMember(state.me.email, state.data.teams, state.me.name, state.me.code), data: state.data });
}

async function startApp() {
  try {
    if (!(await authorize())) return;
    syncLogout();
    setBoot('Đang tải danh sách báo cáo…', 2);
    const months = await loadMonths();
    fillMonths(months);
    if (!months.length) {
      state.data = null;
      if (canSettings()) { state.tab = 'settings'; return renderView(); }
      return showError('Chưa có link báo cáo nào. Hãy nhờ Admin hoặc Quản trị thêm link trong mục Thiết lập.');
    }
    const { month } = readHash();
    state.tab = 'overview';   // luôn vào Tổng quan trước
    await setMonth(months.some((m) => m.month === month) ? month : months[0].month, { boot: true });
  } catch (err) {
    if (err.code === 'auth') showLogin(err.message); else showError(err.message);
  }
}

/* ---------- Đăng nhập một lần trong ngày ---------- */
let staleSession = false;   // token Google đã hết hạn: đang dùng dữ liệu đã lưu, chờ lần chạm đầu tiên để làm mới
const refreshBar = $('refresh-bar');
const clock = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lưu dữ liệu đã tải để lần mở sau trong ngày vào thẳng trang chủ, không qua màn hình đăng nhập. */
function persistSnapshot() {
  if (!state.me || !state.data || staleSession) return;
  saveSnapshot({ email: state.me.email, month: state.month, me: state.me, accounts: state.accounts, data: snapshotData() });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persistSnapshot(); });

function disarmRefresh() {
  staleSession = false;
  refreshBar.hidden = true;
  document.removeEventListener('click', onTouch, true);
  document.removeEventListener('keydown', onTouch, true);
}
function onTouch() { document.removeEventListener('click', onTouch, true); document.removeEventListener('keydown', onTouch, true); refreshSession(); }

/** Token hết hạn nhưng vẫn trong ngày: giữ nguyên giao diện, làm mới ngay ở lần chạm kế tiếp (cần thao tác người dùng để Google cấp lại). */
function armRefresh(text) {
  staleSession = true;
  refreshBar.textContent = text ?? `Đang hiển thị dữ liệu đã lưu lúc ${clock(loadSnapshot(state.me?.email)?.savedAt ?? Date.now())}. Chạm bất kỳ đâu để cập nhật.`;
  refreshBar.hidden = false;
  loadGis().catch(() => {});   // nạp sẵn để cửa sổ cấp quyền mở kịp trong lần chạm
  document.addEventListener('click', onTouch, true);
  document.addEventListener('keydown', onTouch, true);
}

function authLost(message) {
  if (getRemembered() && state.data && state.me) return armRefresh('Phiên làm việc vừa hết hạn. Chạm bất kỳ đâu để làm mới dữ liệu.');
  showLogin(message);
}

async function refreshSession() {
  refreshBar.textContent = 'Đang làm mới dữ liệu…';
  try {
    // Thử cấp lại âm thầm trước (cửa sổ Google tự đóng ngay, không hiện giao diện); không được mới hiện cửa sổ thường.
    try { await signIn({ resume: true, silent: true }); } catch { await signIn({ resume: true }); }
    reloadMonths();   // đọc lại danh sách link (có thể vừa thêm link mới, ví dụ PBI) và xóa dữ liệu cũ
    const months = await loadMonths();
    fillMonths(months);
    if (!months.some((m) => m.month === state.month)) state.month = months[0]?.month ?? state.month;
    if (!(await authorize())) return;
    Object.assign(state.report, { data: null, error: '' });
    Object.assign(state.cinfo, { data: null, error: '' });
    preloadPbi();
    state.data = await loadMonth(state.month);
    staleSession = false;
    syncLogout();
    withKeptInputs(renderView);
    refreshBar.hidden = true;
    persistSnapshot();
    chat.watch();
  } catch (err) {
    armRefresh(`Chưa làm mới được (${err.message}). Chạm bất kỳ đâu để thử lại.`);
  }
}

/** Mở lại trong ngày khi token đã hết: dựng trang chủ từ bản đã lưu (sau màn hình loading), rồi làm mới ở lần chạm đầu. */
async function startFromSnapshot(snap) {
  setBoot('Đang mở báo cáo…', 2);
  try {
    state.me = snap.me; state.accounts = snap.accounts;
    restoreData(snap.data);
    staleSession = true;
    const months = await loadMonths();
    fillMonths(months);
    state.tab = 'overview';
    await Promise.all([setMonth(months.some((m) => m.month === snap.month) ? snap.month : months[0].month, { boot: true }), sleep(700)]);
    if (!state.data) { staleSession = false; return showLogin(); }
    syncLogout();
  } finally { setBoot(); }
  greet();
  armRefresh();
  preloadPbi();
}

/** Mở lại web: còn token thì vào luôn; hết token mà vẫn trong ngày thì vào bằng dữ liệu đã lưu, không hiện màn hình đăng nhập. */
async function open() {
  if (getSession()) return start();
  const remembered = getRemembered();
  if (remembered) {
    const snap = loadSnapshot(remembered.email);
    if (snap) return startFromSnapshot(snap);
    try { await signIn({ resume: true, silent: true }); return start(); } catch { /* chưa có bản lưu: cần một lần bấm */ }
  }
  showLogin();
}
open();

if ('serviceWorker' in navigator) {
  // Có bản mới được kích hoạt thì tải lại một lần để dùng ngay giao diện mới (không phải đóng mở app nhiều lần).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
