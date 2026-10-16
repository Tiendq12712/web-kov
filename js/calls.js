/**
 * Phân tích từng cuộc gọi từ Sheet "Dữ liệu call" (do mục Xuất Call ghi ra): kết nối thành công, thời gian đàm thoại,
 * bên ngắt máy, khung giờ, lý do không kết nối. Số điện thoại khách và link ghi âm không được đọc vào web.
 */
export const SHORT_OPTIONS = [10, 20, 30, 45, 60];
export const LONG_OPTIONS = [120, 180, 300];
export const HIST = [[0, 10, '< 10 giây'], [10, 30, '10–30 giây'], [30, 60, '30–60 giây'], [60, 180, '1–3 phút'], [180, 300, '3–5 phút'], [300, Infinity, 'Trên 5 phút']];

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const DURATION = /^(\d+):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;
const seconds = (v) => {
  if (typeof v === 'number') return Math.round(v * 86400);
  const m = DURATION.exec(String(v ?? '').trim());
  return m ? Math.round(+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3] ?? 0)) : 0;
};
const sum = (list) => list.reduce((a, b) => a + b, 0);
const median = (sorted) => (sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : null);

/** Thời gian gọi: chuỗi "2026-10-15 21:56:11" hoặc số ngày của Google Sheets (ô kiểu ngày giờ khi đọc không định dạng). */
function timeParts(v) {
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400) * 1000);   // 25569 = số ngày từ 30/12/1899 đến 1/1/1970
    return { ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, day: d.getUTCDate(), hour: d.getUTCHours() };
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2})/.exec(String(v ?? '').trim());
  if (m) return { ym: `${m[1]}-${m[2]}`, day: Number(m[3]), hour: Number(m[4]) };
  const n = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2})/.exec(String(v ?? '').trim());   // 15/10/2026 21:56
  return n ? { ym: `${n[3]}-${n[2].padStart(2, '0')}`, day: Number(n[1]), hour: Number(n[4]) } : { ym: '', day: 0, hour: NaN };
}

/** Đọc các dòng của Sheet thành danh sách cuộc gọi gọn (không giữ số điện thoại, link ghi âm). */
export function parseCalls(rowSets, tabNames = []) {
  const sets = Array.isArray(rowSets[0]?.[0]) ? rowSets : [rowSets];   // một tab hoặc nhiều tab (mỗi tab một tháng)
  const calls = [], sources = [];
  sets.forEach((rows, i) => {
    const list = parseTab(rows);
    calls.push(...list);
    sources.push({ tab: tabNames[i] ?? `Tab ${i + 1}`, rows: Math.max(rows.length - 1, 0), calls: list.length, months: [...new Set(list.map((c) => c.ym))].filter(Boolean).sort() });
  });
  return { calls, sources, months: [...new Set(calls.map((c) => c.ym).filter(Boolean))].sort() };
}

function parseTab(rows) {
  const head = rows[0]?.map(plain) ?? [];
  const at = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const col = { caller: at('nguoi goi'), time: at('thoi gian goi'), ring: at('do chuong'), talk: at('dam thoai'), status: at('tinh trang'), ender: at('ben ngat'), sip: at('sip code'), slot: at('khung thoi gian'), day: at('ngay'), ok: at('sl call ket noi') };
  if (col.caller < 0 || col.talk < 0 || col.status < 0) return [];   // tab không phải dữ liệu call
  const calls = [];
  for (const r of rows.slice(1)) {
    const who = String(r[col.caller] ?? '');
    const code = /\((\d+)\)\s*$/.exec(who)?.[1];
    if (!code) continue;
    const tp = timeParts(r[col.time]);
    const ender = plain(r[col.ender]);
    const talk = seconds(r[col.talk]), status = String(r[col.status] ?? '').trim();
    const hour = tp.hour;
    calls.push({
      code, name: who.split(',')[0].trim(), ym: tp.ym, day: Number(r[col.day]) || tp.day || 0,
      talk, ring: seconds(r[col.ring]), status, slot: String(r[col.slot] ?? '').trim() || (Number.isFinite(hour) ? `${hour}-${hour + 1}h` : ''),
      sip: String(r[col.sip] ?? '').trim(), ok: col.ok >= 0 ? Number(r[col.ok]) === 1 : status === 'Answered' && talk > 0,
      ender: ender.includes('customer') ? 'customer' : ender.includes('agent') ? 'agent' : ender.includes('system') ? 'system' : '',
    });
  }
  return calls;
}

export function analyzeCalls(all, { month, shortSec = 30, longSec = 180 } = {}) {
  const list = month ? all.filter((c) => c.ym === month) : all;
  const connected = list.filter((c) => c.ok);
  const bucket = (t) => (t < shortSec ? 'short' : t >= longSec ? 'long' : 'mid');
  const talks = connected.map((c) => c.talk).sort((a, b) => a - b);
  const buckets = { short: { success: 0 }, mid: { success: 0 }, long: { success: 0 } };
  connected.forEach((c) => { buckets[bucket(c.talk)].success += 1; });
  const hist = HIST.map(([lo, hi, label]) => ({ label, count: connected.filter((c) => c.talk >= lo && c.talk < hi).length, short: hi <= shortSec }));
  const customerEnd = connected.filter((c) => c.ender === 'customer').length;
  const shortCalls = connected.filter((c) => c.talk < shortSec);
  const shortCustomerEnd = shortCalls.filter((c) => c.ender === 'customer').length;

  const agents = new Map();
  for (const c of list) {
    const a = agents.get(c.code) ?? { code: c.code, name: c.name, calls: 0, talks: [], short: 0, custEnd: 0 };
    a.calls += 1;
    if (c.ok) { a.talks.push(c.talk); if (c.talk < shortSec) a.short += 1; if (c.ender === 'customer') a.custEnd += 1; }
    agents.set(c.code, a);
  }
  const totals = { calls: list.length, success: connected.length, rate: list.length ? connected.length / list.length : null, talk: sum(talks), avg: talks.length ? sum(talks) / talks.length : null, median: median(talks), people: agents.size };
  const shortShare = connected.length ? shortCalls.length / connected.length : 0;
  const rows = [...agents.values()].map((a) => {
    const sorted = [...a.talks].sort((x, y) => x - y);
    const success = a.talks.length;
    const r = { code: a.code, name: a.name, calls: a.calls, success, talk: sum(a.talks), rate: a.calls ? success / a.calls : null, avg: success ? sum(a.talks) / success : null, median: median(sorted), shortCount: a.short, shortShare: success ? a.short / success : null, customerEndShare: success ? a.custEnd / success : null };
    r.vsTeam = r.avg != null && totals.avg ? r.avg / totals.avg - 1 : null;
    r.status = success < 30 || r.shortShare == null ? 'mid' : r.shortShare >= shortShare + 0.08 ? 'short' : r.shortShare <= shortShare - 0.05 ? 'long' : 'mid';
    return r;
  });

  const slotStats = new Map();
  for (const c of list) {
    if (!c.slot) continue;
    const s = slotStats.get(c.slot) ?? { slot: c.slot, calls: 0, success: 0, short: 0 };
    s.calls += 1; if (c.ok) { s.success += 1; if (c.talk < shortSec) s.short += 1; }
    slotStats.set(c.slot, s);
  }
  const hours = [...slotStats.values()].sort((a, b) => parseInt(a.slot, 10) - parseInt(b.slot, 10)).map((s) => ({ ...s, rate: s.calls ? s.success / s.calls : 0, shortShare: s.success ? s.short / s.success : null }));

  const dayStats = new Map();
  for (const c of list) {
    if (!c.day) continue;
    const key = `${c.ym}-${String(c.day).padStart(2, '0')}`;
    const d = dayStats.get(key) ?? { key, ym: c.ym, day: c.day, calls: 0, success: 0, talk: 0, short: 0 };
    d.calls += 1; if (c.ok) { d.success += 1; d.talk += c.talk; if (c.talk < shortSec) d.short += 1; }
    dayStats.set(key, d);
  }
  const daily = [...dayStats.values()].sort((a, b) => a.key.localeCompare(b.key)).map((d) => ({ ...d, rate: d.calls ? d.success / d.calls : 0, avg: d.success ? d.talk / d.success : 0 }));

  const failed = list.filter((c) => !c.ok);
  const reasonCount = new Map();
  failed.forEach((c) => { const key = reasonKey(c); reasonCount.set(key, (reasonCount.get(key) ?? 0) + 1); });
  const failures = [...reasonCount].map(([key, count]) => ({ key, ...REASONS[key], count, share: failed.length ? count / failed.length : 0 })).sort((a, b) => b.count - a.count);
  const technical = failed.filter((c) => reasonKey(c) === 'server').length;
  const wrongNumber = failed.filter((c) => reasonKey(c) === 'notfound').length;
  const unreachable = failed.filter((c) => ['unreachable', 'timeout'].includes(reasonKey(c))).length;

  const q = { totals, rows, buckets, hist, hours, daily, failures, shortShare, customerEndShare: connected.length ? customerEnd / connected.length : 0, shortCustomerEndShare: shortCalls.length ? shortCustomerEnd / shortCalls.length : 0, shortCount: shortCalls.length, technicalShare: list.length ? technical / list.length : 0, wrongNumberShare: list.length ? wrongNumber / list.length : 0, unreachableShare: list.length ? unreachable / list.length : 0, failedCount: failed.length };
  q.advice = adviceFor(q, shortSec);
  return q;
}

/** Nhóm lý do không kết nối theo trạng thái + mã SIP (phần lớn là phía khách, không phải lỗi hệ thống). */
const REASONS = {
  denied: { label: 'Khách từ chối / máy bận', hint: 'Khách bấm từ chối hoặc đang bận (SIP 486, 603, 600)' },
  timeout: { label: 'Không nghe máy', hint: 'Đổ chuông hết thời gian chờ (SIP 408)' },
  unreachable: { label: 'Thuê bao không liên lạc được', hint: 'Tắt máy, ngoài vùng sóng hoặc nghẽn mạng nhà mạng (SIP 480)' },
  notfound: { label: 'Số không tồn tại / sai số', hint: 'Cần rà lại số điện thoại trong data (SIP 404)' },
  cancel: { label: 'Hủy trước khi khách bắt máy', hint: 'Nhân sự hoặc hệ thống ngắt khi đang đổ chuông' },
  server: { label: 'Lỗi tổng đài / hệ thống', hint: 'Lỗi máy chủ hoặc bị chặn (SIP 500, 403, 406): mới là lỗi kỹ thuật thật' },
  silent: { label: 'Bắt máy nhưng không đàm thoại', hint: 'Trạng thái Answered nhưng đàm thoại 0 giây' },
  other: { label: 'Khác', hint: '' },
};
function reasonKey(c) {
  const code = /\((\d{3})\)/.exec(c.sip)?.[1];
  if (['500', '403', '406'].includes(code)) return 'server';
  if (code === '404') return 'notfound';
  if (code === '480') return 'unreachable';
  if (code === '408' || /noanswer/i.test(c.status)) return 'timeout';
  if (['486', '603', '600'].includes(code) || /denied|busy/i.test(c.status)) return 'denied';
  if (/cancel/i.test(c.status)) return 'cancel';
  if (/answered/i.test(c.status)) return 'silent';
  return 'other';
}

function adviceFor(q, shortSec) {
  const out = [];
  const pc = (v) => `${Math.round(v * 100)}%`;
  if (q.shortShare >= 0.25) out.push({ tone: 'bad', text: `${pc(q.shortShare)} call kết nối (${q.shortCount.toLocaleString('vi-VN')} cuộc) có đàm thoại dưới ${shortSec} giây, trong đó ${pc(q.shortCustomerEndShare)} do khách ngắt máy: nhiều khách bắt máy nhưng không muốn trao đổi.` });
  else if (q.shortShare >= 0.12) out.push({ tone: 'warn', text: `${pc(q.shortShare)} call kết nối (${q.shortCount.toLocaleString('vi-VN')} cuộc) đàm thoại dưới ${shortSec} giây, ${pc(q.shortCustomerEndShare)} trong số đó do khách ngắt máy: mức cần theo dõi, nên nghe lại mẫu để biết khách ngắt vì lý do gì.` });
  else out.push({ tone: 'good', text: `Chỉ ${pc(q.shortShare)} call kết nối đàm thoại dưới ${shortSec} giây: phần lớn khách bắt máy đều trao đổi.` });
  const risky = q.rows.filter((r) => r.status === 'short').sort((a, b) => b.shortShare - a.shortShare);
  if (risky.length) out.push({ tone: 'warn', text: `Nhân sự có tỉ lệ call ngắn cao hơn team ≥ 8 điểm %: ${risky.slice(0, 6).map((r) => `${r.name} (${pc(r.shortShare)})`).join(', ')}. Nên coaching: nghe lại cuộc ngắn, chỉnh lời mở đầu và cách giữ khách ở lại cuộc gọi.` });
  const badHours = q.hours.filter((h) => h.calls >= 100 && h.shortShare != null && h.shortShare >= q.shortShare + 0.06);
  if (badHours.length) out.push({ tone: 'warn', text: `Khung giờ có tỉ lệ call ngắn cao: ${badHours.map((h) => `${h.slot} (${pc(h.shortShare)})`).join(', ')}. Cân nhắc đổi khung giờ gọi các nhóm khách này.` });
  const bestHours = q.hours.filter((h) => h.calls >= 300).sort((a, b) => b.rate - a.rate).slice(0, 2);
  if (bestHours.length) out.push({ tone: 'info', text: `Khung giờ kết nối tốt nhất: ${bestHours.map((h) => `${h.slot} (${pc(h.rate)})`).join(', ')}. Ưu tiên gọi data quan trọng vào các khung này.` });
  if (q.technicalShare >= 0.03) out.push({ tone: 'bad', text: `${pc(q.technicalShare)} tổng cuộc gọi bị lỗi tổng đài/hệ thống (SIP 500/403/406): nên báo bộ phận hạ tầng kiểm tra.` });
  if (q.wrongNumberShare >= 0.005) out.push({ tone: 'warn', text: `${pc(q.wrongNumberShare)} tổng cuộc gọi gọi vào số không tồn tại (SIP 404): rà soát lại số điện thoại trong data trước khi chia cho nhân sự.` });
  if (q.unreachableShare >= 0.1) out.push({ tone: 'info', text: `${pc(q.unreachableShare)} tổng cuộc gọi không liên lạc được hoặc không nghe máy (SIP 480/408): nên gọi lại ở khung giờ khác thay vì bỏ data.` });
  const top = q.failures[0];
  if (top) out.push({ tone: 'info', text: `Lý do không kết nối nhiều nhất: ${top.label} (${pc(top.share)} số cuộc không thành công).` });
  return out;
}

/* ---------- Qua các tháng ---------- */
const monthStats = (list, shortSec) => {
  const ok = list.filter((c) => c.ok);
  const talks = ok.map((c) => c.talk).sort((a, b) => a - b);
  const short = ok.filter((c) => c.talk < shortSec).length;
  return {
    calls: list.length, success: ok.length, rate: list.length ? ok.length / list.length : null,
    avg: ok.length ? sum(talks) / ok.length : null, median: median(talks),
    shortShare: ok.length ? short / ok.length : null, customerEndShare: ok.length ? ok.filter((c) => c.ender === 'customer').length / ok.length : null,
    technicalShare: list.length ? list.filter((c) => !c.ok && reasonKey(c) === 'server').length / list.length : null,
    unreachableShare: list.length ? list.filter((c) => !c.ok && ['unreachable', 'timeout'].includes(reasonKey(c))).length / list.length : null,
    days: new Set(list.map((c) => c.day)).size,
  };
};

/** Số liệu từng tháng của toàn team và của từng nhân sự (tỉ lệ kết nối, tỉ lệ cuộc ngắn) để so sánh xu hướng. */
export function analyzeMonths(all, { shortSec = 30 } = {}) {
  const months = [...new Set(all.map((c) => c.ym).filter(Boolean))].sort();
  const team = months.map((ym) => ({ ym, ...monthStats(all.filter((c) => c.ym === ym), shortSec) }));
  const byAgent = new Map();
  for (const c of all) { if (!c.ym) continue; const a = byAgent.get(c.code) ?? { code: c.code, name: c.name, perMonth: new Map() }; (a.perMonth.get(c.ym) ?? a.perMonth.set(c.ym, []).get(c.ym)).push(c); byAgent.set(c.code, a); }
  const agents = [...byAgent.values()].map((a) => ({ code: a.code, name: a.name, perMonth: months.map((ym) => (a.perMonth.has(ym) ? { ym, ...monthStats(a.perMonth.get(ym), shortSec) } : null)) }));
  return { months, team, agents, advice: trendAdvice(team, shortSec) };
}

function trendAdvice(team, shortSec) {
  if (team.length < 2) return [];
  const out = [], last = team.at(-1), prev = team.at(-2), first = team[0];
  const pts = (v) => `${(Math.abs(v) * 100).toFixed(1).replace('.', ',')} điểm %`;
  const lab = (t) => `T${Number(t.ym.slice(5))}`;
  const dRate = last.rate - prev.rate, dShort = last.shortShare - prev.shortShare;
  out.push({ tone: dRate >= 0.005 ? 'good' : dRate <= -0.005 ? 'warn' : 'info', text: `Tỉ lệ kết nối ${lab(last)} là ${(last.rate * 100).toFixed(1).replace('.', ',')}%, ${dRate >= 0 ? 'tăng' : 'giảm'} ${pts(dRate)} so với ${lab(prev)}; so với ${lab(first)} ${last.rate >= first.rate ? 'tăng' : 'giảm'} ${pts(last.rate - first.rate)}.` });
  out.push({ tone: dShort <= -0.005 ? 'good' : dShort >= 0.005 ? 'bad' : 'info', text: `Tỉ lệ cuộc kết nối ngắn (dưới ${shortSec} giây) ${lab(last)} là ${(last.shortShare * 100).toFixed(1).replace('.', ',')}%, ${dShort <= 0 ? 'giảm' : 'tăng'} ${pts(dShort)} so với ${lab(prev)} (${lab(first)}: ${(first.shortShare * 100).toFixed(1).replace('.', ',')}%).` });
  if (last.unreachableShare >= 0.1) out.push({ tone: 'info', text: `Cuộc gọi không liên lạc được / không nghe máy chiếm ${(Math.min(...team.map((t) => t.unreachableShare)) * 100).toFixed(0)}–${(Math.max(...team.map((t) => t.unreachableShare)) * 100).toFixed(0)}% tổng cuộc gọi qua các tháng, phần lớn do phía khách: cân nhắc gọi lại khung giờ khác.` });
  if (last.days < 20) out.push({ tone: 'info', text: `${lab(last)} mới có ${last.days} ngày dữ liệu; các tỉ lệ vẫn so sánh được nhưng số cuộc gọi chưa phải cả tháng.` });
  return out;
}
