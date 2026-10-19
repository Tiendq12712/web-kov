/**
 * Kiểm soát data của nhân sự theo Quy trình ONLINE và Quy định xử lý vi phạm (mục 5.1.1):
 * số cuộc gọi tối thiểu, mô tả/thông tin ghi nhận, ticket, tính năng tư vấn và tiến độ SLA.
 * Chỉ kiểm tra data "Đã làm" (data đã chuyển sang hoàn tất).
 */
import { classify } from './slaDetail.js';

/** Số cuộc gọi tối thiểu trước khi chuyển "Đã làm" (Quy trình 4.6.1). */
const MIN_CALLS = { 'Không nghe máy': 3, 'Thuê bao': 2, 'Sai số': 1, 'Hẹn liên hệ sau': 3, 'Kết nối thành công': 1 };
const TICKET_TASK = /ticket|chuyển sale|chuyển lead/i;
const HAS_TICKET = /TT\d+|ticket\s*[:#-]?\s*\d+|\b\d{6,}\b/i;
const HAS_DATE = /\b\d{1,2}\s*[\/.-]\s*\d{1,2}\b/;

export const RULES = [
  { id: 'calls', label: 'Chưa gọi đủ số cuộc gọi theo quy định', penalty: '1%', hint: 'Không nghe máy ≥ 3 cuộc, thuê bao ≥ 2, sai số ≥ 1, hẹn liên hệ sau ≥ 3 (2 lần gọi lại, không tính cuộc đầu), kết nối thành công ≥ 1 trước khi chuyển "Đã làm".',
    test: (r) => { const need = MIN_CALLS[r.contact]; return need != null && r.calls != null && r.calls < need ? `${r.contact}: ${r.calls}/${need} cuộc` : ''; } },
  { id: 'nocontact', label: 'Đã làm nhưng chưa ghi tình trạng liên hệ', penalty: '5%', hint: 'Ghi nhận sai/thiếu thông tin bắt buộc trên hệ thống.',
    test: (r) => (!r.contact ? 'Thiếu tình trạng liên hệ' : '') },
  { id: 'desc', label: 'Mô tả thiếu hoặc sơ sài', penalty: '5%', hint: 'Mô tả phải có ngày liên hệ, nội dung trao đổi và quá trình hỗ trợ.',
    test: (r) => (r.desc.replace(/\s+/g, ' ').length < 25 ? 'Mô tả quá ngắn hoặc trống' : !HAS_DATE.test(r.desc) ? 'Mô tả không ghi ngày liên hệ' : '') },
  { id: 'ticket', label: 'Công việc có ticket nhưng mô tả không ghi số ticket', penalty: '5%', hint: 'Khi tạo hoặc chuyển ticket phải ghi số ticket trong mô tả.',
    test: (r) => (r.tasks.some((t) => TICKET_TASK.test(t)) && !HAS_TICKET.test(r.desc) ? 'Có ticket/chuyển nhưng không có số ticket' : '') },
  { id: 'feature', label: 'Tư vấn tính năng nhưng thiếu nhóm tính năng / tính năng', penalty: '5%', hint: 'Bắt buộc chọn Nhóm tính năng và Tính năng đúng thực tế đã tư vấn.',
    test: (r) => (r.tasks.some((t) => /tư vấn tính năng/i.test(t)) && (!r.feature || !r.featureGroup) ? 'Thiếu nhóm tính năng hoặc tính năng' : '') },
  { id: 'reason', label: 'Kết nối thành công nhưng chưa ghi nguyên nhân', penalty: 'Tham khảo', hint: 'Nên ghi nguyên nhân khi khách chưa dùng hoặc có vướng mắc (chỉ cảnh báo, không tính trừ).', soft: true,
    test: (r) => (r.contact === 'Kết nối thành công' && !r.reason && /chưa đưa vào sử dụng|đang check/i.test(r.usage) ? 'Chưa dùng/đang check nhưng thiếu nguyên nhân' : '') },
];

/** Trừ thưởng theo tỉ lệ đạt SLA (Quy định 5.1.1 mục 7). */
export const slaPenalty = (rate) => (rate == null ? null : rate >= 0.98 ? 0 : rate >= 0.95 ? 10 : rate >= 0.9 ? 30 : rate >= 0.8 ? 50 : 100);

const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';
const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '(Chưa giao nhân sự)');
/** Che số điện thoại khi hiển thị mô tả. */
export const maskPhone = (s) => String(s).replace(/(?<!\d)(?:\+?84|0)?\d[\d .]{7,12}\d(?!\d)/g, '••••••••');

export function analyzeControl(rows, { month, code = null, now = Date.now() } = {}) {
  const scoped = rows.filter((r) => (!month || r.month === month) && (!code || codeOf(r.handler) === code));
  const done = scoped.filter((r) => r.status === 'Đã làm');
  const flaggedAll = [];   // gồm cả cảnh báo tham khảo
  for (const r of done) {
    const found = RULES.map((rule) => ({ rule, note: rule.test(r) })).filter((x) => x.note);
    if (found.length) flaggedAll.push({ r, found });
  }
  // Số data "có lỗi" chỉ tính các quy tắc có mức trừ; cảnh báo tham khảo tách riêng.
  const flagged = flaggedAll.filter((f) => f.found.some((x) => !x.rule.soft)).map((f) => ({ ...f, found: f.found }));
  const people = new Map();
  const bucket = (r) => { const k = `${codeOf(r.handler)}|${nameOf(r.handler)}`; return people.get(k) ?? people.set(k, { code: codeOf(r.handler), name: nameOf(r.handler), done: 0, flagged: 0, byRule: Object.fromEntries(RULES.map((x) => [x.id, 0])), live: 0, late: 0 }).get(k); };
  for (const r of done) bucket(r).done += 1;
  for (const f of flaggedAll) { const p = bucket(f.r); if (f.found.some((x) => !x.rule.soft)) p.flagged += 1; for (const x of f.found) p.byRule[x.rule.id] += 1; }
  for (const r of scoped) { const c = classify(r, now); if (c.kind === 'cancel') continue; const p = bucket(r); p.live += 1; if (c.kind === 'late-done' || c.kind === 'late-open') p.late += 1; }
  const list = [...people.values()].map((p) => ({ ...p, errRate: p.done ? p.flagged / p.done : null, slaRate: p.live ? 1 - p.late / p.live : null })).map((p) => ({ ...p, slaCut: slaPenalty(p.slaRate) }))
    .sort((a, b) => (b.errRate ?? -1) - (a.errRate ?? -1));
  const byRule = RULES.map((rule) => ({ rule, count: flaggedAll.filter((f) => f.found.some((x) => x.rule.id === rule.id)).length }));
  const live = scoped.filter((r) => classify(r, now).kind !== 'cancel'), late = live.filter((r) => ['late-done', 'late-open'].includes(classify(r, now).kind)).length;
  const slaRate = live.length ? 1 - late / live.length : null;
  return { total: done.length, flagged, flaggedAll, flaggedCount: flagged.length, errRate: done.length ? flagged.length / done.length : null, byRule, people: list, slaRate, slaCut: slaPenalty(slaRate), live: live.length, late };
}
