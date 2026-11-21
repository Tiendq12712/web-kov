/**
 * Thống kê theo "Loại công việc" của data (CSKH T15 - DVKH, CSKH OI - DVKH, CSKH NA - DVKH…):
 * tình trạng xử lý, tình trạng liên hệ (kết nối / không nghe máy…), impact, add-on; chia theo ngành hàng, công việc hỗ trợ và nhân sự.
 */
const sum = (list) => list.reduce((a, b) => a + b, 0);
const ratio = (a, b) => (b ? a / b : null);
const codeOf = (h) => /^(\d+)\s*-/.exec(h)?.[1] ?? '';
const nameOf = (h) => (/^\d+\s*-/.test(h) ? h.replace(/^(\d+)\s*-\s*([^-]+?)(\s*-.*)?$/, '$2').trim() : '(Chưa giao nhân sự)');

/** "CSKH T15 - DVKH" -> "T15". */
export const jobKey = (j) => /CSKH\s+(\S+)/i.exec(j ?? '')?.[1] ?? (String(j ?? '').trim() || '(Chưa có loại)');
/** Ngành hàng từ cột Product (FnB / Fnb gộp một). */
export const industryOf = (p) => { const t = String(p ?? '').trim().toLowerCase(); return t === 'fnb' ? 'FnB' : t === 'retail' ? 'Retail' : t === 'booking' ? 'Booking' : t ? String(p).trim() : 'Chưa phân loại'; };

/** Chỉ số của một nhóm data. Tỉ lệ liên hệ tính trên data đã có tình trạng liên hệ. */
export function metrics(rows) {
  const done = rows.filter((r) => r.status === 'Đã làm'), contacted = rows.filter((r) => r.contact && r.status !== 'Hủy');   // data Hủy không tính vào liên hệ
  const by = (label) => contacted.filter((r) => r.contact === label).length;
  const conn = by('Kết nối thành công');
  return {
    n: rows.length, done: done.length, doing: rows.filter((r) => r.status === 'Đang làm').length, todo: rows.filter((r) => r.status === 'Chưa làm').length, cancel: rows.filter((r) => r.status === 'Hủy').length,
    contacted: contacted.length, conn, noAnswer: by('Không nghe máy'), offline: by('Thuê bao'), later: by('Hẹn liên hệ sau'), wrong: by('Sai số'),
    connRate: ratio(conn, contacted.length), noAnswerRate: ratio(by('Không nghe máy'), contacted.length),
    impact: done.filter((r) => r.impact).length, impactRate: ratio(done.filter((r) => r.impact).length, done.length),
    connNoImpact: contacted.filter((r) => r.contact === 'Kết nối thành công' && !r.impact).length,
    addRows: contacted.filter((r) => r.add?.length).length, addRate: ratio(contacted.filter((r) => r.add?.length && r.contact === 'Kết nối thành công').length, conn),
  };
}

export function analyzeJobTypes(rows, { month = 'all', product = 'all', code = null, job = null } = {}) {
  const base = rows.filter((r) => (month === 'all' || r.month === month) && (!code || codeOf(r.handler) === code));
  const industries = [...new Set(base.map((r) => industryOf(r.product)))].sort();
  const scoped = base.filter((r) => product === 'all' || industryOf(r.product) === product);
  const jobs = [...new Set(scoped.map((r) => jobKey(r.jobType)))].sort((a, b) => scoped.filter((r) => jobKey(r.jobType) === b).length - scoped.filter((r) => jobKey(r.jobType) === a).length);
  const rowsOf = (j) => scoped.filter((r) => jobKey(r.jobType) === j);
  const byJob = jobs.map((j) => ({ job: j, ...metrics(rowsOf(j)) }));
  const total = metrics(scoped);
  // Không nghe máy theo ngành hàng (dùng toàn bộ ngành, không lọc product) để so sánh loại công việc × ngành.
  const matrixJobs = [...new Set(base.map((r) => jobKey(r.jobType)))].sort((a, b) => base.filter((r) => jobKey(r.jobType) === b).length - base.filter((r) => jobKey(r.jobType) === a).length);
  const matrix = matrixJobs.map((j) => ({ job: j, cells: Object.fromEntries(industries.map((ind) => [ind, metrics(base.filter((r) => jobKey(r.jobType) === j && industryOf(r.product) === ind))])) }));
  const sel = job && jobs.includes(job) ? job : jobs[0] ?? null;
  const selRows = sel ? rowsOf(sel) : [];
  const doneSel = selRows.filter((r) => r.status === 'Đã làm');
  const taskMap = new Map();
  for (const r of doneSel) for (const t of r.tasks) {   // data chưa ghi công việc hỗ trợ thì chưa có impact nên không liệt kê
    const x = taskMap.get(t) ?? taskMap.set(t, { task: t, n: 0, contacted: 0, conn: 0, impact: 0, add: 0 }).get(t);
    x.n += 1; x.contacted += r.contact ? 1 : 0; x.conn += r.contact === 'Kết nối thành công' ? 1 : 0; x.impact += r.impact ? 1 : 0; x.add += r.add?.length ? 1 : 0;
  }
  const tasks = [...taskMap.values()].map((x) => ({ ...x, share: ratio(x.n, doneSel.length), connRate: ratio(x.conn, x.contacted), impactRate: ratio(x.impact, x.n), addRate: ratio(x.add, x.n) })).sort((a, b) => b.n - a.n);
  const people = new Map();
  for (const r of selRows) { const k = codeOf(r.handler) || '(pool)'; (people.get(k) ?? people.set(k, { code: codeOf(r.handler), name: nameOf(r.handler), rows: [] }).get(k)).rows.push(r); }
  const byPerson = [...people.values()].map((p) => ({ code: p.code, name: p.name, ...metrics(p.rows) })).sort((a, b) => (b.noAnswerRate ?? 0) - (a.noAnswerRate ?? 0) || b.contacted - a.contacted);
  return { total, byJob, matrix, industries, jobs, sel, tasks, doneSel: doneSel.length, byPerson, months: [...new Set(rows.map((r) => r.month).filter(Boolean))].sort(), allIndustries: industries, nSum: sum(byJob.map((j) => j.n)) };
}

/** Impact qua từng tháng: cả đội và từng loại công việc (impact = data có "KH SC tác động" / data đã làm của tháng đó). */
export function impactByMonth(rows, months, code = '') {
  const per = months.map((m) => rows.filter((r) => r.month === m && (!code || codeOf(r.handler) === code)));
  const all = per.map((rs) => metrics(rs));
  const jobs = [...new Set(per.flat().map((r) => jobKey(r.jobType)))].sort((a, b) => sum(per.map((rs) => rs.filter((r) => jobKey(r.jobType) === b).length)) - sum(per.map((rs) => rs.filter((r) => jobKey(r.jobType) === a).length)));
  const list = jobs.map((job) => ({ job, cells: per.map((rs) => { const x = rs.filter((r) => jobKey(r.jobType) === job); return x.length ? metrics(x) : null; }) }));
  return { months, all, list };
}

const POOLS = [['Miền Nam', /Miền Nam/i], ['Miền Bắc', /Miền Bắc/i]];
/** Data chưa chia: người xử lý còn là nhóm "Chăm sóc khách hàng SC Miền Nam / Miền Bắc" (chưa có mã nhân sự), chưa làm xong. Theo nhóm × loại công việc và theo ngày tạo. */
export function unassignedStats(rows, month) {
  const open = rows.filter((r) => (!month || r.month === month) && !codeOf(r.handler ?? '') && /Chăm sóc khách hàng/i.test(r.handler ?? '') && (r.status === 'Chưa làm' || r.status === 'Đang làm'));
  const poolOf = (r) => POOLS.find(([, re]) => re.test(r.handler))?.[0] ?? 'Khác';
  const jobs = [...new Set(open.map((r) => jobKey(r.jobType)))].sort((a, b) => open.filter((r) => jobKey(r.jobType) === b).length - open.filter((r) => jobKey(r.jobType) === a).length);
  const pools = [...POOLS.map(([n]) => n), ...(open.some((r) => poolOf(r) === 'Khác') ? ['Khác'] : [])];
  const count = (list) => ({ n: list.length, byJob: Object.fromEntries(jobs.map((j) => [j, list.filter((r) => jobKey(r.jobType) === j).length])) });
  const byPool = pools.map((pool) => ({ pool, ...count(open.filter((r) => poolOf(r) === pool)) }));
  const days = [...new Set(open.map((r) => String(r.created ?? '').slice(0, 10)).filter(Boolean))].sort();
  const byDay = days.map((day) => { const l = open.filter((r) => String(r.created ?? '').slice(0, 10) === day); return { day, ...count(l), byPool: Object.fromEntries(pools.map((pl) => [pl, l.filter((r) => poolOf(r) === pl).length])) }; });
  return { jobs, pools, total: { ...count(open) }, byPool, byDay };
}
