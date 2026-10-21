import { loadMonths, reloadMonths, loadMonth, loadReport, hasReport, clearCache, snapshotData, restoreData, hasPbi, loadPbi, hasLibrary, loadLibrary, hasHr, loadHr, hasCalls, loadCalls, hasDetail, loadDetail, hasScores, loadScores, hasAddons, loadAddons } from './data.js';
import { CONFIG } from './config.js';
import { getSession, getRemembered, signIn, signOut, loadGis } from './auth.js';
import { saveSnapshot, loadSnapshot, clearSnapshot } from './snapshot.js';
import { loadAccounts, findAccount, canOpenSettings } from './directory.js';
import { html, mount, raw } from './dom.js';
import { monthLabel } from './format.js';
import { overviewView, memberRowsView } from './views/overview.js';
import { qualityWarnings, acceptQuality } from './quality.js';
import { analyzeControl } from './control.js';
import { callScoreView } from './views/callScores.js';
import { listenView } from './views/listen.js';
import { teamView, rowsView } from './views/team.js';
import { detailView } from './views/detail.js';
import { workView, workRowsView } from './views/work.js';
import { reportView, reportRowsView, reportDetailView } from './views/report.js';
import { connectView } from './views/connect.js';
import { connectCallsView } from './views/connectCalls.js';
import { segmentView } from './views/segment.js';
import { addonView } from './views/addons.js';
import { slaDetailView } from './views/slaDetail.js';
import { controlView } from './views/control.js';
import { transferView } from './views/transfer.js';
import { workdaysByCode } from './report.js';
import { createSettings } from './settingsController.js';
import { createChat } from './chatController.js';
import { computeSla } from './sla.js';
import { slaView } from './views/sla.js';
import { cinfoView, DEFAULT_FILTERS } from './views/cinfo.js';
import { trendView } from './views/trend.js';
import { loadHistory, recordHistory, buildSnapshot } from './history.js';
import { buildTodo } from './todo.js';
import { coachFor } from './coach.js';
import { coachFloat } from './views/coach.js';
import { libraryView, libraryListView, CHECK_ICON } from './views/library.js';
import { hrView, hrRowsView } from './views/hr.js';
import { summarizeMonth } from './compare.js';
import { compareView } from './views/compare.js';
import { findMember, showWelcome, hideWelcome } from './welcome.js';
import { startTour, tourSeen } from './tour.js';
import { openGuide } from './guide.js';
import { decorateTables, handleExportClick, exportReportExcel, exportReportPdf } from './export.js';
import { buildPeriodReport } from './periodReport.js';
import { initTips } from './tip.js';
import { initZoom } from './zoom.js';
import './mobileShell.js';
import { applyTableSorts } from './tableSort.js';

const $ = (id) => document.getElementById(id);
const els = { view: $('view'), tabs: $('tabs'), detail: $('detail'), bottomNav: $('bottom-nav'), logout: $('logout'), welcome: $('welcome') };

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
  compare: { a: null, b: null, key: '', data: null, loading: false, error: '' },   // so sánh hai tháng (quản lý)
  connect: { region: 'all', shortSec: 30, longSec: 180, view: 'month' },   // phân tích chất lượng call kết nối (dùng chung dữ liệu năng suất)
  calls: { data: null, loading: false, error: '' },
  segment: { data: null, loading: false, error: '', key: '', month: 'all' },
  xfer: { month: 'all' },   // data chuyển Offline → Online (dùng chung dữ liệu chi tiết)
  listen: { month: null, job: 'T15', person: 'all', level: 'attn' },   // gợi ý nghe lại call (dùng chung dữ liệu chi tiết)
  callctl: { data: null, loading: false, error: '', month: 'all', person: 'all' },   // kết quả chấm call (Sheet Chấm call)
  control: { rule: 'all', person: 'all' },   // kiểm soát data theo quy trình (dùng chung dữ liệu chi tiết Data Txx)
  addons: { data: null, loading: false, error: '', month: 'all', type: 'all', person: 'all', status: 'all', q: '' },   // add-on nhân sự chọn và được ghi nhận (Sheet PBI, tab Chi tiết addon)   // phân tích tệp data (tab Data Txx)   // từng cuộc gọi (Sheet "Dữ liệu call")
  hr: { data: null, loading: false, error: '', q: '', region: 'all' },   // nhân sự và phép năm
  library: { data: null, loading: false, error: '', cat: 'all', q: '' },   // thư viện tài liệu (quy trình, chính sách, giải trình…)
  coach: null, coachBump: 0,   // nhân vật Coach KPI nổi ở góc màn hình
  coachPref: readCoachPref(),  // { side: 'left' | 'right', open }
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
/** Nhớ tab và tháng đang xem của từng tài khoản để lần mở sau vào lại đúng chỗ. */
const lastKey = (email) => `kpi.last.${email}`;
const readLast = (email) => { try { return JSON.parse(localStorage.getItem(lastKey(email))) ?? {}; } catch { return {}; } };
const writeHash = () => {
  history.replaceState(null, '', `#/${state.month}/${state.tab}`);
  if (state.me?.email && state.month) { try { localStorage.setItem(lastKey(state.me.email), JSON.stringify({ month: state.month, tab: state.tab })); } catch { /* không lưu được thì thôi */ } }
};

/* ---------- Render ---------- */
const ICONS = {
  overview: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.8"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.8"/>',
  addon: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 3.5v7M13.5 7h7"/>',
  xfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  control: '<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  segment: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  connect: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  hr: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11a3 3 0 1 0 0-6M18 14.5c2.2.6 3.5 2.4 3.5 5.5"/>',
  report: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  cinfo: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  library: '<path d="M3 5.5C5 4.5 8 4.5 12 6.5c4-2 7-2 9-1v13c-2-1-5-1-9 1-4-2-7-2-9-1z"/><path d="M12 6.5v13"/>',
  compare: '<path d="M7 4v16M17 4v16M3 9h8M13 15h8"/>',
  trend: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  sla: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 3h6"/>',
  work: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 15l2.5 2.5L16 13"/>',
};
const tabIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] ?? ICONS.team}</svg>`);

/** Cùng một danh sách tab: thanh ngang trên desktop, thanh dưới cùng trên mobile. */
/** Các mục điều hướng: một số mục gom thành nhóm (Team, Vận hành, Phân tích) mở ra danh sách để chọn. */
let navModel = [];
function buildNav() {
  const d = state.data, manager = state.me?.role !== 'member';
  const item = (id, name, short, desc = '') => ({ id, name, short: short ?? name, desc });
  const group = (id, name, icon, items) => (items.length > 1 ? { group: id, id, name, short: name, icon, items } : items[0]);
  const teams = d.teams.map((t) => item(t.id, t.name, t.name.replace('Team ', ''), 'KPI và nhân sự của team'));
  if (hasHr()) teams.push(item('hr', 'Phép năm', 'Phép năm', 'Nhân sự và phép năm 2026'));
  const reports = [];
  if (d.work) reports.push(item('work', 'Theo dõi công việc', 'Công việc', 'Tiến độ xử lý data, bảng chia data'));
  if (d.work?.backlogAll) reports.push(item('sla', 'SLA', 'SLA', 'Data đã trễ và sắp trễ hạn 7 ngày'));
  if (hasPbi()) reports.push(item('cinfo', 'Customer Info', 'C-Info', 'Tỉ lệ SC dùng Customer Info'));
  if (hasScores()) reports.push(item('callctl', 'Kiểm soát call', 'Chấm call', 'Kết quả chấm chất lượng cuộc gọi'));
  if (hasDetail()) reports.push(item('control', 'Kiểm soát', 'Kiểm soát', 'Data điền đúng quy trình, SLA và mức trừ'));
  if (hasAddons()) reports.push(item('addon', 'Add-on', 'Add-on', 'Add-on đã chọn và được ghi nhận'));
  if (hasReport(state.month)) reports.push(item('report', 'Năng suất', 'Năng suất', 'Cuộc gọi, talktime, ngày công'));
  const analysis = [];
  if (manager) analysis.push(item('trend', 'Xu hướng', 'Xu hướng', 'Biến động theo ngày'));
  if (manager && hasDetail()) analysis.push(item('xfer', 'Chuyển Offline → Online', 'Chuyển data', 'Data chuyển theo tháng, nguồn và tỉnh/thành'));
  if (manager && hasDetail()) analysis.push(item('listen', 'Chọn call nghe lại', 'Nghe lại', 'Data kết nối thành công nhưng không impact, xếp mức ưu tiên'));
  if (manager && hasDetail()) analysis.push(item('segment', 'Phân tích tệp data', 'Tệp data', 'Công việc, kết nối, impact, add-on theo nguồn data'));
  if (manager && (hasCalls() || hasReport(state.month))) analysis.push(item('connect', 'Chất lượng kết nối', 'Kết nối', 'Tỉ lệ kết nối và call đàm thoại ngắn'));
  if (manager && monthList.length > 1) analysis.push(item('compare', 'So sánh tháng', 'So sánh', 'Đặt hai tháng cạnh nhau'));
  return [item('overview', 'Tổng quan'), group('team', 'Team', 'team', teams), group('ops', 'Vận hành', 'report', reports), group('analysis', 'Phân tích', 'trend', analysis),
    hasLibrary() ? item('library', 'Thư viện') : null, item('chat', 'Chia sẻ')].filter(Boolean);
}

/** Cùng một danh sách: thanh ngang trên desktop, thanh dưới cùng trên mobile. */
function renderTabs() {
  navModel = buildNav();
  const unread = state.me ? chat.unread() : 0;
  const badge = (n) => (n.id === 'chat' && unread ? html`<span class="chat-badge" aria-label="${unread} tin chưa đọc">${unread > 99 ? '99+' : unread}</span>` : '');
  const active = (n) => (n.items ? n.items.some((i) => i.id === state.tab) : n.id === state.tab);
  const label = (n, short) => {
    const cur = n.items?.find((i) => i.id === state.tab);
    return cur ? `${n.name}: ${cur.short}` : (short ? n.short : n.name);
  };
  const attrs = (n) => (n.items ? html`data-nav-group="${n.id}" aria-haspopup="menu" aria-expanded="false"` : html`data-tab="${n.id}"`);
  const cur = (n) => (active(n) ? html`aria-current="page"` : '');
  mount(els.tabs, html`${navModel.map((n) => html`
    <button class="tab ${n.items ? 'tab--group' : ''}" type="button" title="${label(n)}" ${attrs(n)} ${cur(n)}>${tabIcon(n.icon ?? n.id)}<span class="tab__label">${label(n)}</span>${n.items ? html`<span class="tab__caret" aria-hidden="true">▾</span>` : ''}${badge(n)}</button>`)}`);
  mount(els.bottomNav, html`${navModel.map((n) => html`
    <button class="bottom-nav__item" type="button" ${attrs(n)} ${cur(n)}>
      <span class="bottom-nav__icon">${tabIcon(n.icon ?? n.id)}${badge(n)}</span><span>${n.items ? (n.items.find((i) => i.id === state.tab)?.short ?? n.short) : n.short}</span>
    </button>`)}`);
}

/* ---------- Menu thả xuống (nhóm điều hướng, tài khoản) ---------- */
const popmenu = $('popmenu'), accountMenu = $('account-menu'), accountBtn = $('user');
function closeMenus() {
  popmenu.hidden = true; accountMenu.hidden = true;
  accountBtn.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('[data-nav-group][aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
function placeMenu(menu, anchor, { align = 'left' } = {}) {
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, margin = 8;
  const fromBottom = Boolean(anchor.closest('#bottom-nav'));
  const left = align === 'right' ? r.right - w : r.left + r.width / 2 - (fromBottom ? w / 2 : r.width / 2);
  menu.style.left = `${Math.max(margin, Math.min(left, innerWidth - w - margin))}px`;
  if (fromBottom) { menu.style.top = 'auto'; menu.style.bottom = `${innerHeight - r.top + 6}px`; }
  else { menu.style.bottom = 'auto'; menu.style.top = `${r.bottom + 4}px`; }
}
function openNavMenu(btn) {
  const was = btn.getAttribute('aria-expanded') === 'true';
  closeMenus();
  if (was) return;
  const g = navModel.find((n) => n.id === btn.dataset.navGroup);
  popmenu.innerHTML = html`${g.items.map((i) => html`<button class="menu__item menu__item--rich" type="button" role="menuitem" data-tab="${i.id}" ${i.id === state.tab ? html`aria-current="page"` : ''}><span class="menu__icon">${tabIcon(i.id)}</span><span class="menu__text"><strong>${i.name}</strong>${i.desc ? html`<small>${i.desc}</small>` : ''}</span></button>`)}`.toString();
  popmenu.hidden = false;
  placeMenu(popmenu, btn);
  btn.setAttribute('aria-expanded', 'true');
}
function toggleAccountMenu() {
  const was = !accountMenu.hidden;
  closeMenus();
  if (was) return;
  accountMenu.hidden = false;
  placeMenu(accountMenu, accountBtn, { align: 'right' });
  accountBtn.setAttribute('aria-expanded', 'true');
}
/** Xuất báo cáo tuần/tháng theo khuôn cố định (cần data chi tiết để có SLA và Kiểm soát; không tải được thì xuất phần KPI). */
async function prepareReport(btn) {
  const [period, kind] = btn.dataset.prep.split(':'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang chuẩn bị…';
  try {
    let detail = state.segment.data;
    if (!detail && hasDetail()) detail = await loadDetail().then((d) => (state.segment.data = d)).catch(() => null);
    const report = buildPeriodReport({ data: state.data, rows: detail?.rows ?? null, period });
    (kind === 'xlsx' ? exportReportExcel : exportReportPdf)(report);
  } finally { btn.disabled = false; btn.textContent = label; }
}
document.addEventListener('click', (e) => {
  const prep = e.target.closest('[data-prep]');
  if (prep) { prepareReport(prep); return; }
  if (e.target.closest('[data-dq-accept]')) { if (state.segment.data) acceptQuality(state.segment.data); return renderView(); }
  if (e.target.closest('[data-nav-group]')) return openNavMenu(e.target.closest('[data-nav-group]'));
  if (e.target.closest('#user')) return toggleAccountMenu();
  closeMenus();   // bấm ra ngoài hoặc chọn một mục: đóng menu (mục vẫn được các xử lý khác thực hiện)
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('resize', closeMenus);

/** Tên có dấu của nhân sự lấy từ báo cáo KPI (theo mã), vì Sheet năng suất ghi tên không dấu. */
const kpiNames = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, m.name])));

/** Mã nhân sự -> { name, team } từ báo cáo KPI, để lọc theo team ở các tab khác. */
const kpiPeople = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, { name: m.name, team: t.id }])));

/** Kết quả Kiểm soát cho "Việc cần làm": quản lý thấy toàn đội, nhân sự chỉ phần của mình; chỉ có khi data chi tiết đã tải xong. */
let ctlMemo = { key: null, value: null };
function todoControl() {
  const d = state.segment.data;
  if (!d) return null;
  const code = state.me.role === 'member' ? myCode() : null, key = `${state.month}|${code}`;
  if (ctlMemo.data !== d || ctlMemo.key !== key) ctlMemo = { data: d, key, value: analyzeControl(d.rows, { month: state.month, code }) };
  return ctlMemo.value;
}
/** Tải nền data chi tiết sau khi vào trang để "Việc cần làm" có số lỗi Kiểm soát; không chặn giao diện. */
function preloadDetail() {
  if (!hasDetail() || state.segment.data || state.segment.loading) return;
  setTimeout(() => loadDetail().then((d) => { state.segment.data = d; if (state.tab === 'overview') renderView(); }).catch(() => {}), 2500);
}

/** Dải cảnh báo chất lượng dữ liệu chi tiết (chỉ quản lý thấy) đặt trên đầu báo cáo dùng Data Txx. */
function withQuality(tab, detail, view) {
  if (state.me?.role === 'member') return view;
  const warns = qualityWarnings(detail, { tab });
  if (!warns.length) return view;
  return html`<div class="notice dq" role="alert">${warns.map((w) => html`<p><strong>⚠️ Chất lượng dữ liệu:</strong> ${w.text}</p>`)}<button class="btn btn--ghost" type="button" data-dq-accept>Bỏ qua, dùng số hiện tại làm mốc</button></div>${view}`;
}

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

const renderWork = () => {
  // Ngành hàng lấy từ data chi tiết (cột Product); đang tải thì báo "đang tải", chưa có link thì để trống.
  const loaded = hasDetail() ? lazyTab(state.segment, 'work', loadDetail, (d) => d) : null;
  const industry = hasDetail() && !state.segment.error ? (loaded?.rows ? { rows: loaded.rows, month: state.month } : { loading: true }) : undefined;
  return workView(state.data.work, state.work, kpiPeople(), state.data.teams.map(({ id, name }) => ({ id, name })), industry);
};

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
    state.todo = buildTodo({ me: state.me, found: findMember(state.me.email, state.data.teams, state.me.name, state.me.code), data: state.data, report: state.report.data, pbi: state.cinfo.data, unread: chat.unread(), control: todoControl() });
  }
  const report = preloadReport();   // ngày công và năng suất lấy từ file năng suất, nên luôn tải nền
  if (state.tab === 'settings') return { view: settings.view(), title: 'Thiết lập' };
  if (state.tab === 'report') return { view: renderReport(), title: 'Năng suất' };
  if (state.tab === 'xfer' && state.me.role !== 'member' && hasDetail()) return { view: lazyTab(state.segment, 'xfer', loadDetail, (d) => withQuality('xfer', d, transferView({ rows: d.rows, months: d.months }, state.xfer))), title: 'Chuyển Offline → Online' };
  if (state.tab === 'listen' && state.me.role !== 'member' && hasDetail()) return { view: lazyTab(state.segment, 'listen', loadDetail, (d) => withQuality('listen', d, listenView(d, state.listen, { names: kpiNames() }))), title: 'Chọn call nghe lại' };
  if (state.tab === 'callctl' && hasScores()) return { view: lazyTab(state.callctl, 'callctl', loadScores, (d) => callScoreView(d, state.callctl, { manager: state.me.role !== 'member', code: myCode(), names: kpiNames() })), title: 'Kiểm soát call' };
  if (state.tab === 'control' && hasDetail()) return { view: lazyTab(state.segment, 'control', loadDetail, (d) => withQuality('control', d, controlView(d, state.control, { manager: state.me.role !== 'member', code: myCode(), names: kpiNames(), month: state.month }))), title: 'Kiểm soát' };
  if (state.tab === 'addon' && hasAddons()) return { view: lazyTab(state.addons, 'addon', loadAddons, (d) => addonView(d, state.addons, { manager: state.me.role !== 'member', code: myCode(), names: kpiNames() })), title: 'Add-on' };
  if (state.tab === 'segment' && state.me.role !== 'member' && hasDetail()) return { view: lazyTab(state.segment, 'segment', loadDetail, (data) => withQuality('segment', data, segmentView(data, state.segment))), title: 'Phân tích tệp data' };
  if (state.tab === 'connect' && state.me.role !== 'member') {
    const view = hasCalls()
      ? lazyTab(state.calls, 'connect', loadCalls, (data) => connectCallsView(data, state.connect, state.month, kpiNames()))
      : lazyTab(state.report, 'connect', loadReport, (data) => connectView(data, state.connect, kpiNames()));
    return { view, title: 'Chất lượng kết nối' };
  }
  if (state.tab === 'chat') return { view: renderChat(), title: 'Chia sẻ' };
  if (state.tab === 'hr' && hasHr()) return { view: lazyTab(state.hr, 'hr', loadHr, (d) => hrView(d, state.hr, { manager: state.me.role !== 'member', code: myCode() })), title: 'Phép năm' };
  if (state.tab === 'library' && hasLibrary()) return { view: lazyTab(state.library, 'library', loadLibrary, (d) => libraryView(d, state.library)), title: 'Thư viện' };
  if (state.tab === 'compare' && state.me.role !== 'member' && monthList.length > 1) return { view: renderCompare(), title: 'So sánh tháng' };
  if (state.tab === 'trend' && state.me.role !== 'member') return { view: lazyTab(state.trend, 'trend', loadHistory, (h) => trendView(h, state.trend, { manager: state.me.role !== 'member', code: myCode() })), title: 'Xu hướng' };
  if (state.tab === 'cinfo') return { view: lazyTab(state.cinfo, 'cinfo', loadPbi, (d) => cinfoView(d, state.cinfo.f, { manager: state.me.role !== 'member', code: state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code })), title: 'Customer Info' };
  if (state.tab === 'sla') {
    const manager = state.me.role !== 'member';
    const detail = hasDetail() ? lazyTab(state.segment, 'sla', loadDetail, (d) => withQuality('sla', d, slaDetailView(d, { month: state.month, manager, code: myCode(), names: kpiNames() }))) : '';
    return { view: html`${detail}${slaView(computeSla(state.data.work, latestAsOf(state.data), state.month), { manager, code: state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code })}`, title: 'SLA' };
  }
  if (state.tab === 'work') return { view: renderWork(), title: 'Theo dõi công việc' };
  if (t) return { view: teamView(t, state), title: t.name };
  return { view: overviewView(state.data, state, report), title: 'Tổng quan' };
}

/** Tab phụ thuộc vào tháng đang xem (Tổng quan, các team, Công việc, SLA, Năng suất) mới có ô chọn tháng; các tab khác (Customer Info, Xu hướng, So sánh, Chia sẻ, Thiết lập) thì không. */
const isMonthly = (tab) => ['overview', 'work', 'sla', 'report', 'control'].includes(tab) || (tab === 'connect' && !hasCalls()) || Boolean(state.data?.teams.some((t) => t.id === tab));

/** Ô chọn tháng nằm trong nội dung của tab (không đặt ở thanh trên cùng). */
function monthBar() {
  if (!monthList.length) return '';
  const prep = state.tab === 'overview' && state.me?.role !== 'member';   // quản lý: xuất báo cáo tuần/tháng gửi cấp trên
  return html`<div class="monthbar"><label for="month">Tháng báo cáo</label>
    <select id="month" class="select">${monthList.map((m) => html`<option value="${m.month}" ${m.month === state.month ? 'selected' : ''}>${monthLabel(m.month)}</option>`)}</select>
    ${prep ? html`<span class="monthbar__reports" role="group" aria-label="Xuất báo cáo gửi quản lý"><span class="muted">Báo cáo gửi quản lý:</span>
      ${[['week', 'Tuần'], ['month', 'Tháng']].map(([per, name]) => html`<span class="reportbtn">${name}
        <button class="export-btn" type="button" data-prep="${per}:xlsx" title="Xuất báo cáo ${name.toLowerCase()} ra Excel">Excel</button><button class="export-btn" type="button" data-prep="${per}:pdf" title="Xuất báo cáo ${name.toLowerCase()} ra PDF">PDF</button></span>`)}</span>` : ''}</div>`;
}

function readCoachPref() {
  try { return { side: 'right', open: true, ...JSON.parse(localStorage.getItem('kpi.coach')) }; } catch { return { side: 'right', open: true }; }
}
const saveCoachPref = () => { try { localStorage.setItem('kpi.coach', JSON.stringify(state.coachPref)); } catch {} };

/** Nhân vật nổi ở góc: hiện ở các tab xem số liệu; ẩn ở Chia sẻ/Thiết lập (tránh che ô soạn tin). */
function renderCoach() {
  const el = $('coach');
  const show = CONFIG.coachEnabled && state.me && state.data && !['chat', 'settings'].includes(state.tab);
  state.coach = show ? coachFor({ me: state.me, found: findMember(state.me.email, state.data.teams, state.me.name, state.me.code), data: state.data, bump: state.coachBump }) : null;
  mount(el, state.coach ? coachFloat(state.coach, state.coachPref) : html``);
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
  const monthly = isMonthly(state.tab);
  mount(els.view, html`${monthly ? monthBar() : ''}${page.view}`);
  renderTabs();
  applyTableSorts(els.view);
  renderCoach();
  baseTitle = monthly ? `${page.title} · ${monthLabel(state.month)} · Report SC ONLINE` : `${page.title} · Report SC ONLINE`;
  applyTitle();
  writeHash();
  if (state.tab === 'chat') { const msgs = $('chat-messages'); if (msgs) msgs.scrollTop = msgs.scrollHeight; }
}

async function setMonth(ym, { boot = false } = {}) {
  state.month = ym;
  if (!boot) mount(els.view, html`${isMonthly(state.tab) ? monthBar() : ''}<p class="muted" role="status">Đang tải dữ liệu từ Google Sheet…</p>`);
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
  Object.assign(state.report, { data: report, error: '', query: '' });
  state.work.query = '';
  const validTab = (state.tab === 'work' && state.data.work) || (state.tab === 'settings' && canSettings()) || state.tab === 'chat' || (state.tab === 'sla' && state.data.work?.backlogAll) || (state.tab === 'cinfo' && hasPbi()) || (state.tab === 'library' && hasLibrary()) || (state.tab === 'hr' && hasHr()) || (state.tab === 'trend' && state.me.role !== 'member') || (state.tab === 'compare' && state.me.role !== 'member' && monthList.length > 1) || (state.tab === 'report' && hasReport(ym)) || (state.tab === 'connect' && state.me.role !== 'member' && (hasCalls() || hasReport(ym))) || (state.tab === 'segment' && state.me.role !== 'member' && hasDetail()) || (state.tab === 'addon' && hasAddons()) || (state.tab === 'control' && hasDetail()) || (state.tab === 'callctl' && hasScores()) || (state.tab === 'listen' && state.me.role !== 'member' && hasDetail()) || (state.tab === 'xfer' && state.me.role !== 'member' && hasDetail()) || team();
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
/** Sao chép link tài liệu vào bộ nhớ tạm; nút đổi chữ báo kết quả trong 1,5 giây. */
async function copyLink(btn) {
  const url = btn.dataset.copyLink;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch {
    const box = Object.assign(document.createElement('textarea'), { value: url });   // trình duyệt chặn Clipboard API: dùng cách cũ
    box.style.cssText = 'position:fixed;opacity:0'; document.body.append(box); box.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    box.remove();
  }
  const old = btn.dataset.html ?? btn.innerHTML;
  btn.dataset.html = old;
  btn.innerHTML = ok ? CHECK_ICON : '✕';
  btn.title = ok ? 'Đã sao chép' : 'Không chép được';
  btn.classList.toggle('is-copied', ok);
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.innerHTML = old; btn.title = 'Sao chép link'; btn.classList.remove('is-copied'); }, 1500);
}

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

function openReportMember(code, { timesheet = false } = {}) {
  mount(els.detail, reportDetailView(state.report.data, code, kpiNames()));
  els.detail.showModal();
  if (timesheet) {   // mở sẵn bảng công của nhân sự
    const sheet = els.detail.querySelector('details.timesheet');
    if (sheet) { sheet.open = true; sheet.scrollIntoView({ block: 'start' }); }
  }
}

/* ---------- Nút xuất Excel/PDF cho mọi bảng (gắn lại mỗi khi nội dung đổi) ---------- */
let exportQueued = false;
const exportObserver = new MutationObserver(() => {
  if (exportQueued) return;
  exportQueued = true;
  setTimeout(() => { exportQueued = false; decorateTables(els.view); decorateTables(els.detail); }, 60);
});
initTips();
initZoom();
exportObserver.observe(els.view, { childList: true, subtree: true });
exportObserver.observe(els.detail, { childList: true, subtree: true });

/* ---------- Sự kiện (ủy quyền, không gắn từng phần tử) ---------- */
document.addEventListener('click', (e) => {
  const hit = (sel) => e.target.closest(sel);
  if (handleExportClick(e)) return;
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
  if (hit('[data-coach-slow]')) {   // quản lý: về Tổng quan, lọc "Chậm" và cuộn tới bảng nhân sự
    Object.assign(state, { filter: 'all', mstatus: 'bad', mquery: '' });
    if (state.tab !== 'overview') setTab('overview'); else renderView();
    $('member-rows')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (hit('[data-coach-next]')) { state.coachBump += 1; return renderCoach(); }
  if (hit('[data-coach-toggle]')) { state.coachPref.open = !state.coachPref.open; saveCoachPref(); return renderCoach(); }
  if (hit('[data-coach-side]')) { state.coachPref.side = state.coachPref.side === 'right' ? 'left' : 'right'; saveCoachPref(); return renderCoach(); }
  if (hit('[data-copy-link]')) { copyLink(hit('[data-copy-link]')); return; }
  if (hit('[data-lib-cat]')) { state.library.cat = hit('[data-lib-cat]').dataset.libCat; return renderView(); }
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
  if (row.dataset.rmember) openReportMember(row.dataset.rmember, { timesheet: Boolean(row.closest('.work-table')) }); else openMember(row.dataset.member);
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
  if (e.target.id === 'addon-search') { state.addons.q = e.target.value; return withKeptInputs(renderView); }
  if (e.target.id === 'hr-search') {   // chỉ vẽ lại phần thân bảng để giữ con trỏ khi gõ
    state.hr.q = e.target.value;
    return mount($('hr-rows'), hrRowsView(state.hr.data, state.hr));
  }
  if (e.target.id === 'lib-search') {   // chỉ vẽ lại danh sách để giữ con trỏ khi gõ
    state.library.q = e.target.value;
    return mount($('lib-list'), libraryListView(state.library.data, state.library));
  }
  if (e.target.id !== 'search') return;
  state.query = e.target.value;
  mount($('rows'), rowsView(team(), state.query, state.sort));
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'xfer-month') { state.xfer.month = e.target.value; return renderView(); }
  if (e.target.id === 'ls-month') { state.listen.month = e.target.value; return renderView(); }
  if (e.target.id === 'ls-job') { state.listen.job = e.target.value; return renderView(); }
  if (e.target.id === 'ls-person') { state.listen.person = e.target.value; return renderView(); }
  if (e.target.id === 'ls-level') { state.listen.level = e.target.value; return renderView(); }
  if (e.target.id === 'cs-month') { state.callctl.month = e.target.value; return renderView(); }
  if (e.target.id === 'cs-person') { state.callctl.person = e.target.value; return renderView(); }
  if (e.target.id === 'ctl-rule') { state.control.rule = e.target.value; return renderView(); }
  if (e.target.id === 'ctl-person') { state.control.person = e.target.value; return renderView(); }
  if (e.target.id === 'addon-month') { state.addons.month = e.target.value; state.addons.person = 'all'; state.addons.type = 'all'; return renderView(); }
  if (e.target.id === 'addon-type') { state.addons.type = e.target.value; return renderView(); }
  if (e.target.id === 'addon-person') { state.addons.person = e.target.value; return renderView(); }
  if (e.target.id === 'addon-status') { state.addons.status = e.target.value; return renderView(); }
  if (e.target.id === 'seg-source') { state.segment.key = e.target.value; return renderView(); }
  if (e.target.id === 'seg-month') { state.segment.month = e.target.value; return renderView(); }
  if (e.target.id === 'connect-month') { state.connect.month = e.target.value; return renderView(); }
  if (e.target.id === 'connect-short' || e.target.id === 'connect-long') { state.connect[e.target.id === 'connect-short' ? 'shortSec' : 'longSec'] = Number(e.target.value); return renderView(); }
  if (e.target.id === 'hr-region') { state.hr.region = e.target.value; return renderView(); }
  if (e.target.id === 'compare-a' || e.target.id === 'compare-b') { state.compare[e.target.id === 'compare-a' ? 'a' : 'b'] = e.target.value; return renderView(); }
  if (e.target.id === 'trend-who') { state.trend.who = e.target.value; return renderView(); }
  if (e.target.id === 'month') return setMonth(e.target.value);
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
  if (hit('[data-addon-clear]')) { Object.assign(state.addons, { type: 'all', person: 'all', status: 'all', q: '' }); return renderView(); }
  if (hit('[data-cview]')) { state.connect.view = hit('[data-cview]').dataset.cview; return renderView(); }
  if (hit('[data-cregion]')) { state.connect.region = hit('[data-cregion]').dataset.cregion; return renderView(); }
  if (hit('[data-daymetric]')) { state.report.dayMetric = hit('[data-daymetric]').dataset.daymetric; return renderView(); }
  if (hit('[data-rsort]')) {
    const key = hit('[data-rsort]').dataset.rsort;
    const { sort } = state.report;
    state.report.sort = { key, dir: sort.key === key && sort.dir === 'desc' ? 'asc' : 'desc' };
    return renderView();
  }
  if (hit('[data-rmember]')) openReportMember(hit('[data-rmember]').dataset.rmember, { timesheet: Boolean(hit('[data-rmember]').closest('.work-table')) });
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
  if (act === 'chat') setTab('chat'); else if (act === 'sla') setTab('sla'); 
});
$('help').addEventListener('click', () => openGuide(state.me?.role, { onTour: () => startTour({ email: state.me?.email }) }));


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
}

/** Link báo cáo vừa đổi: dựng lại danh sách tháng, giữ tháng đang xem nếu còn. */
async function refreshMonths() {
  reloadMonths();
  const months = await loadMonths();
  fillMonths(months);
  if (!months.length) { state.data = null; return; }
  if (months.some((m) => m.month === state.month)) return;
  state.month = months[0].month;
  state.data = await loadMonth(state.month);
}

/** Tải và tóm tắt hai tháng để so sánh (dùng lại bộ nhớ đệm của từng tháng). */
async function loadCompare(a, b) {
  const one = async (ym) => {
    const data = await loadMonth(ym);
    const report = hasReport(ym) ? await loadReport(ym).catch(() => null) : null;
    return summarizeMonth(ym, data, report);
  };
  const [sa, sb] = await Promise.all([one(a), one(b)]);
  return { a: sa, b: sb };
}

function renderCompare() {
  const c = state.compare;
  c.a ??= monthList[0].month;
  c.b ??= monthList[1].month;
  const key = `${c.a}|${c.b}`;
  if (c.key !== key) Object.assign(c, { key, data: null, error: '', loading: false });
  if (c.a !== c.b && !c.data && !c.loading && !c.error) {
    c.loading = true;
    loadCompare(c.a, c.b)
      .then((d) => { if (c.key === key) c.data = d; })
      .catch((err) => { if (err.code === 'auth') authLost(err.message); else c.error = err.message; })
      .finally(() => { c.loading = false; if (state.tab === 'compare' && c.key === key) renderView(); });
  }
  if (c.error) return html`<p class="notice" role="alert">${c.error}</p>`;
  return compareView({ months: monthList, a: c.a, b: c.b, data: c.data });
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
  $('settings-btn').hidden = !(email && canSettings());
  setAccount(email);
}

/** Nút tài khoản ở góc phải: chữ cái đầu + email khi đã đăng nhập, "Menu" khi chưa (vẫn mở được Hướng dẫn và Giao diện). */
function setAccount(email) {
  $('user').classList.toggle('is-out', !email);
  $('user-avatar').textContent = email ? email[0].toUpperCase() : '☰';
  $('user-email').textContent = email ?? 'Menu';
  $('menu-who').textContent = email ?? 'Chưa đăng nhập';
  els.logout.title = email ? `Đăng xuất (${email}) để đăng nhập bằng tài khoản khác` : '';
}

const showError = (message) => {
  syncLogout();
  mount(els.view, html`<p class="notice" role="alert">${message}</p>`);
};

function showLogin(message = '') {
  setBoot();
  const remembered = getRemembered();   // đã đăng nhập hôm nay nhưng token hết hạn: chỉ cần bấm Tiếp tục
  els.logout.hidden = true;
  setAccount(null);
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
  if (state.me && state.data) { chat.watch(); persistSnapshot(); preloadPbi(); preloadDetail(); }   // thăm dò tin mới + lưu bản dữ liệu hôm nay
}

/** Thẻ chào mừng theo tiến độ của chính người đăng nhập; chỉ hiện một lần cho mỗi lần đăng nhập. */
function greet() {
  if (!state.data || !state.me || state.tab === 'settings') return;
  const welcome = () => showWelcome(els.welcome, { me: state.me, found: findMember(state.me.email, state.data.teams, state.me.name, state.me.code), data: state.data });
  // Tài khoản vào lần đầu: xem tour nhanh trước, xong mới tới thẻ chào.
  if (tourSeen(state.me.email)) return welcome();
  requestAnimationFrame(() => startTour({ email: state.me.email, onClose: welcome }));
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
    // Ưu tiên đường dẫn được gửi (#/tháng/tab), rồi tới nơi đã xem lần trước, cuối cùng là Tổng quan. Tab không hợp lệ sẽ tự về Tổng quan.
    const hash = readHash(), last = readLast(state.me.email);
    const month = hash.month || last.month;
    state.tab = hash.tab || last.tab || 'overview';
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
    Object.assign(state.library, { data: null, error: '' });
    Object.assign(state.hr, { data: null, error: '' });
    Object.assign(state.calls, { data: null, error: '' });
    Object.assign(state.segment, { data: null, error: '' });
    Object.assign(state.callctl, { data: null, error: '' });
    Object.assign(state.addons, { data: null, error: '' });
    Object.assign(state.compare, { data: null, error: '', key: '' });
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
    const last = readLast(snap.me.email);
    state.tab = last.tab || 'overview';
    const want = snap.month;   // bản lưu chỉ có dữ liệu của tháng này
    await Promise.all([setMonth(months.some((m) => m.month === want) ? want : months[0].month, { boot: true }), sleep(700)]);
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
