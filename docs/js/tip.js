/** Chú thích nổi tức thì cho các ô có `data-note` (nhanh hơn tooltip mặc định, bấm cũng xem được trên điện thoại). */
let tip = null, current = null;
const hide = () => { tip?.remove(); tip = null; current = null; };

function show(cell) {
  if (current === cell) return;
  hide();
  current = cell;
  tip = Object.assign(document.createElement('div'), { className: 'tip', role: 'tooltip' });
  const who = cell.dataset.who ? `<small>${cell.dataset.who}</small>` : '';
  tip.innerHTML = `${who}<span></span>`;
  tip.lastChild.textContent = cell.dataset.note;
  document.body.append(tip);
  const r = cell.getBoundingClientRect(), t = tip.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 8));
  const above = r.top - t.height - 8 > 8;
  tip.style.left = `${left}px`;
  tip.style.top = `${above ? r.top - t.height - 8 : r.bottom + 8}px`;
}

export function initTips() {
  document.addEventListener('mouseover', (e) => { const c = e.target.closest?.('[data-note]'); if (c) show(c); else if (current) hide(); });
  document.addEventListener('click', (e) => { const c = e.target.closest?.('[data-note]'); if (c && current !== c) show(c); else hide(); });
  document.addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
}
