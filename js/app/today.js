/** Trang "Hôm nay của tôi": tải dần dữ liệu và dựng giao diện. */
import { hasDetail, hasScores, loadDetailFor, loadScores } from '../data.js';
import { loadHistory } from '../history.js';
import { findMember } from '../welcome.js';
import { buildTodo } from '../todo.js';
import { todayView } from '../views/today.js';
import { openItems, myScores, myControl, myTrend } from '../today.js';
import { wallNow } from '../slaDetail.js';
import { state } from './state.js';
import { hooks } from './hooks.js';
import { currentSla } from './background.js';

/** Tải dần dữ liệu cho trang "Hôm nay của tôi" (data chi tiết của tháng, chấm call, lịch sử); phần nào xong thì vẽ lại. */
export function ensureTodayData() {
  const month = state.month;
  const load = (slice, loader, apply, ok = () => true) => {
    if (slice.data || slice.loading || slice.error) return;
    slice.loading = true;
    loader().then((d) => { if (ok()) apply(d); }).catch((err) => { if (err.code === 'auth') hooks.authLost(err.message); else slice.error = err.message; })
      .finally(() => { slice.loading = false; if (state.tab === 'me') hooks.renderView(); });
  };
  if (hasDetail()) load(state.segmentM, () => loadDetailFor([month]), (d) => { state.segmentM.data = d; }, () => month === state.month);
  if (hasScores()) load(state.callctl, loadScores, (d) => { state.callctl.data = d; });
  load(state.trend, loadHistory, (d) => { state.trend.data = d; });
}

export function renderToday(report) {
  ensureTodayData();
  const found = findMember(state.me.email, state.data.teams, state.me.name, state.me.code);
  if (!found) return todayView({ found: null });
  const code = found.member.code, detail = state.segmentM.data, now = wallNow();
  const todoItems = buildTodo({ me: { ...state.me, role: 'member' }, found, data: state.data, report: state.report.data, pbi: state.cinfo.data, unread: hooks.unread(), control: null, alerts: [], sla: state.data.work?.backlogAll ? currentSla() : null });   // việc của riêng bạn, kể cả khi bạn là quản lý
  return todayView({
    me: state.me, found, report, todoItems, month: state.month, hasScores: hasScores(),
    open: hasDetail() && !state.segmentM.error ? (detail ? openItems(detail.rows, code, now) : null) : undefined,
    control: hasDetail() && !state.segmentM.error ? (detail ? myControl(detail.rows, state.month, code) : null) : undefined,
    scores: hasScores() && !state.callctl.error ? (state.callctl.data ? myScores(state.callctl.data.rows, code) : null) : undefined,
    trend: state.trend.error ? undefined : (state.trend.data ? myTrend(state.trend.data, code) : null),
  });
}

