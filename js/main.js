import { loadMonths, reloadMonths, loadMonth, loadReport, hasReport, clearCache } from './data.js';
import { CONFIG } from './config.js';
import { getSession, signIn, signOut } from './auth.js';
import { loadAccounts, findAccount, canOpenSettings } from './directory.js';
import { html, mount, raw } from './dom.js';
import { monthLabel } from './format.js';
import { overviewView } from './views/overview.js';
import { teamView, rowsView } from './views/team.js';
import { detailView } from './views/detail.js';
import { workView, workRowsView } from './views/work.js';
import { reportView, reportRowsView, reportDetailView } from './views/report.js';
import { workdaysByCode } from './report.js';
import { createSettings } from './settingsController.js';

const $ = (id) => document.getElementById(id);
const els = { view: $('view'), tabs: $('tabs'), month: $('month'), detail: $('detail'), bottomNav: $('bottom-nav'), logout: $('logout') };

/** Lưu lựa chọn giao diện của riêng trình duyệt này; lỗi (chế độ riêng tư…) thì dùng mặc định. */
function readPref(key, fallback) {
  try { return localStorage.getItem(`kpi.${key}`) ?? fallback; } catch { return fallback; }
}

const state = {
  month: null, data: null,
  tab: 'overview',           // 'overview' | 'work' | 'report' | 'settings' | team id
  filter: 'all',             // bộ lọc team ở bảng nhân sự trang tổng quan
  heat: readPref('heat2', 'bars'),   // kiểu màu bảng: bars (thanh màu) | alert (ít màu) | full (nhiều màu)
  query: '',
  sort: { key: 'kpi', dir: 'desc' },
  report: { data: null, loading: false, error: '', region: 'all', weekMetric: 'calls', dayMetric: 'calls', query: '', sort: { key: 'talk', dir: 'desc' } },
  work: { team: 'all', matrix: 'backlogAll', query: '', sort: { key: 'pctDone', dir: 'desc' } },
  me: null,                  // { email, role } — role: admin | manager | member
};

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
  work: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 15l2.5 2.5L16 13"/>',
};
const tabIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] ?? ICONS.team}</svg>`);

/** Cùng một danh sách tab: thanh ngang trên desktop, thanh dưới cùng trên mobile. */
function renderTabs() {
  const tabs = [{ id: 'overview', name: 'Tổng quan' }, ...state.data.teams];
  if (state.data.work) tabs.push({ id: 'work', name: 'Theo dõi công việc', short: 'Công việc' });
  if (hasReport(state.month)) tabs.push({ id: 'report', name: 'Năng suất' });
  const current = (t) => (t.id === state.tab ? html`aria-current="page"` : '');
  mount(els.tabs, html`${tabs.map((t) => html`
    <button class="tab" type="button" data-tab="${t.id}" ${current(t)}>${t.name}</button>`)}`);
  mount(els.bottomNav, html`${tabs.map((t) => html`
    <button class="bottom-nav__item" type="button" data-tab="${t.id}" ${current(t)}>
      ${tabIcon(t.id)}<span>${t.short ?? t.name.replace('Team ', '')}</span>
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
      .catch((err) => { if (err.code === 'auth') showLogin(err.message); else slice.error = err.message; })
      .finally(() => { slice.loading = false; if (state.tab === tab && state.month === month) renderView(); });
  }
  return html`<p class="muted" role="status">Đang tải dữ liệu…</p>`;
}

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
  const report = preloadReport();   // ngày công và năng suất lấy từ file năng suất, nên luôn tải nền
  if (state.tab === 'settings') return { view: settings.view(), title: 'Thiết lập' };
  if (state.tab === 'report') return { view: renderReport(), title: 'Năng suất' };
  if (state.tab === 'work') return { view: renderWork(), title: 'Theo dõi công việc' };
  if (t) return { view: teamView(t, state), title: t.name };
  return { view: overviewView(state.data, state, report), title: 'Tổng quan' };
}

function renderView() {
  if (!state.data) {   // chưa có báo cáo nào: chỉ còn trang Thiết lập (dành cho Admin / Quản trị)
    els.tabs.replaceChildren();
    els.bottomNav.replaceChildren();
    mount(els.view, settings.view());
    document.title = 'Thiết lập · Báo cáo KPI';
    return;
  }
  const page = currentPage();
  mount(els.view, page.view);
  renderTabs();
  document.title = `${page.title} · ${monthLabel(state.month)} · Báo cáo KPI`;
  writeHash();
}

async function setMonth(ym) {
  state.month = ym;
  mount(els.view, html`<p class="muted" role="status">Đang tải dữ liệu từ Google Sheet…</p>`);
  try {
    state.data = await loadMonth(ym);
  } catch (err) {
    return err.code === 'auth' ? showLogin(err.message) : showError(err.message);
  }
  els.month.value = ym;
  Object.assign(state.report, { data: null, error: '', query: '' });
  state.work.query = '';
  const validTab = (state.tab === 'work' && state.data.work) || (state.tab === 'settings' && canSettings()) || (state.tab === 'report' && hasReport(ym)) || team();
  if (state.tab !== 'overview' && !validTab) state.tab = 'overview';
  renderView();
}

function setTab(tab) {
  state.tab = tab;
  state.query = '';
  renderView();
  window.scrollTo({ top: 0 });
}

/* ---------- Chi tiết nhân sự ---------- */
function openMember(ref) {
  const [teamId, code] = ref.split(':');
  const t = state.data.teams.find((x) => x.id === teamId);
  const member = t.members.find((m) => m.code === code);
  const workdays = state.report.data ? workdaysByCode(state.report.data).get(member.code) : undefined;
  mount(els.detail, detailView(t, member, workdays));
  els.detail.showModal();
}

function openReportMember(code) {
  mount(els.detail, reportDetailView(state.report.data, code, kpiNames()));
  els.detail.showModal();
}

/* ---------- Sự kiện (ủy quyền, không gắn từng phần tử) ---------- */
document.addEventListener('click', (e) => {
  const hit = (sel) => e.target.closest(sel);
  if (hit('[data-close]') || e.target === els.detail) return els.detail.close();
  if (hit('[data-tab]')) { els.detail.close(); return setTab(hit('[data-tab]').dataset.tab); }
  if (hit('[data-member]')) return openMember(hit('[data-member]').dataset.member);
  if (hit('[data-heat]')) {
    state.heat = hit('[data-heat]').dataset.heat;
    try { localStorage.setItem('kpi.heat2', state.heat); } catch {}
    return renderView();
  }
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
  if (e.target.id === 'work-search') {
    state.work.query = e.target.value;
    return mount($('work-rows'), workRowsView(state.data.work, state.work, kpiPeople()));
  }
  if (e.target.id !== 'search') return;
  state.query = e.target.value;
  mount($('rows'), rowsView(team(), state.query, state.sort));
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'week-metric') return;
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

const settings = createSettings({
  getMe: () => state.me,
  getMonths: () => monthList,
  rerender: () => { if (state.tab === 'settings' || !state.data) renderView(); },
  onAuthExpired: (message) => showLogin(message),
  onLinksChanged: refreshMonths,
});

/* ---------- Đăng nhập ---------- */
/** Nút đăng xuất luôn hiện khi còn phiên đăng nhập, kể cả lúc đang báo lỗi. */
function syncLogout() {
  const session = getSession();
  els.logout.hidden = !session;
  $('user').hidden = !session;
  $('settings-btn').hidden = !(session && canSettings());
  if (session) {
    els.logout.title = `Đăng xuất (${session.email}) để đăng nhập bằng tài khoản khác`;
    $('user-email').textContent = session.email;
    $('user-avatar').textContent = session.email[0].toUpperCase();
  }
}

const showError = (message) => {
  syncLogout();
  mount(els.view, html`<p class="notice" role="alert">${message}</p>`);
};

function showLogin(message = '') {
  els.logout.hidden = true;
  $('user').hidden = true;
  $('settings-btn').hidden = true;
  els.tabs.replaceChildren();
  els.bottomNav.replaceChildren();
  mount(els.view, html`
    <section class="card login">
      <h2 class="big">Đăng nhập để xem báo cáo</h2>
      <p class="muted">Chỉ tài khoản Google <strong>@${CONFIG.allowedDomain}</strong> được truy cập. Dữ liệu được đọc trực tiếp từ Google Sheet bằng quyền của bạn.</p>
      ${message ? html`<p class="notice" role="alert">${message}</p>` : ''}
      <button class="btn" id="login" type="button">Đăng nhập bằng Google</button>
    </section>`);
}

async function handleLogin(button) {
  button.disabled = true;
  try {
    await signIn();
    clearCache();
    await start();
  } catch (err) {
    showLogin(err.message);
  }
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'login') handleLogin(e.target);
});
els.logout.addEventListener('click', () => { signOut(); clearCache(); settings.reset(); state.me = null; state.data = null; showLogin(); });

/* ---------- Khởi động ---------- */
/** Email phải có trong tab "Tài khoản" của Sheet cấu hình; quyền lấy từ cột "Phân quyền". */
async function authorize() {
  const email = getSession().email;
  const account = findAccount(await loadAccounts(), email);
  if (!account) {
    signOut();
    showLogin('Email của bạn chưa được cấp quyền. Hãy liên hệ Admin để được thêm vào danh sách tài khoản.');
    return false;
  }
  state.me = { email, role: account.role };
  return true;
}

async function start() {
  syncLogout();
  try {
    if (!(await authorize())) return;
    syncLogout();
    const months = await loadMonths();
    fillMonths(months);
    if (!months.length) {
      state.data = null;
      if (canSettings()) { state.tab = 'settings'; return renderView(); }
      return showError('Chưa có link báo cáo nào. Hãy nhờ Admin hoặc Quản trị thêm link trong mục Thiết lập.');
    }
    const { month } = readHash();
    state.tab = 'overview';   // luôn vào Tổng quan trước
    await setMonth(months.some((m) => m.month === month) ? month : months[0].month);
  } catch (err) {
    if (err.code === 'auth') showLogin(err.message); else showError(err.message);
  }
}

getSession() ? start() : showLogin();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
