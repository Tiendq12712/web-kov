/**
 * Thư viện tài liệu: Sheet có nhiều tab (ví dụ "Quy trình/quy định", "Chính sách", "Giải trình"),
 * mỗi tab là một nhóm; mỗi dòng gồm tiêu đề + link (có thể thêm cột mô tả, ngày…).
 */
const text = (v) => (v == null ? '' : String(v).trim());
const isUrl = (s) => /^https?:\/\//i.test(s);

/** Phân loại link để hiện biểu tượng/nhãn. */
export function kindOf(url) {
  if (/docs\.google\.com\/document/i.test(url)) return { id: 'doc', label: 'Tài liệu', icon: '📄' };
  if (/docs\.google\.com\/spreadsheets/i.test(url)) return { id: 'sheet', label: 'Bảng tính', icon: '📊' };
  if (/docs\.google\.com\/presentation/i.test(url)) return { id: 'slide', label: 'Trình chiếu', icon: '📽️' };
  if (/docs\.google\.com\/forms/i.test(url)) return { id: 'form', label: 'Biểu mẫu', icon: '📝' };
  if (/drive\.google\.com\/(file|open)/i.test(url)) return { id: 'file', label: 'Tệp', icon: '📎' };
  if (/youtu\.?be|vimeo|loom\.com/i.test(url)) return { id: 'video', label: 'Video', icon: '🎬' };
  return { id: 'link', label: 'Liên kết', icon: '🔗' };
}

const plainText = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Sản phẩm của gian hàng (cột Product): Retail / FnB / Booking / Salon / Hotel, mỗi loại một biểu tượng và màu riêng. */
export function productOf(value) {
  const t = plainText(value).replace(/[^a-z]/g, '');
  if (!t) return null;
  if (t.includes('fnb')) return { id: 'fnb', label: 'FnB' };
  if (t.includes('booking')) return { id: 'booking', label: 'Booking' };
  if (t.includes('salon')) return { id: 'salon', label: 'Salon' };
  if (t.includes('hotel')) return { id: 'hotel', label: 'Hotel' };
  if (t.includes('retail')) return { id: 'retail', label: 'Retail' };
  return { id: 'other', label: String(value).trim() };
}

/** Vai trò của gian hàng (cột Vai trò): Zalo được làm nổi bật và xếp lên đầu. */
export const roleOf = (value) => { const label = text(value); return label ? { label, zalo: /zalo/i.test(label) } : null; };

const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };

/** Một tab -> { name, items: [{ title, url, kind, extra: [[tiêu đề cột, giá trị]] }] }. Dòng không có link hợp lệ bị bỏ. */
export function parseTab(name, rows) {
  if (!rows.length) return { name, items: [] };
  const head = rows[0].map(text);
  const linkCol = head.findIndex((h) => /^link/i.test(h));
  const titleCol = head.findIndex((h) => /tiêu đề|tên|title/i.test(h));
  const col = (re) => head.findIndex((h) => re.test(plainText(h)));
  const productCol = col(/^product|san pham/), roleCol = col(/^vai tro|^role/), accountCol = col(/tai khoan|account/);
  const store = productCol >= 0;   // tab gian hàng: có cột Product
  const t = !store && titleCol >= 0 ? titleCol : 0;
  const items = rows.slice(1).map((r) => {
    const cells = r.map(text);
    const url = (linkCol >= 0 ? cells[linkCol] : cells.find(isUrl)) ?? '';
    return {
      title: store ? hostOf(url) : cells[t] || url, url, kind: kindOf(url),
      ...(store ? { product: productOf(cells[productCol]), role: roleCol >= 0 ? roleOf(cells[roleCol]) : null, account: accountCol >= 0 ? cells[accountCol] : '' } : {}),
      extra: head.map((h, i) => [h, cells[i] ?? '']).filter(([h, v], i) => h && v && i !== t && i !== (linkCol >= 0 ? linkCol : cells.findIndex(isUrl))),
    };
  }).filter((i) => isUrl(i.url));
  if (store) items.sort((a, b) => Number(b.role?.zalo ?? false) - Number(a.role?.zalo ?? false));   // Array.sort ổn định: giữ thứ tự cũ trong từng nhóm
  return { name, items };
}

export function buildLibrary(tabs) {
  const groups = tabs.filter((g) => g.items.length);
  return { groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
}
