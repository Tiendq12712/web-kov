/**
 * Điện thoại: nội dung cuộn trong #view (thanh trên/dưới cố định), nên cần hai thứ mà trình duyệt không tự làm:
 *  1. Cuộn xuống thì thu gọn thanh trên + thanh dưới để thấy nhiều nội dung hơn; cuộn lên thì hiện lại.
 *  2. Kéo từ đỉnh trang xuống để tải lại (pull-to-refresh).
 */
const phone = matchMedia('(max-width: 640px)');
const view = document.getElementById('view');
const topbar = document.querySelector('.topbar');
const nav = document.getElementById('bottom-nav');

/* ---------- 1. Thu gọn khi cuộn ---------- */
const measure = () => {
  document.documentElement.style.setProperty('--topbar-h', `${topbar.offsetHeight}px`);
  document.documentElement.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
};
new ResizeObserver(measure).observe(topbar);
new ResizeObserver(measure).observe(nav);

let last = 0;
view.addEventListener('scroll', () => {
  if (!phone.matches) return document.body.classList.remove('is-compact');
  const top = view.scrollTop;
  const delta = top - last;
  const atBottom = top + view.clientHeight >= view.scrollHeight - 8;
  if (top < 24 || atBottom || delta < -8) document.body.classList.remove('is-compact');
  else if (delta > 8) document.body.classList.add('is-compact');
  last = top;
}, { passive: true });
document.addEventListener('click', (e) => { if (e.target.closest('[data-tab]')) { document.body.classList.remove('is-compact'); last = 0; } });

/* ---------- 2. Kéo xuống để tải lại ---------- */
const THRESHOLD = 70, MAX = 110;
const hint = Object.assign(document.createElement('div'), { className: 'ptr', hidden: true });
hint.innerHTML = '<span class="ptr__icon" aria-hidden="true">↓</span><span class="ptr__text"></span>';
document.body.append(hint);
const text = hint.querySelector('.ptr__text'), icon = hint.querySelector('.ptr__icon');

let startX = 0, startY = 0, pulling = false, pull = 0;
const blocked = () => !phone.matches || document.querySelector('.tour, dialog[open]') || !document.getElementById('welcome').hidden || document.body.classList.contains('is-booting');
const show = (distance) => {
  hint.hidden = distance <= 0;
  hint.style.setProperty('--pull', `${distance}px`);
  const ready = distance >= THRESHOLD;
  hint.classList.toggle('is-ready', ready);
  icon.style.transform = `rotate(${ready ? 180 : 0}deg)`;
  text.textContent = ready ? 'Thả để tải lại' : 'Kéo xuống để tải lại';
};

view.addEventListener('touchstart', (e) => {
  pulling = !blocked() && view.scrollTop <= 0 && e.touches.length === 1;
  [startX, startY] = [e.touches[0].clientX, e.touches[0].clientY];
  pull = 0;
}, { passive: true });

view.addEventListener('touchmove', (e) => {
  if (!pulling) return;
  const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
  if (dy <= 0 || Math.abs(dx) > dy || view.scrollTop > 0) { pulling = false; show(0); return; }
  e.preventDefault();   // giữ trang đứng yên trong lúc kéo
  pull = Math.min(dy * 0.5, MAX);
  show(pull);
}, { passive: false });

const end = () => {
  if (!pulling) return;
  pulling = false;
  if (pull >= THRESHOLD) {
    hint.classList.add('is-loading');
    text.textContent = 'Đang tải lại…';
    icon.textContent = '⟳';
    setTimeout(() => location.reload(), 150);
  } else show(0);
  pull = 0;
};
view.addEventListener('touchend', end);
view.addEventListener('touchcancel', end);
