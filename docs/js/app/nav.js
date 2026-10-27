/** Mô hình điều hướng (các tab, nhóm tab, biểu tượng) dựng từ dữ liệu và quyền hiện tại. */
import { raw } from '../dom.js';
import { hasReport, hasPbi, hasLibrary, hasHr, hasCalls, hasDetail, hasAddons, hasScores } from '../data.js';
import { findMember } from '../welcome.js';
import { state } from './state.js';

export const ICONS = {
  overview: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.8"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.8"/>',
  addon: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M17 3.5v7M13.5 7h7"/>',
  xfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  control: '<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  segment: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  connect: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  hr: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M17 11a3 3 0 1 0 0-6M18 14.5c2.2.6 3.5 2.4 3.5 5.5"/>',
  report: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  cinfo: '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>',
  library: '<path d="M3 5.5C5 4.5 8 4.5 12 6.5c4-2 7-2 9-1v13c-2-1-5-1-9 1-4-2-7-2-9-1z"/><path d="M12 6.5v13"/>',
  compare: '<path d="M7 4v16M17 4v16M3 9h8M13 15h8"/>',
  trend: '<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',
  sla: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 3h6"/>',
  work: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M8 15l2.5 2.5L16 13"/>',
};
export const tabIcon = (id) => raw(`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] ?? ICONS.team}</svg>`);

/** Cùng một danh sách tab: thanh ngang trên desktop, thanh dưới cùng trên mobile. */
/** Các mục điều hướng: một số mục gom thành nhóm (Team, Vận hành, Phân tích) mở ra danh sách để chọn. */
/** `monthList`: các tháng có trong danh sách link (để biết có được so sánh tháng không). */
export function buildNav(monthList) {
  const d = state.data, manager = state.me?.role !== 'member';
  const item = (id, name, short, desc = '') => ({ id, name, short: short ?? name, desc });
  const group = (id, name, icon, items) => (items.length > 1 ? { group: id, id, name, short: name, icon, items } : items[0]);
  const teams = d.teams.map((t) => item(t.id, t.name, t.name.replace('Team ', ''), 'KPI và nhân sự của team'));
  if (hasHr()) teams.push(item('hr', 'Phép năm', 'Phép năm', 'Nhân sự và phép năm 2026'));
  const reports = [];
  if (d.work) reports.push(item('work', 'Theo dõi công việc', 'Công việc', 'Tiến độ xử lý data, bảng chia data'));
  if (d.work?.backlogAll) reports.push(item('sla', 'SLA', 'SLA', 'Data đã trễ và sắp trễ hạn 7 ngày'));
  if (hasPbi()) reports.push(item('cinfo', 'Customer Info', 'C-Info', 'Tỉ lệ SC dùng Customer Info'));
  if (hasScores()) reports.push(item('callctl', 'Kiểm soát call', 'Chấm call', 'Kết quả chấm chất lượng cuộc gọi'));
  if (hasDetail()) reports.push(item('control', 'Kiểm soát', 'Kiểm soát', 'Data điền đúng quy trình, SLA và mức trừ'));
  if (hasDetail()) reports.push(item('addondetail', 'Chi tiết Add-on', 'Add-on', 'Thống kê toàn bộ add-on theo loại, team và nhân sự'));
  if (hasAddons()) reports.push(item('addon', 'Add-on', 'Add-on', 'Add-on đã chọn và được ghi nhận'));
  if (hasReport(state.month)) reports.push(item('report', 'Năng suất', 'Năng suất', 'Cuộc gọi, talktime, ngày công'));
  const analysis = [];
  if (manager) analysis.push(item('trend', 'Xu hướng', 'Xu hướng', 'Biến động theo ngày'));
  if (manager && hasDetail()) analysis.push(item('xfer', 'Chuyển Offline → Online', 'Chuyển data', 'Data chuyển theo tháng, nguồn và tỉnh/thành'));
  if (manager && hasDetail()) analysis.push(item('jobs', 'Theo loại công việc', 'Loại CV', 'So sánh CSKH T15, OI, NA: liên hệ, impact, add-on'));
  if (manager && hasDetail()) analysis.push(item('listen', 'Chọn call nghe lại', 'Nghe lại', 'Data kết nối thành công nhưng không impact, xếp mức ưu tiên'));
  if (manager && hasDetail()) analysis.push(item('segment', 'Phân tích tệp data', 'Tệp data', 'Công việc, kết nối, impact, add-on theo nguồn data'));
  if (manager && (hasCalls() || hasReport(state.month))) analysis.push(item('connect', 'Chất lượng kết nối', 'Kết nối', 'Tỉ lệ kết nối và call đàm thoại ngắn'));
  if (manager && monthList.length > 1) analysis.push(item('compare', 'So sánh tháng', 'So sánh', 'Đặt hai tháng cạnh nhau'));
  const me = findMember(state.me.email, d.teams, state.me.name, state.me.code) ? [item('me', 'Hôm nay của tôi', 'Hôm nay')] : [];   // trang riêng cho người có trong báo cáo KPI
  return [item('overview', 'Tổng quan'), ...me, group('team', 'Team', 'team', teams), group('ops', 'Vận hành', 'report', reports), group('analysis', 'Phân tích', 'trend', analysis),
    hasLibrary() ? item('library', 'Thư viện') : null, item('chat', 'Chia sẻ')].filter(Boolean);
}

