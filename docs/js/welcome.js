import { html, mount } from './dom.js';
import { pct } from './format.js';
import { memberStatus, elapsedRatio } from './metrics.js';

const plain = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z\s]/g, ' ').trim();

/** Email kiểu "phong.nh1@" = tên + chữ cái đầu họ/đệm ("Nguyễn Hoàng Phong"); khớp được đúng một người thì mới chào riêng. */
/** Nhận ra nhân sự trong báo cáo KPI: ưu tiên đầu số (mã nhân sự), rồi tới tên/biệt danh, cuối cùng đoán theo email. */
export function findMember(email, teams, name = '', code = '') {
  if (code) {
    const hit = teams.flatMap((team) => team.members.map((member) => ({ team, member }))).find(({ member }) => member.code === String(code));
    if (hit) return hit;
  }
  const byName = findByName(name, teams);
  if (byName) return byName;
  const [first = '', initials = ''] = email.split('@')[0].split('.').map((p) => p.replace(/[^a-z]/gi, '').toLowerCase());
  if (!first) return null;
  const hits = teams.flatMap((team) => team.members.filter((m) => {
    const t = plain(m.name).split(/\s+/);
    return t.at(-1) === first && t.slice(0, -1).map((w) => w[0]).join('') === initials;
  }).map((member) => ({ team, member })));
  return hits.length === 1 ? hits[0] : null;
}

/** Tên/biệt danh điền trong tab Tài khoản: khớp đúng họ tên, hoặc đúng tên gọi (từ cuối) nếu chỉ có một người. */
function findByName(name, teams) {
  const want = plain(name);
  if (!want) return null;
  const all = teams.flatMap((team) => team.members.map((member) => ({ team, member })));
  const exact = all.filter(({ member }) => plain(member.name) === want);
  if (exact.length === 1) return exact[0];
  const short = all.filter(({ member }) => plain(member.name).split(/\s+/).at(-1) === want);
  return short.length === 1 ? short[0] : null;
}

const firstName = (full) => plain(full) && full.trim().split(/\s+/).at(-1);

/** Nội dung chào theo mức tiến độ KPI của chính nhân sự. */
const TONES = {
  good: { icon: '🎉', title: (n) => `Chào mừng ${n} quay lại!`, text: (p, P) => `${P} đang đạt năng suất rất tốt. Tiếp tục phát huy nhé!`, cls: 'is-good' },
  warn: { icon: '💪', title: (n) => `Chào ${n}!`, text: (p, P) => `${P} đang hơi chậm so với tiến độ tháng — chỉ cần đẩy thêm một chút là kịp. Cố lên nhé!`, cls: 'is-warn' },
  bad: { icon: '🤝', title: (n) => `Chào ${n}`, text: (p, P) => `KPI của ${p} đang thấp hơn nhiều so với tiến độ. ${P} có đang gặp khó khăn gì không? Hãy chia sẻ với quản lý để được hỗ trợ.`, cls: 'is-bad' },
};

/** Xưng hô theo giới tính khai trong tab Tài khoản: Nam → anh, Nữ → chị, chưa khai → bạn. */
const pronoun = (gender) => (gender === 'Nam' ? 'anh' : gender === 'Nữ' ? 'chị' : 'bạn');
const cap = (s) => s[0].toUpperCase() + s.slice(1);

const confetti = () => Array.from({ length: 24 }, (_, i) => html`<i style="--i:${i}"></i>`);

/** Hiện thẻ chào; trả về false nếu không có gì để hiển thị. */
export function showWelcome(el, { me, found, data }) {
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const who = pronoun(me.gender);
  let tone = null, stat = '';
  if (found) {
    const status = memberStatus(found.member, found.team);
    tone = TONES[status.key];
    stat = html`<dl class="welcome__stat"><div><dt>KPI của ${who}</dt><dd>${pct(found.member.kpi, 1)}</dd></div><div><dt>Tiến độ tháng</dt><dd>${pct(elapsedRatio(found.team.asOf), 0)}</dd></div></dl>`;
  }
  const name = me.name || (found && firstName(found.member.name)) || me.email.split('@')[0];
  mount(el, html`
    <div class="welcome__card ${tone?.cls ?? 'is-good'}" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      ${tone?.cls === 'is-good' ? html`<div class="welcome__confetti" aria-hidden="true">${confetti()}</div>` : ''}
      <div class="welcome__icon" aria-hidden="true">${tone?.icon ?? '👋'}</div>
      <p class="welcome__hello">${greet}</p>
      <h2 id="welcome-title" class="welcome__title">${tone ? tone.title(name) : `Chào mừng ${name}!`}</h2>
      <p class="welcome__text">${tone?.text(who, cap(who)) ?? `Chúc ${who} một ngày làm việc hiệu quả. Cùng xem tiến độ KPI của đội nhé.`}</p>
      ${stat}
      <div class="welcome__actions">
        ${tone?.cls === 'is-bad' || tone?.cls === 'is-warn' ? html`<button class="btn" type="button" data-welcome="chat">Chia sẻ với quản lý</button>` : ''}
        <button class="btn btn--ghost" type="button" data-welcome="close">${found ? 'Xem báo cáo' : 'Bắt đầu'}</button>
      </div>
    </div>`);
  el.hidden = false;
  el.querySelector('.btn')?.focus();
}

export const hideWelcome = (el) => { el.hidden = true; el.replaceChildren(); };
