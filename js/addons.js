/**
 * Add-on nhân sự chọn và được ghi nhận: tab "Chi tiết addon" trong Sheet PBI.
 * Mỗi dòng là một add-on nhân sự đã chọn cho khách; "được ghi nhận" khi is_impact = Yes (có điểm SC), kèm lý do nếu không.
 * Tháng lấy theo ngày tương tác cuối (last_interaction_time).
 */
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);

function dateOf(v) {
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400) * 1000); return { ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, iso: d.toISOString().slice(0, 10) }; }
  const t = String(v ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return { ym: `${m[3]}-${m[2].padStart(2, '0')}`, iso: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` };
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? { ym: `${m[1]}-${m[2]}`, iso: t.slice(0, 10) } : { ym: '', iso: '' };
}

export function parseAddons(rows) {
  const head = (rows[0] ?? []).map(plain);
  const at = (n) => head.indexOf(n);
  const col = { act: at('activityid'), ticket: at('ticket_no'), last: at('last_interaction_time'), created: at('act_createdtime'), retailer: at('retailer_id'), addon: at('add_on'), impact: at('is_impact'), points: at('sc_points'), who: at('last_name'), reason: at('reason') };
  if (col.addon < 0 || col.who < 0) throw new Error('Tab "Chi tiết addon" thiếu cột add_on / last_name');
  const out = [];
  for (const r of rows.slice(1)) {
    const addon = String(r[col.addon] ?? '').trim();
    const who = String(r[col.who] ?? '').trim();
    const code = /^(\d+)\s*-/.exec(who)?.[1];
    if (!addon || !code) continue;
    const d = dateOf(r[col.last]) .ym ? dateOf(r[col.last]) : dateOf(r[col.created]);
    out.push({
      act: String(r[col.act] ?? ''), ticket: String(r[col.ticket] ?? '') === '0' ? '' : String(r[col.ticket] ?? ''), retailer: String(r[col.retailer] ?? ''),
      date: d.iso, month: d.ym, addon, code, name: (who.split(' - ')[1] ?? who).trim(),
      recorded: /^yes$/i.test(String(r[col.impact] ?? '').trim()), points: Number(r[col.points]) || 0, reason: String(r[col.reason] ?? '').trim(),
    });
  }
  return { rows: out, months: [...new Set(out.map((x) => x.month).filter(Boolean))].sort() };
}

const stats = (rows) => {
  const rec = rows.filter((x) => x.recorded);
  return { chosen: rows.length, recorded: rec.length, missed: rows.length - rec.length, rate: ratio(rec.length, rows.length), points: sum(rows.map((x) => x.points)) };
};

/** Bộ lọc: loại add-on, nhân sự (đầu số), trạng thái ghi nhận, từ khóa (retailer, ticket, lý do). */
const matcher = ({ type = 'all', person = 'all', status = 'all', q = '' } = {}) => {
  const key = plain(q);
  return (x) => (type === 'all' || x.addon === type) && (person === 'all' || x.code === person)
    && (status === 'all' || (status === 'recorded' ? x.recorded : !x.recorded))
    && (!key || plain(`${x.retailer} ${x.ticket} ${x.reason} ${x.addon} ${x.name} ${x.act}`).includes(key));
};

export function analyzeAddons(all, { month = 'all', code = null, filters = {} } = {}) {
  const inMonth = (month === 'all' ? all : all.filter((x) => x.month === month));
  const base = code ? inMonth.filter((x) => x.code === code) : inMonth;
  const pass = matcher(filters);
  const rows = base.filter(pass);
  const group = (list, keyOf, labelOf = (x) => x) => {
    const map = new Map();
    for (const x of list) { const k = keyOf(x); (map.get(k) ?? map.set(k, []).get(k)).push(x); }
    return [...map].map(([k, v]) => ({ key: k, label: labelOf(v[0]), ...stats(v), rows: v }));
  };
  const people = group(rows, (x) => x.code, (x) => x.name).sort((a, b) => b.recorded - a.recorded || b.chosen - a.chosen);
  const types = group(rows, (x) => x.addon, (x) => x.addon).sort((a, b) => b.chosen - a.chosen);
  const typeNames = types.map((t) => t.key);
  people.forEach((p) => { p.byType = Object.fromEntries(typeNames.map((t) => [t, { chosen: p.rows.filter((x) => x.addon === t).length, recorded: p.rows.filter((x) => x.addon === t && x.recorded).length }])); });
  const reasons = group(rows.filter((x) => !x.recorded), (x) => x.reason || '(Không ghi lý do)').sort((a, b) => b.chosen - a.chosen)
    .map((r) => ({ reason: r.key, count: r.chosen, share: ratio(r.chosen, rows.filter((x) => !x.recorded).length), types: [...new Set(r.rows.map((x) => x.addon))] }));
  const months = [...new Set(all.map((x) => x.month).filter(Boolean))].sort();
  const trend = months.map((ym) => ({ ym, ...stats((code ? all.filter((x) => x.code === code) : all).filter((x) => x.month === ym && pass(x))) }));
  const total = stats(rows);
  const detail = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const options = { types: [...new Set(base.map((x) => x.addon))].sort(), people: [...new Map(base.map((x) => [x.code, x.name])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi')) };
  return { total, people, types, typeNames, reasons, trend, detail, options, filtered: rows.length !== base.length, advice: advise({ total, people, types, reasons }, code) };
}

const pc = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
function advise(a, mine) {
  const out = [], { total, people, types, reasons } = a;
  if (!total.chosen) return out;
  if (total.rate != null) out.push({ tone: total.rate >= 0.8 ? 'good' : total.rate >= 0.65 ? 'warn' : 'bad', text: `${mine ? 'Bạn đã chọn' : 'Nhân sự đã chọn'} ${total.chosen} add-on, ${total.recorded} add-on được ghi nhận (${pc(total.rate)}), ${total.points} điểm. ${total.missed} add-on chưa được ghi nhận.` });
  const top = reasons[0];
  if (top && total.missed) out.push({ tone: 'warn', text: `Lý do chưa ghi nhận nhiều nhất: "${top.reason}" (${top.count} add-on, ${pc(top.share)}). Kiểm tra lại điều kiện ghi nhận (ticket, thời hạn, trạng thái) trước khi chọn add-on.` });
  const weak = types.filter((t) => t.chosen >= 10 && t.rate != null && t.rate < 0.5);
  weak.slice(0, 2).forEach((t) => out.push({ tone: 'warn', text: `Add-on "${t.label}" chỉ ghi nhận ${t.recorded}/${t.chosen} (${pc(t.rate)}): hay bị loại, cần nắm rõ rule ghi nhận của loại này.` }));
  if (!mine) {
    const low = people.filter((p) => p.chosen >= 8 && p.rate != null && p.rate < (total.rate ?? 0) - 0.15);
    if (low.length) out.push({ tone: 'warn', text: `Nhân sự có tỉ lệ ghi nhận thấp hơn mức chung trên 15 điểm %: ${low.slice(0, 5).map((p) => `${p.label} (${pc(p.rate)})`).join(', ')}. Nên rà lại các add-on không được ghi nhận của từng người.` });
  }
  return out;
}
