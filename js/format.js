const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
const EMPTY = '—';

export const num = (v) => (v == null ? EMPTY : nf.format(v));
export const pct = (v, digits = 0) => (v == null ? EMPTY : `${(v * 100).toFixed(digits)}%`);
export const hm = (seconds) => {
  if (seconds == null) return EMPTY;
  const total = Math.round(seconds / 60);   // làm tròn phút trước để không ra "1h60"
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}p`;
};
export const dayMonth = (iso) => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };
export const monthLabel = (ym) => `Tháng ${+ym.slice(5)}/${ym.slice(0, 4)}`;
