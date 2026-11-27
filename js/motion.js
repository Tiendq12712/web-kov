/**
 * Hiệu ứng khi mở trang (chỉ giao diện "Nổi khối"): số chạy lên, thẻ hiện dần, biểu đồ vẽ dần.
 * Chạy một lần mỗi khi đổi tab hoặc tháng; vẽ lại do lọc, gõ tìm kiếm, tải thêm dữ liệu thì không chạy lại.
 * Phần chuyển động của thẻ và biểu đồ nằm trong css/theme-soft.css (lớp .motion-in).
 */
const COUNT_MS = 1100;   // thời gian số chạy lên
const TOTAL_MS = 1700;   // sau mốc này mọi hiệu ứng đã xong
const COUNTED = '.big, .kv dd, .donut__value, .donut__legend strong';

let lastKey = '', startedAt = 0, timer = 0, restoreTimer = 0, frame = 0;
let restore = () => {};   // trả các số đang chạy về đúng chữ gốc

/**
 * Một cụm chữ số tại tiến độ p (0..1), giữ cách viết gốc: "2.360" (chấm ngăn nghìn), "59.2" (chấm thập phân), "92,12" (phẩy thập phân).
 */
export function scaleNumber(token, p) {
  if (p >= 1) return token;
  if (/^\d{1,3}(\.\d{3})+$/.test(token)) return String(Math.round(Number(token.replace(/\./g, '')) * p)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const mark = token.includes(',') ? ',' : '.';
  const digits = token.split(mark)[1]?.length ?? 0;
  return (Number(token.replace(',', '.')) * p).toFixed(digits).replace('.', mark);
}

export const scaleText = (text, p) => text.replace(/\d+(?:\.\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g, (token) => scaleNumber(token, p));

const textNodes = (el) => {
  const walk = el.ownerDocument.createTreeWalker(el, 4 /* chữ */), list = [];
  while (walk.nextNode()) if (/\d/.test(walk.currentNode.nodeValue)) list.push(walk.currentNode);
  return list;
};

const wanted = () => document.documentElement.dataset.theme === 'soft' && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden;

/** Chạy lại từ đầu ở lần gọi kế tiếp (dùng khi vừa đóng màn hình che trang). */
export const resetIntro = () => { lastKey = ''; };

export function playIntro(view, key) {
  clearTimeout(timer); clearTimeout(restoreTimer);
  restore();   // BẮT BUỘC trước khi đọc chữ gốc: gọi lại giữa chừng mà không trả số thì số dở dang (vd 0%) bị nhớ làm số thật
  const stop = () => { view.classList.remove('motion-in'); view.style.removeProperty('--motion-delay'); };
  if (!wanted() || document.body.classList.contains('is-booting')) return stop();
  if (!view.querySelector('.card, .table-wrap, svg')) return stop();   // còn đang tải: chưa tính là đã chạy
  const now = performance.now();
  if (key !== lastKey) { lastKey = key; startedAt = now; }
  const elapsed = now - startedAt;
  if (elapsed >= TOTAL_MS) return stop();

  // Vẽ lại giữa chừng (dữ liệu tải thêm): đi tiếp từ chỗ đang dở nhờ độ trễ âm.
  view.style.setProperty('--motion-delay', `${-Math.round(elapsed)}ms`);
  view.classList.add('motion-in');
  const items = [...view.querySelectorAll(COUNTED)].flatMap(textNodes).map((node) => ({ node, text: node.nodeValue }));
  const draw = (t) => {
    const x = Math.min(1, (t - startedAt) / COUNT_MS), p = 1 - (1 - x) ** 3;
    for (const { node, text } of items) node.nodeValue = scaleText(text, p);
    if (x < 1) frame = requestAnimationFrame(draw);
  };
  draw(now);
  // Chốt đúng số gốc dù trình duyệt tạm dừng khung hình (chuyển sang thẻ khác).
  restore = () => { cancelAnimationFrame(frame); for (const { node, text } of items) node.nodeValue = text; restore = () => {}; };
  restoreTimer = setTimeout(() => restore(), Math.max(0, COUNT_MS - elapsed) + 80);
  timer = setTimeout(stop, TOTAL_MS - elapsed);
}
