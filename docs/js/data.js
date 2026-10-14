import { getToken } from './auth.js';
import { fetchRows, parseKpi } from './sheet.js';
import { parseReport } from './report.js';
import { tryParseWork } from './work.js';
import { loadLinks, resolveMonths } from './directory.js';
import { loadSyncTime, applySyncTime } from './syncTime.js';

const cache = new Map();
const store = new Map();   // kết quả đã tải xong (để lưu lại dùng cho lần mở sau)
let months = [];
let monthsPromise = null;

/** Danh sách tháng được dựng từ tab "Danh sách link" của Sheet cấu hình. */
export const loadMonths = () => (monthsPromise ??= loadLinks().then(resolveMonths).then((list) => (months = list)));
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
  return fetchRows(productivity.id, getToken(), { tab: productivity.tab, range: 'A1:DZ1000' }).then((rows) => parseReport(rows, ym));
});

export const clearCache = () => { cache.clear(); store.clear(); };

/** Ảnh chụp dữ liệu đã tải, lưu cục bộ để mở lại trong ngày là thấy ngay dù token Google đã hết hạn. */
export const snapshotData = () => ({ months, entries: [...store].filter(([key]) => key !== 'sync') });
export function restoreData({ months: saved, entries }) {
  months = saved;
  monthsPromise = Promise.resolve(saved);
  entries.forEach(([key, value]) => { cache.set(key, Promise.resolve(value)); store.set(key, value); });
}
