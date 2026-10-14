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
export function timesheetView(report, code) {
  const sheet = report?.timesheets?.[code];
  if (!sheet?.rows.length) return '';
  const [y, mo] = (report.month ?? '').split('-').map(Number);
  const lastIdx = sheet.rows.findLastIndex((r) => r.mark || r.note || r.calls);
  const rows = sheet.rows.slice(0, lastIdx + 1);
  if (!rows.length) return '';
  const counted = sumWeights(rows);
  const total = sheet.total ?? counted;
  const weekday = (day) => (y && mo ? WEEKDAYS[new Date(y, mo - 1, day).getDay()] : '');
  const off = (day) => ['CN'].includes(weekday(day));
  return html`
    <details class="card timesheet">
      <summary><strong>Chi tiết ngày công</strong> <span class="badge badge--good">${num(total)} ngày</span></summary>
      <p class="muted">Đối chiếu ngày công của bạn: <strong>X</strong> = 1 ngày, <strong>X/2</strong> = nửa ngày, để trống = không tính công.
        Thấy chưa đúng? <button class="link-btn" type="button" data-tab="chat">Báo cho quản lý</button></p>
      <div class="table-wrap"><table class="timesheet__table">
        <thead><tr><th>Ngày</th><th>Thứ</th><th class="right">Công</th><th>Ghi chú</th><th class="right">Call</th><th class="right">Talktime</th></tr></thead>
        <tbody>${rows.map((r) => html`
          <tr class="static ${r.weight ? 'is-work' : 'is-off'} ${off(r.day) ? 'is-weekend' : ''}">
            <td class="num">${r.day}${y && mo ? `/${mo}` : ''}</td>
            <td>${weekday(r.day)}</td>
            <td class="right"><strong class="timesheet__mark" title="${MARKS[r.mark] ?? ''}">${r.mark || '—'}</strong>${r.weight ? html` <span class="muted">(${num(r.weight)})</span>` : ''}</td>
            <td>${r.note || ''}</td>
            <td class="right num">${r.calls ? num(r.calls) : '—'}</td>
            <td class="right num">${r.talk ? hm(r.talk) : '—'}</td>
          </tr>`)}</tbody>
        <tfoot><tr><td colspan="2"><strong>Tổng công</strong></td><td class="right"><strong>${num(total)}</strong></td>
          <td colspan="3" class="muted">${Math.abs(counted - total) > 0.01 ? `Tự cộng từ bảng: ${num(counted)} (khác tổng trong Sheet)` : 'Khớp với tổng trong Sheet'}</td></tr></tfoot>
      </table></div>
    </details>`;
}
