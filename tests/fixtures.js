/** Dữ liệu giả (không phải dữ liệu thật) để dựng cả ứng dụng trong kiểm tra tự động: tên và mã nhân sự đều là bịa. */
const col = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const rowOf = (cells, width = 30) => { const r = Array(width).fill(''); for (const [letters, v] of Object.entries(cells)) r[col(letters)] = v; return r; };

export const IDS = { config: null, kpi: 'KPIFILE000000000000000000001', score: 'SCOREFILE0000000000000000001', hr: 'HRFILE0000000000000000000001', addon: 'ADDONFILE000000000000000000001' };
const TEAM1 = [['9001', 'Nguyễn Văn An'], ['9002', 'Trần Thị Bình'], ['9003', 'Lê Hoàng Cường'], ['9004', 'Phạm Thu Dung']];
const TEAM2 = [['9005', 'Võ Minh Em'], ['9006', 'Đỗ Thanh Giang'], ['9007', 'Bùi Quốc Hùng'], ['9008', 'Hoàng Thị Lan']];
export const PEOPLE = [...TEAM1, ...TEAM2];

function kpiTab() {
  const rows = [rowOf({ M: 'Tháng 10/2026' })];
  const block = (team, update) => {
    rows.push(rowOf({ A: update }));
    team.forEach(([code, name], i) => {
      const k = 0.4 + i * 0.1;
      rows.push(rowOf({ A: i + 1, B: `${code} - ${name} - Customer Success`, C: 2, D: 500, E: 300 + i * 20, F: 40, G: 100, H: 15, I: 0.6, J: 250, K: 150 + i * 20, L: 100, M: 0.6, N: 'Không đạt', O: 500, P: 250 + i * 30, Q: 250, R: 0.5 + i * 0.05, S: 60, T: 30 + i * 5, U: 30, V: 0.5, W: 0.0833, X: 0.06 + i * 0.01, Y: i % 2 ? 'Đạt' : 'Không đạt', Z: k, AA: 0.3 + i * 0.08, AB: 15 }));
    });
    rows.push(rowOf({ A: 'Total', D: 2000, E: 1200 }));
  };
  block(TEAM1, 'Update 2h30 20/10');
  block(TEAM2, 'Update 2h30 20/10');
  // Các bảng pivot của tab "Theo dõi công việc" nằm dưới bảng KPI: tình trạng xử lý, data đã chia và tồn theo ngày (mỗi khối cách nhau một dòng trống).
  const pivot = (title, labels, valueOf) => {
    rows.push([], rowOf({ A: title }), rowOf({ B: 'Người xử lý', ...Object.fromEntries(labels.map((l, i) => [String.fromCharCode(67 + i), l])) }));
    PEOPLE.forEach(([code, name], i) => rows.push(rowOf({ B: `${code} - ${name} - Customer Success`, ...Object.fromEntries(labels.map((l, k) => [String.fromCharCode(67 + k), valueOf(i, k, l)])) })));
    rows.push(rowOf({ B: 'Grand Total' }));
  };
  const days = Array.from({ length: 21 }, (_, i) => i + 1);
  pivot('THEO TÌNH TRẠNG XỬ LÝ', ['Đã làm', 'Đang làm', 'Chưa làm', 'Hủy'], (i, k) => [300 + i * 20, 40, 100, 3][k]);
  pivot('DATA ĐÃ CHIA THEO NGÀY', [...days, 'Tổng'], (i, k, l) => (l === 'Tổng' ? 20 * 20 : 20 + ((i + k) % 5)));
  pivot('DATA CHƯA LÀM + ĐANG LÀM THEO NGÀY', [...days, 'Tổng'], (i, k, l) => (l === 'Tổng' ? 60 : k % 7 === 0 ? 3 + (i % 3) : 1));
  return rows;
}

const DETAIL_HEAD = ['Thời gian tạo', 'Công việc hỗ trợ', 'Retailer ID', 'Nguồn data', 'Mô tả', 'Product', 'Thời gian tương tác', 'Loại công việc', 'Người xử lý', 'Tình trạng xử lý', 'Tình trạng liên hệ', 'Nguyên nhân', 'Số cuộc gọi thực hiện', 'Mức độ KH hài lòng', 'Tỉnh/Thành phố', 'KH SC tác động', 'Tổng điểm', 'Điểm add on'];
function detailTab() {
  const rows = [DETAIL_HEAD];
  const jobs = ['CSKH T15 - DVKH', 'CSKH OI - DVKH', 'CSKH NA - DVKH'], contacts = ['Kết nối thành công', 'Kết nối thành công', 'Không nghe máy', 'Thuê bao', 'Hẹn liên hệ sau', ''], statuses = ['Đã làm', 'Đã làm', 'Đã làm', 'Đang làm', 'Chưa làm', 'Hủy'], products = ['FnB', 'Retail', 'Fnb', 'Booking', ''];
  for (let i = 0; i < 240; i++) {
    const [code, name] = PEOPLE[i % PEOPLE.length], day = 1 + (i % 20), pad = (n) => String(n).padStart(2, '0');
    const status = statuses[i % 6], contact = status === 'Chưa làm' || status === 'Hủy' ? '' : contacts[i % 6];
    const desc = i % 7 === 0 ? 'KNM KH tắt máy ngang' : 'Xác nhận thông tin hợp đồng, khách đang dùng ổn, đã tư vấn payment và hóa đơn điện tử cho khách hàng';
    rows.push([`2026-10-${pad(day)} 08:${pad(i % 60)} AM`, status === 'Đã làm' && i % 3 ? 'Tư vấn tính năng' : '', String(500000000 + i), ['T15', 'OI', 'NA', ''][i % 4], desc, products[i % 5], `2026-10-${pad(Math.min(day + (i % 9), 21))} 09:00 AM`, jobs[i % 3], `${code} - ${name} - Customer Success`, status, contact, '', i % 4 + 1, i % 5 ? 5 : 3, ['Hà Nội', 'Hồ Chí Minh', ''][i % 3], status === 'Đã làm' && i % 2 ? 1 : 0, 0, 0]);
  }
  return rows;
}

const SCORE_HEAD = ['Timestamp', 'Nhân sự', 'Retailer ID', 'Thời gian tạo Activity', ' Giai đoạn 1: Tiếp cận', 'Giai đoạn 2: Khảo sát', 'Giai đoạn 3: Tiếp nhận', 'Giai đoạn 4: Xử lý', 'Tương tác tổng thể', 'Các vấn đề khác liên quan đến quy trình', 'Điểm cộng (+)', 'Nhận xét (Note)', 'Số liên hệ', 'Góp ý', 'Đánh giá'];
function scoreTab() {
  const r = (who, act, g4, note, fb, score) => ['10/19/2026 9:00:00', who, '501111111', act, '', '', '', g4, '', '', '', note, '0901234567', fb, score];
  return [SCORE_HEAD,
    r('9001 - Nguyễn Văn An - Customer Success', '10/15/2026', 'Tư vấn thiếu/không đầy đủ (-2%)', '- Lỗi ứng xử & Bao biện: SC phản hồi chưa đúng\n- Thiếu nhạy bén xoa dịu', 'Cần rút kinh nghiệm', 2),
    r('9002 - Trần Thị Bình - Customer Success', '10/16/2026', '', '- Giai đoạn 1: Lời chào chuẩn kịch bản', '', 5),
    r('9001 - Nguyễn Văn An - Customer Success', '10/17/2026', '', 'ĐẠT, xử lý nhanh gọn', '', 4)];
}

/** Sheet Addon: mỗi loại (Payment, HDDT, Kship) một tab, có cột "Điểm ghi nhận". 9001: Payment 5đ + 0đ, Kship 1đ → trừ 9đ. */
function addonTabs() {
  const who = (code, name) => `${code} - ${name} - Customer Success`;
  const pay = [['STT', 'activityid', 'retailer_id', 'Khối SC hỗ trợ', 'Ngày tạo act', 'Ngày chỉnh sửa', 'Ngày đăng ký lần đầu', 'Trang thái đky?', 'Số ngày có digi invoice trong 30D', 'SC impact thành công payment?', 'last_name', 'Điểm ghi nhận'],
    ['1', '1001', '501000001', 'CSKH mới T15 - DVKH', '08/10/2026', '15/10/2026', '06/10/2026', 'yes', '9', 'success', who('9001', 'Nguyễn Văn An'), '5'],
    ['1', '1002', '501000002', 'CSKH mới T15 - DVKH', '08/10/2026', '15/10/2026', '06/10/2026', 'yes', '1', 'non-success', who('9001', 'Nguyễn Văn An'), '0'],
    ['1', '1003', '501000003', 'CSKH mới T15 - DVKH', '08/10/2026', '14/10/2026', '', 'yes', '12', 'success', who('9002', 'Trần Thị Bình'), '5'],
    ['1', '1004', '501000004', 'CSKH mới T15 - DVKH', '08/10/2026', '14/10/2026', '', 'yes', '3', 'non-success', who('8201', 'Người Ngoài Danh Sách'), '0']];
  const hddt = [['STT', 'activityid', 'retailer_id', 'createdtime', 'modifiedtime', 'min_merchant_regist_date', 'min_txn_date', 'total_einvoice', 'impact_hddt', 'last_name', 'Điểm ghi nhận'],
    ['1', '2001', '501000005', '25/09/2026', '30/09/2026', '29/09/2026', '09/10/2026', '4', 'yes', who('9003', 'Lê Hoàng Cường'), '5'],
    ['1', '2002', '501000006', '06/10/2026', '09/10/2026', '', '', '', 'no', who('9003', 'Lê Hoàng Cường'), '0']];
  const kship = [['STT', 'last_name', 'ticket_no', 'tk_createdtime', 'last_interaction_time', 'potentialid', 'retailer_id', 'kship_status', 'kship_nn_that_bai', 'kship_chitiet_that_bai', 'add_on', 'Điểm ghi nhận'],
    ['1', who('9001', 'Nguyễn Văn An'), 'TT1', '19/10/2026', '19/10/2026', '1', '501000007', 'Bán hàng', 'KH đang tìm hiểu', 'cần quen thao tác', 'Giới thiệu Kship', '1'],
    ['1', who('9002', 'Trần Thị Bình'), 'TT2', '20/10/2026', '20/10/2026', '2', '501000008', 'Thành công', '', '', 'Giới thiệu Kship', '5']];
  return { 'Payment': pay, 'HDDT': hddt, 'Kship': kship };
}

/** Sheet nhân sự: tab "Danh sách" và tab "Phép năm 2026" (mỗi tháng một khối 3 cột: phép thêm, đã dùng, còn). */
function hrTabs() {
  const staff = [['Tên nhân sự', 'Mã NV', 'Đầu số', 'Khu vực', 'Giới tính', 'Level'], ...PEOPLE.map(([code, name], i) => [`${code} - ${name} - Customer Success`, `NV${100 + i}`, code, i < 4 ? 'Miền Nam' : 'Miền Bắc', i % 2 ? 'Nữ' : 'Nam', 2])];
  const months = Array.from({ length: 10 }, (_, i) => i + 1);
  const title = ['', '', '', '', ''], head = ['MNV', 'Họ và tên', 'Phòng ban', '2025', '2026'];
  months.forEach((m) => { title.push(`${String(m).padStart(2, '0')}/2026`, '', ''); head.push('Phép thêm', 'Đã dùng', 'Còn'); });
  const leave = [title, head, ...PEOPLE.map(([, name], i) => {
    const row = [`NV${100 + i}`, name, 'SC', '2', '12'];
    let bal = 2 + (i % 3);
    months.forEach((m) => { const used = (m + i) % 4 === 0 ? 1 : 0; bal += 1 - used; row.push('1', used ? String(used) : '', (bal - (i === 3 ? m * 0.6 : 0)).toFixed(1).replace('.', ',')); });
    return row;
  })];
  return { 'Danh sách': staff, 'Phép năm 2026': leave };
}

/** Bảng tab theo từng Sheet: { [sheetId]: { [tên tab]: giá trị } }. */
export function buildFixtures(configId, memberEmail) {
  return {
    [configId]: {
      'Tài khoản': [['1', 'admin@kiotviet.com', 'Admin', 'Full quyền', 'Quản Trị Viên', 'Nam', ''], ['2', memberEmail, 'Thành viên', 'Chỉ xem', 'Nguyễn Văn An', 'Nam', '9001']],
      'Danh sách link': [['KPI', IDS.kpi, 'KPI'], ['Chấm call', IDS.score, ''], ['Danh sách nhân sự SC', IDS.hr, ''], ['Addon', IDS.addon, '']],
      'Cập nhật': [], 'Lịch sử': [], 'Đã nghe lại': [], 'Nhật ký thao tác': [], 'Gia hạn SLA': [], 'Cấu hình đồng bộ': [['https://kvcrm.kiotviet.vn/crm/list?filter=1', 'https://docs.google.com/spreadsheets/d/ABCDEFGHIJKLMNOPQRSTUVWXYZ/edit', 'Data T10', 'Bật', 'Tác vụ mẫu']], 'Cấu hình call': [],
    },
    [IDS.kpi]: { 'KPI T10': kpiTab(), 'Data T10': detailTab() },
    [IDS.score]: { 'Phản hồi biểu mẫu 1': scoreTab() },
    [IDS.hr]: hrTabs(),
    [IDS.addon]: addonTabs(),
  };
}
