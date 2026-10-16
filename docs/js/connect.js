/**
 * Phân tích chất lượng cuộc gọi kết nối thành công, dựa trên báo cáo năng suất (theo ngày từng người):
 * tỉ lệ kết nối, và thời gian đàm thoại TB mỗi call kết nối để nhận ra khách bắt máy nhưng không muốn trao đổi.
 * Lưu ý: file chỉ có tổng call/talktime theo ngày nên các nhóm Ngắn/Trung bình/Dài xếp theo TB đàm thoại của từng người-ngày.
 */
export const SHORT_OPTIONS = [20, 30, 45, 60, 90];
export const LONG_OPTIONS = [90, 120, 180, 240];

const sum = (list) => list.reduce((a, b) => a + (b ?? 0), 0);
const avgOf = (talk, success) => (success > 0 ? talk / success : null);

/** Nhóm của một người-ngày theo TB đàm thoại / call kết nối. */
export const bucketOf = (avg, shortSec, longSec) => (avg == null ? null : avg < shortSec ? 'short' : avg >= longSec ? 'long' : 'mid');

export function analyzeConnect(report, { region = 'all', shortSec = 45, longSec = 120 } = {}) {
  const members = report.members.filter((m) => region === 'all' || m.region === region);
  const buckets = { short: { days: 0, success: 0 }, mid: { days: 0, success: 0 }, long: { days: 0, success: 0 } };
  const byDay = new Map();
  const rows = members.map((m) => {
    const days = (report.days[m.code] ?? []).filter((d) => d.calls > 0);
    const own = { short: { days: 0, success: 0 }, mid: { days: 0, success: 0 }, long: { days: 0, success: 0 } };
    for (const d of days) {
      const b = bucketOf(avgOf(d.talk ?? 0, d.success ?? 0), shortSec, longSec);
      if (b) { own[b].days += 1; own[b].success += d.success; buckets[b].days += 1; buckets[b].success += d.success; }
      const t = byDay.get(d.day) ?? { day: d.day, calls: 0, success: 0, talk: 0 };
      t.calls += d.calls; t.success += d.success ?? 0; t.talk += d.talk ?? 0; byDay.set(d.day, t);
    }
    const calls = sum(days.map((d) => d.calls)), success = sum(days.map((d) => d.success)), talk = sum(days.map((d) => d.talk));
    const withSuccess = own.short.days + own.mid.days + own.long.days;
    return {
      code: m.code, name: m.name, region: m.region, calls, success, talk, days: days.length,
      rate: calls ? success / calls : null, avg: avgOf(talk, success), own,
      shortShare: success ? own.short.success / success : null, shortDayShare: withSuccess ? own.short.days / withSuccess : null,
    };
  }).filter((r) => r.calls > 0);
  const calls = sum(rows.map((r) => r.calls)), success = sum(rows.map((r) => r.success)), talk = sum(rows.map((r) => r.talk));
  const totals = { calls, success, talk, rate: calls ? success / calls : null, avg: avgOf(talk, success), people: rows.length };
  rows.forEach((r) => {
    r.vsTeam = r.avg != null && totals.avg ? r.avg / totals.avg - 1 : null;
    r.status = bucketOf(r.avg, shortSec, longSec);
  });
  const daily = [...byDay.values()].sort((a, b) => a.day - b.day).map((d) => ({ ...d, rate: d.calls ? d.success / d.calls : 0, avg: avgOf(d.talk, d.success) ?? 0 }));
  const shortShare = success ? buckets.short.success / success : 0;
  return { totals, rows, buckets, daily, shortShare, advice: adviceFor({ totals, rows, shortShare, shortSec }) };
}

/** Gợi ý hành động từ số liệu (quy tắc đơn giản, để quản lý tham khảo). */
function adviceFor({ totals, rows, shortShare, shortSec }) {
  const out = [];
  const risky = rows.filter((r) => r.shortShare != null && r.success >= 20 && r.shortShare >= Math.max(shortShare + 0.1, 0.3)).sort((a, b) => b.shortShare - a.shortShare);
  if (shortShare >= 0.3) out.push({ tone: 'bad', text: `${Math.round(shortShare * 100)}% call kết nối rơi vào nhóm đàm thoại ngắn (dưới ${shortSec} giây): nhiều khách bắt máy nhưng không muốn trao đổi. Cần rà soát chất lượng data/khung giờ gọi và kịch bản mở đầu.` });
  else if (shortShare >= 0.15) out.push({ tone: 'warn', text: `${Math.round(shortShare * 100)}% call kết nối thuộc nhóm đàm thoại ngắn (dưới ${shortSec} giây): mức cần theo dõi, nên nghe lại một số cuộc mẫu để tìm nguyên nhân khách ngắt máy sớm.` });
  else out.push({ tone: 'good', text: `Chỉ ${Math.round(shortShare * 100)}% call kết nối thuộc nhóm đàm thoại ngắn: phần lớn khách bắt máy đều trao đổi.` });
  if (risky.length) out.push({ tone: 'warn', text: `Nhân sự có tỉ lệ call ngắn cao hơn team: ${risky.slice(0, 5).map((r) => `${r.name} (${Math.round(r.shortShare * 100)}%)`).join(', ')}. Nên coaching: nghe lại cuộc gọi, chỉnh lời mở đầu và cách giữ khách ở lại cuộc gọi.` });
  const lowRate = rows.filter((r) => r.rate != null && totals.rate && r.rate < totals.rate * 0.8 && r.calls >= 50).sort((a, b) => a.rate - b.rate);
  if (lowRate.length) out.push({ tone: 'warn', text: `Tỉ lệ kết nối thấp hơn team trên 20%: ${lowRate.slice(0, 5).map((r) => r.name).join(', ')}. Kiểm tra khung giờ gọi và chất lượng danh sách data được chia.` });
  out.push({ tone: 'info', text: 'Bước tiếp theo gợi ý: (1) chọn vài cuộc ngắn của nhóm rủi ro để nghe lại; (2) đối chiếu theo khung giờ trong tab Năng suất; (3) trao đổi với nguồn data (T15/NA/OI) nếu tỉ lệ ngắn tập trung ở một nguồn.' });
  return out;
}
