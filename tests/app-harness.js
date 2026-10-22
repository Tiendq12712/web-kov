/**
 * Dựng cả ứng dụng (index.html + main.js) trong một iframe với phiên đăng nhập giả và Google Sheets giả,
 * rồi mở lần lượt các tab và kiểm tra không có lỗi chạy. Phủ các đường chỉ chạy được sau khi đăng nhập.
 */
import { buildFixtures, IDS } from './fixtures.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, '0');

/** Mã chạy trong iframe trước khi ứng dụng tải: phiên giả, fetch giả, bắt lỗi. */
const preamble = (fixtures, email) => `
(() => {
  const FX = ${JSON.stringify(fixtures)};
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push('error: ' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.__calls = [];
  window.fetch = async (url, init = {}) => {
    const u = String(url); window.__calls.push(u);
    if (u.includes('oauth2/v3/userinfo')) return json({ email: ${JSON.stringify(email)}, email_verified: true, hd: 'kiotviet.com', name: 'Test' });
    let m = /spreadsheets\\/([^/?]+)\\/values\\/([^?]+)/.exec(u);
    if (m) {
      const tab = decodeURIComponent(m[2]).split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'"), sheet = FX[m[1]];
      if (init.method === 'PUT' || init.method === 'POST') return json({ updatedRows: 1 });
      return sheet && sheet[tab] ? json({ values: sheet[tab] }) : json({}, 400);
    }
    m = /spreadsheets\\/([^/?:]+)\\?fields/.exec(u);
    if (m) return FX[m[1]] ? json({ sheets: Object.keys(FX[m[1]]).map((title) => ({ properties: { title } })) }) : json({}, 404);
    if (u.includes('/api/')) return json({ error: 'Máy chủ cục bộ không chạy (kiểm tra tự động)' }, 404);
    return json({}, 404);
  };
})();`;

async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { /* chờ tiếp */ } await sleep(80); } return false; }

/** Mở ứng dụng với một tài khoản; trả về { win, doc, open(tab), stop() }. */
export async function bootApp({ root, email, configId }) {
  // Phiên giả đặt từ trang kiểm tra (cùng nguồn gốc nên cùng localStorage) trước khi dựng iframe.
  const d = new Date(), todayIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  Object.keys(localStorage).filter((k) => k.startsWith('kpi.')).forEach((k) => localStorage.removeItem(k));
  localStorage.setItem('kpi.session', JSON.stringify({ token: 'fake', email, date: todayIso, write: true, expiresAt: Date.now() + 3_600_000 }));
  localStorage.setItem('kpi.write', '1');
  const html = await (await fetch(`${root}index.html`, { cache: 'no-store' })).text();
  const patched = html.replace('<head>', `<head><base href="${root}"><script>${preamble(buildFixtures(configId, email), email)}<\/script>`);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:1200px;height:800px;position:fixed;left:-3000px;top:0';
  frame.srcdoc = patched;
  document.body.append(frame);
  await new Promise((r) => { frame.onload = r; });
  const win = frame.contentWindow, doc = frame.contentDocument;
  const ok = await waitFor(() => doc.getElementById('boot')?.hidden && doc.getElementById('view')?.textContent.trim().length > 20, 12000);
  const view = () => doc.getElementById('view');
  return {
    win, doc, ok, view, errors: () => win.__errors,
    /** Mở một tab và chờ vẽ xong (không còn chữ "Đang tải"). */
    async open(tab) {
      const b = doc.createElement('button'); b.dataset.tab = tab; doc.body.append(b); b.click(); b.remove();
      await sleep(60);
      const done = await waitFor(() => !/Đang tải/.test(view().textContent) && view().textContent.trim().length > 10, 9000);
      return done;
    },
    click(selector) { doc.querySelector(selector)?.click(); },
    stop() { frame.remove(); },
  };
}

export { IDS, pad };
