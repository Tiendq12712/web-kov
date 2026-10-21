/** Xuất bảng đang xem ra Excel (.xlsx) hoặc PDF (in ra PDF). Không dùng thư viện ngoài. */

import { reportHtml } from './reportPdf.js';

/* ---------- Đọc bảng HTML thành mảng dòng ---------- */
const clean = (el) => el.textContent.replace(/\s+/g, ' ').trim();
/** Đọc một ô: nếu ô có thẻ <small> phụ (mã nhân sự, thứ trong tuần) thì ghép sau chữ chính. */
const cellText = (el) => {
  const small = el.querySelector('small');
  if (!small) return clean(el);
  const sub = clean(small);
  return `${clean(el).slice(0, clean(el).length - sub.length).trim()} ${sub}`.trim();
};
export function readTable(table) {
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    if (tr.hidden || tr.closest('[hidden]')) continue;
    const cells = [...tr.children].filter((c) => /^T[DH]$/.test(c.tagName) && !c.hidden);
    if (!cells.length) continue;
    const row = [];
    for (const c of cells) {
      row.push(cellText(c));
      for (let i = 1; i < (c.colSpan || 1); i++) row.push('');
    }
    rows.push({ head: Boolean(tr.closest('thead')), foot: Boolean(tr.closest('tfoot')), cells: row });
  }
  return rows;
}

/* ---------- Xlsx tối giản (zip không nén) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = new TextEncoder();

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nameB.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    parts.push(new Uint8Array(local.buffer), nameB, data);
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nameB.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    central.push(new Uint8Array(cen.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  }
  const size = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const colName = (i) => { let n = i + 1, s = ''; while (n) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };
/** Số kiểu Việt Nam ("1.997", "11,5", "-0,5", "42%") → số; không phải số thì giữ chữ. */
function parseValue(text) {
  const t = text.replace('−', '-').replace(/^\+/, '');
  const m = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(%?)$/.exec(t);
  if (!m) return { text };
  const value = Number(`${m[1]}${m[2].replace(/\./g, '')}${m[3] ? `.${m[3]}` : ''}`);
  return m[4] ? { value: value / 100, percent: true } : { value };
}

export function buildXlsx(rows, sheetName = 'Dữ liệu', { freeze = true } = {}) {
  const widths = [];
  rows.forEach((r) => r.cells.forEach((c, i) => { widths[i] = Math.min(40, Math.max(widths[i] ?? 6, c.length + 2)); }));
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.cells.map((text, ci) => {
    const ref = `${colName(ci)}${ri + 1}`;
    if (!text) return r.head ? `<c r="${ref}" s="1"/>` : '';
    if (r.head) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
    const v = parseValue(text);
    const bold = r.foot ? 3 : 0;
    if (v.text !== undefined) return `<c r="${ref}"${bold ? ` s="${bold}"` : ''} t="inlineStr"><is><t>${esc(text)}</t></is></c>`;
    return `<c r="${ref}" s="${v.percent ? (bold ? 5 : 2) : bold || 0}"><v>${v.value}</v></c>`;
  }).join('')}</row>`).join('');
  const headRows = freeze ? rows.filter((r) => r.head).length : 0;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${headRows ? `<pane ySplit="${headRows}" topLeftCell="A${headRows + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="10" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const safeName = sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Dữ liệu';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', styles],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

/* ---------- Tải file / in PDF ---------- */
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'bang';
function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
const stamp = () => new Date().toLocaleString('vi-VN');

export function exportExcel(table, title) {
  const rows = readTable(table);
  if (!rows.length) return;
  const date = new Date().toISOString().slice(0, 10);
  download(buildXlsx(rows, title), `${slug(title)}-${date}.xlsx`);
}

/** PDF: mở hộp thoại in của trình duyệt chỉ với bảng này (chọn "Lưu dưới dạng PDF"), khổ A4 ngang. */
export function exportPdf(table, title) {
  const rows = readTable(table);
  if (!rows.length) return;
  const wide = Math.max(...rows.map((r) => r.cells.length)) > 14;
  const tr = (r) => `<tr>${r.cells.map((c) => `<${r.head ? 'th' : 'td'}>${esc(c)}</${r.head ? 'th' : 'td'}>`).join('')}</tr>`;
  const part = (tag, list) => (list.length ? `<${tag}>${list.map(tr).join('')}</${tag}>` : '');
  const doc = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font: ${wide ? 8 : 10.5}px/1.35 system-ui, "Segoe UI", Arial, sans-serif; color: #111; }
    h1 { font-size: 15px; margin: 0 0 2px; } p { margin: 0 0 8px; color: #555; font-size: 10px; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #999; padding: ${wide ? '2px 3px' : '4px 6px'}; text-align: center; }
    td:first-child, th:first-child { text-align: left; } th { background: #e8eefb; } tfoot td { font-weight: 700; background: #f3f5f9; }
    tr { break-inside: avoid; } thead { display: table-header-group; }
  </style></head><body><h1>${esc(title)}</h1><p>Report SC ONLINE · xuất lúc ${esc(stamp())}</p>
  <table>${part('thead', rows.filter((r) => r.head))}${part('tbody', rows.filter((r) => !r.head && !r.foot))}${part('tfoot', rows.filter((r) => r.foot))}</table></body></html>`;
  const frame = Object.assign(document.createElement('iframe'), { srcdoc: doc });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60_000); };
  document.body.append(frame);
}

/* ---------- Báo cáo tuần / tháng (khuôn cố định) ---------- */
const reportRows = (report) => [
  { cells: [report.title], head: true }, { cells: [report.subtitle] }, { cells: [] },
  { cells: ['Nhận định chính'], head: true }, ...report.insights.map((t) => ({ cells: [t] })), { cells: [] },
  ...report.sections.flatMap((sec) => [{ cells: [sec.title], head: true }, { cells: sec.head, head: true }, ...sec.rows.map((cells) => ({ cells })), ...(sec.foot ? [{ cells: sec.foot, foot: true }] : []), { cells: [] }]),
];

export function exportReportExcel(report) {
  download(buildXlsx(reportRows(report), 'Báo cáo', { freeze: false }), `${slug(report.title)}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportReportPdf(report) {
  const frame = Object.assign(document.createElement('iframe'), { srcdoc: reportHtml(report) });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 60_000); };
  document.body.append(frame);
}

/* ---------- Gắn nút xuất cho các bảng trong trang ---------- */
/** Tên của bảng: tiêu đề gần nhất phía trên, không có thì lấy tên trang. */
function titleOf(wrap) {
  for (let el = wrap; el && el !== document.body; el = el.parentElement) {
    for (let s = el.previousElementSibling, i = 0; s && i < 4; s = s.previousElementSibling, i++) {
      const h = s.matches('h1,h2,h3,.section-title,.card__title') ? s : s.querySelector('h1,h2,h3,.section-title,.card__title');
      if (h) return clean(h);
    }
    const own = el.querySelector(':scope > .card__head .card__title, :scope > h3');
    if (own) return clean(own);
  }
  return document.title.split('·')[0].trim() || 'Bảng dữ liệu';
}

let exportSeq = 0;
export function decorateTables(root) {
  for (const wrap of root.querySelectorAll('.table-wrap')) {
    const table = wrap.querySelector('table');
    if (!table || table.rows.length < 3) continue;
    wrap.dataset.exportId ??= String(++exportSeq);
    const id = wrap.dataset.exportId;
    if (document.querySelector(`.export-bar[data-for="${id}"]`)) continue;
    const bar = document.createElement('div');
    bar.dataset.for = id;
    bar.innerHTML = '<button class="export-btn" type="button" data-export-menu aria-haspopup="menu" aria-expanded="false" title="Xuất bảng này ra Excel hoặc PDF">⬇ Xuất</button><div class="export-menu" role="menu" hidden><button type="button" role="menuitem" data-export="xlsx">Excel (.xlsx)</button><button type="button" role="menuitem" data-export="pdf">PDF (in)</button></div>';
    // Ưu tiên gắn vào hàng công cụ ngay trên bảng (cùng hàng với bộ lọc) để không tốn thêm một dòng.
    const prev = wrap.previousElementSibling;
    const host = prev?.matches('.toolbar, .card__head, .filters') ? prev
      : wrap.closest('details')?.querySelector(':scope > summary') ?? wrap.closest('.card')?.querySelector(':scope > .card__head');
    if (host) { bar.className = 'export-bar export-bar--inline'; host.append(bar); }
    else { bar.className = 'export-bar'; wrap.before(bar); }
  }
}

function closeMenus(except) {
  document.querySelectorAll('.export-bar').forEach((bar) => {
    if (bar === except) return;
    const menu = bar.querySelector('.export-menu');
    if (menu && !menu.hidden) { menu.hidden = true; bar.querySelector('[data-export-menu]').setAttribute('aria-expanded', 'false'); }
  });
}

/** Bấm nút trong thanh xuất. */
export function handleExportClick(e) {
  const menuBtn = e.target.closest?.('[data-export-menu]');
  closeMenus(menuBtn?.closest('.export-bar'));
  if (menuBtn) {
    e.preventDefault();
    const menu = menuBtn.nextElementSibling, open = menu.hidden;
    menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open));
    return true;
  }
  const btn = e.target.closest?.('[data-export]');
  if (!btn) return false;
  const table = document.querySelector(`.table-wrap[data-export-id="${btn.closest('.export-bar').dataset.for}"] table`);
  if (!table) return true;
  const title = titleOf(table.closest('.table-wrap'));
  (btn.dataset.export === 'xlsx' ? exportExcel : exportPdf)(table, title);
  return true;
}
