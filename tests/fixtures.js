/** Dữ liệu giả (không phải dữ liệu thật) để dựng cả ứng dụng trong kiểm tra tự động: tên và mã nhân sự đều là bịa. */
const col = (letters) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const rowOf = (cells, width = 30) => { const r = Array(width).fill(''); for (const [letters, v] of Object.entries(cells)) r[col(letters)] = v; return r; };

export const IDS = { config: null, kpi: 'KPIFILE000000000000000000001', score: 'SCOREFILE0000000000000000001' };
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

/** Bảng tab theo từng Sheet: { [sheetId]: { [tên tab]: giá trị } }. */
export function buildFixtures(configId, memberEmail) {
  return {
    [configId]: {
      'Tài khoản': [['1', 'admin@kiotviet.com', 'Admin', 'Full quyền', 'Quản Trị Viên', 'Nam', ''], ['2', memberEmail, 'Thành viên', 'Chỉ xem', 'Nguyễn Văn An', 'Nam', '9001']],
      'Danh sách link': [['KPI', IDS.kpi, 'KPI'], ['Chấm call', IDS.score, '']],
      'Cập nhật': [], 'Lịch sử': [], 'Đã nghe lại': [], 'Nhật ký thao tác': [], 'Gia hạn SLA': [], 'Cấu hình đồng bộ': [], 'Cấu hình call': [],
    },
    [IDS.kpi]: { 'KPI T10': kpiTab(), 'Data T10': detailTab() },
    [IDS.score]: { 'Phản hồi biểu mẫu 1': scoreTab() },
  };
}
