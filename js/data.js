import { getToken } from './auth.js';
import { fetchRows, fetchTabs, parseKpi } from './sheet.js';
import { parseTab, buildLibrary } from './library.js';
import { buildHr } from './hr.js';
import { parseReport, alignCodes } from './report.js';
import { tryParseWork } from './work.js';
import { loadLinks, resolveMonths } from './directory.js';
import { loadSyncTime, applySyncTime } from './syncTime.js';
import { parsePbi } from './pbi.js';
import { parseCalls } from './calls.js';
import { parseDetail } from './segment.js';

const cache = new Map();
const store = new Map();   // kết quả đã tải xong (để lưu lại dùng cho lần mở sau)
let months = [];
let monthsPromise = null;
let pbiLink = null;      // link Power BI (dòng "PBI" trong tab Danh sách link)
let hrLink = null;       // link "Danh sách nhân sự SC" (tab Danh sách + tab Phép năm)
let callLink = null;     // link "Dữ liệu call" (từng cuộc gọi do mục Xuất Call ghi ra)
let libraryLink = null;  // link "Thư viện" (dòng Thư viện trong tab Danh sách link)

/** Danh sách tháng được dựng từ tab "Danh sách link" của Sheet cấu hình. */
const isPbi = (l) => l.info.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'pbi';
const isHr = (l) => /nhan su/.test(l.info.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase());
const isCalls = (l) => /^du lieu call/.test(l.info.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase());
const isLibrary = (l) => l.info.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase().replace(/\s+/g, ' ') === 'thu vien';
export const loadMonths = () => (monthsPromise ??= loadLinks().then((links) => {
  pbiLink = links.find(isPbi) ?? null;
  libraryLink = links.find(isLibrary) ?? null;
  hrLink = links.find(isHr) ?? null;
  callLink = links.find(isCalls) ?? null;
  return resolveMonths(links);
}).then((list) => (months = list)));
export const reloadMonths = () => { monthsPromise = null; cache.clear(); store.clear(); };

const entryOf = (ym) => {
  const entry = months.find((m) => m.month === ym);
  if (!entry) throw new Error(`Chưa có link báo cáo cho tháng ${ym}`);
  return entry;
};

/** Đọc một nguồn một lần mỗi tháng; lỗi thì cho phép thử lại. */
function memo(key, load) {
  if (!cache.has(key)) {
    const request = load();
    request.then((value) => store.set(key, value), () => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

/** Tab tháng: bảng KPI Team Online, kèm các báo cáo theo dõi công việc nằm bên dưới (nếu có). */
export const loadMonth = (ym) => memo(ym, () => {
  const { kpi } = entryOf(ym);
  return Promise.all([fetchRows(kpi.id, getToken(), { tab: kpi.tab }), memo('sync', loadSyncTime)])
    .then(([rows, synced]) => applySyncTime({ ...parseKpi(rows, ym), work: tryParseWork(rows) }, synced));
});

export const hasReport = (ym) => Boolean(months.find((m) => m.month === ym)?.productivity);

export const loadReport = (ym) => memo(`report:${ym}`, () => {
  const { productivity } = entryOf(ym);
  if (!productivity) throw new Error('Tháng này chưa có link báo cáo năng suất');
  // Cần danh sách nhân sự của file KPI để ghép lại các mã nhân sự lệch giữa hai file.
  return Promise.all([fetchRows(productivity.id, getToken(), { tab: productivity.tab, range: 'A1:DZ1000' }), loadMonth(ym)])
    .then(([rows, kpi]) => alignCodes(parseReport(rows, ym), kpi.teams.flatMap((t) => t.members)));
});

/** Báo cáo Power BI "SC sử dụng Customer Info": có khi tab Danh sách link có dòng PBI. */
export const hasPbi = () => Boolean(pbiLink);
export const loadPbi = () => memo('pbi', () => {
  if (!pbiLink) throw new Error('Chưa có link PBI trong tab Danh sách link');
  return fetchRows(pbiLink.id, getToken(), { tab: pbiLink.tab || 'Data', range: 'A1:Z8000' }).then(parsePbi);
});

/** Thư viện tài liệu: mỗi tab hiển thị của Sheet là một nhóm (Quy trình/quy định, Chính sách, Giải trình…). */
export const hasLibrary = () => Boolean(libraryLink);
export const loadLibrary = () => memo('library', async () => {
  if (!libraryLink) throw new Error('Chưa có link Thư viện trong tab Danh sách link');
  const token = getToken();
  const tabs = libraryLink.tab ? [libraryLink.tab] : await fetchTabs(libraryLink.id, token);
  const parsed = await Promise.all(tabs.map(async (name) => {
    const rows = await fetchRows(libraryLink.id, token, { tab: `'${name.replace(/'/g, "''")}'`, range: 'A1:H500', render: 'FORMATTED_VALUE' });
    return parseTab(name, rows);
  }));
  return buildLibrary(parsed);
});

/** Nhân sự và phép năm: đọc tab có chữ "danh sách" và tab có chữ "phép" trong Sheet nhân sự. */
export const hasHr = () => Boolean(hrLink);
export const loadHr = () => memo('hr', async () => {
  if (!hrLink) throw new Error('Chưa có link Danh sách nhân sự trong tab Danh sách link');
  const token = getToken();
  const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const tabs = await fetchTabs(hrLink.id, token);
  const staffTab = tabs.find((t) => plain(t).includes('danh sach')), leaveTab = tabs.find((t) => plain(t).includes('phep'));
  if (!staffTab || !leaveTab) throw new Error('Sheet nhân sự cần có tab "Danh sách" và tab "Phép năm …"');
  const read = (name) => fetchRows(hrLink.id, token, { tab: `'${name.replace(/'/g, "''")}'`, range: 'A1:BZ300', render: 'FORMATTED_VALUE' });
  const [staff, leave] = await Promise.all([read(staffTab), read(leaveTab)]);
  return buildHr(staff, leave);
});

/** Dữ liệu từng cuộc gọi (Sheet lớn): đọc một lần mỗi phiên, không lưu vào bản dữ liệu của ngày. */
export const hasCalls = () => Boolean(callLink);
export const loadCalls = () => memo('calls', async () => {
  if (!callLink) throw new Error('Chưa có link "Dữ liệu call" trong tab Danh sách link');
  const token = getToken();
  const tabs = callLink.tab ? [callLink.tab] : await fetchTabs(callLink.id, token);   // mỗi tab một tháng (T7, T8, T9, T10…)
  const sets = await Promise.all(tabs.map((tab) => fetchRows(callLink.id, token, { tab: `'${tab.replace(/'/g, "''")}'`, range: 'A1:O60000' })));
  return parseCalls(sets, tabs);
});

/** Chi tiết từng việc của file KPI (tab "Data Txx" của mỗi tháng): dùng để phân tích theo tệp data. */
export const hasDetail = () => months.some((m) => m.detail);
export const loadDetail = () => memo('detail', async () => {
  const token = getToken();
  const list = months.filter((m) => m.detail);
  const sets = await Promise.all(list.map((m) => fetchRows(m.detail.id, token, { tab: `'${m.detail.tab.replace(/'/g, "''")}'`, range: 'A1:AK30000' })));
  const rows = sets.flatMap((set, i) => parseDetail(set, list[i].month));
  return { rows, months: list.map((m) => m.month).sort() };
});

export const clearCache = () => { cache.clear(); store.clear(); };

/** Ảnh chụp dữ liệu đã tải, lưu cục bộ để mở lại trong ngày là thấy ngay dù token Google đã hết hạn. */
export const snapshotData = () => ({ months, pbi: pbiLink, library: libraryLink, hr: hrLink, calls: callLink, entries: [...store].filter(([key]) => key !== 'sync' && key !== 'calls' && key !== 'detail') });
export function restoreData({ months: saved, pbi, library, hr, calls, entries }) {
  months = saved;
  pbiLink = pbi ?? null;
  libraryLink = library ?? null;
  hrLink = hr ?? null;
  callLink = calls ?? null;
  monthsPromise = Promise.resolve(saved);
  entries.forEach(([key, value]) => { cache.set(key, Promise.resolve(value)); store.set(key, value); });
}
