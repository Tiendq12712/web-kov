import { html } from '../dom.js';

/** Thang màu năng suất: so giá trị với mức tham chiếu (trung bình team hoặc chỉ tiêu). */
const LEVELS = [
  { cls: 'heat-low', label: 'Thấp', hint: '< 70%' },
  { cls: 'heat-mid', label: 'Dưới mức tham chiếu', hint: '70–100%' },
  { cls: 'heat-good', label: 'Đạt', hint: '100–130%' },
  { cls: 'heat-top', label: 'Cao', hint: '≥ 130%' },
];
const INVERT_LABELS = ['Thấp (tốt)', 'Dưới mức tham chiếu', 'Cao', 'Rất cao (xấu)'];   // theo thứ tự tỷ lệ tăng dần
const LOW = 0.7, MID = 1, TOP = 1.3;

/** Lớp CSS theo tỷ lệ so với tham chiếu; không tô màu khi thiếu dữ liệu. */
export const heatClass = (value, reference, { invert = false } = {}) => {
  if (value == null || !reference) return '';
  const ratio = value / reference;
  const level = ratio < LOW ? 0 : ratio < MID ? 1 : ratio < TOP ? 2 : 3;
  return LEVELS[invert ? 3 - level : level].cls;   // invert: giá trị cao là xấu (ví dụ data tồn)
};

/** Kiểu ít màu: chỉ tô ô thấp hơn ngưỡng (cảnh báo), các ô còn lại để trung tính cho dễ đọc. */
export const alertClass = (value, reference) => {
  if (value == null || !reference) return '';
  return value / reference < LOW ? LEVELS[0].cls : '';
};

export const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

export const alertLegend = (referenceText) => html`
  <ul class="legend heat-legend" aria-label="Chú thích màu">
    <li><i class="swatch ${LEVELS[0].cls}"></i>Cần chú ý (${LEVELS[0].hint})</li>
    <li class="muted">so với ${referenceText}; ô không tô màu là bình thường</li>
  </ul>`;

export const heatLegend = (referenceText, { invert = false } = {}) => html`
  <ul class="legend heat-legend" aria-label="Chú thích màu">
    ${LEVELS.map((l, i) => html`<li><i class="swatch ${invert ? LEVELS[3 - i].cls : l.cls}"></i>${invert ? INVERT_LABELS[i] : l.label} (${l.hint})</li>`)}
    <li class="muted">so với ${referenceText}</li>
  </ul>`;
