import { html } from '../dom.js';
import { num, pct, hm } from '../format.js';
import { badge } from './components.js';
import { chartCard, lineChart } from './charts.js';
import { analyzeConnect, SHORT_OPTIONS, LONG_OPTIONS } from '../connect.js';

const sec = (s) => {
  if (s == null) return '—';
  const total = Math.round(s), m = Math.floor(total / 60), r = total % 60;
  return m ? (r ? `${m}p${String(r).padStart(2, '0')}s` : `${m}p`) : `${r}s`;
};
const STATUS = { short: ['bad', 'Ngắn'], mid: ['warn', 'Trung bình'], long: ['good', 'Dài'] };
const stat = (title, value, sub) => html`<div class="card"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;

/** Trang "Chất lượng kết nối" (quản lý): tỉ lệ kết nối thành công và thời gian đàm thoại ngắn / trung bình / dài. */
export function connectView(report, ui, names) {
  const nameOf = (m) => names.get(m.code) ?? m.name;
  const a = analyzeConnect(report, ui);
  const { totals, buckets } = a;
  const bucketTotal = buckets.short.success + buckets.mid.success + buckets.long.success;
  const share = (b) => (bucketTotal ? buckets[b].success / bucketTotal : 0);
  const option = (list, current) => list.map((v) => html`<option value="${v}" ${v === current ? 'selected' : ''}>${sec(v)}</option>`);
  const rows = [...a.rows].sort((x, y) => (y.shortShare ?? -1) - (x.shortShare ?? -1));
  return html`
    <div class="toolbar">
      <h2 class="section-title">Chất lượng cuộc gọi kết nối</h2>
      <p class="muted">Cuộc gọi kết nối thành công nhưng đàm thoại ngắn: dấu hiệu khách bắt máy nhưng không muốn trao đổi.</p>
    </div>
    <div class="filters" aria-label="Bộ lọc phân tích">
      <div class="filter"><span>Khu vực</span><div class="chips" role="group">${[['all', 'Tất cả'], ['nam', report.regions.nam], ['bac', report.regions.bac]].map(([id, label]) => html`
        <button class="chip" type="button" data-cregion="${id}" aria-pressed="${id === ui.region}">${label}</button>`)}</div></div>
      <label class="filter"><span>Ngắn: dưới</span><select id="connect-short" class="select">${option(SHORT_OPTIONS, ui.shortSec)}</select></label>
      <label class="filter"><span>Dài: từ</span><select id="connect-long" class="select">${option(LONG_OPTIONS, ui.longSec)}</select></label>
    </div>
    <div class="grid">
      ${stat('Tổng call', num(totals.calls), `${totals.people} nhân sự`)}
      ${stat('Kết nối thành công', num(totals.success), `Tỉ lệ ${pct(totals.rate ?? 0, 1)}`)}
      ${stat('Đàm thoại TB / call kết nối', sec(totals.avg), `Tổng talktime ${hm(totals.talk)}`)}
      ${stat('Call kết nối ngắn', pct(a.shortShare, 1), `${num(buckets.short.success)} call · dưới ${sec(ui.shortSec)}`)}
    </div>
    <section class="card"><h3 class="card__title">Phân bố call kết nối theo thời gian đàm thoại</h3>
      <div class="stack stack--big" role="img" aria-label="Phân bố call kết nối">
        ${['short', 'mid', 'long'].map((b, i) => html`<span class="stack__seg s${[4, 1, 2][i]}" style="flex:${Math.max(buckets[b].success, 0.0001)}" title="${STATUS[b][1]}: ${num(buckets[b].success)} call (${pct(share(b), 1)})"></span>`)}
      </div>
      <ul class="legend">${['short', 'mid', 'long'].map((b, i) => html`<li><i class="swatch s${[4, 1, 2][i]}"></i><strong>${STATUS[b][1]}</strong> ${b === 'short' ? `dưới ${sec(ui.shortSec)}` : b === 'long' ? `từ ${sec(ui.longSec)}` : `${sec(ui.shortSec)} – ${sec(ui.longSec)}`}: ${num(buckets[b].success)} call (${pct(share(b), 1)}) · ${num(buckets[b].days)} người-ngày</li>`)}</ul>
      <p class="muted">File năng suất chỉ có tổng theo ngày, nên mỗi người-ngày được xếp nhóm theo đàm thoại TB/call kết nối của ngày đó và toàn bộ call kết nối của ngày được tính vào nhóm này.</p>
    </section>
    <section class="card"><h3 class="card__title">Gợi ý hành động</h3>
      <ul class="advice">${a.advice.map((x) => html`<li class="advice--${x.tone}">${x.text}</li>`)}</ul></section>
    <div class="toolbar"><h2 class="section-title">Theo nhân sự</h2><p class="muted">Xếp theo tỉ lệ call kết nối ngắn cao nhất</p></div>
    <div class="table-wrap"><table class="connect-table sortable">
      <thead><tr><th scope="col" class="sticky-col">Nhân sự</th><th scope="col" class="right">Tổng call</th><th scope="col" class="right">Kết nối</th><th scope="col" class="right">Tỉ lệ kết nối</th>
        <th scope="col" class="right">TB đàm thoại / call</th><th scope="col" class="right">So với team</th><th scope="col" class="right">Call ngắn</th><th scope="col" class="right">Tỉ lệ ngắn</th><th scope="col" class="right">Ngày ngắn</th><th scope="col">Đánh giá</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="static"><td class="sticky-col"><span class="person"><strong>${nameOf(r)}</strong><small>${r.code}</small></span></td>
        <td class="right num">${num(r.calls)}</td><td class="right num">${num(r.success)}</td><td class="right num">${r.rate == null ? '—' : pct(r.rate, 1)}</td>
        <td class="right num">${sec(r.avg)}</td>
        <td class="right num ${r.vsTeam == null ? '' : r.vsTeam >= 0 ? 'talk-ok' : 'talk-bad'}">${r.vsTeam == null ? '—' : `${r.vsTeam >= 0 ? '+' : '−'}${Math.round(Math.abs(r.vsTeam) * 100)}%`}</td>
        <td class="right num">${num(r.own.short.success)}</td><td class="right num strong ${r.shortShare != null && r.shortShare >= 0.3 ? 'talk-bad' : ''}">${r.shortShare == null ? '—' : pct(r.shortShare, 1)}</td>
        <td class="right num">${r.own.short.days}/${r.own.short.days + r.own.mid.days + r.own.long.days}</td>
        <td>${r.status ? badge(STATUS[r.status][0], STATUS[r.status][1]) : '—'}</td></tr>`)}</tbody>
    </table></div>
    ${a.daily.length > 1 ? chartCard('Tỉ lệ kết nối theo ngày', lineChart({ labels: a.daily.map((d) => String(d.day)), series: [{ name: 'Tỉ lệ kết nối', cls: 's1', values: a.daily.map((d) => d.rate) }], format: (v) => pct(v) }), 'Toàn team, theo từng ngày trong tháng.') : ''}
    ${a.daily.length > 1 ? chartCard('Đàm thoại TB / call kết nối theo ngày', lineChart({ labels: a.daily.map((d) => String(d.day)), series: [{ name: 'Giây / call', cls: 's3', values: a.daily.map((d) => Math.round(d.avg)) }], format: (v) => sec(v) }), 'Ngày nào thấp bất thường: khả năng cao là chất lượng data hoặc khung giờ gọi.') : ''}`;
}
