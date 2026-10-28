/** Trạng thái chung của ứng dụng (một đối tượng duy nhất) và các hàm chọn nhanh từ nó. Các module của giao diện đều đọc/ghi qua đây. */
import { DEFAULT_FILTERS } from '../views/cinfo.js';
import { findMember } from '../welcome.js';

/** Lưu lựa chọn giao diện của riêng trình duyệt này; lỗi (chế độ riêng tư…) thì dùng mặc định. */
export function readPref(key, fallback) {
  try { return localStorage.getItem(`kpi.${key}`) ?? fallback; } catch { return fallback; }
}

export function readCoachPref() {
  try { return { side: 'right', open: true, ...JSON.parse(localStorage.getItem('kpi.coach')) }; } catch { return { side: 'right', open: true }; }
}
export const saveCoachPref = () => { try { localStorage.setItem('kpi.coach', JSON.stringify(state.coachPref)); } catch {} };

export const state = {
  month: null, data: null,
  tab: 'overview',           // 'overview' | 'work' | 'report' | 'settings' | team id
  tview: readPref('tview', 'compact'),   // bảng nhân sự: compact (tối giản) | full (đầy đủ)
  osort: { key: 'kpi', dir: 'desc' },   // sắp xếp bảng nhân sự trang tổng quan
  mstatus: 'all', mquery: '',   // lọc tình trạng + tìm kiếm ở bảng nhân sự trang tổng quan
  filter: 'all',             // bộ lọc team ở bảng nhân sự trang tổng quan
  heat: readPref('heat2', 'bars'),   // kiểu màu bảng: bars (thanh màu) | alert (ít màu) | full (nhiều màu)
  query: '',
  sort: { key: 'kpi', dir: 'desc' },
  report: { data: null, loading: false, error: '', region: 'all', weekMetric: 'calls', dayMetric: 'calls', query: '', sort: { key: 'talk', dir: 'desc' } },
  work: { team: 'all', matrix: 'backlogAll', query: '', sort: { key: 'pctDone', dir: 'desc' } },
  cinfo: { data: null, loading: false, error: '', f: { ...DEFAULT_FILTERS }, evals: new Map(), evalsLoaded: false, evalsLoading: false, evalNotice: '' },   // báo cáo Customer Info (PBI) + bộ lọc
  trend: { data: null, loading: false, error: '', metric: 'kpi', who: 'all', range: 'all' },   // xu hướng theo ngày (lịch sử đồng bộ)
  compare: { a: null, b: null, key: '', data: null, loading: false, error: '' },   // so sánh hai tháng (quản lý)
  connect: { region: 'all', shortSec: 30, longSec: 180, view: 'month' },   // phân tích chất lượng call kết nối (dùng chung dữ liệu năng suất)
  calls: { data: null, loading: false, error: '' },
  segmentM: { data: null, loading: false, error: '' },   // chi tiết data của riêng tháng đang xem (SLA, Kiểm soát, Công việc)
  segment: { data: null, loading: false, error: '', key: '', month: 'all' },
  xfer: { month: 'all' },   // data chuyển Offline → Online (dùng chung dữ liệu chi tiết)
  jobs: { month: null, product: 'all', job: 'T15' },   // thống kê theo loại công việc (dùng chung dữ liệu chi tiết)
  listen: { month: null, job: 'T15', person: 'all', level: 'attn', heard: new Map(), heardLoaded: false, heardLoading: false, heardFilter: 'all', heardNotice: '', hasScores: false },   // gợi ý nghe lại call (dùng chung dữ liệu chi tiết)
  callctl: { data: null, loading: false, error: '', month: 'all', person: 'all', q: 'all', stars: 'all', has: 'all', err: 'all', sort: 'priority', text: '' },   // kết quả chấm call (Sheet Chấm call)
  addonD: { person: 'all', type: 'all' },   // chi tiết add-on theo loại / nhân sự (dùng chung dữ liệu chi tiết Data Txx)
  control: { rule: 'all', person: 'all' },   // kiểm soát data theo quy trình (dùng chung dữ liệu chi tiết Data Txx)
  addons: { data: null, loading: false, error: '', month: 'all', type: 'all', person: 'all', status: 'all', q: '' },   // add-on nhân sự chọn và được ghi nhận (Sheet PBI, tab Chi tiết addon)   // phân tích tệp data (tab Data Txx)   // từng cuộc gọi (Sheet "Dữ liệu call")
  hr: { data: null, loading: false, error: '', q: '', region: 'all', status: 'all' },   // nhân sự và phép năm
  library: { data: null, loading: false, error: '', cat: 'all', q: '' },   // thư viện tài liệu (quy trình, chính sách, giải trình…)
  coach: null, coachBump: 0,   // nhân vật Coach KPI nổi ở góc màn hình
  coachPref: readCoachPref(),  // { side: 'left' | 'right', open }
  todo: null,                // "Việc cần làm hôm nay" của trang Tổng quan
  accounts: [],              // danh sách tài khoản (để Admin/Quản trị chọn nhân sự trong tab Chia sẻ)
  me: null,                  // { email, role } — role: admin | manager | member
};

/** Ngày số liệu mới nhất trong các team (mốc tính tuổi data cho SLA). */
export const latestAsOf = (data) => data.teams.map((t) => t.asOf).sort().at(-1);

/** Đầu số của người đang đăng nhập (ưu tiên cột Đầu số trong tab Tài khoản). */
export const myCode = () => state.me.code ?? findMember(state.me.email, state.data.teams, state.me.name)?.member.code;

export const team = () => state.data?.teams.find((t) => t.id === state.tab);

/** Tên có dấu của nhân sự lấy từ báo cáo KPI (theo mã), vì Sheet năng suất ghi tên không dấu. */
export const kpiNames = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, m.name])));

/** Mã nhân sự -> { name, team } từ báo cáo KPI, để lọc theo team ở các tab khác. */
export const kpiPeople = () => new Map(state.data.teams.flatMap((t) => t.members.map((m) => [m.code, { name: m.name, team: t.id }])));
