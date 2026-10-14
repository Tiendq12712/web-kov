/**
 * Nhân sự & phép năm: Sheet có tab "Danh sách" (tên, mã NV, đầu số, khu vực, giới tính) và tab "Phép năm 2026"
 * (mỗi người một dòng; mỗi tháng một khối cột). Cấu trúc khối tháng đọc theo dòng tiêu đề, không theo vị trí cố định.
 */
const text = (v) => (v == null ? '' : String(v).trim());
const plain = (s) => text(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** "  0,5 ", "- 0,5 ", 1.5, "-" -> số hoặc null. */
export function num(v) {
  if (typeof v === 'number') return v;
  const t = text(v).replace(/\s+/g, '');
  if (!t || t === '-') return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Tab "Danh sách": [{ stt, code (đầu số), mnv, name, role, level, region, gender }]. */
export function parseStaff(rows) {
  const head = (rows[0] ?? []).map(plain);
  const col = (re) => head.findIndex((h) => re.test(h));
  const [cName, cMnv, cCode, cRegion, cGender] = [col(/ten nhan su/), col(/ma nv/), col(/dau so/), col(/khu vuc/), col(/gioi tinh/)];
  const cLevel = col(/^level/);
  return rows.slice(1).filter((r) => text(r[cName])).map((r) => {
    const m = /^(\d+)\s*-\s*(.+?)(?:\s*-\s*(.+))?$/.exec(text(r[cName]));
    return {
      code: text(r[cCode]) || m?.[1] || '', mnv: text(r[cMnv]), name: m?.[2] ?? text(r[cName]), role: m?.[3] ?? '',
      level: cLevel >= 0 ? num(r[cLevel]) : null, region: text(r[cRegion]), gender: text(r[cGender]),
    };
  });
}

/**
 * Tab "Phép năm": mỗi tháng có khối cột bắt đầu ở ô ghi "mm/yyyy".
 *  - Khối 3 cột (và khối quý có thêm cột phụ): [Phép thêm, Đã dùng, Còn]
 *  - Khối 4 cột (từ tháng 6): theo số liệu là [Phép thêm, Tồn sau khi thêm, Đã dùng, Tồn cuối] (tiêu đề trong Sheet ghi hoán đổi, nên đọc theo vị trí)
 */
export function parseLeave(rows) {
  const hi = rows.findIndex((r) => r.some((c) => plain(c) === 'mnv'));
  if (hi < 1) throw new Error('Không tìm thấy dòng tiêu đề "MNV" trong tab phép năm');
  const head = rows[hi], monthRow = rows[hi - 1];
  const col = (re) => head.findIndex((c) => re.test(plain(c)));
  const [cMnv, cName, cDept] = [col(/^mnv$/), col(/^ho va ten$/), col(/^phong ban$/)];
  const cCarry = head.findIndex((c) => text(c) === '2025'), cYear = head.findIndex((c) => text(c) === '2026');
  const starts = monthRow.map((c, i) => [/^(\d{1,2})\/(\d{4})$/.exec(text(c)), i]).filter(([m]) => m).map(([m, i]) => ({ month: Number(m[1]), year: Number(m[2]), start: i }));
  starts.forEach((s, k) => { s.end = (starts[k + 1]?.start ?? head.length); s.len = s.end - s.start; s.four = s.len === 4 || head.slice(s.start, s.end).some((c) => plain(c) === 'ton cuoi'); });
  const people = rows.slice(hi + 1).filter((r) => text(r[cMnv])).map((r) => {
    const months = starts.map((s) => {
      const g = (i) => num(r[s.start + i]);
      return s.four ? { month: s.month, add: g(0), used: g(2), balance: g(3) } : { month: s.month, add: g(0), used: g(1), balance: g(2) };
    });
    return { mnv: text(r[cMnv]), name: text(r[cName]), dept: text(r[cDept]), carry: num(r[cCarry]) ?? 0, annual: num(r[cYear]) ?? 0, months };
  });
  return { year: starts[0]?.year ?? 2026, people };
}

/** Tổng hợp một người đến tháng `upto` (1–12): đã dùng, phép được thêm, còn lại hiện tại và dự kiến cuối năm. */
export function summarize(p, upto) {
  const sum = (key) => p.months.filter((m) => m.month <= upto).reduce((a, m) => a + (m[key] ?? 0), 0);
  const withBal = p.months.filter((m) => m.balance != null);
  const at = [...withBal].reverse().find((m) => m.month <= upto) ?? withBal[0];
  return { used: sum('used'), added: sum('add'), balance: at?.balance ?? 0, endOfYear: withBal.at(-1)?.balance ?? 0, carry: p.carry };
}

export function buildHr(staffRows, leaveRows) {
  const staff = parseStaff(staffRows);
  const leave = parseLeave(leaveRows);
  const byMnv = new Map(leave.people.map((p) => [p.mnv, p]));
  const people = staff.map((s) => ({ ...s, leave: byMnv.get(s.mnv) ?? null }));
  // người có trong tab phép nhưng chưa có trong tab Danh sách vẫn hiển thị
  const known = new Set(staff.map((s) => s.mnv));
  leave.people.filter((p) => !known.has(p.mnv)).forEach((p) => people.push({ code: '', mnv: p.mnv, name: p.name, role: '', level: null, region: '', gender: '', leave: p }));
  return { year: leave.year, people };
}
