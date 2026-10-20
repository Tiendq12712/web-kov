/**
 * Cảnh báo chất lượng dữ liệu chi tiết (tab "Data Txx"): số dòng giảm, nhân sự mất dữ liệu, cột tỉnh/thành trống nhiều.
 * Mốc so sánh là số dòng/nhân sự cao nhất từng thấy của tháng đó trên trình duyệt này; bấm "Bỏ qua" để lấy số hiện tại làm mốc mới.
 */
const DROP = 0.9;           // dưới 90% mốc thì cảnh báo
const BLANK_PROVINCE = 0.4; // cột tỉnh/thành trống quá 40% thì cảnh báo ở báo cáo chuyển data

const key = (month) => `kpi.dq.${month}`;
const read = (month) => { try { return JSON.parse(localStorage.getItem(key(month))) ?? null; } catch { return null; } };
const write = (month, value) => { try { localStorage.setItem(key(month), JSON.stringify(value)); } catch { /* không lưu được thì bỏ qua */ } };
const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';

/** Số dòng và số nhân sự có data của từng tháng. */
export function monthStats(detail) {
  return detail.months.map((month) => {
    const rows = detail.rows.filter((r) => r.month === month);
    return { month, n: rows.length, staff: new Set(rows.map((r) => codeOf(r.handler)).filter(Boolean)).size, blankProvince: rows.length ? rows.filter((r) => !r.province).length / rows.length : 0 };
  });
}

/** Danh sách cảnh báo: [{ text }]. Cập nhật mốc cao nhất đã thấy. */
export function qualityWarnings(detail, { tab } = {}) {
  const out = [];
  for (const s of monthStats(detail)) {
    const base = read(s.month);
    if (base && (s.n < base.n * DROP || s.staff < base.staff)) {
      const parts = [];
      if (s.n < base.n * DROP) parts.push(`số dòng giảm từ ${base.n.toLocaleString('vi-VN')} còn ${s.n.toLocaleString('vi-VN')}`);
      if (s.staff < base.staff) parts.push(`số nhân sự có data giảm từ ${base.staff} còn ${s.staff}`);
      out.push({ text: `Data ${s.month}: ${parts.join('; ')}. Có thể file nguồn đang thiếu dữ liệu (ví dụ CRM xuất chưa đủ), số liệu báo cáo có thể bị thấp.` });
    } else write(s.month, { n: Math.max(s.n, base?.n ?? 0), staff: Math.max(s.staff, base?.staff ?? 0) });
    if (tab === 'xfer' && s.n > 200 && s.blankProvince > BLANK_PROVINCE) out.push({ text: `Data ${s.month}: ${Math.round(s.blankProvince * 100)}% dòng trống tỉnh/thành. Báo cáo theo tỉnh/thành sẽ thiếu; cần kiểm tra cột "Tỉnh/Thành phố" trong Sheet.`, soft: true });
  }
  return out;
}

/** Chấp nhận số liệu hiện tại làm mốc mới (khi dữ liệu giảm là có chủ ý). */
export function acceptQuality(detail) { for (const s of monthStats(detail)) write(s.month, { n: s.n, staff: s.staff }); }
