/** Template tag `html` tự escape giá trị nội suy; dùng `raw()` để chèn HTML đã an toàn. */
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);
const render = (v) => v instanceof Safe ? v.s : Array.isArray(v) ? v.map(render).join('') : v == null || v === false ? '' : escape(v);

export const raw = (s) => new Safe(s);
export const html = (strings, ...values) =>
  new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
export const mount = (el, tpl) => { el.innerHTML = tpl.toString(); };
