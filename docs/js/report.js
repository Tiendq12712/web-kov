/** Đọc tab "Report ONLINE": bảng theo ngày từng người, thống kê tuần và thống kê tháng.
 *  Các khối được nhận ra bằng chữ trên tiêu đề (không phụ thuộc vị trí cột cố định). */
const DAY_SECONDS = 86400;
const HOUR_HEADER = /^\d{1,2}-\d{1,2}h$/;
const DURATION = /^(\d+):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;
const REGIONS = { nam: 'Miền Nam (HCM)', bac: 'Miền Bắc (HN)' };

const HEADERS = {
  calls: 'Tổng call', success: 'SL call kết nối thành công', rate: 'Tỉ lệ kết nối thành công',
  talk: 'Talktime', ring: 'Thời gian đổ chuông', talkPerCall: 'Talktime/call',
};
const DURATION_FIELDS = new Set(['talk', 'ring', 'talkPerCall']);

/* ---------- Đọc ô ---------- */
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const cellAt = (rows, r, c) => rows[r]?.[c] ?? null;

/** Sheets trả thời lượng dạng phần của ngày; file xuất ra có thể là chuỗi "h:mm:ss". */
export function toSeconds(v) {
  if (typeof v === 'number') return Math.round(v * DAY_SECONDS);
  const m = DURATION.exec(text(v));
  return m ? Math.round(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3] ?? 0)) : null;
}
const toNumber = (v) => (typeof v === 'number' ? v : null);
const codeOf = (name) => /\((\d+)\)\s*$/.exec(name)?.[1] ?? null;
const shortName = (name) => name.split(',')[0].trim();

/** Bản đồ "chữ tiêu đề -> số cột", lấy lần xuất hiện đầu tiên tính từ `from`. */
function columnsFrom(row, from) {
  const map = new Map();
  const hours = [];
  row.forEach((v, i) => {
    const t = text(v);
    if (i < from || !t) return;
    if (HOUR_HEADER.test(t) && hours.length < 13 && !map.has(`h:${t}`)) { hours.push(i); map.set(`h:${t}`, i); }
    else if (!map.has(t)) map.set(t, i);
  });
  return { get: (header) => map.get(header), hours, labels: [...map.keys()].filter((k) => k.startsWith('h:')).map((k) => k.slice(2)) };
}

function readMetrics(rows, r, cols) {
  const out = { hourly: cols.hours.map((c) => toNumber(cellAt(rows, r, c)) ?? 0) };
  for (const [key, header] of Object.entries(HEADERS)) {
    const v = cellAt(rows, r, cols.get(header));
    out[key] = DURATION_FIELDS.has(key) ? toSeconds(v) : toNumber(v);
  }
  return out;
}

/* ---------- Khối thống kê tháng ---------- */
function parseMonthly(rows) {
  const anchor = findCell(rows, (t) => t === 'TỔNG TEAM', 6);
  if (!anchor) throw new Error('Không tìm thấy khối "THỐNG KÊ THEO THÁNG" (TỔNG TEAM) trong tab báo cáo');
  const cols = columnsFrom(rows[anchor.r], anchor.c);
  const members = [];
  const averages = {};
  let pending = [];

  for (let r = anchor.r + 1; text(cellAt(rows, r, anchor.c)); r++) {
    const name = text(cellAt(rows, r, anchor.c));
    const base = { ...readMetrics(rows, r, cols) };
    const region = /MIỀN NAM/i.test(name) ? 'nam' : /MIỀN BẮC/i.test(name) ? 'bac' : null;
    if (region) {
      averages[region] = { ...base, kpiTalk: toSeconds(cellAt(rows, r, cols.get('KPI'))) };
      pending.forEach((m) => { m.region = region; });
      pending = [];
      continue;
    }
    const member = {
      ...base, code: codeOf(name), name: shortName(name), region: null,
      level: toNumber(cellAt(rows, r, cols.get('Level'))),
      workdays: toNumber(cellAt(rows, r, cols.get('Ngày công làm thực tế'))),
      kpiTalk: toSeconds(cellAt(rows, r, cols.get('KPI'))),
      talkOk: text(cellAt(rows, r, cols.get('Thực đạt'))) === 'Đạt',
    };
    members.push(member);
    pending.push(member);
  }
  return { members: members.filter((m) => m.code && m.region), averages, hours: cols.labels };
}

/* ---------- Khối thống kê tuần ---------- */
function parseWeekly(rows) {
  const weeks = [];
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (!/^Tuần\s*\d+/.test(text(v))) return;
    const cols = columnsFrom(row, c);
    const week = { label: text(v), members: {}, averages: {} };
    for (let i = r + 1; text(cellAt(rows, i, c)); i++) {
      const name = text(cellAt(rows, i, c));
      const metrics = readMetrics(rows, i, cols);
      if (/^Trung bình/i.test(name)) week.averages[/Nam/.test(name) ? 'nam' : 'bac'] = metrics;
      else if (codeOf(name)) week.members[codeOf(name)] = metrics;
    }
    weeks.push(week);
  }));
  return weeks.filter((w) => Object.values(w.averages).some((a) => a.calls > 0));
}

/* ---------- Bảng theo ngày của từng người ---------- */
const WORK_WEIGHT = { X: 1, 'X/2': 0.5 };

function parseDaily(rows) {
  const days = {};
  const timesheets = {};
  rows.forEach((row, r) => {
    if (text(row[2]) !== 'Ngày' || !codeOf(text(cellAt(rows, r - 1, 2)))) return;
    const code = codeOf(text(rows[r - 1][2]));
    const cols = columnsFrom(row, 2);
    const list = [];
    const sheet = [];
    let i = r + 1;
    for (; typeof cellAt(rows, i, 2) === 'number'; i++) {
      const work = text(cellAt(rows, i, cols.get('Công thực tế')));
      const metrics = readMetrics(rows, i, cols);
      list.push({ day: rows[i][2], ...metrics, work: WORK_WEIGHT[work] ?? 0 });
      sheet.push({ day: rows[i][2], mark: work, weight: WORK_WEIGHT[work] ?? 0, note: text(cellAt(rows, i, cols.get('Ghi chú'))), calls: metrics.calls, talk: metrics.talk });
    }
    // Dòng tổng ngay dưới bảng: "Công thực tế" cộng sẵn trong Sheet, để đối chiếu với số tự cộng.
    const total = toNumber(cellAt(rows, i, cols.get('Công thực tế')));
    while (list.length && !list.at(-1).calls) list.pop();   // bỏ các ngày chưa tới
    days[code] = list;
    timesheets[code] = { rows: sheet, total };
  });
  return { days, timesheets };
}

function findCell(rows, test, maxRow = rows.length) {
  for (let r = 0; r < Math.min(maxRow, rows.length); r++) {
    const c = rows[r].findIndex((v) => test(text(v)));
    if (c >= 0) return { r, c };
  }
  return null;
}

/** Kết quả: { hours, members, averages, weeks, days } — xem các hàm parse* ở trên. */
export function parseReport(rows, month = null) {
  if (rows.length < 5) throw new Error('Tab năng suất của tháng này chưa có dữ liệu');
  const monthly = parseMonthly(rows);
  return { month, regions: REGIONS, ...monthly, weeks: parseWeekly(rows), ...parseDaily(rows) };
}

const plain = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const rekey = (obj, map) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [map.get(k) ?? k, v]));

/**
 * File năng suất đôi khi ghi mã nhân sự khác file KPI (ví dụ cùng một người là 8452 ở file này nhưng 8618 ở file KPI),
 * khiến ngày công/năng suất không khớp được. Mã không có trong KPI thì ghép theo họ tên (không dấu) với người KPI chưa được ghép;
 * chỉ ghép khi duy nhất một người khớp. Trả về báo cáo đã đổi sang mã của file KPI.
 */
export function alignCodes(report, kpiMembers) {
  const kpiCodes = new Set(kpiMembers.map((m) => m.code));
  const taken = new Set(report.members.filter((m) => kpiCodes.has(m.code)).map((m) => m.code));
  const map = new Map();
  for (const m of report.members) {
    if (kpiCodes.has(m.code)) continue;
    const hits = kpiMembers.filter((k) => !taken.has(k.code) && plain(k.name) === plain(m.name));
    if (hits.length === 1) { map.set(m.code, hits[0].code); taken.add(hits[0].code); }
  }
  if (!map.size) return report;
  return {
    ...report, codeMap: map,
    members: report.members.map((m) => (map.has(m.code) ? { ...m, code: map.get(m.code), reportCode: m.code } : m)),
    days: rekey(report.days, map), timesheets: rekey(report.timesheets, map),
    weeks: report.weeks.map((w) => ({ ...w, members: rekey(w.members, map) })),
  };
}

/** Ngày công thực tế của từng nhân sự theo mã (nguồn: file năng suất, cột "Ngày công làm thực tế"). */
export const workdaysByCode = (report) => new Map(report.members.map((m) => [m.code, m.workdays]));
