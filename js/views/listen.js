import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeListen, SIGNALS, LEVELS } from '../listen.js';
import { maskPhone } from '../control.js';
import { RESULTS, resultOf, heardKey } from '../heard.js';

const p1 = (v) => (v == null ? '—' : pct(v, 1));
const mlabel = (ym) => `T${Number(ym.slice(5))}/${ym.slice(2, 4)}`;
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const when = (ts) => (ts == null ? '' : (() => { const d = new Date(ts).toISOString(); return `${d.slice(8, 10)}/${d.slice(5, 7)} ${d.slice(11, 16)}`; })());
const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const LEVEL = { high: ['bad', 'Cao'], mid: ['warn', 'Trung bình'], low: ['', 'Thấp'] };
/** "CSKH T15 - DVKH" -> "T15": nhóm theo loại công việc. */
const jobKey = (j) => /CSKH\s+(\S+)/i.exec(j)?.[1] ?? j;

/** Tab "Chọn call nghe lại": data kết nối thành công nhưng không có impact, xếp mức ưu tiên theo dấu hiệu trong ghi chú. */
export function listenView(data, ui, { names }) {
  const months = data.months, month = ui.month && (ui.month === 'all' || months.includes(ui.month)) ? ui.month : months.at(-1);
  const jobs = [...new Set(data.rows.map((r) => jobKey(r.jobType)).filter(Boolean))].sort();
  const job = ui.job === 'all' || jobs.includes(ui.job) ? ui.job : (jobs.includes('T15') ? 'T15' : 'all');
  const a = analyzeListen(data.rows, { month, job });
  const person = ui.person !== 'all' && a.byPerson.some((p) => p.code === ui.person) ? ui.person : 'all';
  const level = ['all', 'high', 'mid', 'low', 'attn'].includes(ui.level) ? ui.level : 'attn';
  const heard = ui.heard instanceof Map ? ui.heard : new Map();
  const heardOf = (i) => heard.get(heardKey(i.r.retailer, i.r.modifiedTs));
  const hf = ['all', 'todo', 'done'].includes(ui.heardFilter) ? ui.heardFilter : 'all';
  const inScope = a.items.filter((i) => person === 'all' || i.code === person);
  const heardCount = inScope.filter((i) => heardOf(i)).length, highHeard = inScope.filter((i) => i.level === 'high' && heardOf(i)).length;
  const shownAll = inScope.filter((i) => (level === 'all' || (level === 'attn' ? i.level !== 'low' : i.level === level)) && (hf === 'all' || (hf === 'done' ? heardOf(i) : !heardOf(i))));
  const shown = shownAll.slice(0, 300);
  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const nm = (code, fallback) => names.get(code) ?? fallback;
  return html`
    <div class="toolbar"><h2 class="section-title">Chọn call nghe lại</h2>
      <p class="muted">Gợi ý data nên nghe lại để đánh giá: <strong>kết nối thành công nhưng KH không có impact</strong>. Mức ưu tiên dựa trên dấu hiệu trong ghi chú và dữ liệu (xem bảng dấu hiệu); đây là gợi ý chọn mẫu, không phải kết luận nhân sự làm sai.</p></div>
    ${ui.heardNotice ? html`<p class="notice" role="status">${ui.heardNotice}</p>` : ''}
    <div class="filters" aria-label="Lọc gợi ý nghe lại">
      <label class="filter"><span>Tháng</span><select id="ls-month" class="select">${opt('all', 'Tất cả tháng', month)}${[...months].reverse().map((m) => opt(m, mlabel(m), month))}</select></label>
      <label class="filter"><span>Loại công việc</span><select id="ls-job" class="select">${opt('all', 'Tất cả', job)}${jobs.map((j) => opt(j, j, job))}</select></label>
      <label class="filter"><span>Nhân sự</span><select id="ls-person" class="select">${opt('all', 'Tất cả nhân sự', person)}${a.byPerson.filter((p) => p.code).map((p) => opt(p.code, `${nm(p.code, p.name)} (${p.code})`, person))}</select></label>
      <label class="filter"><span>Trạng thái nghe</span><select id="ls-heard" class="select">${opt('all', 'Tất cả', hf)}${opt('todo', 'Chưa nghe', hf)}${opt('done', 'Đã nghe', hf)}</select></label>
      <label class="filter"><span>Mức ưu tiên</span><select id="ls-level" class="select">${opt('attn', 'Cao + Trung bình', level)}${opt('high', 'Chỉ mức Cao', level)}${opt('mid', 'Chỉ Trung bình', level)}${opt('low', 'Chỉ mức Thấp', level)}${opt('all', 'Tất cả', level)}</select></label>
    </div>
    <div class="grid">
      ${stat('Kết nối thành công', num(a.conn), `Trên ${num(a.pool)} data (${p1(a.pool ? a.conn / a.pool : null)})`)}
      ${stat('Kết nối nhưng không impact', num(a.noImpact), `${p1(a.rate)} data kết nối thành công`, a.rate >= 0.5 ? 'warn' : '')}
      ${stat('Nên nghe: mức Cao', num(a.high), 'Ghi chú mâu thuẫn trạng thái, KH hài lòng thấp…', a.high ? 'bad' : 'good')}
      ${stat('Mức Trung bình', num(a.mid), 'Có dấu hiệu cần xem thêm', a.mid ? 'warn' : '')}
      ${stat('Đã nghe lại', `${num(heardCount)} / ${num(inScope.length)}`, `${num(highHeard)} / ${num(inScope.filter((i) => i.level === 'high').length)} data mức Cao đã nghe`, heardCount ? 'good' : '')}
      ${stat('Ghi chú mâu thuẫn', num(a.contradict), 'Ghi chưa nghe máy / KH tắt máy nhưng chọn "Kết nối thành công"', a.contradict ? 'bad' : 'good')}
    </div>
    <div class="toolbar"><h2 class="section-title">Dấu hiệu dùng để xếp mức ưu tiên</h2><p class="muted">Điểm ưu tiên = tổng trọng số các dấu hiệu: từ 4 điểm là Cao, 2–3 điểm là Trung bình, còn lại là Thấp (chỉ vì kết nối không impact).</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Dấu hiệu</th><th scope="col" class="right">Trọng số</th><th scope="col" class="right">Số data</th><th scope="col">Cách dùng</th></tr></thead>
      <tbody>${a.bySignal.map((s) => html`<tr class="static"><td class="sticky-col"><strong>${SIGNALS[s.key].label}</strong></td><td class="right num">${SIGNALS[s.key].weight}</td><td class="right num strong">${num(s.count)}</td><td class="muted">${SIGNALS[s.key].hint}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Tỉ lệ không impact so với trung bình đội (${p1(a.rate)}). Gợi ý: nghe khoảng 5 data mức Cao của mỗi người, bắt đầu từ người có nhiều data Cao nhất.</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Kết nối thành công</th><th scope="col" class="right">Không impact</th><th scope="col" class="right">Tỉ lệ không impact</th><th scope="col" class="right">So với đội</th><th scope="col" class="right">Mức Cao</th><th scope="col" class="right">Trung bình</th><th scope="col" class="right">Ghi chú mâu thuẫn</th><th scope="col">Chấm call</th></tr></thead>
      <tbody>${a.byPerson.map((p) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${nm(p.code, p.name)}</strong>${p.code ? html`<small>${p.code}</small>` : ''}</span></td>
        <td class="right num">${num(p.conn)}</td><td class="right num">${num(p.noImpact)}</td><td class="right num strong">${p1(p.rate)}</td>
        <td class="right">${p.vsTeam == null ? '—' : html`<span class="badge badge--${p.vsTeam > 0.05 ? 'bad' : p.vsTeam < -0.05 ? 'good' : 'warn'}">${p.vsTeam > 0 ? '+' : ''}${(p.vsTeam * 100).toFixed(1).replace('.', ',')} điểm</span>`}</td>
        <td class="right num">${p.high ? html`<span class="badge badge--bad">${num(p.high)}</span>` : '0'}</td><td class="right num">${num(p.mid)}</td><td class="right num">${num(p.contradict)}</td><td>${p.code && ui.hasScores ? html`<button class="link-btn" type="button" data-goto-callctl="${p.code}">Xem →</button>` : ''}</td></tr>`)}</tbody>
    </table></div>
    <div class="toolbar"><h2 class="section-title">Danh sách data nên nghe lại</h2><p class="muted">${num(shownAll.length)} data${shownAll.length > shown.length ? ` (hiển thị ${num(shown.length)} data ưu tiên cao nhất)` : ''}. Dùng Retailer ID và thời gian tương tác để tìm bản ghi âm trong CRM; số điện thoại trong ghi chú được che bớt.</p></div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col">Mức</th><th scope="col" class="sticky-col">Nhân sự</th><th scope="col">Retailer ID</th><th scope="col">Tạo / tương tác</th><th scope="col" class="right">Số cuộc gọi</th><th scope="col">Dấu hiệu</th><th scope="col">Sau khi nghe</th><th scope="col">Ghi chú nhân sự</th></tr></thead>
      <tbody>${shown.map((i) => html`<tr class="static"><td><span class="badge badge--${LEVEL[i.level][0] || 'warn'}">${LEVEL[i.level][1]}</span></td><td class="sticky-col"><strong>${nm(i.code, i.name)}</strong></td>
        <td class="num">${i.r.retailer || '—'}</td><td class="num muted">${dmy(i.r.created)}<br><small>${when(i.r.modifiedTs)}</small></td><td class="right num">${i.r.calls ?? '—'}</td>
        <td>${i.signals.length ? i.signals.map((k) => html`<span class="badge badge--${SIGNALS[k].weight >= 3 ? 'bad' : 'warn'}" title="${SIGNALS[k].hint}">${SIGNALS[k].short}</span> `) : html`<span class="muted">Chỉ vì không impact</span>`}</td>
        <td class="heard-cell">${(() => {
          const h = heardOf(i), r = h && resultOf(h.result);
          return html`<select class="select heard-select ${r ? `heard-select--${r.tone}` : ''}" data-heard-select data-retailer="${i.r.retailer}" data-ts="${i.r.modifiedTs ?? ''}" data-code="${i.code}" data-name="${i.name}" aria-label="Kết quả sau khi nghe lại">
            <option value="">Chưa nghe</option>${RESULTS.map((x) => html`<option value="${x.id}" ${h?.result === x.id ? 'selected' : ''}>${x.label}</option>`)}</select>${h ? html`<small class="muted">${h.by ? h.by.split('@')[0] : ''}${h.at ? ` · ${String(h.at).slice(5, 10).split('-').reverse().join('/')}` : ''}</small>` : ''}`;
        })()}</td>
        <td class="muted cs-note">${maskPhone(i.text).slice(0, 220)}${i.text.length > 220 ? '…' : ''}</td></tr>`)}</tbody>
    </table></div>`;
}
