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

/* ---------- Phân tích phép năm ---------- */
/** Quy định công ty: phép năm được dùng đến hết tháng 3 của năm sau; quá hạn không dùng thì mất. */
export const EXPIRE_MONTH = 3;

/**
 * Tình trạng phép của một người đến tháng `upto`, có tính hạn dùng phép tồn:
 *  - Phép tồn năm trước được dùng trước (các ngày nghỉ từ tháng 1 đến tháng 3 trừ vào tồn trước, rồi mới trừ vào phép năm nay).
 *  - Hết tháng 3 mà tồn còn dư thì số dư đó mất (expired). Trước đó thì là tồn còn lại có hạn (carryLeft, kèm hạn 31/3 và số ngày còn lại).
 *  - effective = số dư trong Sheet. Sheet đã tự trừ phần tồn hết hạn từ tháng 4 (cột sau quý 1 có số dư mới sau khi trừ), nên KHÔNG trừ thêm; expired chỉ để hiển thị phần đã mất.
 */
export function leaveStatus(p, upto, year, now = new Date()) {
  const s = summarize(p, upto), carry = Math.max(p.carry ?? 0, 0);
  const q1 = p.months.filter((m) => m.month <= Math.min(upto, EXPIRE_MONTH)).reduce((a, m) => a + Math.max(m.used ?? 0, 0), 0);
  const carryUsed = Math.min(carry, q1), carryLeft = carry - carryUsed, over = upto > EXPIRE_MONTH;
  const deadline = new Date(year, EXPIRE_MONTH, 0);   // ngày cuối tháng 3
  const daysToDeadline = !over && carryLeft > 0 && now.getFullYear() === year ? Math.ceil((deadline - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000) : null;
  // Mốc hết tháng 3 (hạn dùng phép tồn): tổng còn lại cuối T3 theo Sheet, phần phép tồn năm trước còn dư sẽ mất sau 31/3, và phép năm nay còn lại sau mốc đó.
  const q1Balance = p.months.find((m) => m.month === EXPIRE_MONTH)?.balance ?? null;
  const q1Used = p.months.filter((m) => m.month <= EXPIRE_MONTH).reduce((a, m) => a + Math.max(m.used ?? 0, 0), 0), q1Lost = carry - Math.min(carry, q1Used);
  return { ...s, q1Balance, q1Lost, q1Own: q1Balance == null ? null : q1Balance - q1Lost, carryUsed, carryLeft: over ? 0 : carryLeft, expired: over ? carryLeft : 0, effective: s.balance, deadline: `${year}-${String(EXPIRE_MONTH).padStart(2, '0')}-${String(deadline.getDate()).padStart(2, '0')}`, daysToDeadline };
}

export const LOW_BALANCE = 1;    // dưới 1 ngày: sắp hết phép
export const HIGH_BALANCE = 6;   // từ 6 ngày trở lên: còn nhiều, nên khuyến khích nghỉ

/** Tình trạng phép của một người theo số dư hiện tại: debt (nợ phép) | low (sắp hết) | high (còn nhiều) | ok. */
export const statusOf = (balance) => (balance < 0 ? 'debt' : balance < LOW_BALANCE ? 'low' : balance >= HIGH_BALANCE ? 'high' : 'ok');
export const STATUS = {
  debt: { label: 'Nợ phép', tone: 'bad' }, low: { label: 'Sắp hết phép', tone: 'warn' }, ok: { label: 'Bình thường', tone: 'good' }, high: { label: 'Còn nhiều phép', tone: 'info' },
};

/** Phép được hưởng đến hết tháng `upto` = tồn năm trước + phép được thêm; tỉ lệ đã dùng trên số đó (null nếu chưa có phép). */
export const usageRate = (s) => { const total = s.carry + s.added; return total > 0 ? s.used / total : null; };

/** Tổng phép đã dùng và phép được thêm của cả nhóm theo từng tháng 1..upto. */
export function monthTotals(people, upto) {
  return Array.from({ length: upto }, (_, i) => i + 1).map((month) => {
    const ms = people.filter((p) => p.leave).map((p) => p.leave.months.find((m) => m.month === month));
    return { month, used: ms.reduce((a, m) => a + (m?.used ?? 0), 0), add: ms.reduce((a, m) => a + (m?.add ?? 0), 0), people: ms.filter((m) => (m?.used ?? 0) > 0).length };
  });
}

/** Thống kê theo khu vực: số người, đã dùng, còn lại, số người nợ phép. */
export function regionStats(people, upto, year = new Date().getFullYear()) {
  const by = new Map();
  for (const p of people.filter((x) => x.leave)) {
    const s = leaveStatus(p.leave, upto, year), r = p.region || 'Chưa có khu vực';
    const e = by.get(r) ?? by.set(r, { region: r, n: 0, used: 0, balance: 0, debt: 0 }).get(r);
    e.n += 1; e.used += s.used; e.balance += s.effective; e.debt += s.effective < 0 ? 1 : 0;
  }
  return [...by.values()].sort((a, b) => b.n - a.n);
}

/** Nhận định bằng lời cho quản lý: [{ tone, text }]. `year`: năm của Sheet (để tính hạn dùng phép tồn). */
export function hrInsights(people, upto, year = new Date().getFullYear(), now = new Date()) {
  const withLeave = people.filter((p) => p.leave).map((p) => ({ p, s: leaveStatus(p.leave, upto, year, now) }));
  if (!withLeave.length) return [];
  const out = [], n = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
  const names = (list, fmt) => `${list.slice(0, 4).map(fmt).join(', ')}${list.length > 4 ? '…' : ''}`;
  const used = withLeave.reduce((a, x) => a + x.s.used, 0), left = withLeave.reduce((a, x) => a + x.s.effective, 0);
  out.push({ tone: '', text: `${withLeave.length} nhân sự đã dùng ${n(used)} ngày phép đến tháng ${upto} (trung bình ${n(used / withLeave.length)} ngày/người), còn lại tổng ${n(left)} ngày.` });
  const pending = withLeave.filter((x) => x.s.carryLeft > 0).sort((a, b) => b.s.carryLeft - a.s.carryLeft);
  if (pending.length) out.push({ tone: 'warn', text: `${pending.length} người còn phép tồn ${year - 1} chưa dùng, hạn hết 31/3/${year}${pending[0].s.daysToDeadline != null ? ` (còn ${pending[0].s.daysToDeadline} ngày)` : ''}, quá hạn sẽ mất: ${names(pending, (x) => `${x.p.name} (${n(x.s.carryLeft)})`)}.` });
  const lost = withLeave.filter((x) => x.s.expired > 0).sort((a, b) => b.s.expired - a.s.expired);
  if (lost.length) out.push({ tone: 'bad', text: `${lost.length} người đã mất phép tồn ${year - 1} do không dùng hết trước 31/3/${year}, tổng ${n(lost.reduce((a, x) => a + x.s.expired, 0))} ngày: ${names(lost, (x) => `${x.p.name} (${n(x.s.expired)})`)}.` });
  const debt = withLeave.filter((x) => x.s.effective < 0).sort((a, b) => a.s.effective - b.s.effective);
  if (debt.length) out.push({ tone: 'bad', text: `${debt.length} người đang nợ phép: ${names(debt, (x) => `${x.p.name} (${n(x.s.effective)})`)}.` });
  const low = withLeave.filter((x) => x.s.effective >= 0 && x.s.effective < LOW_BALANCE);
  if (low.length) out.push({ tone: 'warn', text: `${low.length} người sắp hết phép (còn dưới ${LOW_BALANCE} ngày): ${names(low, (x) => x.p.name)}.` });
  const high = withLeave.filter((x) => x.s.effective >= HIGH_BALANCE).sort((a, b) => b.s.effective - a.s.effective);
  if (high.length) out.push({ tone: 'info', text: `${high.length} người còn nhiều phép (từ ${HIGH_BALANCE} ngày): ${names(high, (x) => `${x.p.name} (${n(x.s.effective)})`)}. Nên sắp xếp để nghỉ, tránh dồn cuối năm.` });
  const months = monthTotals(people, upto), peak = [...months].sort((a, b) => b.used - a.used)[0];
  if (peak?.used > 0) out.push({ tone: '', text: `Tháng dùng phép nhiều nhất: tháng ${peak.month} (${n(peak.used)} ngày, ${peak.people} người nghỉ).` });
  return out;
}
