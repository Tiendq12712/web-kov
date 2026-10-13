/* Đọc cookie JSESSIONID của call-report (kể cả HttpOnly) rồi gửi vào web-kov chạy trên máy này (localhost),
   hoặc sao chép dạng "JSESSIONID=giá_trị". Cookie không đi ra khỏi máy. */
const SITE = 'https://call-report.kiotviet.com/jw/web/';
const COOKIE_NAME = 'JSESSIONID';
const WEBKOV = 'http://localhost:8080';   // cổng mặc định của server.py

const $ = (id) => document.getElementById(id);
const mask = (value) => (value.length > 10 ? `${value.slice(0, 4)}••••••••${value.slice(-4)}` : '••••••••');

function setStatus(text, tone) {
  const el = $('status');
  el.textContent = text;
  el.className = tone ?? '';
}

/** Cookie phiên đang dùng: nếu có nhiều cookie cùng tên thì chọn cái có đường dẫn cụ thể nhất. */
async function findSessionCookie() {
  const cookies = await chrome.cookies.getAll({ url: SITE });
  return cookies.filter((c) => c.name === COOKIE_NAME).sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

async function copy(text) {
  await navigator.clipboard.writeText(text);
}

/** Gửi thẳng vào máy chủ web-kov đang chạy trên máy này (127.0.0.1, chỉ đường nhận cookie call-report). */
async function sendToWebKov(text) {
  const res = await fetch(`${WEBKOV}/api/call/cookie`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-KV-Client': 'web-kov' },
    body: JSON.stringify({ cookie: text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `web-kov trả lỗi ${res.status}`);
}

async function deliver(text) {
  try {
    await sendToWebKov(text);
    setStatus('Đã gửi cookie vào web-kov ✓', 'ok');
  } catch (err) {
    // Không gửi được (chưa chạy server web-kov?) thì vẫn sao chép để dán tay.
    const copied = await copy(text).then(() => true, () => false);
    setStatus(`Chưa gửi được vào web-kov (${err.message}). ${copied ? 'Đã sao chép cookie để bạn dán tay.' : 'Bấm "Sao chép" để dán tay.'}`, 'bad');
  }
}

async function init() {
  const cookie = await findSessionCookie();
  if (!cookie) {
    setStatus('Chưa thấy phiên đăng nhập. Hãy đăng nhập call-report.kiotviet.com rồi mở lại.', 'bad');
    return;
  }
  const text = `${COOKIE_NAME}=${cookie.value}`;
  $('preview').hidden = false;
  $('preview').textContent = `${COOKIE_NAME}=${mask(cookie.value)}`;
  $('send').disabled = false;
  $('copy').disabled = false;
  $('send').addEventListener('click', () => deliver(text));
  $('copy').addEventListener('click', async () => {
    await copy(text);
    setStatus('Đã sao chép cookie.', 'ok');
  });
  await deliver(text);   // mở tiện ích là gửi luôn
}

init().catch((err) => setStatus(`Lỗi: ${err.message}`, 'bad'));
