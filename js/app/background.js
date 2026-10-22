/** Dữ liệu tải nền và tính cho Tổng quan và trang "Hôm nay của tôi": kết quả Kiểm soát, cảnh báo theo ngưỡng, tải trước data chi tiết và chấm call. */
import { hasDetail, hasScores, loadDetailFor, loadScores } from '../data.js';
import { analyzeControl } from '../control.js';
import { computeAlerts } from '../alerts.js';
import { CONFIG } from '../config.js';
import { state, myCode, kpiNames } from './state.js';
import { hooks } from './hooks.js';

/** Kết quả Kiểm soát cho "Việc cần làm": quản lý thấy toàn đội, nhân sự chỉ phần của mình; chỉ có khi data chi tiết đã tải xong. */
let ctlMemo = { key: null, value: null };
export function todoControl() {
  const d = state.segmentM.data ?? state.segment.data;
  if (!d) return null;
  const code = state.me.role === 'member' ? myCode() : null, key = `${state.month}|${code}`;
  if (ctlMemo.data !== d || ctlMemo.key !== key) ctlMemo = { data: d, key, value: analyzeControl(d.rows, { month: state.month, code }) };
  return ctlMemo.value;
}
/** Cảnh báo theo ngưỡng cho quản lý: tính từ data chi tiết của tháng và kết quả chấm call (khi đã tải xong). */
let alertMemo = { key: null, value: [] };
export function todoAlerts() {
  if (state.me.role === 'member') return [];
  const d = state.segmentM.data ?? state.segment.data, sc = state.callctl.data;
  const key = `${state.month}|${d ? d.rows.length : 0}|${sc ? sc.rows.length : 0}`;
  if (alertMemo.key !== key) {
    const names = kpiNames();
    alertMemo = { key, value: computeAlerts({ rows: d?.rows ?? null, month: state.month, control: todoControl(), scores: sc?.rows ?? null, nameFor: (code) => names.get(code) ?? null, cfg: CONFIG.alerts }) };
  }
  return alertMemo.value;
}

/** Tải nền data chi tiết sau khi vào trang để "Việc cần làm" có số lỗi Kiểm soát; không chặn giao diện. */
function preloadScores() {
  if (!hasScores() || state.callctl.data || state.callctl.loading || state.me.role === 'member') return;
  setTimeout(() => loadScores().then((d) => { if (!state.callctl.data) { state.callctl.data = d; if (state.tab === 'overview') hooks.renderView(); } }).catch(() => {}), 3500);
}
export function preloadDetail() {
  preloadScores();
  if (!hasDetail() || state.segmentM.data || state.segment.data || state.segmentM.loading) return;
  const month = state.month;
  setTimeout(() => loadDetailFor([month]).then((d) => { if (month === state.month && !state.segmentM.data) { state.segmentM.data = d; if (state.tab === 'overview') hooks.renderView(); } }).catch(() => {}), 2500);
}

