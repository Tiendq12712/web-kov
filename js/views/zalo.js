import { html } from '../dom.js';
import { num, pct } from '../format.js';
import { analyzeZalo, hotlineStats } from '../zalo.js';
import { chartCard, donutChart, groupedColumns } from './charts.js';

const stat = (title, value, sub, tone = '') => html`<div class="card sla-stat ${tone ? `sla-stat--${tone}` : ''}"><h3 class="card__title">${title}</h3><p class="big num">${value}</p><p class="muted">${sub}</p></div>`;
const TARGET = 0.5;   // mục tiêu % impact của khách liên hệ qua Zalo: trên 50%
const tag = (ok, yesText, noText) => html`<span class="badge badge--${ok ? 'good' : 'warn'}">${ok ? yesText : noText}</span>`;

/** Các dòng của bảng "Từng retailer" (vẽ riêng để ô tìm kiếm chỉ vẽ lại thân bảng, giữ con trỏ gõ). */
const zaloRows = (shown, names) => {
  const jobName = (x) => (x.job ? (names.get(x.code) ?? /^\d+\s*-\s*([^-]+)/.exec(x.job.handler)?.[1]?.trim() ?? x.job.handler) : '—');
  return html`${shown.map((x) => html`<tr><td class="num">${x.retailer}</td><td>${x.name}</td><td>${x.date || '—'}</td><td>${tag(x.accepted, 'Đồng ý', 'Chưa đồng ý')}</td><td>${tag(x.replied, 'Có phản hồi', 'Không phản hồi')}</td>
        <td>${jobName(x)}</td><td>${x.job ? (x.product || '—') : '—'}</td><td>${x.job ? x.source : html`<span class="muted">Không có trong data</span>`}</td><td>${x.job?.status ?? '—'}</td><td>${x.job?.contact || '—'}</td>
        <td>${x.job ? (x.job.impact ? html`<span class="badge badge--good">Có</span>` : html`<span class="badge badge--bad">Không</span>`) : '—'}</td><td>${x.note}</td></tr>`)}`;
};
export function zaloRowsView(data, { names = new Map(), filters = {} } = {}) {
  const a = analyzeZalo(data.zalo, data.detail?.rows ?? [], filters);
  return { rows: zaloRows(a.shown, names), count: Object.values(filters).some((v) => v && v !== 'all') ? `Đang lọc: ${num(a.shown.length)} / ${num(a.total)} retailer` : `${num(a.total)} retailer` };
}

/** Tab "Zalo": tình trạng kết nối Zalo với khách và kết quả impact, đối chiếu retailer ID với data nhân sự. */
/** Thời gian đàm thoại: 1 giờ 02 phút 03 giây → "1:02:03"; dưới một giờ → "5:07". */
const dur = (s) => {
  if (s == null) return '—';
  const t = Math.round(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
const dmyShort = (iso) => iso.split('-').reverse().slice(0, 2).join('/');

/** Báo cáo cuộc gọi hotline: tổng cuộc gọi, kết nối thành công, tỉ lệ, thời gian đàm thoại (tổng, trung bình). */
function hotlineView(hotline) {
  if (!hotline?.calls.length) return '';
  const h = hotlineStats(hotline), a = h.all;
  const tone = a.rate == null ? '' : a.rate >= 0.9 ? 'good' : a.rate >= 0.8 ? 'warn' : 'bad';
  const row = (label, b, strong = false) => html`<tr class="static ${strong ? 'avg-row' : ''}"><td class="sticky-col"><strong>${label}</strong></td><td class="right num">${b.total == null ? '—' : num(b.total)}</td><td class="right num">${num(b.conn)}</td><td class="right num">${pct(b.rate, 1)}</td><td class="right num">${dur(b.talk)}</td><td class="right num">${dur(b.avg)}</td></tr>`;
  return html`
    <div class="toolbar"><h2 class="section-title">Cuộc gọi hotline</h2>
      <p class="muted">Từ ${dmyShort(h.byDay[0].day)} đến ${dmyShort(h.byDay.at(-1).day)}. Tổng cuộc gọi lấy từ bảng "Tổng cuộc gọi" trong tab hotline; kết nối thành công là các cuộc có đàm thoại. Thời gian trung bình tính trên cuộc kết nối thành công.</p></div>
    ${h.inconsistent.length ? html`<p class="notice">Tổng cuộc gọi của ${h.inconsistent.join(', ')} nhỏ hơn số cuộc kết nối trong danh sách; hãy kiểm tra lại bảng tổng.</p>` : ''}
    <div class="grid grid--stats">
      ${stat('Tổng cuộc gọi', a.total == null ? '—' : num(a.total), a.total == null ? 'Chưa đủ tổng cuộc gọi của các khu vực' : h.byRegion.map((r) => `${r.region} ${num(r.total)}`).join(' · '))}
      ${stat('Kết nối thành công', num(a.conn), h.nets.map((x) => `${x.net} ${num(x.n)}`).join(' · '))}
      ${stat('Tỉ lệ kết nối', pct(a.rate, 1), a.total == null ? '—' : `${num(a.conn)} / ${num(a.total)} cuộc gọi`, tone)}
      ${stat('Tổng thời gian đàm thoại', dur(a.talk), 'giờ:phút:giây')}
      ${stat('Trung bình đàm thoại', dur(a.avg), 'phút:giây mỗi cuộc kết nối')}
    </div>
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Khu vực</th><th scope="col" class="right">Tổng cuộc gọi</th><th scope="col" class="right">Kết nối thành công</th><th scope="col" class="right">Tỉ lệ kết nối</th><th scope="col" class="right">Tổng đàm thoại</th><th scope="col" class="right">Trung bình</th></tr></thead>
      <tbody>${h.byRegion.map((r) => row(r.region, r))}</tbody><tfoot>${row('Tất cả', a, true)}</tfoot>
    </table></div>
    ${chartCard('Cuộc kết nối thành công theo ngày', groupedColumns({ categories: h.byDay.map((d) => dmyShort(d.day)), series: [{ name: 'Cuộc kết nối', cls: 's2', values: h.byDay.map((d) => d.conn) }], ratio: false, values: true, format: (v) => String(Math.round(v)) }), 'Chỉ có số cuộc kết nối theo ngày; tổng cuộc gọi trong Sheet chỉ ghi theo khu vực.')}
    <div class="table-wrap"><table class="connect-table">
      <thead><tr><th scope="col" class="sticky-col">Ngày</th><th scope="col" class="right">Kết nối thành công</th><th scope="col" class="right">Tổng đàm thoại</th><th scope="col" class="right">Trung bình</th></tr></thead>
      <tbody>${[...h.byDay].reverse().map((d) => html`<tr class="static"><td class="sticky-col"><strong>${dmyShort(d.day)}</strong></td><td class="right num">${num(d.conn)}</td><td class="right num">${dur(d.talk)}</td><td class="right num">${dur(d.avg)}</td></tr>`)}</tbody>
    </table></div>`;
}

export function zaloView({ zalo, detail }, { names = new Map(), manager = true, filters = {} } = {}) {
  const hot = hotlineView(zalo.hotline);
  if (!zalo.length) return html`${hot}<p class="notice">Sheet "Zalo và hotline" chưa có retailer nào (cần cột Retailer ID và Tình trạng kết nối).</p>`;
  const a = analyzeZalo(zalo, detail?.rows ?? [], filters);
  const g = Object.fromEntries(a.groups.map((x) => [x.key, x]));
  const all = g.all, acc = g.acc, noacc = g.noacc, leaves = [g.acc_rep, g.acc_norep, g.noacc_rep, g.noacc_norep];
  const repN = g.acc_rep.n + g.noacc_rep.n;
  const short = ['Đồng ý · có phản hồi', 'Đồng ý · không phản hồi', 'Chưa đồng ý · có phản hồi', 'Chưa đồng ý · không phản hồi'];
  const opt = (v, label, cur) => html`<option value="${v}" ${v === (cur ?? 'all') ? 'selected' : ''}>${label}</option>`;
  const sel = (key, label, options) => html`<label class="filter"><span>${label}</span><select class="select" data-zf="${key}">${options.map(([v, l]) => opt(v, l, filters[key]))}</select></label>`;
  const active = Object.values(filters).some((v) => v && v !== 'all');   // gồm cả ô tìm kiếm (q)
  const filterBar = html`<div class="filters" role="search" aria-label="Lọc danh sách retailer">
      <label class="filter cs-search"><span>Tìm</span><input id="zalo-q" class="select" type="search" placeholder="Tên gian hàng hoặc Retailer ID…" value="${filters.q ?? ''}" autocomplete="off"></label>
      ${sel('accept', 'Kết nối Zalo', [['all', 'Tất cả'], ['yes', 'Đồng ý kết bạn'], ['no', 'Chưa đồng ý']])}
      ${sel('reply', 'Phản hồi', [['all', 'Tất cả'], ['yes', 'Có phản hồi'], ['no', 'Không phản hồi']])}
      ${manager ? sel('person', 'Nhân sự', [['all', 'Tất cả nhân sự'], ...a.options.persons.map((p) => [p.code, `${names.get(p.code) ?? p.name} (${p.code})`])]) : ''}
      ${sel('product', 'Product', [['all', 'Tất cả product'], ...a.options.products.map((x) => [x, x])])}
      ${sel('source', 'Nguồn data', [['all', 'Tất cả nguồn'], ...a.options.sources.map((x) => [x, x])])}
      ${sel('impact', 'Impact', [['all', 'Tất cả'], ['yes', 'Có impact'], ['no', 'Không impact']])}
      ${active ? html`<button class="link-btn filters__clear" type="button" data-zf-clear>Xóa lọc</button>` : ''}
      <p class="muted" id="zalo-count">${active ? `Đang lọc: ${num(a.shown.length)} / ${num(a.total)} retailer` : `${num(a.total)} retailer`}</p>
    </div>`;
  const nm = (p) => names.get(p.code) ?? p.name;
  const tone = (r) => (r == null ? '' : r > TARGET ? 'good' : r >= TARGET * 0.8 ? 'warn' : 'bad');
  const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
  return html`${hot}
    <div class="toolbar"><h2 class="section-title">Kết nối Zalo với khách</h2>
      <p class="muted">Các retailer nhân sự đã kết bạn Zalo (Sheet "Zalo và hotline"), đối chiếu theo Retailer ID với data nhân sự: ca mới nhất của retailer đó trong data.</p></div>
    <details class="card" open><summary><strong>Impact là gì?</strong></summary>
      <p>Impact là cột <strong>KH SC tác động</strong> trong data nhân sự: sau cuộc liên hệ, khách có chuyển biến mà SC ghi nhận được (dùng thêm tính năng, kích hoạt dịch vụ…). Ca <strong>có impact</strong> nghĩa là liên hệ tạo ra tác động; ca <strong>không impact</strong> là liên hệ được nhưng chưa tạo thay đổi.</p>
      <p class="muted">% Impact ở đây = số ca có impact / số ca đã làm. Mục tiêu của khách liên hệ qua Zalo là trên 50% (xanh khi trên 50%, cam từ 40%, đỏ thấp hơn).</p></details>
    <div class="grid grid--stats">
      ${stat('Retailer kết bạn Zalo', num(all.n), `${num(all.found)} có trong data nhân sự${a.missing.length ? ` · ${num(a.missing.length)} không thấy` : ''}`)}
      ${stat('Đồng ý kết bạn', pct(all.n ? acc.n / all.n : null), `${num(acc.n)} / ${num(all.n)} retailer`, 'good')}
      ${stat('Có phản hồi', pct(all.n ? repN / all.n : null), `${num(repN)} / ${num(all.n)} retailer (cả đồng ý và chưa đồng ý)`, 'good')}
      ${stat('Có impact', num(all.impactDone), `${pct(all.impactRate)} trên ${num(all.done)} ca đã làm`, tone(all.impactRate))}
    </div>
    <div class="charts">
      ${chartCard('1. Khách đã đồng ý kết bạn chưa?', donutChart({ segments: [{ label: 'Đồng ý kết bạn', value: acc.n, cls: 's2' }, { label: 'Chưa đồng ý', value: noacc.n, cls: 's4' }], center: { value: num(all.n), label: 'retailer' } }), 'Hai tình trạng cộng lại là 100% số retailer.')}
      ${chartCard('2. Trong mỗi tình trạng, khách có phản hồi không?', groupedColumns({ categories: ['Đồng ý kết bạn', 'Chưa đồng ý kết bạn'], series: [{ name: 'Có phản hồi', cls: 's2', values: [g.acc_rep.n, g.noacc_rep.n] }, { name: 'Không phản hồi', cls: 's3', values: [g.acc_norep.n, g.noacc_norep.n] }], ratio: false, values: true, format: (v) => String(Math.round(v)) }), 'Số retailer. Cột có phản hồi + không phản hồi = số retailer của tình trạng đó.')}
      ${chartCard('3. Số ca đã làm: có impact và không impact', groupedColumns({ categories: short, series: [{ name: 'Có impact', cls: 's2', values: leaves.map((x) => x.impactDone) }, { name: 'Đã làm nhưng không impact', cls: 's3', values: leaves.map((x) => x.done - x.impactDone) }], ratio: false, values: true, format: (v) => String(Math.round(v)) }), 'Số ca đã làm của bốn nhóm, tách ca có và không có impact.')}
      ${chartCard('4. % Impact của từng nhóm', groupedColumns({ categories: short, series: [{ name: '% Impact = ca có impact / ca đã làm của chính nhóm đó', cls: 's2', values: leaves.map((x) => x.impactRate ?? 0) }], values: true, valueFormat: (v) => pct(v), line: TARGET, lineLabel: 'Mục tiêu trên 50%' }), 'Mỗi cột là tỷ lệ impact bên trong nhóm đó (không phải tỷ trọng của nhóm), nên các cột không cộng lại thành 100%. Vạch ngang là mục tiêu trên 50%.')}
    </div>
    <h3 class="section-title">Zalo có giúp tăng impact không?</h3>
    <div class="table-wrap"><table class="data-table zalo-tree"><thead><tr><th>Nhóm</th><th class="right">Retailer</th><th class="right">Đã làm</th><th class="right">Kết nối thành công</th><th class="right">Có impact (trong ca đã làm)</th><th class="right">% Impact (có impact / đã làm)</th></tr></thead>
      <tbody>${a.groups.map((x) => html`<tr class="${x.key === 'all' ? 'z-all' : x.key.startsWith('acc') ? (x.leaf ? 'z-acc-leaf z-leaf' : 'z-acc') : (x.leaf ? 'z-noacc-leaf z-leaf' : 'z-noacc')}"><td style="padding-left:${12 + x.level * 22}px">${x.level === 2 ? '↳ ' : ''}${x.level === 1 ? html`<span class="badge badge--${x.key === 'acc' ? 'good' : 'warn'}">${x.label}</span>` : html`<strong>${x.label}</strong>`}</td><td class="right num">${num(x.n)}</td><td class="right num">${num(x.done)}</td><td class="right num">${num(x.conn)}</td><td class="right num">${num(x.impactDone)}</td><td class="right num">${x.done ? html`<span class="badge badge--${tone(x.impactRate) || 'warn'}">${pct(x.impactRate)}</span> <small class="muted">(${num(x.impactDone)}/${num(x.done)})</small>` : '—'}</td></tr>`)}</tbody></table></div>
    <p class="muted">Cách đọc: nhóm xanh là khách đồng ý kết bạn, nhóm cam là khách chưa đồng ý; nhãn % xanh khi đạt mục tiêu trên 50%, cam từ 40%, đỏ thấp hơn. Khách <strong>đồng ý kết bạn</strong> có ${pct(acc.impactRate)} ca đã làm có impact, khách <strong>chưa đồng ý</strong> là ${pct(noacc.impactRate)}. Hai nhóm phản hồi bên trong mỗi tình trạng cộng lại bằng đúng nhóm cha của nó. Số retailer còn ít (${num(all.n)}), cần thêm dữ liệu trước khi kết luận.</p>
    ${manager ? html`<h3 class="section-title">Theo nhân sự</h3>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Nhân sự</th><th class="right">Retailer</th><th class="right">Đồng ý kết bạn</th><th class="right">Có phản hồi</th><th class="right">Đã làm</th><th class="right">Có impact</th><th class="right">% Impact</th></tr></thead>
      <tbody>${a.people.map((p) => html`<tr><td>${nm(p)} <small class="muted">${p.code}</small></td><td class="right num">${num(p.n)}</td><td class="right num">${num(p.accepted)}</td><td class="right num">${num(p.replied)}</td><td class="right num">${num(p.done)}</td><td class="right num">${num(p.impact)}</td><td class="right num">${pct(p.impactRate)}</td></tr>`)}</tbody></table></div>` : ''}
    <h3 class="section-title">Từng retailer</h3>
    ${filterBar}
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Retailer ID</th><th>Gian hàng</th><th>Ngày kết bạn</th><th>Kết nối Zalo</th><th>Phản hồi</th><th>Nhân sự</th><th>Product</th><th>Nguồn data</th><th>Xử lý</th><th>Liên hệ</th><th>Impact</th><th>Ghi chú</th></tr></thead>
      <tbody id="zalo-rows">${zaloRows(a.shown, names)}</tbody></table></div>`;
}
