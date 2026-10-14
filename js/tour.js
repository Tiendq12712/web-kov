/** Hướng dẫn lần đầu: làm nổi từng phần tử và giải thích ngắn. Bước nào không thấy trên màn hình thì bỏ qua. */
const KEY = 'kpi.tour1';   // đã xem hướng dẫn: ghi theo từng tài khoản (email)
const keyOf = (email) => `${KEY}.${String(email ?? '').toLowerCase()}`;
const visible = (el) => el && el.getClientRects().length > 0;
const first = (...sels) => sels.map((s) => document.querySelector(s)).find(visible);
const heat = () => { const b = document.querySelector('[data-heat]'); return visible(b) ? b.parentElement : null; };

const STEPS = [
  { el: () => first('#month'), title: 'Chọn tháng', text: 'Chuyển giữa các tháng báo cáo. Dữ liệu lấy trực tiếp từ Google Sheet của công ty.' },
  { el: () => first('#tabs', '#bottom-nav'), title: 'Các mục báo cáo', text: 'Các mục có dấu ▾ (Team, Báo cáo, Phân tích) mở ra danh sách để chọn. Tổng quan, Thư viện và Chia sẻ bấm là vào ngay.' },
  { el: heat, title: 'Kiểu màu bảng', text: 'Đổi cách tô màu bảng nhân sự: thanh màu, ít màu hoặc nhiều màu — chọn kiểu bạn dễ nhìn nhất.' },
  { el: () => first('.card__head .badge', '.badge--good', '.badge--warn', '.badge--bad'), title: 'Cách đọc trạng thái', text: 'Nhãn màu này cho biết tiến độ của team hoặc nhân sự. “Đạt tiến độ” = KPI theo kịp thời gian đã qua của tháng; “Cần đẩy” = từ 70% trở lên; “Chậm” = dưới 70%. Bấm vào một nhân sự để xem chi tiết.' },
  { el: () => first('[data-tab="chat"]'), title: 'Chia sẻ với quản lý', text: 'Gặp khó khăn? Gửi tin cho quản lý ở đây và xem phản hồi của họ.' },
  { el: () => first('#user'), title: 'Tài khoản và tuỳ chọn', text: 'Bấm vào đây để mở Thiết lập (Admin/Quản trị), xem lại hướng dẫn này, đổi giao diện sáng/tối hoặc đăng xuất.' },
];

export const tourSeen = (email) => { try { return localStorage.getItem(keyOf(email)) === '1'; } catch { return true; } };
const markSeen = (email) => { try { localStorage.setItem(keyOf(email), '1'); } catch {} };

let root = null;
/** `email`: tài khoản đang xem (để chỉ tự hiện lần đầu); `onClose`: chạy khi kết thúc hoặc bỏ qua. */
export function startTour({ email, onClose } = {}) {
  if (root) return;
  const steps = STEPS.map((s) => ({ ...s, target: s.el() })).filter((s) => s.target || s.title === 'Cách đọc trạng thái');
  if (!steps.length) return;
  let i = 0;
  root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour__spot"></div><div class="tour__tip" role="dialog" aria-modal="true" aria-labelledby="tour-title"><p class="tour__count"></p><h3 id="tour-title" class="tour__title"></h3><p class="tour__text"></p><div class="tour__actions"><button type="button" class="btn btn--ghost" data-tour="skip">Bỏ qua</button><button type="button" class="btn" data-tour="next"></button></div></div>';
  document.body.append(root);
  const spot = root.querySelector('.tour__spot'), tip = root.querySelector('.tour__tip');

  const lock = (e) => e.preventDefault();
  const close = () => { markSeen(email); root.remove(); root = null; document.documentElement.style.overflow = ''; window.removeEventListener('resize', place); window.removeEventListener('scroll', place); document.removeEventListener('keydown', onKey); onClose?.(); };
  function place() {
    const step = steps[i], el = step.target;
    root.querySelector('.tour__count').textContent = `Bước ${i + 1}/${steps.length}`;
    root.querySelector('.tour__title').textContent = step.title;
    root.querySelector('.tour__text').textContent = step.text;
    root.querySelector('[data-tour="next"]').textContent = i === steps.length - 1 ? 'Hoàn tất' : 'Tiếp theo';
    // Phần tử trong thanh trên/dưới đã cố định; còn lại cuộn ra giữa màn hình để không bị thanh trên che.
    if (el && !el.closest('.topbar, .bottom-nav')) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el?.getBoundingClientRect();
    if (!r) { spot.style.cssText = 'left:50%;top:50%;width:0;height:0'; tip.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)'; return; }
    const pad = 6;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
    const width = Math.min(320, innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, innerWidth - width - 12));
    const below = r.bottom + 14 + 190 < innerHeight;
    tip.style.cssText = `width:${width}px;left:${left}px;${below ? `top:${r.bottom + 14}px` : `bottom:${innerHeight - r.top + 14}px`}`;
  }
  const next = () => { if (i === steps.length - 1) return close(); i += 1; place(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'Enter' || e.key === 'ArrowRight') next(); };
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-tour]')?.dataset.tour;
    if (act === 'next') next(); else if (act === 'skip') close();
  });
  // Khóa cuộn trong lúc hướng dẫn để khung làm nổi không bị lệch; nếu vẫn cuộn (bàn phím…) thì bám theo.
  document.documentElement.style.overflow = 'hidden';
  for (const type of ['wheel', 'touchmove']) root.addEventListener(type, lock, { passive: false });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, { passive: true });
  document.addEventListener('keydown', onKey);
  place();
  tip.querySelector('[data-tour="next"]').focus();
}
