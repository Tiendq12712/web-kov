/** Bấm vào biểu đồ để xem phóng to trong cửa sổ nổi (Esc, bấm ra ngoài hoặc nút ✕ để đóng). */
let root = null;
const clean = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';

function close() {
  root?.remove(); root = null;
  document.documentElement.style.overflow = '';
}

function open(chart) {
  close();
  const card = chart.closest('.card');
  const title = clean(card?.querySelector('.section-title, .card__title, h2, h3')) || document.title.split('·')[0].trim();
  const note = clean(card?.querySelector(':scope > .muted'));
  root = document.createElement('div');
  root.className = 'zoom';
  root.innerHTML = '<div class="zoom__panel" role="dialog" aria-modal="true" aria-label="Biểu đồ phóng to"><header class="zoom__head"><h3></h3><button class="zoom__close" type="button" aria-label="Đóng">✕</button></header><p class="muted zoom__note"></p><div class="zoom__body"></div></div>';
  root.querySelector('h3').textContent = title;
  root.querySelector('.zoom__note').textContent = note;
  root.querySelector('.zoom__note').hidden = !note;
  root.querySelector('.zoom__body').append(chart.cloneNode(true));
  document.body.append(root);
  document.documentElement.style.overflow = 'hidden';
  root.querySelector('.zoom__close').focus();
}

export function initZoom() {
  document.addEventListener('click', (e) => {
    if (root && (e.target === root || e.target.closest('.zoom__close'))) return close();
    if (root?.contains(e.target)) return;
    const chart = e.target.closest?.('.chart, .donut');
    if (chart && !chart.closest('.tour, .guide, dialog')) open(chart);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root) close(); });
}
