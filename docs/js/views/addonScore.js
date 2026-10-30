import { html } from '../dom.js';
import { num } from '../format.js';
import { TYPES, FULL } from '../addonScore.js';

const reasonOf = (x) => {
  if (x.missing) return 'Không có trong báo cáo PBI (thiếu retailer) → mặc định trừ đủ';
  if (x.type === 'kship') return [x.status || 'Chưa có trạng thái', x.cause].filter(Boolean).join(' · ');
  if (x.type === 'payment') return x.registered ? `Đăng ký ${x.registered} · ${x.digi || 0} ngày có giao dịch` : `Chưa đăng ký · ${x.digi || 0} ngày có giao dịch`;
  return x.einvoice ? `${x.einvoice} hóa đơn điện tử` : 'Chưa phát sinh hóa đơn';
};

/** Thẻ "Điểm Add-on thực đạt" của một nhân sự: theo từng loại và danh sách act chưa đủ điểm. Không có dữ liệu thì không hiện. */
export function addonScoreCard(m) {
  const a = m.addonScore;
  if (!a) return '';
  const lost = a.rows.filter((x) => x.lost > 0).sort((x, y) => y.lost - x.lost || x.date.localeCompare(y.date));
  return html`
    <section class="card card--wide">
      <div class="card__head"><h3 class="card__title">Điểm Add-on thực đạt</h3></div>
      <p class="muted">${a.missing ? `${a.missing} act thiếu retailer trong báo cáo PBI, đã trừ đủ ${FULL}đ. ` : ''}KPI tính đủ ${FULL}đ cho mỗi act; phần chưa đạt được trừ khỏi Add-on (Sheet KPI: ${num(a.sheetDone)} → ${num(m.addon.done)}).</p>
      <div class="addon-score-grid"><div>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Loại</th><th scope="col" class="right">Act</th><th scope="col" class="right">Thực đạt</th><th scope="col" class="right">Không đạt</th></tr></thead>
        <tbody>${Object.entries(TYPES).filter(([t]) => a.byType[t].acts).map(([t, info]) => html`
          <tr class="static"><td>${info.short}</td><td class="right num">${a.byType[t].acts}</td><td class="right num">${num(a.byType[t].earned)}/${num(a.byType[t].acts * FULL)}</td><td class="right num ${a.byType[t].lost ? 'addon-lost' : 'is-done'}">${a.byType[t].lost ? `−${num(a.byType[t].lost)}` : '✓'}</td></tr>`)}
          <tr class="static avg-row"><td><strong>Tổng</strong></td><td class="right num">${a.acts}</td><td class="right num">${num(a.earned)}/${num(a.acts * FULL)}</td><td class="right num ${a.lost ? 'addon-lost' : 'is-done'}">${a.lost ? `−${num(a.lost)}` : '✓'}</td></tr>
        </tbody></table></div></div>
      <div>${lost.length ? html`
        <h4 class="card__subtitle">Act chưa đủ ${FULL}đ (${lost.length})</h4>
        <ul class="addon-lost-list">${lost.map((x) => html`<li><strong>${TYPES[x.type].short}</strong> · KH ${x.retailer || '—'} · ${x.date || '—'} <span class="addon-lost">${x.points}/${FULL}đ</span>${x.missing ? html` <span class="badge badge--bad">Thiếu retailer</span>` : ''}<br><small class="muted">${reasonOf(x)}</small></li>`)}</ul>` : html`<p class="muted">Tất cả act đều đạt đủ điểm.</p>`}</div></div>
    </section>`;
}
