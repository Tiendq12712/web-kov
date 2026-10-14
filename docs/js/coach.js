import { memberStatus, elapsedRatio } from './metrics.js';
import { computeSla } from './sla.js';
import { CONFIG } from './config.js';

/**
 * Nhân vật "Coach KPI" (nhân vật hoạt hình riêng, không dựa trên người thật): thúc đẩy nhân sự chậm tiến độ,
 * động viên người sắp kịp, khen người đạt/vượt tiến độ. Câu thoại chọn ổn định theo ngày, bấm vào nhân vật để đổi câu.
 */
export const MASCOT_NAME = CONFIG.mascotName ?? 'Coach KPI';

/* {name} tên gọi · {p}/{P} anh/chị/bạn · {kpi} KPI% · {elapsed} thời gian đã qua% · {days} số ngày còn lại · {missing} điểm tổng còn thiếu · {late}/{soon} data trễ/sắp trễ SLA */
const LINES = {
  bad: [
    '{name} ơi, KPI mới được {kpi}% trong khi thời gian đã qua {elapsed}%. Mình cần tăng tốc thôi nào!',
    'Còn {days} ngày nữa là hết tháng. Mỗi ngày cố thêm một chút, {p} sẽ bắt kịp tiến độ!',
    '{P} đang còn thiếu {missing} điểm tổng. Chia nhỏ ra từng ngày thì làm được thôi!',
    'Hôm nay chọn một việc quan trọng nhất và làm cho xong nhé {name}. Xong việc đó là đã nhích lên rồi!',
    'Chậm lúc này không đáng sợ, đáng sợ là không bắt đầu lại. Bắt đầu ngay bây giờ nhé {name}!',
    'Có khó khăn gì cứ chia sẻ với quản lý. Cả đội đang chờ {p} tăng tốc đấy!',
  ],
  badSla: ['Ưu tiên data đã trễ SLA ({late} data) trước, rồi tới {soon} data sắp trễ. Làm từ lô cũ nhất nhé {name}!'],
  warn: [
    'Gần kịp rồi {name}! KPI {kpi}%, chỉ cần đẩy thêm một chút là vượt tiến độ ({elapsed}%).',
    'Còn {days} ngày, {p} hoàn toàn có thể bắt kịp. Cố lên nào {name}!',
    'Chỉ thiếu một nhịp nữa thôi. Hôm nay tăng một chút so với hôm qua là được!',
    'Phong độ đang đi lên đó {name}. Giữ nhịp và đẩy thêm nhé!',
  ],
  good: [
    'Giỏi lắm {name}! KPI {kpi}%, đang vượt tiến độ tháng ({elapsed}%). Cứ giữ phong độ này!',
    'Tuyệt vời! {P} đang đi trước tiến độ rồi. Giúp đồng đội một tay nếu rảnh nhé!',
    'Làm tốt lắm! Hết {days} ngày còn lại mà giữ được nhịp này thì quá đẹp!',
    'Quản lý rất vui khi thấy số của {p}. Tiếp tục phát huy nhé {name}!',
  ],
  celebrate: [
    'Chúc mừng {name}! Đã chạm {kpi}% KPI. Quá xuất sắc! 🎉',
    'Hoàn thành mục tiêu rồi! Cả đội tự hào về {p} đó {name}!',
    'Đỉnh quá! KPI {kpi}%. Hôm nay nghỉ ngơi một chút rồi chia sẻ bí quyết cho mọi người nhé!',
  ],
  team: {
    bad: ['Đang có {n} nhân sự chậm tiến độ. Hãy hỏi thăm và hỗ trợ các bạn ấy sớm nhé!', 'Còn {days} ngày: {n} bạn đang dưới 70% mức thời gian đã qua. Cùng kéo cả đội lên nào!'],
    good: ['Cả nhóm đều đạt hoặc gần kịp tiến độ. Quá tốt! Nhớ ghi nhận các bạn nhé.', 'Không có nhân sự nào chậm tiến độ. Giữ vững phong độ cả đội!'],
  },
};

const pad = (n) => String(n).padStart(2, '0');
const pick = (list, seed) => list[Math.abs(seed) % list.length];
const pronoun = (g) => (g === 'Nam' ? 'anh' : g === 'Nữ' ? 'chị' : 'bạn');
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const fill = (text, v) => text.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const daysLeftOf = (asOf) => { const [y, m, d] = asOf.split('-').map(Number); return new Date(y, m, 0).getDate() - d; };
const firstName = (s) => (String(s).trim().split(/\s+/).at(-1) || '').trim();

/** Nội dung nhân vật cho nhân sự (found) hoặc quản lý. `bump` tăng lên mỗi lần bấm nhân vật để đổi câu. */
export function coachFor({ me, found, data, bump = 0 }) {
  const asOf = data.teams.map((t) => t.asOf).sort().at(-1);
  const sla = computeSla(data.work, asOf, data.month);
  const seedDay = Number(asOf.slice(8, 10)) + bump;
  const days = daysLeftOf(asOf);

  if (me.role !== 'member') {
    const slow = data.teams.flatMap((t) => t.members.filter((m) => memberStatus(m, t).key === 'bad'));
    const bad = slow.length > 0;
    return { mood: bad ? 'stern' : 'cheer', name: MASCOT_NAME, line: fill(pick(bad ? LINES.team.bad : LINES.team.good, seedDay), { n: slow.length, days }), action: bad ? { label: 'Xem nhân sự chậm', slow: true } : null };
  }
  if (!found) return null;
  const { team, member: m } = found;
  const key = m.kpi >= 1 ? 'celebrate' : memberStatus(m, team).key;
  const mine = sla?.rows.find((r) => r.code === m.code);
  const v = {
    name: me.name || firstName(m.name), p: pronoun(me.gender), P: cap(pronoun(me.gender)),
    kpi: Math.round(m.kpi * 100), elapsed: Math.round(elapsedRatio(team.asOf) * 100), days,
    missing: Math.max(Math.round((m.main?.target ?? 0) - (m.main?.done ?? 0)), 0), late: mine?.late ?? 0, soon: mine?.soon ?? 0,
  };
  let pool = LINES[key];
  if (key === 'bad' && (v.late || v.soon)) pool = [...pool, ...LINES.badSla];   // có data trễ thì thêm câu nhắc ưu tiên SLA
  const mood = { bad: 'stern', warn: 'worried', good: 'cheer', celebrate: 'celebrate' }[key];
  const action = key === 'bad' || key === 'warn' ? { label: 'Chia sẻ với quản lý', tab: 'chat' } : null;
  return { mood, name: MASCOT_NAME, line: fill(pick(pool, seedDay + Number(m.code || 0)), v), action };
}
