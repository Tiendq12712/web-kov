/** Quy tắc tính toán — một chỗ duy nhất để chỉnh khi đổi quy chế KPI. */
const WEIGHT_MAIN = 0.7;   // Điểm tổng 70%
const WEIGHT_ADDON = 0.3;  // Add-on 30%
const ON_TRACK = 1;        // KPI/tiến độ thời gian ≥ 100%
const WATCH = 0.7;         // ≥ 70% là "cần đẩy", dưới là "chậm"

const sum = (items, pick) => items.reduce((s, m) => s + (pick(m) ?? 0), 0);
const ratio = (a, b) => (b ? a / b : 0);

/** Tỷ lệ thời gian đã qua của tháng tại thời điểm cập nhật (theo ngày lịch). */
export function elapsedRatio(asOf) {
  const [y, m, d] = asOf.split('-').map(Number);
  return d / new Date(y, m, 0).getDate();
}

/** Trạng thái tiến độ so với thời gian đã trôi qua. */
export function paceStatus(kpi, elapsed) {
  const r = ratio(kpi, elapsed);
  if (r >= ON_TRACK) return { key: 'good', label: 'Đạt tiến độ' };
  if (r >= WATCH) return { key: 'warn', label: 'Cần đẩy' };
  return { key: 'bad', label: 'Chậm' };
}

const block = (members, key) => {
  const target = sum(members, (m) => m[key].target);
  const done = sum(members, (m) => m[key].done);
  return { target, done, missing: target - done, rate: ratio(done, target) };
};

/** Tổng hợp team: KPI = 70% × tỷ lệ Điểm tổng + 30% × tỷ lệ Add-on (như công thức của sheet). */
export function summarize(team) {
  const { members } = team;
  const main = block(members, 'main');
  const addon = block(members, 'addon');
  const need = block(members, 'need');
  const kpi = WEIGHT_MAIN * main.rate + WEIGHT_ADDON * addon.rate;
  const elapsed = elapsedRatio(team.asOf);
  return { main, addon, need, kpi, elapsed, status: paceStatus(kpi, elapsed), count: members.length };
}

export const memberStatus = (member, team) => paceStatus(member.kpi, elapsedRatio(team.asOf));

/** Gộp các team thành một nhóm "Toàn bộ Online" (dùng ngày cập nhật mới nhất). */
export const combineTeams = (teams) => ({
  id: 'all', name: 'Toàn bộ Online',
  members: teams.flatMap((t) => t.members),
  asOf: teams.map((t) => t.asOf).sort().at(-1),
});

/** KPI dự kiến cuối tháng nếu giữ nguyên nhịp hiện tại (tối đa 200% để không ra số phi thực tế). */
export const projectedKpi = (kpi, elapsed) => Math.min(ratio(kpi, elapsed), 2);
