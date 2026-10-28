/** Vì sao act "Tư vấn tính năng" không khớp tính năng hệ thống (RCM) gợi ý: phân loại nguyên nhân, tính năng lệch nhiều nhất, theo nhân sự. */
export const CAUSES = [
  ['no-sc', 'SC không ghi tính năng', 'SC chọn công việc "Tư vấn tính năng" nhưng không ghi tính năng nào, nên không có gì để đối chiếu.'],
  ['no-rcm', 'Hệ thống không gợi ý', 'Hệ thống không có tính năng gợi ý cho retailer này.'],
  ['outside', 'Ngoài danh mục gợi ý', 'Mọi tính năng SC ghi đều không nằm trong danh mục hệ thống từng gợi ý cho ai, nên không thể khớp.'],
  ['diff', 'SC tư vấn khác gợi ý', 'SC và hệ thống đều có tính năng nhưng hai danh sách không trùng nhau.'],
];

const count = (list) => { const m = new Map(); for (const x of list) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };

/** `all`: toàn bộ act của báo cáo (để biết danh mục gợi ý của hệ thống); `acts`: act đang lọc. */
export function analyzeMismatch(acts0, all0) {
  const norm = (a) => ({ ...a, scFeatures: a.scFeatures ?? [], rcmFeatures: a.rcmFeatures ?? [] });
  const acts = acts0.map(norm), all = all0.map(norm);
  const vocab = new Set(all.flatMap((a) => a.rcmFeatures));
  const advised = acts.filter((a) => a.advised);
  const classify = (a) => (!a.scFeatures.length ? 'no-sc' : !a.rcmFeatures.length ? 'no-rcm' : a.scFeatures.every((f) => !vocab.has(f)) ? 'outside' : 'diff');
  const bad = advised.filter((a) => !a.match).map((a) => ({ ...a, cause: classify(a) }));
  const byCause = Object.fromEntries(CAUSES.map(([id]) => [id, bad.filter((a) => a.cause === id).length]));
  const people = new Map();
  for (const a of advised) {
    const p = people.get(a.code) ?? { code: a.code, name: a.name, advised: 0, matched: 0, avgSc: 0, causes: Object.fromEntries(CAUSES.map(([id]) => [id, 0])) };
    p.advised += 1; p.avgSc += a.scFeatures.length;
    if (a.match) p.matched += 1; else p.causes[classify(a)] += 1;
    people.set(a.code, p);
  }
  return {
    advised: advised.length, matched: advised.length - bad.length, bad, byCause, vocab,
    scOnly: count(bad.flatMap((a) => a.scFeatures.filter((f) => !a.rcmFeatures.includes(f)))).slice(0, 8).map(([f, n]) => ({ feature: f, n, outside: !vocab.has(f) })),
    rcmOnly: count(bad.flatMap((a) => a.rcmFeatures.filter((f) => !a.scFeatures.includes(f)))).slice(0, 8).map(([f, n]) => ({ feature: f, n })),
    people: [...people.values()].map((p) => ({ ...p, avgSc: p.advised ? p.avgSc / p.advised : 0, rate: p.advised ? p.matched / p.advised : null })).sort((a, b) => b.advised - a.advised),
  };
}
