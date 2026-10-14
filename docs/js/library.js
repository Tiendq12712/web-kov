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

/** Một tab -> { name, items: [{ title, url, kind, extra: [[tiêu đề cột, giá trị]] }] }. Dòng không có link hợp lệ bị bỏ. */
export function parseTab(name, rows) {
  if (!rows.length) return { name, items: [] };
  const head = rows[0].map(text);
  const linkCol = head.findIndex((h) => /^link/i.test(h));
  const titleCol = head.findIndex((h) => /tiêu đề|tên|title/i.test(h));
  const t = titleCol >= 0 ? titleCol : 0;
  const items = rows.slice(1).map((r) => {
    const cells = r.map(text);
    const url = (linkCol >= 0 ? cells[linkCol] : cells.find(isUrl)) ?? '';
    return {
      title: cells[t] || url, url, kind: kindOf(url),
      extra: head.map((h, i) => [h, cells[i] ?? '']).filter(([h, v], i) => h && v && i !== t && i !== (linkCol >= 0 ? linkCol : cells.findIndex(isUrl))),
    };
  }).filter((i) => isUrl(i.url));
  return { name, items };
}

export function buildLibrary(tabs) {
  const groups = tabs.filter((g) => g.items.length);
  return { groups, total: groups.reduce((n, g) => n + g.items.length, 0) };
}
