/**
 * Gợi ý chia data hằng ngày.
 *  - Tệp chia riêng: Booking chia hết cho người nhận Booking; FnB lỗi chia đều cho người nhận FnB lỗi (hai người thì chia đôi).
 *  - Phần còn lại: chia theo từng miền, san bằng "khối lượng sau khi chia" giữa mọi người trong miền.
 *    Khối lượng của một người = data tồn hiện tại + tệp chia riêng vừa nhận + phần chia thêm; người có level cao được tính sức làm lớn hơn.
 */
export const DEFAULTS = { booking: ['8427'], fnb: ['8474', '8454'], step: 15 };   // mã đầu số: Thương (Sài Gòn), Lợi và Sang

/** Hệ số sức làm theo level: level 2 là mốc 1,0; mỗi level lệch đi cộng/trừ `step`% (tối thiểu 0,3). */
export const weightOf = (level, step = DEFAULTS.step) => Math.max(0.3, 1 + (step / 100) * ((level ?? 2) - 2));

/** Chia `n` data (số nguyên) đều cho các người; phần lẻ dành cho người đang tồn ít hơn. */
function evenSplit(n, people) {
  const order = [...people].sort((a, b) => a.backlog - b.backlog || a.code.localeCompare(b.code));
  const out = new Map(order.map((p) => [p.code, Math.floor(n / order.length)]));
  for (let i = 0; i < n % order.length; i++) out.set(order[i].code, out.get(order[i].code) + 1);
  return out;
}

/**
 * San bằng: tìm mức λ sao cho tổng max(0, λ·w − base) = n, rồi làm tròn theo phần lẻ lớn nhất để tổng đúng bằng n.
 * Người có base/w cao hơn mức λ (đang tồn nhiều) không nhận thêm.
 */
function fillOnce(n, people) {
  const shares = new Map(people.map((p) => [p.code, 0]));
  if (!n || !people.length) return shares;
  const sorted = [...people].sort((a, b) => a.base / a.w - b.base / b.w || a.code.localeCompare(b.code));
  let lambda = 0, active = 0, sumBase = 0, sumW = 0;
  for (const p of sorted) {   // thêm dần người vào nhóm nhận cho tới khi người kế tiếp đã tồn cao hơn mức λ hiện tại
    if (active && p.base / p.w >= lambda) break;
    sumBase += p.base; sumW += p.w; active += 1;
    lambda = (n + sumBase) / sumW;
  }
  const raw = sorted.slice(0, active).map((p) => ({ p, v: Math.max(0, lambda * p.w - p.base) }));
  raw.forEach((r) => { r.i = Math.floor(r.v); });
  const left = n - raw.reduce((a, r) => a + r.i, 0);
  [...raw].sort((a, b) => (b.v - b.i) - (a.v - a.i) || a.p.base - b.p.base || a.p.code.localeCompare(b.p.code)).slice(0, left).forEach((r) => { r.i += 1; });
  raw.forEach((r) => shares.set(r.p.code, r.i));
  return shares;
}

/** Như trên, có thêm mức tối đa `cap` mỗi người: ai vượt thì giữ ở mức tối đa, phần dư chia lại cho những người còn lại. `shares.left` là phần không chia được. */
export function waterFill(n, people, cap = 0) {
  if (!(cap > 0)) return fillOnce(n, people);
  const fixed = new Map();
  let pool = people, remaining = n;
  while (pool.length && remaining > 0) {
    const shares = fillOnce(remaining, pool);
    const over = pool.filter((p) => shares.get(p.code) > cap);
    if (!over.length) { shares.forEach((v, code) => fixed.set(code, v)); remaining = 0; break; }
    over.forEach((p) => { fixed.set(p.code, cap); remaining -= cap; });
    pool = pool.filter((p) => !over.includes(p));
  }
  const out = new Map(people.map((p) => [p.code, fixed.get(p.code) ?? 0]));
  out.left = Math.max(0, remaining);
  return out;
}

/**
 * people: [{ code, name, level, region, backlog, off, booking, fnb }]; input: { booking, fnb, rest: { [miền]: số } }.
 * Trả về { rows: [{...person, special, extra, give, after, w}], warnings: [], totals }.
 */
export function suggestDivide(people, input, step = DEFAULTS.step, cap = 0) {
  const warnings = [];
  const active = people.filter((p) => !p.off);
  const rows = new Map(people.map((p) => [p.code, { ...p, special: 0, extra: 0, w: weightOf(p.level, step) }]));
  const give = (map, key) => map.forEach((v, code) => { rows.get(code)[key] += v; });

  const special = (n, to, label) => {
    if (!n) return;
    if (!to.length) { warnings.push(`Chưa có ai nhận ${label} (${n} data): hãy tích người nhận ở cột "${label}".`); return; }
    give(evenSplit(n, to), 'special');
  };
  special(input.booking, active.filter((p) => p.booking), 'Booking');
  special(input.fnb, active.filter((p) => p.fnb), 'FnB lỗi');

  for (const [region, n] of Object.entries(input.rest ?? {})) {
    if (!n) continue;
    const group = active.filter((p) => p.region === region);
    if (!group.length) { warnings.push(`${region}: không có ai nhận data nên ${n} data chưa chia được.`); continue; }
    const shares = waterFill(n, group.map((p) => ({ code: p.code, w: rows.get(p.code).w, base: p.backlog + rows.get(p.code).special })), cap);
    give(shares, 'extra');
    if (shares.left) warnings.push(`${region}: còn ${shares.left} data chưa chia vì ai cũng đã chạm mức tối đa ${cap} data/người; hãy tăng mức tối đa hoặc thêm người nhận.`);
  }
  const list = [...rows.values()].map((r) => ({ ...r, give: r.special + r.extra, after: r.backlog + r.special + r.extra }));
  const sum = (key) => list.reduce((a, r) => a + r[key], 0);
  return { rows: list, warnings, totals: { special: sum('special'), extra: sum('extra'), give: sum('give') } };
}
