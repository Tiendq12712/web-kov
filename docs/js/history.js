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
  for (const a of pbi?.acts ?? []) {
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
