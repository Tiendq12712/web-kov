/**
 * Gợi ý data nên nghe lại call để đánh giá: data "Kết nối thành công" nhưng KH không có impact (cột "KH SC tác động" = 0).
 * Mỗi data được chấm mức ưu tiên theo các dấu hiệu trong ghi chú và dữ liệu; đây là gợi ý để chọn mẫu nghe, không kết luận lỗi.
 */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);
const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';
const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '(Chưa giao nhân sự)');

/** Phần nhân sự tự ghi trong mô tả (trước khối thông tin CRM "retailer_id: …"), đã bỏ số điện thoại và ngày. */
export function writtenPart(desc) {
  return String(desc ?? '').split(/\s*-?\s*retailer_id\s*:/i)[0]
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '').replace(/(?<!\d)(?:\+?84|0)\d[\d .]{7,12}\d/g, '').replace(/\s+/g, ' ').trim();
}

// Dấu hiệu viết trên chữ không dấu, chữ thường.
const HANG_UP = /\bknm\b|khong nghe may|ko nghe may|tat may|cup may|bam tat|thue bao|khong nghe duoc|khong noi gi|ko noi gi|khong tra loi/;
const CONSULT = /tu van|xntt|xmtt|xac nhan|xac thuc|huong dan|dang dung|dang sd|dang su dung|da dung|da sd|su dung on|danh gia|\b[1-5] ?d\b|chua can|khong can|ho tro|nhap hang|thanh toan|payment|hddt|\bqr\b/;
const COMPLAINT = /goi nhieu|khieu nai|phan nan|khong hai long|bat man|kho chiu|lua dao/;   // "tránh làm phiền KH" là câu đóng case thông thường nên không tính

export const SIGNALS = {
  contradict: { short: 'Mâu thuẫn trạng thái', weight: 4, label: 'Ghi chú như chưa nghe máy / KH tắt máy nhưng chọn "Kết nối thành công"', hint: 'Có thể chưa kết nối thật, nên nghe lại để xác nhận.' },
  unhappy: { short: 'KH hài lòng thấp', weight: 3, label: 'KH chấm hài lòng thấp (≤ 3 điểm)', hint: 'Nghe lại cách nhân sự trao đổi.' },
  complaint: { short: 'KH phản ứng tiêu cực', weight: 2, label: 'KH phản ứng tiêu cực (gọi nhiều, khó chịu, nghi lừa đảo, không hài lòng)', hint: 'Kiểm tra tần suất và cách mở đầu cuộc gọi.' },
  repeated: { short: 'Liên hệ nhiều lần', weight: 1, label: 'Cùng gian hàng liên hệ nhiều lần vẫn không impact', hint: 'Xem các lần gọi có khai thác đúng nhu cầu không.' },
  short: { short: 'Ghi chú sơ sài', weight: 1, label: 'Ghi chú sơ sài (dưới 60 ký tự)', hint: 'Khó biết nội dung trao đổi nếu không nghe lại.' },
};

export const LEVELS = [{ id: 'high', label: 'Cao', min: 4 }, { id: 'mid', label: 'Trung bình', min: 2 }, { id: 'low', label: 'Thấp', min: 0 }];
const levelOf = (score) => LEVELS.find((l) => score >= l.min).id;

export function signalsOf(r, repeatedKeys) {
  const text = writtenPart(r.desc), n = norm(text), found = [];
  if (HANG_UP.test(n) && !CONSULT.test(n)) found.push('contradict');
  if (r.satisfaction > 0 && r.satisfaction <= 3) found.push('unhappy');
  if (COMPLAINT.test(n)) found.push('complaint');
  if (r.retailer && repeatedKeys.has(r.retailer)) found.push('repeated');
  if (text.length < 60) found.push('short');
  return { found, text };
}

/** job: 'all' hoặc một phần tên "Loại công việc" (ví dụ 'T15'); month: 'all' hoặc 'YYYY-MM'; code: đầu số nhân sự hoặc null. */
export function analyzeListen(rows, { month = 'all', job = 'T15', code = null } = {}) {
  const pool = rows.filter((r) => r.status !== 'Hủy' && (month === 'all' || r.month === month) && (job === 'all' || (r.jobType ?? '').includes(job)) && (!code || codeOf(r.handler) === code));
  const conn = pool.filter((r) => r.contact === 'Kết nối thành công');
  const noImpact = conn.filter((r) => !r.impact);
  const perRetailer = new Map();
  for (const r of noImpact) if (r.retailer) perRetailer.set(r.retailer, (perRetailer.get(r.retailer) ?? 0) + 1);
  const repeated = new Set([...perRetailer].filter(([, k]) => k >= 2).map(([id]) => id));
  const items = noImpact.map((r) => {
    const { found, text } = signalsOf(r, repeated), score = sum(found.map((k) => SIGNALS[k].weight));
    return { r, signals: found, score, level: levelOf(score), text, code: codeOf(r.handler), name: nameOf(r.handler) };
  }).sort((a, b) => b.score - a.score || (b.r.modifiedTs ?? 0) - (a.r.modifiedTs ?? 0));
  const teamRate = ratio(noImpact.length, conn.length);
  const people = new Map();
  for (const r of conn) { const k = codeOf(r.handler) || '(pool)'; (people.get(k) ?? people.set(k, { code: codeOf(r.handler), name: nameOf(r.handler), conn: 0, noImpact: 0, high: 0, mid: 0, contradict: 0 }).get(k)).conn += 1; }
  for (const it of items) { const p = people.get(it.code || '(pool)'); p.noImpact += 1; if (it.level === 'high') p.high += 1; if (it.level === 'mid') p.mid += 1; if (it.signals.includes('contradict')) p.contradict += 1; }
  const byPerson = [...people.values()].map((p) => ({ ...p, rate: ratio(p.noImpact, p.conn), vsTeam: p.conn ? ratio(p.noImpact, p.conn) - teamRate : null })).sort((a, b) => b.high - a.high || (b.rate ?? 0) - (a.rate ?? 0));
  const count = (level) => items.filter((i) => i.level === level).length;
  const bySignal = Object.keys(SIGNALS).map((k) => ({ key: k, count: items.filter((i) => i.signals.includes(k)).length }));
  const months = [...new Set(rows.map((r) => r.month).filter(Boolean))].sort();
  const jobs = [...new Set(rows.map((r) => r.jobType).filter(Boolean))].sort();
  return { pool: pool.length, conn: conn.length, noImpact: noImpact.length, rate: teamRate, high: count('high'), mid: count('mid'), low: count('low'), items, byPerson, bySignal, months, jobs, contradict: bySignal.find((s) => s.key === 'contradict').count };
}
