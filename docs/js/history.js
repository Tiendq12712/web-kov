import { countedActs } from './pbi.js';
import { CONFIG } from './config.js';
import { readTable, writeTable } from './sheetTable.js';
import { computeSla } from './sla.js';

/**
 * Lịch sử số liệu: mỗi lần đồng bộ CRM ta lưu một "ảnh chụp" (mỗi nhân sự một dòng) vào tab "Lịch sử" của Sheet cấu hình,
 * để vẽ xu hướng theo ngày. Một ngày chỉ giữ ảnh chụp mới nhất; ảnh chụp quá cũ bị bỏ để Sheet không phình to.
 */
const COLUMNS = ['Ngày', 'Mã NS', 'Tên', 'KPI', 'ĐK cần', 'Điểm tổng', 'Add-on', 'Act đã làm', 'Act phân công',
  'Data trễ SLA', 'Data sắp trễ SLA', 'Data tồn', 'Data đã chia', 'Act C-Info', 'Không dùng C-Info'];
const target = { url: CONFIG.configSheet, tab: CONFIG.tabs.history, columns: COLUMNS, maxRows: 6000 };
const KEEP_DAYS = 150;

const n = (v) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) && String(v ?? '').trim() !== '' ? x : null; };
const round = (v, d = 4) => (v == null ? '' : Number(v.toFixed(d)));

const toRecord = ([date, code, name, kpi, need, main, addon, actDone, assigned, late, soon, backlog, base, cinfoTotal, cinfoNot]) => ({
  date: String(date).trim(), code: String(code).trim(), name: String(name).trim(),
  kpi: n(kpi), need: n(need), main: n(main), addon: n(addon), actDone: n(actDone), assigned: n(assigned),
  late: n(late), soon: n(soon), backlog: n(backlog), base: n(base), cinfoTotal: n(cinfoTotal), cinfoNot: n(cinfoNot),
});
const fromRecord = (r) => [r.date, r.code, r.name, round(r.kpi), round(r.need), round(r.main), round(r.addon), r.actDone ?? '', r.assigned ?? '',
  r.late ?? '', r.soon ?? '', r.backlog ?? '', r.base ?? '', r.cinfoTotal ?? '', r.cinfoNot ?? ''];

export async function loadHistory() {
  const rows = (await readTable(target)).map(toRecord).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.code);
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

/** Ảnh chụp của ngày `date` từ dữ liệu đang hiển thị (KPI + SLA + Customer Info nếu có). */
export function buildSnapshot({ data, month, date, pbi }) {
  const sla = computeSla(data.work, date, month, { live: false });
  const slaBy = new Map((sla?.rows ?? []).map((r) => [r.code, r]));
  const cinfo = new Map();
  for (const a of countedActs(pbi?.acts ?? [])) {
    const c = cinfo.get(a.code) ?? { total: 0, not: 0 };
    c.total += 1; c.not += a.used ? 0 : 1;
    cinfo.set(a.code, c);
  }
  return data.teams.flatMap((t) => t.members).map((m) => {
    const s = slaBy.get(m.code), c = cinfo.get(m.code);
    return {
      date, code: m.code, name: m.name, kpi: m.kpi, need: m.need?.rate ?? null, main: m.main?.rate ?? null, addon: m.addon?.rate ?? null,
      actDone: m.extra?.actDone ?? null, assigned: m.extra?.assigned ?? null,
      late: s?.late ?? null, soon: s?.soon ?? null, backlog: s?.total ?? null, base: s?.base ?? null,
      cinfoTotal: c?.total ?? null, cinfoNot: c?.not ?? null,
    };
  });
}

/** Ghi ảnh chụp: thay toàn bộ dòng của cùng ngày, giữ các ngày khác (bỏ ngày quá cũ). */
export async function recordHistory(snapshot) {
  if (!snapshot.length) return 0;
  const date = snapshot[0].date;
  const existing = await loadHistory();
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const kept = existing.filter((r) => r.date !== date && r.date >= cutoff);
  const rows = [...kept, ...snapshot].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
  await writeTable({ ...target, rows: rows.map(fromRecord), previousLength: existing.length });
  return snapshot.length;
}

/* ---------- Gộp cho biểu đồ ---------- */
export const METRICS = {
  kpi: { label: 'KPI tổng', pct: true, goodUp: true, agg: 'mean', get: (r) => r.kpi },
  late: { label: 'Data trễ SLA', pct: false, goodUp: false, agg: 'sum', get: (r) => r.late },
  soon: { label: 'Data sắp trễ SLA', pct: false, goodUp: false, agg: 'sum', get: (r) => r.soon },
  cinfo: { label: '% dùng Customer Info', pct: true, goodUp: true, agg: 'cinfo', get: (r) => (r.cinfoTotal ? 1 - r.cinfoNot / r.cinfoTotal : null) },
  actDone: { label: 'Act đã làm', pct: false, goodUp: true, agg: 'sum', get: (r) => r.actDone },
};

/** Giá trị theo ngày của một chỉ số cho một người (`code`) hoặc toàn bộ ('all'): [{ date, value }]. */
export function series(records, metric, who) {
  const m = METRICS[metric];
  const byDate = new Map();
  for (const r of records) {
    if (who !== 'all' && r.code !== who) continue;
    (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)).push(r);
  }
  return [...byDate].map(([date, rows]) => {
    const vals = rows.map(m.get).filter((v) => v != null);
    let value = null;
    if (m.agg === 'cinfo') { const t = rows.reduce((a, r) => a + (r.cinfoTotal ?? 0), 0); value = t ? 1 - rows.reduce((a, r) => a + (r.cinfoNot ?? 0), 0) / t : null; }
    else if (vals.length) value = m.agg === 'sum' ? vals.reduce((a, b) => a + b, 0) : vals.reduce((a, b) => a + b, 0) / vals.length;
    return { date, value };
  }).filter((p) => p.value != null).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- Phân tích xu hướng ---------- */
const dmOf = (iso) => iso.split('-').slice(1).reverse().map(Number).join('/');
export const fmtMetric = (m, v) => (v == null ? '—' : m.pct ? `${(v * 100).toFixed(1).replace('.', ',')}%` : String(Math.round(v * 10) / 10).replace('.', ','));
export const fmtDeltaMetric = (m, d) => (m.pct ? `${(Math.abs(d) * 100).toFixed(1).replace('.', ',')} điểm %` : String(Math.round(Math.abs(d) * 10) / 10).replace('.', ','));
/** Thay đổi theo hướng tốt/xấu: 'good' | 'bad' | '' (không đổi). */
export const toneOf = (m, d) => (!d ? '' : (m.goodUp ? d > 0 : d < 0) ? 'good' : 'bad');
/** Lấy N ngày cuối của chuỗi ('all' = hết). */
export const lastN = (list, n) => (n === 'all' || !Number(n) ? list : list.slice(-Number(n)));

/** Biến động từng nhân sự giữa hai ngày gần nhất, xếp từ cải thiện nhiều nhất đến xấu nhất (theo hướng tốt của chỉ số). */
export function movers(records, metric) {
  const m = METRICS[metric];
  const names = new Map(records.map((r) => [r.code, r.name]));
  return [...names].map(([code, name]) => {
    const s = series(records, metric, code), last = s.at(-1), prev = s.at(-2);
    return { code, name, last: last?.value ?? null, prev: prev?.value ?? null, delta: last && prev ? last.value - prev.value : null, values: s.map((p) => p.value) };
  }).filter((r) => r.delta != null).sort((a, b) => (m.goodUp ? b.delta - a.delta : a.delta - b.delta));
}

/** Ma trận nhân sự × N ngày gần nhất: mỗi ô { value, delta so với ngày liền trước }. */
export function dayMatrix(records, metric, days = 10) {
  const dates = lastN([...new Set(records.map((r) => r.date))].sort(), days);
  const names = new Map(records.map((r) => [r.code, r.name]));
  const rows = [...names].map(([code, name]) => {
    const s = new Map(series(records, metric, code).map((p) => [p.date, p.value]));
    return { code, name, cells: dates.map((d, i) => ({ date: d, value: s.get(d) ?? null, delta: s.get(d) != null && s.get(dates[i - 1]) != null ? s.get(d) - s.get(dates[i - 1]) : null })) };
  }).filter((r) => r.cells.some((c) => c.value != null)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  return { dates, rows };
}

/** Nhận định bằng lời cho chuỗi đang xem: [{ tone, text }]. */
export function trendInsights(records, metric, who, scopeName = 'Toàn đội') {
  const m = METRICS[metric], s = series(records, metric, who), out = [];
  if (s.length < 2) return out;
  const first = s[0], last = s.at(-1), prev = s.at(-2), d = last.value - prev.value;
  const verb = (x) => (x > 0 ? 'tăng' : 'giảm');
  out.push({ tone: toneOf(m, d), text: `${scopeName} · ${m.label}: ${fmtMetric(m, last.value)} (${dmOf(last.date)}), ${d === 0 ? 'không đổi' : `${verb(d)} ${fmtDeltaMetric(m, d)}`} so với ${dmOf(prev.date)}.` });
  let run = 0;
  for (let i = s.length - 1; i > 0; i--) { const x = s[i].value - s[i - 1].value; if (x === 0 || Math.sign(x) !== Math.sign(d)) break; run += 1; }
  if (d !== 0 && run >= 3) out.push({ tone: toneOf(m, d), text: `Đã ${verb(d)} liên tục ${run} ngày gần nhất.` });
  const dFirst = last.value - first.value;
  if (dFirst !== 0 && s.length > 2) out.push({ tone: toneOf(m, dFirst), text: `So với ngày đầu theo dõi (${dmOf(first.date)}: ${fmtMetric(m, first.value)}): ${verb(dFirst)} ${fmtDeltaMetric(m, dFirst)}.` });
  const best = [...s].sort((a, b) => (m.goodUp ? b.value - a.value : a.value - b.value))[0];
  if (best.date !== last.date) out.push({ tone: '', text: `Ngày tốt nhất: ${dmOf(best.date)} (${fmtMetric(m, best.value)}).` });
  if (who === 'all') {
    const mv = movers(records, metric).filter((x) => x.delta !== 0);
    const up = mv.filter((x) => toneOf(m, x.delta) === 'good').slice(0, 2), down = [...mv].reverse().filter((x) => toneOf(m, x.delta) === 'bad').slice(0, 2);
    const fmtList = (list) => list.map((x) => `${x.name} (${x.delta > 0 ? '+' : '−'}${fmtDeltaMetric(m, x.delta)})`).join(', ');
    if (up.length) out.push({ tone: 'good', text: `Cải thiện nhiều nhất so với hôm trước: ${fmtList(up)}.` });
    if (down.length) out.push({ tone: 'bad', text: `Cần chú ý (xấu đi nhiều nhất): ${fmtList(down)}.` });
  }
  return out;
}
