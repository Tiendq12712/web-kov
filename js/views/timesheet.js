import { html } from '../dom.js';
import { num, hm } from '../format.js';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MARKS = { X: 'Làm cả ngày', 'X/2': 'Làm nửa ngày' };

/** Số ngày công tự cộng từ các dòng (X = 1, X/2 = 0,5) để đối chiếu với tổng ghi trong Sheet. */
const sumWeights = (rows) => rows.reduce((a, r) => a + r.weight, 0);

/**
 * Bảng công của một nhân sự (bảng đầu tiên bên trái trong file năng suất), để nhân sự đối chiếu ngày công.
 * Chỉ hiện các ngày tới ngày có dữ liệu gần nhất; ngày trống trước đó nghĩa là chưa được chấm công.
 */
export function timesheetView(report, code, talkTarget = 0) {
  const sheet = report?.timesheets?.[code];
  if (!sheet?.rows.length) return '';
  const [y, mo] = (report.month ?? '').split('-').map(Number);
  const lastIdx = sheet.rows.findLastIndex((r) => r.mark || r.note || r.calls);
  const rows = sheet.rows.slice(0, lastIdx + 1);
  if (!rows.length) return '';
  const counted = sumWeights(rows);
  const total = sheet.total ?? counted;
  const weekday = (day) => (y && mo ? WEEKDAYS[new Date(y, mo - 1, day).getDay()] : '');
  // Talktime của ngày đạt khi ≥ chỉ tiêu/ngày (X = đủ chỉ tiêu, X/2 = nửa chỉ tiêu); ngày không có công thì không đánh giá.
  const talkClass = (r) => (talkTarget > 0 && r.weight > 0 ? ((r.talk ?? 0) >= talkTarget * Math.min(r.weight, 1) ? 'talk-ok' : 'talk-bad') : '');
  const need = (r) => (talkTarget > 0 && r.weight > 0 ? talkTarget * Math.min(r.weight, 1) : 0);
  const diffOf = (r) => (need(r) ? (r.talk ?? 0) - need(r) : null);
  const diffs = rows.map(diffOf).filter((d) => d != null);
  const diffTotal = diffs.reduce((a, b) => a + b, 0);
  const signed = (sec) => (Math.round(Math.abs(sec) / 60) === 0 ? '0p' : `${sec > 0 ? '+' : '−'}${hm(Math.abs(sec))}`);
  const diffClass = (d) => (d == null ? '' : d >= 0 ? 'talk-ok' : 'talk-bad');
  const callTotal = rows.reduce((a, r) => a + (r.calls ?? 0), 0), talkTotal = rows.reduce((a, r) => a + (r.talk ?? 0), 0);
  const off = (day) => ['CN'].includes(weekday(day));
  return html`
    <details class="card timesheet">
      <summary><strong>Chi tiết ngày công</strong> <span class="badge badge--good">${num(total)} ngày</span></summary>
      <p class="muted">Đối chiếu ngày công của bạn: <strong>X</strong> = 1 ngày, <strong>X/2</strong> = nửa ngày, để trống = không tính công.${talkTarget > 0 ? html` Talktime: <strong class="talk-ok">xanh</strong> = đạt chỉ tiêu ngày (X/2 tính nửa chỉ tiêu), <strong class="talk-bad">đỏ</strong> = chưa đạt.` : ''}
        Thấy chưa đúng? <button class="link-btn" type="button" data-tab="chat">Báo cho quản lý</button></p>
      <div class="table-wrap"><table class="timesheet__table sortable">
        <thead><tr><th>Ngày</th><th>Thứ</th><th class="right">Công</th><th>Ghi chú</th><th class="right">Call</th><th class="right">Talktime</th>${talkTarget > 0 ? html`<th class="right" title="Talktime trừ chỉ tiêu của ngày (X/2 tính nửa chỉ tiêu)">Thừa/thiếu</th>` : ''}</tr></thead>
        <tbody>${rows.map((r) => html`
          <tr class="static ${r.weight ? 'is-work' : 'is-off'} ${off(r.day) ? 'is-weekend' : ''}">
            <td class="num">${r.day}${y && mo ? `/${mo}` : ''}</td>
            <td>${weekday(r.day)}</td>
            <td class="right"><strong class="timesheet__mark" title="${MARKS[r.mark] ?? ''}">${r.mark || '—'}</strong>${r.weight ? html` <span class="muted">(${num(r.weight)})</span>` : ''}</td>
            <td class="timesheet__note" title="${r.note || ''}">${r.note || ''}</td>
            <td class="right num">${r.calls ? num(r.calls) : '—'}</td>
            <td class="right num ${talkClass(r)}" ${talkTarget > 0 && r.weight > 0 ? html`title="Chỉ tiêu ${hm(talkTarget * Math.min(r.weight, 1))}"` : ''}>${r.talk ? hm(r.talk) : '—'}</td>
            ${talkTarget > 0 ? html`<td class="right num ${diffClass(diffOf(r))}">${diffOf(r) == null ? '' : signed(diffOf(r))}</td>` : ''}
          </tr>`)}</tbody>
        <tfoot><tr><td colspan="2"><strong>Tổng</strong></td><td class="right"><strong>${num(total)}</strong></td><td></td>
          <td class="right num"><strong>${num(callTotal)}</strong></td><td class="right num"><strong>${talkTotal ? hm(talkTotal) : '—'}</strong></td>
          ${talkTarget > 0 ? html`<td class="right num ${diffClass(diffTotal)}"><strong>${signed(diffTotal)}</strong></td>` : ''}</tr></tfoot>
      </table></div>
      ${talkTarget > 0 && diffs.length ? html`<p class="timesheet__sum ${diffClass(diffTotal)}">${diffTotal < 0 ? html`Còn thiếu <strong>${hm(-diffTotal)}</strong> talktime so với chỉ tiêu các ngày đã có công — cần chạy thêm để đạt mốc KPI.` : html`Đã vượt chỉ tiêu <strong>${hm(diffTotal)}</strong> talktime các ngày đã có công. Cứ giữ nhịp nhé!`}</p>` : ''}
      <p class="muted">${Math.abs(counted - total) > 0.01 ? `Tổng công tự cộng từ bảng: ${num(counted)} (khác tổng trong Sheet).` : 'Tổng công khớp với tổng trong Sheet.'}</p>
    </details>`;
}
