import { html, raw } from '../dom.js';
import { num } from '../format.js';

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Biểu tượng vẽ bằng SVG (ô bo góc màu + hình trắng) thay cho emoji để đồng nhất giữa các máy. */
const GLYPH = {
  book: '<path d="M4 5.5C6 4.6 9 4.6 12 6.2c3-1.6 6-1.6 8-.7V18c-2-.9-5-.9-8 .7-3-1.6-6-1.6-8-.7z"/><path d="M12 6.2v12.5"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  clipboard: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V4h6v1M9 11h6M9 15h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  all: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 16h5"/>',
  sheet: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 5v14"/>',
  slide: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M12 16v4M8 20h8"/>',
  form: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  file: '<path d="M8.5 12.5l5.8-5.8a3.2 3.2 0 0 1 4.5 4.5l-7.4 7.4a5 5 0 0 1-7-7l7.1-7.1"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const GROUPS = [['quy trinh', 'book', '#3b82f6'], ['chinh sach', 'shield', '#f59e0b'], ['giai trinh', 'clipboard', '#8b5cf6']];
const KIND_COLOR = { doc: '#3b82f6', sheet: '#10b981', slide: '#f59e0b', form: '#8b5cf6', file: '#ef4444', video: '#ef4444', link: '#64748b' };
const icon = (glyph, color, size = 36) => raw(`<span class="lib-icon" style="--c:${color};width:${size}px;height:${size}px"><svg viewBox="0 0 24 24" width="${Math.round(size * 0.58)}" height="${Math.round(size * 0.58)}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[glyph]}</svg></span>`);
const groupIcon = (name, size) => { const g = GROUPS.find(([k]) => plain(name).includes(k)); return icon(g?.[1] ?? 'folder', g?.[2] ?? '#0ea5e9', size); };

/** Các mục khớp bộ lọc nhóm + ô tìm kiếm (không dấu). */
export function libraryItems(lib, { cat = 'all', q = '' }) {
  const needle = plain(q).trim();
  return lib.groups.filter((g) => cat === 'all' || g.name === cat)
    .map((g) => ({ ...g, items: g.items.filter((i) => !needle || plain(`${i.title} ${i.extra.map(([, v]) => v).join(' ')}`).includes(needle)) }))
    .filter((g) => g.items.length);
}

const itemRow = (i) => html`
  <li class="lib-item">
    <span class="lib-item__icon" title="${i.kind.label}" aria-hidden="true">${icon(i.kind.id, KIND_COLOR[i.kind.id] ?? '#64748b')}</span>
    <span class="lib-item__text"><strong>${i.title}</strong>
      <small>${i.kind.label}${i.extra.map(([h, v]) => ` · ${h}: ${v}`).join('')}</small></span>
    <a class="btn btn--ghost lib-item__go" href="${i.url}" target="_blank" rel="noopener noreferrer">Mở</a>
  </li>`;

export const libraryListView = (lib, ui) => {
  const groups = libraryItems(lib, ui);
  if (!groups.length) return html`<p class="muted">Không có tài liệu nào khớp.</p>`;
  return html`${groups.map((g) => html`
    <section class="card lib-group"><div class="card__head"><h3 class="card__title lib-title">${groupIcon(g.name, 28)} ${g.name}</h3><span class="muted">${g.items.length} tài liệu</span></div>
      <ul class="lib-list">${g.items.map(itemRow)}</ul></section>`)}`;
};

/** Tab Thư viện: thống kê theo nhóm (bấm để lọc), ô tìm kiếm và danh sách tài liệu có nút mở. */
export function libraryView(lib, ui) {
  return html`
    <div class="toolbar"><h2 class="section-title">Thư viện tài liệu</h2><p class="muted">${num(lib.total)} tài liệu · ${lib.groups.length} nhóm</p></div>
    <div class="grid">
      <button class="card card--link lib-stat ${ui.cat === 'all' ? 'is-active' : ''}" type="button" data-lib-cat="all"><h3 class="card__title lib-title">${icon('all', '#0ea5e9', 28)} Tất cả</h3><p class="big num">${num(lib.total)}</p><p class="muted">tài liệu</p></button>
      ${lib.groups.map((g) => html`<button class="card card--link lib-stat ${ui.cat === g.name ? 'is-active' : ''}" type="button" data-lib-cat="${g.name}">
        <h3 class="card__title lib-title">${groupIcon(g.name, 28)} ${g.name}</h3><p class="big num">${num(g.items.length)}</p><p class="muted">tài liệu</p></button>`)}
    </div>
    <div class="filters"><label class="filter filter--grow"><span>Tìm tài liệu</span>
      <input id="lib-search" class="search" type="search" placeholder="Nhập tên tài liệu…" value="${ui.q}" autocomplete="off"></label></div>
    <div id="lib-list" class="lib-groups">${libraryListView(lib, ui)}</div>`;
}
