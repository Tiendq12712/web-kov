import { html, raw } from '../dom.js';
import { CONFIG } from '../config.js';

const INK = '#1b2a52';

/**
 * Nhân vật robot hoạt hình (nhân vật riêng, vẽ bằng SVG): mũ giáp xanh, khiên phát sáng, 4 biểu cảm theo tiến độ.
 * `look`: { armor, accent } — màu giáp và màu khiên/ánh sáng.
 */
const FACE = {
  stern: { brows: 'M60 66 L74 71 M100 66 L86 71', mouth: '<path d="M70 98 Q80 94 90 98"/>', eyes: 'dot', pose: 'guard' },
  worried: { brows: 'M60 72 L74 67 M100 72 L86 67', mouth: '<path d="M70 100 Q80 92 90 100"/>', eyes: 'dot', pose: 'down', sweat: true },
  cheer: { brows: 'M60 68 Q67 63 74 68 M86 68 Q93 63 100 68', mouth: '<path d="M68 93 Q80 106 92 93"/>', eyes: 'dot', pose: 'thumb' },
  celebrate: { brows: 'M60 67 Q67 62 74 67 M86 67 Q93 62 100 67', mouth: '<path d="M66 92 Q80 112 94 92Z" fill="#7f1d1d"/>', eyes: 'happy', pose: 'up' },
};

/** Làm sáng (amt > 0) hoặc tối (amt < 0) một màu #rrggbb, amt trong [-1, 1]. */
function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const to = (v) => ch(v).toString(16).padStart(2, '0');
  return `#${to((n >> 16) & 255)}${to((n >> 8) & 255)}${to(n & 255)}`;
}

export function mascot(mood, look = CONFIG.mascot ?? {}) {
  const { armor = '#2f63e0', accent = '#38bdf8' } = look;
  const f = FACE[mood] ?? FACE.cheer;
  const id = (name) => `${name}-${mood}`;
  const [hi, lo, deep] = [shade(armor, 0.55), shade(armor, -0.3), shade(armor, -0.55)];
  const defs = `<defs>
    <radialGradient id="${id('helm')}" cx=".34" cy=".26" r=".85"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${armor}"/><stop offset="1" stop-color="${deep}"/></radialGradient>
    <linearGradient id="${id('body')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(armor, 0.3)}"/><stop offset="1" stop-color="${deep}"/></linearGradient>
    <linearGradient id="${id('plate')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>
    <radialGradient id="${id('face')}" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#fff3e6"/><stop offset=".7" stop-color="#ffd9b8"/><stop offset="1" stop-color="#eeaf80"/></radialGradient>
    <radialGradient id="${id('eye')}" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#3b4f93"/><stop offset="1" stop-color="#0b1330"/></radialGradient>
    <radialGradient id="${id('glove')}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b6c2d6"/></radialGradient>
    <linearGradient id="${id('shield')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(accent, 0.55)}"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, -0.35)}"/></linearGradient>
    <filter id="${id('blur')}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="${id('glow')}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>`;
  const shield = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k})" filter="url(#${id('glow')})">
      <path d="M28 0 L54 9 V32 C54 48 42 58 28 64 C14 58 2 48 2 32 V9 Z" fill="url(#${id('shield')})" stroke="#e0f2fe" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M28 6 L48 13 V32 C48 44 39 52 28 58 Z" fill="#fff" fill-opacity=".18"/>
      <path d="M8 14 Q16 10 26 8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>
      <path d="M19 32 L26 39 L38 25" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const arm = (d) => `<path d="${d}" fill="none" stroke="${deep}" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${armor}" stroke-width="12" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${hi}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" transform="translate(-2 -2)"/>`;
  const glove = (x, y) => `<circle cx="${x}" cy="${y}" r="9.5" fill="url(#${id('glove')})" stroke="${lo}" stroke-width="1.8"/><circle cx="${x - 3}" cy="${y - 3}" r="2.6" fill="#fff" fill-opacity=".8"/>`;
  const poses = {
    guard: `${arm('M52 130 L36 128')}${shield(2, 90)}${arm('M108 130 L124 138')}${glove(126, 140)}`,
    down: `${arm('M52 132 L42 154')}${glove(40, 158)}${arm('M108 132 L118 154')}${glove(120, 158)}<path d="M112 52 q6 10 0 14 q-6-4 0-14z" fill="#7dd3fc" stroke="#38bdf8" stroke-width="1"/>`,
    thumb: `${shield(2, 94, .9)}${arm('M108 130 L128 106')}${glove(130, 100)}<rect x="127" y="82" width="7" height="14" rx="3.5" fill="url(#${id('glove')})" stroke="${lo}" stroke-width="1.4"/>`,
    up: `${arm('M52 130 L30 98')}${glove(28, 92)}${arm('M108 130 L130 98')}${glove(132, 92)}${shield(53, 120, .62)}<g><rect x="8" y="26" width="6" height="10" fill="#f59e0b" transform="rotate(20 11 31)"/><rect x="142" y="24" width="6" height="10" fill="#10b981" transform="rotate(-25 145 29)"/><rect x="26" y="10" width="6" height="10" fill="#ef4444" transform="rotate(40 29 15)"/><rect x="124" y="8" width="6" height="10" fill="#a855f7" transform="rotate(-10 127 13)"/><circle cx="76" cy="6" r="3.5" fill="#fbbf24"/></g>`,
  };
  const eyes = f.eyes === 'happy'
    ? `<path d="M60 82 Q67 72 74 82 M86 82 Q93 72 100 82" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>`
    : `<ellipse cx="67" cy="80" rx="7" ry="8" fill="url(#${id('eye')})"/><ellipse cx="93" cy="80" rx="7" ry="8" fill="url(#${id('eye')})"/><circle cx="69.5" cy="76.5" r="2.7" fill="#fff"/><circle cx="95.5" cy="76.5" r="2.7" fill="#fff"/><circle cx="65" cy="84" r="1.3" fill="#fff" fill-opacity=".7"/><circle cx="91" cy="84" r="1.3" fill="#fff" fill-opacity=".7"/>`;
  return raw(`
    <svg class="coach__svg" viewBox="0 0 160 172" role="img" aria-label="Nhân vật Coach KPI" xmlns="http://www.w3.org/2000/svg">
      ${defs}
      <ellipse cx="80" cy="169" rx="42" ry="4.5" fill="#0f172a" fill-opacity=".28" filter="url(#${id('blur')})"/>
      <path d="M44 172 C44 138 58 122 80 122 C102 122 116 138 116 172Z" fill="url(#${id('body')})"/>
      <path d="M50 150 C52 136 62 128 72 126" fill="none" stroke="${hi}" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
      <rect x="62" y="130" width="36" height="30" rx="8" fill="url(#${id('plate')})" stroke="${lo}" stroke-width="2"/>
      <rect x="68" y="139" width="24" height="13" rx="4.5" fill="url(#${id('helm')})" stroke="${deep}" stroke-width="1.2"/><text x="80" y="149" text-anchor="middle" font-size="8.5" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">KPI</text>
      ${poses[f.pose]}
      <rect x="37" y="63" width="10" height="28" rx="5" fill="url(#${id('plate')})" stroke="${lo}" stroke-width="2"/><rect x="113" y="63" width="10" height="28" rx="5" fill="url(#${id('plate')})" stroke="${lo}" stroke-width="2"/>
      <circle cx="80" cy="74" r="40" fill="url(#${id('helm')})" stroke="${deep}" stroke-width="2"/>
      <path d="M80 33 L91 47 H69Z" fill="url(#${id('plate')})" stroke="${lo}" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="62" cy="48" rx="17" ry="8" fill="#fff" fill-opacity=".35" transform="rotate(-28 62 48)"/>
      <ellipse cx="80" cy="82" rx="30" ry="26" fill="url(#${id('face')})" stroke="${deep}" stroke-width="2.2"/>
      <ellipse cx="80" cy="60" rx="26" ry="5" fill="#000" fill-opacity=".08"/>
      <ellipse cx="57" cy="92" rx="7" ry="4.5" fill="#fb7185" fill-opacity=".55" filter="url(#${id('blur')})"/><ellipse cx="103" cy="92" rx="7" ry="4.5" fill="#fb7185" fill-opacity=".55" filter="url(#${id('blur')})"/>
      ${eyes}
      <path d="${f.brows}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
      <g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round">${f.mouth}</g>
    </svg>`);
}

/**
 * Nhân vật nổi ở góc màn hình (trái hoặc phải): bóng thoại phía trên, nhân vật bên dưới.
 * `side`: 'left' | 'right'; `open`: false thì thu nhỏ thành chấm tròn chỉ còn khuôn mặt.
 */
export function coachFloat(c, { side, open }) {
  if (!c) return '';
  return html`
    <div class="coach-float coach-float--${side} coach--${c.mood} ${open ? '' : 'is-min'}">
      ${open ? html`
        <div class="coach__bubble">
          <div class="coach__tools">
            <span class="coach__name">${c.name}</span>
            <span><button class="coach__tool" type="button" data-coach-side title="Chuyển sang góc ${side === 'right' ? 'trái' : 'phải'}" aria-label="Chuyển nhân vật sang góc ${side === 'right' ? 'trái' : 'phải'}">${side === 'right' ? '◀' : '▶'}</button>
              <button class="coach__tool" type="button" data-coach-toggle title="Thu nhỏ" aria-label="Thu nhỏ nhân vật">✕</button></span>
          </div>
          <p class="coach__line">${c.line}</p>
          ${c.action ? (c.action.slow
          ? html`<button class="btn btn--ghost" type="button" data-coach-slow>${c.action.label}</button>`
          : html`<button class="btn btn--ghost" type="button" data-tab="${c.action.tab}">${c.action.label}</button>`) : ''}
        </div>` : ''}
      ${open
        ? html`<button class="coach__figure" type="button" data-coach-next title="Bấm để nghe câu khác" aria-label="Đổi câu thoại của ${c.name}">${mascot(c.mood)}</button>`
        : html`<button class="coach__figure" type="button" data-coach-toggle title="Mở nhân vật" aria-label="Mở ${c.name}">${mascot(c.mood)}</button>`}
    </div>`;
}
