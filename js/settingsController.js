import { logAction, loadAudit } from './audit.js';
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
    audit: { rows: [], loaded: false, loading: false, error: '', action: 'all', who: 'all', q: '' },
    job: null, editing: null, error: '', busy: false, loaded: false, loading: false, me: null, months: [],
    call: { gsheet_url: '', tab_name: '', agents: '', cuser: '', date_mode: 'month_to_yesterday', date_from: '', date_to: '' },
  };
  let timer = null;

  /* ---------- Máy chủ cục bộ & công việc đồng bộ ---------- */
  async function refreshStatus() {
    try { ui.status = await crmServer.status(); ui.serverError = ''; } catch (err) { ui.status = null; ui.serverError = err.message; }
  }

  /** Hỏi tiến độ tuần tự (xong lượt này mới hỏi lượt sau) và ghi log theo chỉ số tuyệt đối nên không bị lặp dòng. */
  let pollGen = 0;   // mỗi lần bắt đầu hỏi tiến độ là một "thế hệ" mới; vòng hỏi cũ tự dừng để không chạy chồng và lặp dòng
  const elapsedText = () => {
    const sec = Math.max(0, Math.round((Date.now() - (ui.job?.startedAt ?? Date.now())) / 1000));
    return `Đang chạy ${Math.floor(sec / 60)}p${String(sec % 60).padStart(2, '0')}s… bước lấy dữ liệu từ CRM thường mất 1–2 phút, vui lòng chờ và đừng bấm Dừng.`;
  };
  function startPolling(jobId) {
    clearTimeout(timer);
    const gen = ++pollGen;
    const tick = async () => {
      if (gen !== pollGen || !ui.job || ui.job.id !== jobId) return;
      const since = ui.job.next;
      try {
        const data = await crmServer.job(jobId, since);
        if (gen !== pollGen || !ui.job || ui.job.id !== jobId) return;
        const clock = byId('crm-elapsed');
        if (clock && !data.finished) clock.textContent = elapsedText();
        data.logs.forEach((line, i) => { ui.job.lines[since + i] = line; });
        Object.assign(ui.job, { next: Math.max(ui.job.next, data.next), done: data.done, total: data.total, ok: data.ok, finished: data.finished });
        const log = byId('crm-log');
        if (log) { log.textContent = ui.job.lines.join('\n'); log.scrollTop = log.scrollHeight; }
        const bar = byId('crm-progress');
        if (bar) bar.style.width = `${(data.total ? data.done / data.total : 0) * 100}%`;
        if (data.finished) {
          if (!ui.job.logged) { ui.job.logged = true; note(ui.job.kind === 'crm' ? 'Đồng bộ CRM xong' : 'Xuất call xong', ui.job.kind === 'crm' ? 'CRM' : 'Xuất call', `${data.ok}/${data.total} tác vụ thành công`); }
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
    ui.job = { kind, id: jobId, lines: [], next: 0, done: 0, total: 0, ok: 0, finished: false, startedAt: Date.now() };
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
    if (failure?.reason.code === 'auth') { ui.loading = false; return onAuthExpired(failure.reason.message); }   // hết phiên: bỏ trạng thái "đang tải" để lần mở sau (khi đã làm mới đăng nhập) tải lại được
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

  async function reloadAudit() {
    Object.assign(ui.audit, { loading: true, error: '' }); rerender({ keep: true });
    try { ui.audit.rows = await loadAudit(); ui.audit.loaded = true; }
    catch (err) { if (err.code === 'auth') return onAuthExpired(err.message); ui.audit.error = err.message; }
    ui.audit.loading = false; rerender({ keep: true });
  }
  const fail = (message) => { ui.error = message; rerender(); };
  /** Ghi nhật ký thao tác (không chờ, không làm hỏng thao tác chính). */
  const note = (action, object = '', detail = '') => { logAction(getMe()?.email, action, object, detail).catch(() => {}); };

  /* ---------- Biểu mẫu ---------- */
  const emailOk = (email) => new RegExp(`^[^\\s@]+@${CONFIG.allowedDomain.replace('.', '\\.')}$`, 'i').test(email);

  const FORMS = {
    cookie: (form) => run(async () => { await crmServer.setCookie(form.elements.cookie.value); await refreshStatus(); note('Đặt cookie CRM', 'CRM'); }),

    'call-cookie': (form) => run(async () => { await callServer.setCookie(form.elements.cookie.value); await refreshStatus(); note('Đặt cookie xuất call', 'Xuất call'); }),

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
      return run(async () => { ui.call = await saveCallConfig(config); note('Lưu cấu hình xuất call', config.tab_name, `${splitAgents(config.agents).length} agent · chế độ ngày ${config.date_mode}`); });
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
        note(original ? 'Sửa tài khoản' : 'Thêm tài khoản', email, `quyền ${role.value} · đầu số ${code || '—'}${original && original !== email ? ` · đổi từ ${original}` : ''}`);
      });
    },

    link(form) {
      const link = { info: form.elements.info.value.trim(), id: sheetId(form.elements.id.value.trim()), tab: form.elements.tab.value.trim() };
      if (!SHEET_LINK.test(link.id)) return fail('Link hoặc ID Google Sheet không hợp lệ');
      const index = form.dataset.key;
      return run(async () => {
        ui.links = index === '' ? await addLink(link) : await updateLink(Number(index), link);
        note(index === '' ? 'Thêm link' : 'Sửa link', link.info, link.tab ? `tab ${link.tab}` : '');
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
        note(index === '' ? 'Thêm tác vụ CRM' : 'Sửa tác vụ CRM', fields.tab_name, fields.description);
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
    note(dryRun ? 'Chạy thử xuất call' : 'Chạy xuất call', tab_name, `${splitAgents(agents).length} agent · ${range.from} → ${range.to}`);
    await refreshStatus();
  });

  /* ---------- Nút bấm ---------- */
  const edit = (kind) => (key) => { ui.editing = { kind, key: kind === 'account' ? key : Number(key) }; ui.error = ''; rerender(); };
  const remove = (message, action) => (key) => { if (confirm(message(key))) run(action(key)); };

  const ACTIONS = {
    section: (key) => { if (['links', 'crm', 'call', 'audit'].includes(key) && getMe()?.role !== 'admin') return; Object.assign(ui, { section: key, editing: null, error: '' }); if (key === 'audit' && !ui.audit.loaded) reloadAudit(); rerender(); },
    'audit-reload': () => reloadAudit(),
    cancel: () => { ui.editing = null; ui.error = ''; rerender(); },
    'account-edit': edit('account'),
    'account-delete': remove((e) => `Xóa tài khoản ${e}?`, (e) => async () => { ui.accounts = await removeAccount(getMe().role, e); note('Xóa tài khoản', e); }),
    'link-edit': edit('link'),
    'link-delete': remove((i) => `Xóa link "${ui.links[i]?.info}"?`, (i) => async () => { const gone = ui.links[i]?.info; ui.links = await removeLink(Number(i)); note('Xóa link', gone); await onLinksChanged(); }),
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
      const gone = ui.tasks[i]?.tab_name;
      ui.tasks = await mutateTasks((list) => list.filter((_, k) => k !== Number(i)));
      note('Xóa tác vụ CRM', gone);
    }),
    'call-cookie-clear': () => run(async () => { await callServer.clearCookie(); await refreshStatus(); note('Xóa cookie xuất call', 'Xuất call'); }),
    'call-run': () => runCall(false),
    'call-dry-run': () => runCall(true),
    'cookie-clear': () => run(async () => { await crmServer.clearCookie(); await refreshStatus(); note('Xóa cookie CRM', 'CRM'); }),
    'crm-run': () => run(async () => {
      await getWriteToken();   // xin quyền ghi ngay khi bấm, để cuối job ghi được thời gian cập nhật
      const { jobId } = await crmServer.run(ui.tasks.filter((t) => t.enabled));
      note('Chạy đồng bộ CRM', 'CRM', `${ui.tasks.filter((t) => t.enabled).length} tác vụ`);
      resumeJob(jobId, 'crm');
      await refreshStatus();
    }),
    'crm-stop': () => { if (ui.job) crmServer.stop(ui.job.id).catch((err) => fail(err.message)); },
  };

  // Quay lại tab sau khi trình duyệt làm chậm bộ đếm: hỏi tiến độ ngay thay vì chờ.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.job && !ui.job.finished) startPolling(ui.job.id); });

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
    if (e.target.matches?.('[data-audit]')) { ui.audit[e.target.dataset.audit] = e.target.value; rerender({ keep: true }); return; }
    const box = e.target.closest('[data-task-toggle]');
    if (!box) return;
    const index = Number(box.dataset.taskToggle);
    run(async () => { ui.tasks = await mutateTasks((list) => list.map((t, k) => (k === index ? { ...t, enabled: box.checked } : t))); note(box.checked ? 'Bật tác vụ CRM' : 'Tắt tác vụ CRM', ui.tasks[index]?.tab_name); });
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
