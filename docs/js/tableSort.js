/**
 * Bấm tiêu đề cột để sắp xếp các bảng thống kê (bảng có class "sortable"); bấm lần nữa để đảo chiều.
 * Sắp xếp ngay trên các dòng đang hiển thị, và nhớ lại sau mỗi lần vẽ lại trang (theo tên các cột).
 */
const saved = new Map();   // chữ ký bảng -> { col, dir }
const FIRST_NUMBER = /^[-+]?\d[\d.]*(?:,\d+)?/;

/** Giá trị để so sánh: số (kiểu Việt: 1.234,5), giờ phút "1h38"/"45p", hoặc chữ; ô trống luôn xếp cuối. */
function valueOf(cell) {
  if (cell?.dataset.sort !== undefined) {   // giá trị sắp xếp ghi sẵn (số thập phân dạng 0.12 hoặc chuỗi)
    const v = cell.dataset.sort.trim();
    return v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : v;
  }
  const t = (cell?.textContent ?? '').trim();
  if (!t || t === '—' || t === '·' || t === '✓') return t === '✓' ? 0 : null;
  const hm = /^(\d+)h(\d{2})?$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const min = /^(\d+)p$/.exec(t);
  if (min) return Number(min[1]);
  const n = FIRST_NUMBER.exec(t);
  return n ? Number(n[0].replace(/\./g, '').replace(',', '.')) : t;
}

const signature = (table) => [...table.tHead.rows[0].cells].map((c) => c.textContent.trim()).join('|');
const bodyRows = (table) => [...table.tBodies[0].rows].filter((r) => !r.classList.contains('group-row'));

function sortTable(table, col, dir) {
  const body = table.tBodies[0];
  const groups = [...body.rows].filter((r) => r.classList.contains('group-row'));
  const rows = bodyRows(table).map((row, i) => ({ row, i, v: valueOf(row.cells[col]) }));
  rows.sort((a, b) => {
    if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;   // ô trống luôn cuối
    const diff = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'vi');
    return (dir === 'asc' ? diff : -diff) || a.i - b.i;
  });
  body.append(...rows.map((r) => r.row), ...groups);   // dòng nhóm (nếu có) giữ ở cuối
  [...table.tHead.rows[0].cells].forEach((th, i) => th.setAttribute('aria-sort', i === col ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'));
}

/** Gọi sau mỗi lần vẽ lại: áp lại kiểu sắp xếp đã chọn và đánh dấu các tiêu đề bấm được. */
export function applyTableSorts(root) {
  root.querySelectorAll('table.sortable').forEach((table) => {
    if (!table.tHead?.rows.length || !table.tBodies[0]) return;
    [...table.tHead.rows[0].cells].forEach((th) => { if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none'); th.tabIndex = 0; });
    const s = saved.get(signature(table));
    if (s) sortTable(table, s.col, s.dir);
  });
}

function toggle(th) {
  const table = th.closest('table.sortable');
  if (!table || th.closest('thead') !== table.tHead || th.rowSpan > 1 && table.tHead.rows.length > 1 && th.parentElement !== table.tHead.rows[0]) return;
  if (th.colSpan > 1) return;
  const col = th.cellIndex;
  const key = signature(table);
  const prev = saved.get(key);
  const first = bodyRows(table).map((r) => valueOf(r.cells[col])).find((v) => v !== null);
  const dir = prev?.col === col ? (prev.dir === 'desc' ? 'asc' : 'desc') : typeof first === 'number' ? 'desc' : 'asc';
  saved.set(key, { col, dir });
  sortTable(table, col, dir);
}

document.addEventListener('click', (e) => { const th = e.target.closest('table.sortable thead th'); if (th) toggle(th); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const th = e.target.closest?.('table.sortable thead th');
  if (th) { e.preventDefault(); toggle(th); }
});
