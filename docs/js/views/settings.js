import { html } from '../dom.js';
import { badge } from './components.js';
import { ROLES, canManage } from '../directory.js';
import { monthLabel } from '../format.js';
import { DATE_MODES, modeOf, resolveRange } from '../crm.js';

const SECTIONS = [['accounts', 'Tài khoản'], ['links', 'Cấu hình'], ['crm', 'Đồng bộ CRM'], ['call', 'Xuất Call']];
const SERVER_COMMAND = '<thư-mục-tool>/venv/bin/python3 server.py 8080';
const short = (text, n = 40) => (text.length > n ? `${text.slice(0, n)}…` : text);
const ROLE_TONE = { admin: 'good', manager: 'warn', member: 'neutral' };

const notice = (ui) => (ui.error ? html`<p class="notice" role="alert">${ui.error}</p>` : '');
const link = (act, key, label, danger = false) =>
  html`<button class="link-btn ${danger ? 'link-btn--danger' : ''}" type="button" data-act="${act}" data-key="${key}">${label}</button>`;

/* ---------- Tài khoản ---------- */
const roleOptions = (actor, selected) => Object.entries(ROLES)
  .filter(([role]) => canManage(actor, role))
  .map(([role, r]) => html`<option value="${role}" ${role === selected ? 'selected' : ''}>${r.label}</option>`);

const accountForm = (ui, account) => html`
  <form class="task-form" data-sform="account" data-key="${account?.email ?? ''}">
    <input name="email" type="email" required placeholder="ten@kiotviet.com" value="${account?.email ?? ''}" aria-label="Email" autocomplete="off">
    <select name="role" class="select" aria-label="Phân quyền">${roleOptions(ui.me.role, account?.role ?? 'member')}</select>
    <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>${account ? 'Lưu' : 'Thêm'}</button>
    ${account ? html`<button class="btn btn--ghost" type="button" data-act="cancel">Hủy</button>` : ''}
  </form>`;

const accountRow = (a, i, ui) => {
  if (ui.editing?.kind === 'account' && ui.editing.key === a.email) {
    return html`<tr><td colspan="5">${accountForm(ui, a)}</td></tr>`;
  }
  const editable = canManage(ui.me.role, a.role);
  return html`<tr class="static">
    <td class="num">${i + 1}</td><td>${a.email}</td>
    <td>${badge(ROLE_TONE[a.role], ROLES[a.role].label)}</td>
    <td>${a.note || ROLES[a.role].note}</td>
    <td class="right">${editable
      ? html`${link('account-edit', a.email, 'Sửa')}${link('account-delete', a.email, 'Xóa', true)}`
      : html`<span class="muted" title="${a.role === 'admin' ? 'Admin cố định, không thay đổi được' : 'Bạn không có quyền sửa tài khoản này'}">🔒 Cố định</span>`}</td></tr>`;
};

const accountsSection = (ui) => html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">Danh sách tài khoản (${ui.accounts.length})</h3></div>
    <p class="muted">Admin cố định, không sửa hoặc xóa được. Quản trị chỉ quản lý được Thành viên.</p>
    ${notice(ui)}
    ${accountForm(ui)}
    <div class="table-wrap"><table>
      <thead><tr><th>STT</th><th>Email</th><th>Phân quyền</th><th>Mô tả quyền</th><th class="right">Thao tác</th></tr></thead>
      <tbody>${ui.accounts.map((a, i) => accountRow(a, i, ui))}</tbody></table></div>
  </section>`;

/* ---------- Cấu hình link báo cáo ---------- */
const linkForm = (ui, item, index) => html`
  <form class="task-form" data-sform="link" data-key="${index ?? ''}">
    <input name="info" required list="link-info" placeholder="Loại: KPI hoặc Năng suất" value="${item?.info ?? ''}" aria-label="Thông tin">
    <input name="id" required placeholder="Link hoặc ID Google Sheet" value="${item?.id ?? ''}" aria-label="ID link">
    <input name="tab" placeholder="Ghi chú tab (không bắt buộc)" value="${item?.tab ?? ''}" aria-label="Sheet">
    <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>${item ? 'Lưu' : 'Thêm'}</button>
    ${item ? html`<button class="btn btn--ghost" type="button" data-act="cancel">Hủy</button>` : ''}
  </form>`;

const linkRow = (l, i, ui) => (ui.editing?.kind === 'link' && ui.editing.key === i
  ? html`<tr><td colspan="4">${linkForm(ui, l, i)}</td></tr>`
  : html`<tr class="static">
      <td><strong>${l.info}</strong></td>
      <td title="${l.id}">${short(l.id, 30)}</td><td>${l.tab || html`<span class="muted">—</span>`}</td>
      <td class="right">${link('link-edit', i, 'Sửa')}${link('link-delete', i, 'Xóa', true)}</td></tr>`);

const tabCell = (t) => (t ? t.tab : html`<span class="muted">—</span>`);
const monthsTable = (months = []) => html`
  <h4 class="subtitle">Các tháng web nhận được (${months.length})</h4>
  ${months.length ? html`<div class="table-wrap"><table>
    <thead><tr><th>Tháng</th><th>Tab KPI</th><th>Tab năng suất</th></tr></thead>
    <tbody>${months.map((m) => html`<tr class="static"><td><strong>${monthLabel(m.month)}</strong></td><td>${tabCell(m.kpi)}</td><td>${tabCell(m.productivity)}</td></tr>`)}</tbody>
  </table></div>` : html`<p class="muted">Chưa nhận được tháng nào. Kiểm tra link có tab tên dạng T10 và bạn có quyền xem Sheet.</p>`}`;

const linksSection = (ui) => html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">Link báo cáo (${ui.links.length})</h3></div>
    <p class="muted">Mỗi dòng là một Google Sheet có <strong>tab theo từng tháng</strong> (ví dụ T9, T10). Ghi “Thông tin” là <strong>KPI</strong> hoặc <strong>Năng suất</strong>; web tự nhận các tab tháng và ghép tab cùng tên giữa hai Sheet.</p>
    ${notice(ui)}
    <datalist id="link-info"><option value="KPI "></option><option value="Năng suất "></option></datalist>
    ${linkForm(ui)}
    ${monthsTable(ui.months)}
    ${ui.links.length ? html`<div class="table-wrap"><table>
      <thead><tr><th>Thông tin</th><th>ID link</th><th>Sheet</th><th class="right">Thao tác</th></tr></thead>
      <tbody>${ui.links.map((l, i) => linkRow(l, i, ui))}</tbody></table></div>` : html`<p class="muted">Chưa có link nào.</p>`}
  </section>`;

/* ---------- Đồng bộ CRM ---------- */
const serverCard = (status, error) => (status
  ? html`
    <section class="card">
      <div class="card__head"><h3 class="card__title">Máy chủ tool CRM</h3>${status.ready ? badge('good', 'Sẵn sàng') : badge('bad', 'Chưa sẵn sàng')}</div>
      ${status.ready ? '' : html`<p class="notice">Chưa nạp được tool: ${status.error}</p>`}
      <dl class="kv"><dt>Tài khoản Google ghi Sheet</dt><dd>${status.serviceAccount ?? 'không tìm thấy credentials.json'}</dd></dl>
      <p class="muted">Mỗi Google Sheet đích cần được <strong>chia sẻ quyền chỉnh sửa</strong> cho tài khoản trên.</p>
    </section>`
  : html`
    <section class="card">
      <div class="card__head"><h3 class="card__title">Máy chủ tool CRM</h3>${badge('bad', 'Chưa kết nối')}</div>
      <p class="muted">Web cần máy chủ cục bộ để chạy tool CRM. Mở Terminal tại thư mục web-kov và chạy:</p>
      <pre class="code">${SERVER_COMMAND}</pre>
      <p class="muted">Rồi mở web bằng <strong>http://localhost:8080</strong>. ${error ? html`<br>Chi tiết: ${error}` : ''}</p>
    </section>`);

/** Ô nhập cookie dùng chung cho CRM và call-report; cookie chỉ nằm trong bộ nhớ máy chủ cục bộ. */
const cookieCard = (status, { title, formName, clearAct, isSet, placeholder, help }) => html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">${title}</h3>${isSet ? badge('good', 'Đã nhập') : badge('warn', 'Chưa nhập')}</div>
    <form class="inline-form" data-sform="${formName}">
      <input name="cookie" type="password" autocomplete="off" placeholder="${placeholder}" aria-label="${title}" ${status?.ready ? '' : 'disabled'}>
      <button class="btn" type="submit" ${status?.ready ? '' : 'disabled'}>Lưu</button>
      ${isSet ? html`<button class="btn btn--ghost" type="button" data-act="${clearAct}">Xóa</button>` : ''}
    </form>
    <p class="muted">${help} Cookie chỉ giữ trong bộ nhớ của máy chủ cục bộ, tắt máy chủ là mất.</p>
  </section>`;

const CRM_COOKIE = {
  title: 'Cookie đăng nhập CRM', formName: 'cookie', clearAct: 'cookie-clear', placeholder: 'Dán cookie CRM (KVCRM_PHPSESSID…)',
  help: 'Lấy bằng tiện ích Chrome “KV CRM Cookie Grabber” rồi dán vào đây.',
};
const CALL_COOKIE = {
  title: 'Cookie call-report', formName: 'call-cookie', clearAct: 'call-cookie-clear', placeholder: 'Dán giá trị JSESSIONID của call-report.kiotviet.com',
  help: 'DevTools → Application → Cookies → call-report.kiotviet.com → JSESSIONID (hoặc dòng Cookie ở tab Network).',
};

const taskFields = (t = {}) => html`
  <input name="crm_url" required placeholder="Link bộ lọc CRM (https://kvcrm.kiotviet.vn/…)" value="${t.crm_url ?? ''}" aria-label="Link CRM">
  <input name="gsheet_url" required placeholder="Link Google Sheet đích" value="${t.gsheet_url ?? ''}" aria-label="Link Google Sheet">
  <input name="tab_name" placeholder="Tên tab đích (bỏ trống = tự động)" value="${t.tab_name ?? ''}" aria-label="Tab đích">`;

const taskRow = (t, i, ui) => (ui.editing?.kind === 'task' && ui.editing.key === i
  ? html`<tr><td colspan="5"><form class="task-form" data-sform="task" data-key="${i}">${taskFields(t)}
      <button class="btn" type="submit">Lưu</button><button class="btn btn--ghost" type="button" data-act="cancel">Hủy</button></form></td></tr>`
  : html`<tr class="static">
      <td><input type="checkbox" data-task-toggle="${i}" ${t.enabled ? 'checked' : ''} aria-label="Bật tác vụ ${t.tab_name}"></td>
      <td><strong>${t.tab_name || 'tự động'}</strong></td>
      <td title="${t.crm_url}">${short(t.crm_url)}</td><td title="${t.gsheet_url}">${short(t.gsheet_url)}</td>
      <td class="right">${link('task-edit', i, 'Sửa')}${link('task-delete', i, 'Xóa', true)}</td></tr>`);

const taskTable = (ui) => html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">Tác vụ đồng bộ (${ui.tasks.length})</h3></div>
    ${notice(ui)}
    <form class="task-form" data-sform="task" data-key="">${taskFields()}<button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>Thêm</button></form>
    ${ui.tasks.length ? html`<div class="table-wrap"><table>
      <thead><tr><th>Bật</th><th>Tab đích</th><th>Link CRM</th><th>Link Google Sheet</th><th class="right">Thao tác</th></tr></thead>
      <tbody>${ui.tasks.map((t, i) => taskRow(t, i, ui))}</tbody></table></div>` : html`<p class="muted">Chưa có tác vụ nào.</p>`}
  </section>`;

/** Khung chạy + nhật ký dùng chung; `run` mô tả nút bấm của từng mục. */
const runCard = (ui, run) => {
  const { status, job } = ui;
  const running = Boolean(job && !job.finished);
  const can = Boolean(status?.ready && run.cookieSet && run.ready && !running);
  const progress = job?.total ? job.done / job.total : 0;
  return html`
    <section class="card">
      <div class="card__head"><h3 class="card__title">Chạy đồng bộ</h3>
        ${running ? badge('warn', 'Đang chạy') : job ? badge(job.ok === job.total ? 'good' : 'bad', `${job.ok}/${job.total} thành công`) : ''}</div>
      <div class="inline-form">
        <button class="btn" type="button" data-act="${run.act}" ${can ? '' : 'disabled'}>${run.label}</button>
        ${run.dryAct ? html`<button class="btn btn--ghost" type="button" data-act="${run.dryAct}" ${can || (status?.ready && run.cookieSet && !running && run.dryReady) ? '' : 'disabled'} title="Lấy dữ liệu để kiểm tra nhưng không ghi vào Google Sheet">Chạy thử (không ghi Sheet)</button>` : ''}
        ${running ? html`<button class="btn btn--ghost" type="button" data-act="crm-stop">Dừng</button>` : ''}
      </div>
      ${status?.ready && !run.cookieSet ? html`<p class="muted">${run.needCookie}</p>` : ''}
      <div class="bar" role="progressbar" aria-valuenow="${Math.round(progress * 100)}"><div class="bar__fill" id="crm-progress" style="width:${progress * 100}%"></div></div>
      <pre class="code log" id="crm-log" aria-live="polite">${job ? job.lines.join('\n') : 'Nhật ký sẽ hiện ở đây khi chạy.'}</pre>
    </section>`;
};

const crmSection = (ui) => html`${serverCard(ui.status, ui.serverError)}${cookieCard(ui.status, { ...CRM_COOKIE, isSet: ui.status?.cookieSet })}${taskTable(ui)}${runCard(ui, {
  act: 'crm-run', label: `Chạy ${ui.tasks.filter((t) => t.enabled).length} tác vụ đã bật`, ready: ui.tasks.some((t) => t.enabled),
  cookieSet: ui.status?.cookieSet, needCookie: 'Cần nhập cookie CRM trước khi chạy.',
})}`;

/* ---------- Xuất Call (call-report.kiotviet.com) ---------- */
const fmtDate = (isoDate) => isoDate.split('-').reverse().join('/');

const callConfigCard = (ui) => {
  const mode = modeOf(ui.call);
  const range = resolveRange(ui.call);
  return html`
  <section class="card">
    <div class="card__head"><h3 class="card__title">Cấu hình xuất call</h3></div>
    ${notice(ui)}
    <form class="call-form" data-sform="call-config">
      <label class="field"><span>Danh sách agent (mỗi dòng một mã agent)</span>
        <textarea name="agents" rows="6" placeholder="Mỗi dòng một mã agent, ví dụ:&#10;8407&#10;8427" aria-label="Danh sách agent">${ui.call.agents}</textarea></label>
      <label class="field"><span>Tài khoản đăng nhập call-report (email) — bỏ trống để tự nhận</span>
        <input name="cuser" type="email" placeholder="ten@kiotviet.com" value="${ui.call.cuser}" autocomplete="off"></label>
      <label class="field"><span>Google Sheet đích (link)</span>
        <input name="gsheet_url" required placeholder="https://docs.google.com/spreadsheets/d/…" value="${ui.call.gsheet_url}"></label>
      <label class="field"><span>Tab đích (bỏ trống = tự động)</span>
        <input name="tab_name" placeholder="Tên tab sẽ dán dữ liệu vào" value="${ui.call.tab_name}"></label>
      <div class="field"><span>Thời gian xuất</span>
        <div class="date-row">
          <select name="date_mode" class="select" aria-label="Chế độ thời gian">${DATE_MODES.map((m) =>
            html`<option value="${m.id}" ${m.id === mode.id ? 'selected' : ''}>${m.label}</option>`)}</select>
          <input name="date_from" type="date" aria-label="Từ ngày" value="${ui.call.date_from}" ${mode.id === 'custom' ? '' : 'disabled'}>
          <input name="date_to" type="date" aria-label="Đến ngày" value="${ui.call.date_to}" ${mode.id === 'custom' ? '' : 'disabled'}>
        </div>
        <small class="muted">${range.error ? range.error : html`Sẽ xuất: <strong>${fmtDate(range.from)} → ${fmtDate(range.to)}</strong> (tính theo ngày bấm chạy).`}</small>
      </div>
      <button class="btn" type="submit" ${ui.busy ? 'disabled' : ''}>Lưu cấu hình</button>
    </form>
    <p class="muted">Cấu hình lưu trong tab “Cấu hình call” của Sheet cấu hình. Chia sẻ Google Sheet đích (quyền chỉnh sửa) cho tài khoản dịch vụ ở mục Đồng bộ CRM.</p>
  </section>`;
};

const callSection = (ui) => html`${serverCard(ui.status, ui.serverError)}${cookieCard(ui.status, { ...CALL_COOKIE, isSet: ui.status?.callCookieSet })}${callConfigCard(ui)}${runCard(ui, {
  act: 'call-run', dryAct: 'call-dry-run', dryReady: Boolean(ui.call.agents && !resolveRange(ui.call).error), label: 'Xuất dữ liệu call', ready: Boolean(ui.call.agents && ui.call.gsheet_url && !resolveRange(ui.call).error),
  cookieSet: ui.status?.callCookieSet, needCookie: 'Cần nhập cookie call-report trước khi chạy.',
})}`;

const BODY = { accounts: accountsSection, links: linksSection, crm: crmSection, call: callSection };

export const settingsView = (ui) => html`
  <div class="toolbar">
    <h2 class="section-title">Thiết lập</h2>
    <div class="chips" role="group" aria-label="Mục thiết lập">
      ${SECTIONS.map(([id, label]) => html`<button class="chip" type="button" data-act="section" data-key="${id}" aria-pressed="${id === ui.section}">${label}</button>`)}
    </div>
  </div>
  ${BODY[ui.section](ui)}`;
