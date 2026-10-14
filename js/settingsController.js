import { CONFIG } from './config.js';
import { html } from './dom.js';
import { sheetId } from './sheet.js';
import { getWriteToken } from './auth.js';
import { checkAccess } from './access.js';
import { recordSyncTime } from './syncTime.js';
import { crmServer, callServer, loadTasks, mutateTasks, loadCallConfig, saveCallConfig, splitAgents, resolveRange } from './crm.js';
import { loadAccounts, addAccount, updateAccount, removeAccount, loadLinks, addLink, updateLink, removeLink } from './directory.js';
import { settingsView } from './views/settings.js';

const POLL_MS = 1000;
const CRM_LINK = /^https:\/\/kvcrm\.kiotviet\.vn\//;
const SHEET_LINK = /^(https:\/\/docs\.google\.com\/spreadsheets\/d\/|[\w-]{20,}$)/;
const byId = (id) => document.getElementById(id);

/**
 * Trang Thiết lập (Tài khoản, Cấu hình link, Đồng bộ CRM): trạng thái, thao tác và sự kiện.
 * `getMe()` trả về { email, role }; các callback giúp ứng dụng chính phản ứng khi dữ liệu đổi.
 */
export function createSettings({ getMe, getMonths, rerender, onAuthExpired, onLinksChanged, onSynced, onHistory }) {
  const ui = {
    section: 'accounts', accounts: [], links: [], tasks: [], status: null, serverError: '',
    access: { loading: false, error: '', result: null },
    job: null, editing: null, error: '', busy: false, loaded: false, loading: false, me: null, months: [],
    call: { gsheet_url: '', tab_name: '', agents: '', cuser: '', date_mode: 'month_to_yesterday', date_from: '', date_to: '' },
  };
  let timer = null;

  /* ---------- Máy chủ cục bộ & công việc đồng bộ ---------- */
  async function refreshStatus() {
    try { ui.status = await crmServer.status(); ui.serverError = ''; } catch (err) { ui.status = null; ui.serverError = err.message; }
  }

  /** Hỏi tiến độ tuần tự (xong lượt này mới hỏi lượt sau) và ghi log theo chỉ số tuyệt đối nên không bị lặp dòng. */
  function startPolling(jobId) {
    clearTimeout(timer);
    const tick = async () => {
      const since = ui.job.next;
      try {
        const data = await crmServer.job(jobId, since);
        data.logs.forEach((line, i) => { ui.job.lines[since + i] = line; });
        Object.assign(ui.job, { next: Math.max(ui.job.next, data.next), done: data.done, total: data.total, ok: data.ok, finished: data.finished });
        const log = byId('crm-log');
        if (log) { log.textContent = ui.job.lines.join('\n'); log.scrollTop = log.scrollHeight; }
        const bar = byId('crm-progress');
        if (bar) bar.style.width = `${(data.total ? data.done / data.total : 0) * 100}%`;
        if (data.finished) {
          await refreshStatus();
          if (ui.job.kind === 'crm' && data.ok > 0) await stampSync();
          return rerender({ keep: true });
        }
      } catch (err) {
        ui.job.lines.push(`Mất kết nối máy chủ cục bộ: ${err.message}`);
        ui.job.finished = true;
        return rerender({ keep: true });
      }
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
  }

  /** Ghi lại thời điểm đồng bộ xong để báo cáo hiển thị "cập nhật lúc" theo đó. */
  async function stampSync() {
    try { await recordSyncTime(); await onSynced(); ui.job.lines.push('Đã ghi thời gian cập nhật báo cáo.'); }
    catch (err) { ui.job.lines.push(`Không ghi được thời gian cập nhật: ${err.message}`); }
    try { const n = await onHistory(); ui.job.lines.push(`Đã lưu ảnh chụp số liệu hôm nay vào lịch sử (${n} nhân sự).`); }
    catch (err) { ui.job.lines.push(`Không lưu được lịch sử số liệu: ${err.message}`); }
  }

  function resumeJob(jobId, kind = '') {
    ui.job = { kind, id: jobId, lines: [], next: 0, done: 0, total: 0, ok: 0, finished: false };
    startPolling(jobId);
  }

  /* ---------- Tải dữ liệu ---------- */
  async function loadAll() {
    ui.loading = true;
    const results = await Promise.allSettled([loadAccounts(), loadLinks(), loadTasks(), refreshStatus(), loadCallConfig()]);
    const [accounts, links, tasks, , call] = results;
    if (call.status === 'fulfilled') ui.call = call.value;
    if (accounts.status === 'fulfilled') ui.accounts = accounts.value;
    if (links.status === 'fulfilled') ui.links = links.value;
    if (tasks.status === 'fulfilled') ui.tasks = tasks.value;
    const failure = results.find((r) => r.status === 'rejected');
    if (failure?.reason.code === 'auth') return onAuthExpired(failure.reason.message);
    ui.error = failure ? failure.reason.message : '';
    ui.loading = false;
    ui.loaded = true;
    if (ui.status?.running && ui.status.jobId && !ui.job) resumeJob(ui.status.jobId);
    rerender();
  }

  /** Chạy một thao tác ghi: hiện trạng thái bận, bắt lỗi và vẽ lại. */
  async function run(action) {
    Object.assign(ui, { busy: true, error: '' });
    try { await action(); ui.editing = null; } catch (err) {
      if (err.code === 'auth') return onAuthExpired(err.message);
      ui.error = err.message;
    }
    ui.busy = false;
    rerender();
  }

  const fail = (message) => { ui.error = message; rerender(); };

  /* ---------- Biểu mẫu ---------- */
  const emailOk = (email) => new RegExp(`^[^\\s@]+@${CONFIG.allowedDomain.replace('.', '\\.')}$`, 'i').test(email);

  const FORMS = {
    cookie: (form) => run(async () => { await crmServer.setCookie(form.elements.cookie.value); await refreshStatus(); }),

    'call-cookie': (form) => run(async () => { await callServer.setCookie(form.elements.cookie.value); await refreshStatus(); }),

    'call-config'(form) {
      const config = {
        gsheet_url: form.elements.gsheet_url.value.trim(), tab_name: form.elements.tab_name.value.trim(), cuser: form.elements.cuser.value.trim(),
        agents: splitAgents(form.elements.agents.value).join('\n'),
        date_mode: form.elements.date_mode.value, date_from: form.elements.date_from.value, date_to: form.elements.date_to.value,
      };
      if (!SHEET_LINK.test(config.gsheet_url)) return fail('Link Google Sheet đích không hợp lệ');
      if (!config.agents) return fail('Hãy nhập ít nhất một agent');
      const range = resolveRange(config);
      if (range.error) return fail(range.error);
      return run(async () => { ui.call = await saveCallConfig(config); });
    },

    account(form) {
      const email = form.elements.email.value.trim();
      const { role } = form.elements;
      const name = form.elements.name.value.trim();
      const gender = form.elements.gender.value;
      const code = form.elements.code.value.trim();
      if (code && !/^\d{3,10}$/.test(code)) return fail('Đầu số chỉ gồm chữ số (ví dụ 8407)');
      if (!emailOk(email)) return fail(`Chỉ nhận email @${CONFIG.allowedDomain}`);
      const original = form.dataset.key;
      const actor = getMe().role;
      return run(async () => {
        ui.accounts = original ? await updateAccount(actor, original, email, role.value, name, gender, code) : await addAccount(actor, email, role.value, name, gender, code);
      });
    },

    link(form) {
      const link = { info: form.elements.info.value.trim(), id: sheetId(form.elements.id.value.trim()), tab: form.elements.tab.value.trim() };
      if (!SHEET_LINK.test(link.id)) return fail('Link hoặc ID Google Sheet không hợp lệ');
      const index = form.dataset.key;
      return run(async () => {
        ui.links = index === '' ? await addLink(link) : await updateLink(Number(index), link);
        await onLinksChanged();
      });
    },

    task(form) {
      const fields = Object.fromEntries(['crm_url', 'gsheet_url', 'tab_name', 'description'].map((k) => [k, form.elements[k].value.trim()]));
      if (!CRM_LINK.test(fields.crm_url)) return fail('Link CRM phải bắt đầu bằng https://kvcrm.kiotviet.vn/');
      if (!SHEET_LINK.test(fields.gsheet_url)) return fail('Link Google Sheet không hợp lệ');
      const index = form.dataset.key;
      return run(async () => {
        ui.tasks = await mutateTasks((list) => (index === ''
          ? [...list, { enabled: true, ...fields }]
          : list.map((t, i) => (i === Number(index) ? { ...t, ...fields } : t))));
      });
    },
  };

  /** Xuất call; `dryRun` chỉ lấy dữ liệu để kiểm tra, không ghi lên Google Sheet. */
  const runCall = (dryRun) => run(async () => {
    const { gsheet_url, tab_name, agents, cuser } = ui.call;
    const range = resolveRange(ui.call);   // tính theo ngày chạy, nên chế độ "đến hôm qua" luôn mới
    if (range.error) throw new Error(range.error);
    const { jobId } = await callServer.run({ gsheet_url, tab_name, agents: splitAgents(agents), cuser, date_from: range.from, date_to: range.to, dry_run: dryRun });
    resumeJob(jobId);
    await refreshStatus();
  });

  /* ---------- Nút bấm ---------- */
  const edit = (kind) => (key) => { ui.editing = { kind, key: kind === 'account' ? key : Number(key) }; ui.error = ''; rerender(); };
  const remove = (message, action) => (key) => { if (confirm(message(key))) run(action(key)); };

  const ACTIONS = {
    section: (key) => { Object.assign(ui, { section: key, editing: null, error: '' }); rerender(); },
    cancel: () => { ui.editing = null; ui.error = ''; rerender(); },
    'account-edit': edit('account'),
    'account-delete': remove((e) => `Xóa tài khoản ${e}?`, (e) => async () => { ui.accounts = await removeAccount(getMe().role, e); }),
    'link-edit': edit('link'),
    'link-delete': remove((i) => `Xóa link "${ui.links[i]?.info}"?`, (i) => async () => { ui.links = await removeLink(Number(i)); await onLinksChanged(); }),
    /** Admin: kiểm tra email nào chưa được chia sẻ các Google Sheet báo cáo (dùng Drive API, cần cho phép một lần). */
    'access-check': async () => {
      ui.access = { loading: true, error: '', result: null };
      rerender();
      try {
        const wanted = [
          ...ui.links.map((l, i) => ({ key: `l${i}`, label: l.info || `Link ${i + 1}`, id: l.id, need: 'reader' })),
          { key: 'cfg', label: 'Sheet cấu hình', id: CONFIG.configSheet, need: 'reader' },
          { key: 'chat', label: 'Sheet chat', id: CONFIG.chatSheet, need: 'writer' },
        ];
        const byId = new Map();   // cùng một Sheet xuất hiện nhiều lần thì gộp, lấy mức quyền cao nhất cần có
        for (const s of wanted) {
          const prev = byId.get(s.id);
          byId.set(s.id, prev ? { ...prev, label: `${prev.label} / ${s.label}`, need: prev.need === 'writer' || s.need === 'writer' ? 'writer' : 'reader' } : s);
        }
        ui.access.result = await checkAccess({ accounts: ui.accounts, sheets: [...byId.values()] });
      } catch (err) {
        if (err.code === 'auth') return onAuthExpired(err.message);
        ui.access.error = err.message;
      }
      ui.access.loading = false;
      rerender();
    },
    'access-copy': async (emails) => {
      try { await navigator.clipboard.writeText(emails.split(',').join('\n')); ui.access.copied = true; } catch { ui.access.error = 'Không sao chép được, hãy chọn và chép thủ công'; }
      rerender();
    },
    'task-edit': edit('task'),
    'task-delete': remove((i) => `Xóa tác vụ "${ui.tasks[i]?.tab_name || 'này'}"?`, (i) => async () => {
      ui.tasks = await mutateTasks((list) => list.filter((_, k) => k !== Number(i)));
    }),
    'call-cookie-clear': () => run(async () => { await callServer.clearCookie(); await refreshStatus(); }),
    'call-run': () => runCall(false),
    'call-dry-run': () => runCall(true),
    'cookie-clear': () => run(async () => { await crmServer.clearCookie(); await refreshStatus(); }),
    'crm-run': () => run(async () => {
      await getWriteToken();   // xin quyền ghi ngay khi bấm, để cuối job ghi được thời gian cập nhật
      const { jobId } = await crmServer.run(ui.tasks.filter((t) => t.enabled));
      resumeJob(jobId, 'crm');
      await refreshStatus();
    }),
    'crm-stop': () => { if (ui.job) crmServer.stop(ui.job.id).catch((err) => fail(err.message)); },
  };

  // Cookie có thể vừa được tiện ích Chrome gửi vào: quay lại trang thì đọc lại trạng thái.
  window.addEventListener('focus', async () => {
    if (!ui.loaded || ui.busy || !['crm', 'call'].includes(ui.section)) return;
    await refreshStatus();
    rerender({ keep: true });   // đừng xóa chữ đang gõ dở khi cửa sổ lấy lại tiêu điểm
  });

  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-act]');
    if (button) ACTIONS[button.dataset.act]?.(button.dataset.key);
  });

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-sform]');
    if (!form) return;
    e.preventDefault();
    FORMS[form.dataset.sform]?.(form);
  });

  document.addEventListener('change', (e) => {
    if (e.target.name === 'date_mode') {   // chỉ cho nhập ngày khi chọn "Tùy chọn"
      const { form } = e.target;
      const custom = e.target.value === 'custom';
      form.elements.date_from.disabled = !custom;
      form.elements.date_to.disabled = !custom;
      return;
    }
    const box = e.target.closest('[data-task-toggle]');
    if (!box) return;
    const index = Number(box.dataset.taskToggle);
    run(async () => { ui.tasks = await mutateTasks((list) => list.map((t, k) => (k === index ? { ...t, enabled: box.checked } : t))); });
  });

  return {
    view() {
      ui.me = getMe();
      ui.months = getMonths();
      if (!ui.loaded && !ui.loading) {
        loadAll();
        return html`<p class="muted" role="status">Đang tải thiết lập…</p>`;
      }
      return ui.loading ? html`<p class="muted" role="status">Đang tải thiết lập…</p>` : settingsView(ui);
    },
    /** Đọc lại toàn bộ khi người dùng đăng xuất/đăng nhập. */
    reset() { clearTimeout(timer); Object.assign(ui, { loaded: false, loading: false, job: null, editing: null, error: '' }); },
  };
}
