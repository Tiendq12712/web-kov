/**
 * Kết quả chấm call (Google Form → Sheet "Chấm call"): mỗi dòng là một cuộc gọi được chấm.
 * Các cột lỗi (Giai đoạn 1–4, Tương tác tổng thể, Các vấn đề khác) ghi lỗi dạng "Tên lỗi (-5%)", ô trống là không lỗi;
 * "Điểm cộng (+)" ghi dạng "… (+2%)". Điểm trừ của một call = tổng các mức trừ ghi trong call đó.
 * Ô ghi nhận xét mức đạt không kèm % (ví dụ "Đạt", "Tốt - Rất bám sát nhu cầu") là đánh giá tốt, không phải lỗi.
 * Cột "Đánh giá" là điểm người chấm cho call (0 = chưa đánh giá); "Số liên hệ" là số điện thoại khách (chỉ hiện dạng che bớt).
 */
import { tsOf } from './segment.js';

const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
/** Lỗi = mục có mức trừ âm. */
const isError = (e) => e.pct != null && e.pct < 0;
const isoOf = (ts) => (ts == null ? '' : new Date(ts).toISOString().slice(0, 10));

/** Tách các mục trong một ô: "Tên lỗi (-5%), Tên khác (-2%)" -> [{ text, pct }]; mục không kèm % (nhận xét mức đạt) có pct = null. */
export function parseItems(cell) {
  const text = String(cell ?? '').trim();
  if (!text) return [];
  const found = [...text.matchAll(/([^,;\n]+?)\s*\(\s*([+-]?\d+(?:[.,]\d+)?)\s*%\s*\)/g)].map((m) => ({ text: m[1].trim(), pct: Number(m[2].replace(',', '.')) }));
  return found.length ? found : [{ text, pct: null }];
}

/** "8618 - Mai Thị Hương - Customer Sucess" -> { code, name }. */
export function parsePerson(cell) {
  const t = String(cell ?? '').trim();
  const m = /^(\d+)\s*-\s*([^-]+?)(?:\s*-.*)?$/.exec(t);
  return m ? { code: m[1], name: m[2].trim() } : { code: '', name: t };
}

/** Chuyển bảng giá trị thô của một tab thành các dòng chấm call; tab không có cột "Nhân sự" và "Activity ID" thì bỏ qua (trả về []). */
export function parseCallScores(rows) {
  const head = (rows[0] ?? []).map(norm);
  const at = (test) => head.findIndex(test);
  const col = {
    ts: at((h) => h === 'timestamp' || h.startsWith('dau thoi gian')), person: at((h) => h === 'nhan su'), retailer: at((h) => h === 'retailer id'),
    act: at((h) => h.startsWith('thoi gian tao activity')), activityId: at((h) => h === 'activity id'), bonus: at((h) => h.startsWith('diem cong')),
    note: at((h) => h.startsWith('nhan xet')), feedback: at((h) => h === 'gop y'), type: at((h) => h === 'loai danh gia'),
  };
  col.score = at((h) => h === 'danh gia'); col.phone = at((h) => h === 'so lien he');
  if (col.person < 0 || (col.act < 0 && col.ts < 0)) return [];   // không phải bảng chấm call
  // Cột lỗi: Giai đoạn…, Tương tác tổng thể, Các vấn đề khác…
  const cats = head.map((h, i) => ({ i, label: String(rows[0][i]).trim() })).filter(({ i }) => /^giai doan|^tuong tac tong the|^cac van de khac/.test(head[i]));
  return rows.slice(1).filter((r) => String(r[col.person] ?? '').trim()).map((r) => {
    const who = parsePerson(r[col.person]), scoredTs = tsOf(r[col.ts]), actTs = tsOf(r[col.act]);
    const ts = actTs ?? scoredTs;   // mốc thời gian của call = "Thời gian tạo Activity" (thiếu thì dùng thời điểm chấm)
    const items = cats.flatMap(({ i, label }) => parseItems(r[i]).map((x) => ({ ...x, cat: label })));
    const errors = items.filter(isError), ratings = items.filter((x) => !isError(x));   // lỗi = có mức trừ âm; còn lại là đánh giá mức đạt
    const bonus = parseItems(r[col.bonus]);
    return {
      ts, month: isoOf(ts).slice(0, 7), date: isoOf(ts), scoredDate: isoOf(scoredTs), code: who.code, name: who.name, retailer: String(r[col.retailer] ?? '').trim(), activityId: String(r[col.activityId] ?? '').trim(),
      errors, ratings, penalty: sum(errors.map((e) => Math.abs(e.pct))), bonus, bonusPct: sum(bonus.map((b) => Math.max(b.pct ?? 0, 0))),
      score: Number(r[col.score]) > 0 ? Number(r[col.score]) : 0, phone: String(r[col.phone] ?? '').trim(),
      note: String(r[col.note] ?? '').trim(), feedback: String(r[col.feedback] ?? '').trim(), type: String(r[col.type] ?? '').trim(),
    };
  });
}


export function analyzeCallScores(rows, { month = 'all', code = null } = {}) {
  const scoped = rows.filter((r) => (month === 'all' || r.month === month) && (!code || r.code === code));
  const flagged = scoped.filter((r) => r.errors.length);
  const people = new Map();
  for (const r of scoped) {
    const p = people.get(r.code || r.name) ?? people.set(r.code || r.name, { code: r.code, name: r.name, calls: 0, withErr: 0, penalty: 0, bonus: 0, scored: 0, scoreSum: 0 }).get(r.code || r.name);
    p.calls += 1; p.penalty += r.penalty; p.bonus += r.bonus.length ? 1 : 0;
    if (r.errors.length) p.withErr += 1;
    if (r.score) { p.scored += 1; p.scoreSum += r.score; }
  }
  const byPerson = [...people.values()].map((p) => ({ ...p, errRate: ratio(p.withErr, p.calls), avgPenalty: ratio(p.penalty, p.calls), avgScore: ratio(p.scoreSum, p.scored) })).sort((a, b) => (b.avgPenalty ?? 0) - (a.avgPenalty ?? 0) || b.calls - a.calls);
  const items = new Map(), cats = new Map();
  for (const r of scoped) for (const e of r.errors) {
    const k = `${e.cat}|${e.text}`, it = items.get(k) ?? items.set(k, { cat: e.cat, text: e.text, pct: e.pct, count: 0, penalty: 0 }).get(k);
    it.count += 1; it.penalty += Math.abs(e.pct);
    const c = cats.get(e.cat) ?? cats.set(e.cat, { cat: e.cat, count: 0, penalty: 0, calls: new Set() }).get(e.cat);
    c.count += 1; c.penalty += Math.abs(e.pct); c.calls.add(r);
  }
  const byMonth = [...new Set(rows.filter((r) => !code || r.code === code).map((r) => r.month).filter(Boolean))].sort().map((m) => {
    const list = rows.filter((r) => r.month === m && (!code || r.code === code)), bad = list.filter((r) => r.errors.length), sc = list.filter((r) => r.score);
    return { month: m, calls: list.length, withErr: bad.length, errRate: ratio(bad.length, list.length), avgPenalty: ratio(sum(list.map((r) => r.penalty)), list.length), avgScore: ratio(sum(sc.map((r) => r.score)), sc.length), scored: sc.length };
  });
  return {
    total: scoped.length, withErr: flagged.length, errRate: ratio(flagged.length, scoped.length), perfect: scoped.length - flagged.length, scored: scoped.filter((r) => r.score).length, avgScore: ratio(sum(scoped.map((r) => r.score)), scoped.filter((r) => r.score).length), scoreDist: [1, 2, 3, 4, 5].map((v) => ({ score: v, count: scoped.filter((r) => r.score === v).length })),
    penalty: sum(scoped.map((r) => r.penalty)), avgPenalty: ratio(sum(scoped.map((r) => r.penalty)), scoped.length), bonusCalls: scoped.filter((r) => r.bonus.length).length,
    people: byPerson, cats: [...cats.values()].map((c) => ({ cat: c.cat, count: c.count, penalty: c.penalty, calls: c.calls.size })).sort((a, b) => b.count - a.count),
    items: [...items.values()].sort((a, b) => b.count - a.count || b.penalty - a.penalty), byMonth,
    list: [...scoped].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0)), months: [...new Set(rows.map((r) => r.month).filter(Boolean))].sort(),
  };
}
