/** Nút "Báo cáo gửi quản lý" (Tuần/Tháng, Excel/PDF): gom dữ liệu tùy chọn rồi xuất theo khuôn cố định. */
import { hasDetail, hasScores, loadDetail, loadScores } from '../data.js';
import { loadHistory } from '../history.js';
import { buildPeriodReport } from '../periodReport.js';
import { exportReportExcel, exportReportPdf } from '../export.js';
import { state } from './state.js';
import { ensureHeard } from './heard.js';

/** Xuất báo cáo tuần/tháng theo khuôn cố định (cần data chi tiết để có SLA và Kiểm soát; không tải được thì xuất phần KPI). */
export async function prepareReport(btn) {
  const [period, kind] = btn.dataset.prep.split(':'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang chuẩn bị…';
  try {
    let detail = state.segment.data;
    if (!detail && hasDetail()) detail = await loadDetail().then((d) => (state.segment.data = d)).catch(() => null);   // báo cáo tuần có thể kéo qua tháng trước nên lấy đủ các tháng
    // Phần xu hướng, chấm call và nghe lại là tùy chọn: không tải được thì báo cáo vẫn xuất các phần còn lại.
    const [history, scoreData] = await Promise.all([loadHistory().catch(() => null), (state.callctl.data ? Promise.resolve(state.callctl.data) : hasScores() ? loadScores().catch(() => null) : Promise.resolve(null))]);
    if (scoreData && !state.callctl.data) state.callctl.data = scoreData;
    if (!state.listen.heardLoaded) await ensureHeard();
    const report = buildPeriodReport({ data: state.data, rows: detail?.rows ?? null, period, history, scores: scoreData?.rows ?? null, heard: state.listen.heard });
    (kind === 'xlsx' ? exportReportExcel : exportReportPdf)(report);
  } finally { btn.disabled = false; btn.textContent = label; }
}
