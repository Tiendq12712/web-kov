import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeCallScores, noteBlocks, QUALITY } from '../callScores.js';
import { maskPhone as maskInText } from '../control.js';   // che số điện thoại khách ghi trong nhận xét

const maskPhone = (t) => (t.length > 5 ? `${t.slice(0, 2)}••••${t.slice(-3)}` : t);   // số khách chỉ hiện dạng che bớt
const score = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ','));
const p1 = (v) => (v == null ? '—' : pct(v, 1));
const pts = (v) => (v == null ? '—' : `${v.toFixed(1).replace('.', ',')}%`);   // điểm trừ là % thưởng
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const bar = (v, max, tone = '') => html`<div class="bar ${tone ? `bar--${tone}` : ''}"><div class="bar__fill" style="width:${max ? Math.min(100, (v / max) * 100) : 0}%"></div></div>`;
const errBadge = (rate) => (rate == null ? html`<span class="muted">—</span>` : html`<span class="badge badge--${rate === 0 ? 'good' : rate <= 0.3 ? 'warn' : 'bad'}">${p1(rate)}</span>`);

const noteList = (blocks) => html`<ul class="cs-notes">${blocks.map((b) => html`<li class="cs-n ${b.tone ? `cs-n--${b.tone}` : ''} ${b.intro ? 'cs-n--intro' : ''}">${b.label ? html`<strong>${b.label}:</strong> ` : ''}${b.text}</li>`)}</ul>`;
/** Nhận xét: ngắn thì hiện thẳng, dài (trên ~350 ký tự) thì gập lại, bấm "Xem đầy đủ" để mở. */
const noteView = (text) => {
  const blocks = noteBlocks(maskInText(text));
  if (!blocks.length) return '';
  const total = blocks.reduce((n, b) => n + b.label.length + b.text.length, 0);
  if (total <= 350) return noteList(blocks);
  const first = blocks[0], preview = `${first.label ? `${first.label}: ` : ''}${first.text}`;
  return html`<details class="cs-more"><summary><span class="cs-prev">${preview.length > 150 ? `${preview.slice(0, 150)}…` : preview}</span><span class="cs-open">Xem đầy đủ (${blocks.length} ý)</span><span class="cs-close">Thu gọn</span></summary>${noteList(blocks)}</details>`;
};
const stars = (v) => (v ? html`<span class="cs-score" title="Điểm đánh giá ${v}">${'★'.repeat(v)}<span class="muted">${'★'.repeat(Math.max(0, 5 - v))}</span></span>` : '');

/** Tab Kiểm soát call: kết quả chấm chất lượng cuộc gọi (Sheet "Chấm call"); nhân sự chỉ thấy các call của mình. */
export function callScoreView(data, ui, { manager, code, names }) {
  if (!manager && !code) return html`<p class="notice">Chưa nhận ra bạn trong danh sách nhân sự nên chưa hiện được kết quả chấm call của bạn. Nhờ quản trị điền <strong>Đầu số</strong> cho tài khoản của bạn trong Thiết lập → Tài khoản.</p>`;
  const mine = manager ? null : code;
  const all = analyzeCallScores(data.rows, { code: mine });
  if (!all.total) return html`<p class="notice">${manager ? 'Chưa có call nào được chấm.' : 'Chưa có call nào của bạn được chấm.'}</p>`;
  const month = all.months.includes(ui.month) ? ui.month : 'all';
  const person = manager && ui.person !== 'all' && all.people.some((p) => p.code === ui.person) ? ui.person : 'all';
  const a = analyzeCallScores(data.rows, { month, code: mine ?? (person === 'all' ? null : person) });
  const maxCat = Math.max(...a.cats.map((c) => c.count), 1), maxItem = Math.max(...a.items.map((i) => i.count), 1);
  // Bộ lọc và sắp xếp của phần chi tiết call
  const q = ['all', ...Object.keys(QUALITY)].includes(ui.q) ? ui.q : 'all', stars_ = ['all', '0', '1', '2', '3', '4', '5'].includes(ui.stars) ? ui.stars : 'all';
  const has = ['all', 'err', 'note', 'fb'].includes(ui.has) ? ui.has : 'all', sort = ['priority', 'new', 'score', 'penalty'].includes(ui.sort) ? ui.sort : 'priority';
  const errOpt = a.items.some((i) => i.text === ui.err) ? ui.err : 'all', text = String(ui.text ?? '').trim();
  const needle = text.toLowerCase();
  const matches = (r) => (q === 'all' || r.quality.level === q) && (stars_ === 'all' || String(r.score) === stars_)
    && (has === 'all' || (has === 'err' && r.errors.length) || (has === 'note' && r.note) || (has === 'fb' && r.feedback))
    && (errOpt === 'all' || r.errors.some((e) => e.text === errOpt))
    && (!needle || `${r.note} ${r.feedback} ${r.retailer} ${r.name} ${r.code}`.toLowerCase().includes(needle));
  const byNew = (x, y) => (y.ts ?? 0) - (x.ts ?? 0);
  const sorter = { priority: (x, y) => QUALITY[x.quality.level].order - QUALITY[y.quality.level].order || y.penalty - x.penalty || byNew(x, y), new: byNew,
    score: (x, y) => (x.score || 9) - (y.score || 9) || byNew(x, y), penalty: (x, y) => y.penalty - x.penalty || byNew(x, y) }[sort];
  const filtered = a.list.filter(matches).sort(sorter), shown = filtered.slice(0, 200);
  const chip = (id, label, n) => html`<button class="chip cs-chip cs-chip--${id}" type="button" data-cs-q="${id}" aria-pressed="${id === q}">${label} <b>${num(n)}</b></button>`;
  const nameOf = (r) => names.get(r.code) ?? r.name;
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Kiểm soát call${manager ? '' : ' của bạn'}</h2>
      <p class="muted">Kết quả chấm chất lượng cuộc gọi theo kịch bản chăm sóc. Mỗi call có thể dính nhiều lỗi; điểm trừ là tổng các mức (%) ghi cho call đó.</p></div>
    <div class="filters" aria-label="Lọc kết quả chấm call">
      <label class="filter"><span>Tháng (theo thời gian tạo Activity)</span><select id="cs-month" class="select">${opt('all', `Tất cả (${all.months.map(mlabel).join(' + ')})`, month)}${[...all.months].reverse().map((m) => opt(m, mlabel(m), month))}</select></label>
      ${manager ? html`<label class="filter"><span>Nhân sự</span><select id="cs-person" class="select">${opt('all', 'Tất cả nhân sự', person)}${all.people.filter((p) => p.code).map((p) => opt(p.code, `${names.get(p.code) ?? p.name} (${p.code})`, person))}</select></label>` : ''}
    </div>
    <div class="grid">
      ${stat('Call đã chấm', num(a.total), manager && person === 'all' ? `${a.people.length} nhân sự được chấm` : 'Trong kỳ đang xem')}
      ${stat('Call có lỗi', num(a.withErr), `${p1(a.errRate)} số call đã chấm · ${num(a.perfect)} call không lỗi`, a.errRate >= 0.3 ? 'bad' : a.errRate >= 0.1 ? 'warn' : 'good')}
      ${stat('Điểm trừ trung bình', pts(a.avgPenalty), `${pts(a.penalty)} tổng điểm trừ`, a.avgPenalty >= 2 ? 'bad' : a.avgPenalty >= 0.5 ? 'warn' : 'good')}
      ${stat('Điểm đánh giá TB', score(a.avgScore), a.scored ? `Trên ${num(a.scored)} call đã có điểm · ${a.scoreDist.filter((d) => d.count).map((d) => `${d.score}đ: ${d.count}`).join(' · ')}` : 'Chưa call nào có điểm đánh giá', a.avgScore == null ? '' : a.avgScore >= 4 ? 'good' : a.avgScore >= 3 ? 'warn' : 'bad')}
      ${stat('Cần chấn chỉnh ngay', num(a.quality.urgent), `${num(a.quality.weak)} call chưa tốt · ${num(a.quality.good)} call tốt`, a.quality.urgent ? 'bad' : 'good')}
      ${stat('Call có điểm cộng', num(a.bonusCalls), 'Call được ghi nhận điểm cộng (+)')}
    </div>
    ${a.byMonth.length > 1 ? html`
    <div class="toolbar"><h2 class="section-title">Theo tháng tạo Activity</h2></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Tháng</th><th scope="col" class="right">Call đã chấm</th><th scope="col" class="right">Call có lỗi</th><th scope="col" class="right">Tỉ lệ lỗi</th><th scope="col" class="right">Điểm trừ TB</th><th scope="col" class="right">Điểm đánh giá TB</th></tr></thead>
      <tbody>${a.byMonth.map((m) => html`<tr class="static"><td class="sticky-col"><strong>${mlabel(m.month)}</strong></td><td class="right num">${num(m.calls)}</td><td class="right num">${num(m.withErr)}</td><td class="right">${errBadge(m.errRate)}</td><td class="right num">${pts(m.avgPenalty)}</td><td class="right num">${score(m.avgScore)}</td></tr>`)}</tbody>
    </table></div>` : ''}
    ${manager && person === 'all' ? html`
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Sắp theo điểm trừ trung bình mỗi call (cao → thấp). Nhân sự chưa có call nào được chấm sẽ không có dòng.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Call đã chấm</th><th scope="col" class="right">Call có lỗi</th><th scope="col" class="right">Tỉ lệ lỗi</th><th scope="col" class="right">Tổng điểm trừ</th><th scope="col" class="right">Điểm trừ TB/call</th><th scope="col" class="right">Điểm đánh giá TB</th><th scope="col" class="right">Cần chấn chỉnh ngay</th><th scope="col" class="right">Chưa tốt</th><th scope="col" class="right">Có điểm cộng</th></tr></thead>
      <tbody>${a.people.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${names.get(p.code) ?? p.name}</strong>${p.code ? html`<small>${p.code}</small>` : ''}</span></td>
        <td class="right num">${num(p.calls)}</td><td class="right num">${num(p.withErr)}</td><td class="right">${errBadge(p.errRate)}</td><td class="right num">${pts(p.penalty)}</td><td class="right num strong">${pts(p.avgPenalty)}</td><td class="right num">${score(p.avgScore)}</td><td class="right num">${p.urgent ? html`<span class="badge badge--bad">${num(p.urgent)}</span>` : '0'}</td><td class="right num">${num(p.weak)}</td><td class="right num">${num(p.bonus)}</td></tr>`)}</tbody>
    </table></div>` : ''}
    ${a.cats.length ? html`
    <div class="toolbar"><h2 class="section-title">Lỗi theo giai đoạn của cuộc gọi</h2><p class="muted">Số lỗi ghi nhận ở từng giai đoạn (Tiếp cận, Khảo sát, Xác minh vấn đề, Xử lý…) để biết cần huấn luyện khâu nào.</p></div>
    <div class="hist">${a.cats.map((c) => html`<div class="hist__row"><span title="${c.cat}">${c.cat}</span>${bar(c.count, maxCat, 'warn')}<span class="num">${num(c.count)} <small class="muted">(${num(c.calls)} call · trừ ${pts(c.penalty)})</small></span></div>`)}</div>
    <div class="toolbar"><h2 class="section-title">Lỗi hay gặp</h2></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Lỗi</th><th scope="col">Giai đoạn</th><th scope="col" class="right">Mức trừ</th><th scope="col" class="right">Số lần</th><th scope="col"></th></tr></thead>
      <tbody>${a.items.slice(0, 20).map((i) => html`<tr class="static"><td class="sticky-col"><strong>${i.text}</strong></td><td class="muted">${i.cat}</td><td class="right">${i.pct ? `${i.pct}%` : '—'}</td><td class="right num strong">${num(i.count)}</td><td>${bar(i.count, maxItem, 'warn')}</td></tr>`)}</tbody>
    </table></div>` : html`<p class="notice notice--good">Chưa có lỗi nào được ghi nhận trong kỳ này. 🎉</p>`}
    <div class="toolbar"><h2 class="section-title">Chi tiết call đã chấm</h2><p class="muted">Mỗi call được xếp loại: <strong>Cần chấn chỉnh ngay</strong> (điểm đánh giá 1–2, bị trừ từ 5% hoặc nhận xét nêu lỗi nghiêm trọng), <strong>Chưa tốt</strong> (điểm 3, có lỗi bị trừ hoặc có điểm cần cải thiện), <strong>Tốt</strong> (điểm từ 4 hoặc không lỗi).</p></div>
    <div class="cs-chips" role="group" aria-label="Lọc theo chất lượng call">${chip('all', 'Tất cả', a.total)}${['urgent', 'weak', 'good', 'none'].map((k) => chip(k, QUALITY[k].label, a.quality[k]))}</div>
    <div class="filters" aria-label="Lọc chi tiết call">
      <label class="filter"><span>Điểm đánh giá</span><select id="cs-stars" class="select">${opt('all', 'Tất cả', stars_)}${['5', '4', '3', '2', '1'].map((v) => opt(v, `${v} sao`, stars_))}${opt('0', 'Chưa có điểm', stars_)}</select></label>
      <label class="filter"><span>Hiển thị</span><select id="cs-has" class="select">${opt('all', 'Tất cả call', has)}${opt('err', 'Có lỗi bị trừ điểm', has)}${opt('note', 'Có nhận xét', has)}${opt('fb', 'Có góp ý', has)}</select></label>
      ${a.items.length ? html`<label class="filter"><span>Loại lỗi</span><select id="cs-err" class="select">${opt('all', 'Tất cả lỗi', errOpt)}${a.items.map((i) => opt(i.text, `${i.text} (${i.count})`, errOpt))}</select></label>` : ''}
      <label class="filter"><span>Sắp xếp</span><select id="cs-sort" class="select">${opt('priority', 'Cần xử lý trước', sort)}${opt('new', 'Mới nhất', sort)}${opt('score', 'Điểm thấp nhất', sort)}${opt('penalty', 'Điểm trừ cao nhất', sort)}</select></label>
      <label class="filter cs-search"><span>Tìm</span><input id="cs-text" class="select" type="search" placeholder="Nhận xét, góp ý, Retailer…" value="${text}"></label>
    </div>
    <p class="muted cs-count">${num(filtered.length)} call${filtered.length > shown.length ? ` (hiển thị ${num(shown.length)} call đầu theo thứ tự đang chọn)` : ''}.</p>
    ${filtered.length ? '' : html`<p class="notice">Không có call nào khớp bộ lọc.</p>`}
    <div class="cs-list">${shown.map((r) => html`<article class="cs-card cs-card--${r.quality.level}">
      <header class="cs-head">
        <span class="cs-verdict cs-verdict--${r.quality.level}">${QUALITY[r.quality.level].label}</span>
        ${manager ? html`<strong class="cs-who">${nameOf(r)}</strong>` : ''}
        <span class="cs-when num">${dmy(r.date)}${r.scoredDate && r.scoredDate !== r.date ? html`<small class="muted"> · chấm ${dmy(r.scoredDate)}</small>` : ''}</span>
        <span class="muted num">${r.phone ? maskPhone(r.phone) : r.activityId}${r.retailer ? ` · Retailer ${r.retailer}` : ''}</span>
        ${stars(r.score)}
        ${manager && r.code && (r.quality.level === 'urgent' || r.quality.level === 'weak') ? html`<button class="link-btn cs-goto" type="button" data-goto-listen="${r.code}" title="Mở danh sách data nên nghe lại của nhân sự này">Data cần nghe lại →</button>` : ''}
      </header>
      ${r.quality.reasons.length ? html`<p class="cs-why">${r.quality.reasons.join(' · ')}</p>` : ''}
      ${r.errors.length || r.ratings.length || r.bonus.length ? html`<div class="cs-tags">${r.errors.map((e) => html`<span class="badge badge--bad" title="${e.cat}">${e.text} (${e.pct}%)</span> `)}${r.ratings.map((x) => html`<span class="badge badge--good" title="${x.cat}">${x.text}</span> `)}${r.bonus.map((b) => html`<span class="badge badge--good">+ ${b.text}${b.pct ? ` (+${b.pct}%)` : ''}</span> `)}</div>` : ''}
      ${r.note || r.feedback ? html`<div class="cs-body ${r.note && r.feedback ? 'cs-body--two' : ''}">
        ${r.note ? html`<div class="cs-sec"><h4>Nhận xét</h4>${noteView(r.note)}</div>` : ''}
        ${r.feedback ? html`<div class="cs-sec cs-sec--fb"><h4>Góp ý</h4><p>${maskInText(r.feedback)}</p></div>` : ''}</div>` : html`<p class="muted cs-none">Chưa có nhận xét hoặc góp ý.</p>`}
    </article>`)}</div>`;
}
