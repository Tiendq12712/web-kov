import { computeSla } from './sla.js';
import { memberStatus, elapsedRatio } from './metrics.js';
import { pct } from './format.js';

const TARGET_CINFO = 0.9;
const dm = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');
const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** Số ngày làm việc đã qua (trước ngày số liệu, không tính Chủ nhật) mà ô công còn trống trong bảng công. */
function unpaidDays(report, code, asOf) {
  const rows = report?.timesheets?.[code]?.rows;
  if (!rows || !report.month) return 0;
  const [y, m] = report.month.split('-').map(Number);
  const last = asOf && asOf.startsWith(report.month) ? Number(asOf.slice(8, 10)) - 1 : 31;   // tháng đã qua: tính cả tháng
  return rows.filter((r) => r.day <= last && !r.mark && new Date(y, m - 1, r.day).getMonth() === m - 1 && new Date(y, m - 1, r.day).getDay() !== 0).length;
}

/**
 * "Việc cần làm hôm nay": gom các việc nhân sự (hoặc quản lý) nên xử lý, mỗi việc có nút đi tới đúng chỗ.
 * item = { tone: 'bad' | 'warn' | 'info', count, text, hint, tab?, timesheet? }.
 * Trả về [] nếu không có gì (view sẽ hiện lời chúc mừng).
 */
export function buildTodo({ me, found, data, report, pbi, unread, control, alerts = [], sla: slaIn = null }) {
  const asOf = data.teams.map((t) => t.asOf).sort().at(-1);
  const sla = slaIn ?? computeSla(data.work, asOf, data.month);   // slaIn: SLA tính từ data chi tiết (chính xác hơn bảng tồn khi chưa kịp đồng bộ)
  const items = [];
  const push = (item) => items.push(item);
  const manager = me.role !== 'member';
  const elapsed = asOf ? elapsedRatio(asOf) : 0;
  const underTalk = (m) => m.talk?.target > 0 && (m.talk.actual ?? 0) < m.talk.target * elapsed;   // talktime thấp hơn mức cần có theo tiến độ tháng

  if (manager) {
    if (asOf && asOf < todayIso()) push({ tone: 'warn', count: null, text: `Số liệu chưa được cập nhật hôm nay (lần cuối ${dm(asOf)})`, hint: 'Chạy Đồng bộ CRM trong Thiết lập', tab: 'settings' });
    if (sla?.totals.late) push({ tone: 'bad', count: sla.totals.late, text: 'data đã trễ SLA', hint: `${sla.rows.filter((r) => r.late).length} nhân sự đang giữ`, tab: 'sla' });
    if (sla?.totals.soon) push({ tone: 'warn', count: sla.totals.soon, text: 'data sắp trễ SLA', hint: `${sla.rows.filter((r) => r.soon).length} nhân sự đang giữ`, tab: 'sla' });
    const slow = data.teams.flatMap((t) => t.members.filter((m) => memberStatus(m, t).key === 'bad'));
    if (slow.length) push({ tone: 'bad', count: slow.length, text: 'nhân sự KPI chậm tiến độ', hint: 'Dưới 70% mức thời gian đã qua', tab: 'overview' });
    for (const a of alerts) push(a);   // cảnh báo tự động theo ngưỡng (nhân sự không nghe máy / không impact / SLA / lỗi / call cần chấn chỉnh)
    if (control?.flaggedCount) push({ tone: 'warn', count: control.flaggedCount, text: 'data đã làm chưa đúng quy trình', hint: `Kiểm soát: ${control.people.filter((p) => p.flagged).length} nhân sự có lỗi · tỉ lệ lỗi ${pct(control.errRate, 1)}`, tab: 'control' });
    const lowTalk = data.teams.flatMap((t) => t.members.filter(underTalk));
    if (lowTalk.length) push({ tone: 'warn', count: lowTalk.length, text: 'nhân sự talktime thấp hơn tiến độ tháng', hint: 'Talktime thực tế dưới mức cần có theo ngày đã qua', tab: 'report' });
    if (pbi) {
      const by = new Map();
      for (const a of pbi.acts) { const c = by.get(a.code) ?? { t: 0, n: 0 }; c.t += 1; c.n += a.used ? 0 : 1; by.set(a.code, c); }
      const low = [...by.values()].filter((c) => c.t && 1 - c.n / c.t < TARGET_CINFO).length;
      if (low) push({ tone: 'warn', count: low, text: 'nhân sự dùng Customer Info dưới mục tiêu', hint: `Mục tiêu ${pct(TARGET_CINFO)}`, tab: 'cinfo' });
    }
  } else if (found) {
    const mine = sla?.rows.find((r) => r.code === found.member.code);
    if (mine?.late) push({ tone: 'bad', count: mine.late, text: 'data đã trễ SLA', hint: 'Quá 7 ngày chưa xử lý xong — ưu tiên xử lý trước', tab: 'sla' });
    if (mine?.soon) push({ tone: 'warn', count: mine.soon, text: 'data sắp trễ SLA', hint: 'Còn tối đa 2 ngày là tới hạn', tab: 'sla' });
    const mineCtl = control?.people.find((p) => p.code === found.member.code);
    if (mineCtl?.flagged) push({ tone: 'warn', count: mineCtl.flagged, text: 'data đã làm chưa đúng quy trình', hint: `Xem chi tiết từng lỗi trong Kiểm soát (tỉ lệ lỗi ${pct(mineCtl.errRate, 1)})`, tab: 'control' });
    if (underTalk(found.member)) push({ tone: 'warn', count: null, text: 'Talktime đang thấp hơn tiến độ tháng', hint: 'Cần gọi thêm để kịp chỉ tiêu talktime', tab: 'report' });
    const noPay = unpaidDays(report, found.member.code, asOf);
    if (noPay) push({ tone: 'info', count: noPay, text: 'ngày làm việc đã qua chưa có công', hint: 'Ô công trống (không tính Chủ nhật) — kiểm tra bảng công, báo quản lý nếu thiếu', timesheet: `${found.team.id}:${found.member.code}` });
    if (pbi) {
      const own = pbi.acts.filter((a) => a.code === found.member.code);
      const not = own.filter((a) => !a.used).length;
      if (not) push({ tone: 'warn', count: not, text: 'act chưa dùng Customer Info', hint: `Tỉ lệ dùng hiện ${pct(1 - not / own.length, 1).replace('.', ',')}, mục tiêu ${pct(TARGET_CINFO)}`, tab: 'cinfo' });
    }
    const status = memberStatus(found.member, found.team);
    if (status.key !== 'good') push({ tone: status.key === 'bad' ? 'bad' : 'warn', count: null, text: `KPI ${pct(found.member.kpi, 1)} đang chậm hơn tiến độ tháng (${pct(elapsedRatio(found.team.asOf))})`, hint: 'Cần hỗ trợ? Chia sẻ với quản lý', tab: 'chat' });
  }
  if (unread) push({ tone: 'info', count: unread, text: 'tin nhắn chưa đọc', hint: 'Trong mục Chia sẻ', tab: 'chat' });
  return items;
}
