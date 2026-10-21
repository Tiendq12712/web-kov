/**
 * Báo cáo tuần / tháng theo khuôn cố định để gửi quản lý (xuất Excel hoặc PDF).
 * Khuôn: Tổng quan → KPI theo nhân sự (lũy kế tháng) → SLA xử lý data → Kiểm soát quy trình.
 * Tuần = 7 ngày gần nhất tính đến ngày số liệu (theo ngày tạo data); tháng = cả tháng đang xem.
 * Trả về { title, subtitle, cards, insights, charts, sections }: thẻ chỉ số, nhận định bằng lời, biểu đồ thanh và các bảng
 * (ô là chuỗi đã định dạng kiểu Việt Nam; `tones` cùng cỡ với `rows` để tô màu ô khi in PDF).
 */
import { summarize, combineTeams, memberStatus, projectedKpi } from './metrics.js';
import { analyzeControl } from './control.js';
import { series } from './history.js';
import { analyzeCallScores, QUALITY } from './callScores.js';
import { analyzeListen } from './listen.js';
import { heardKey } from './heard.js';

const nf = new Intl.NumberFormat('vi-VN');
const n = (v) => (v == null ? '' : nf.format(v));
const p = (v, d = 1) => (v == null ? '' : `${(v * 100).toFixed(d).replace('.', ',')}%`);
const frac = (a, b) => `${n(a)} / ${n(b)}`;
const dmy = (iso) => iso.split('-').reverse().join('/');
const addDays = (iso, k) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const mlabel = (m) => `tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} và ${names.at(-1)}`);

/** Màu theo ngưỡng: tỉ lệ đạt SLA (≥98% tốt, ≥90% cần chú ý) và tỉ lệ lỗi quy trình (<5% tốt, ≤15% cần chú ý). */
const slaTone = (r) => (r == null ? null : r >= 0.98 ? 'good' : r >= 0.9 ? 'warn' : 'bad');
const errTone = (r) => (r == null ? null : r < 0.05 ? 'good' : r <= 0.15 ? 'warn' : 'bad');

export function buildPeriodReport({ data, rows = null, period = 'month', now = new Date(), history = null, scores = null, heard = null }) {
  const all = combineTeams(data.teams), s = summarize(all), asOf = all.asOf;
  const week = period === 'week';
  const from = week ? addDays(asOf, -6) : `${data.month}-01`;
  const scoped = rows ? rows.filter((r) => r.created && r.created.slice(0, 10) >= from && r.created.slice(0, 10) <= (week ? asOf : `${data.month}-31`)) : null;
  const ctl = scoped ? analyzeControl(scoped, { now: Date.parse(`${asOf}T23:59:59Z`) }) : null;
  const inRange = (iso) => iso && iso >= from && iso <= (week ? asOf : `${data.month}-31`);
  const sc = scores ? analyzeCallScores(scores.filter((r) => inRange(r.date)), {}) : null;   // call chấm theo thời gian tạo Activity trong kỳ
  const ls = scoped ? analyzeListen(scoped, { month: 'all', job: 'all' }) : null;           // data kết nối nhưng không impact trong kỳ
  const heardCount = ls ? ls.items.filter((i) => heard?.has(heardKey(i.r.retailer, i.r.modifiedTs))).length : 0;
  const range = week ? `${dmy(from)} – ${dmy(asOf)}` : mlabel(data.month);
  const sections = [], charts = [], insights = [], cards = [];

  /* ---- Nhân sự có tình trạng KPI ---- */
  const people = data.teams.flatMap((t) => t.members.map((m) => ({ m, t, status: memberStatus(m, t) })));
  const dup = new Set(people.map((x) => x.m.name).filter((nm, i, a) => a.indexOf(nm) !== a.lastIndexOf(nm)));
  const cn = (x) => (x.name ? (dup.has(x.name) && x.code ? `${x.name} (${x.code})` : x.name) : '(Chưa giao nhân sự)');   // tên người trong Kiểm soát/SLA
  const nameOf = (m) => (dup.has(m.name) ? `${m.name} (${m.code})` : m.name);   // trùng tên thì kèm đầu số để phân biệt
  const ranked = [...people].sort((a, b) => (b.m.kpi ?? 0) - (a.m.kpi ?? 0));
  const talkPass = all.members.filter((m) => m.talk?.pass).length;

  /* ---- Thẻ chỉ số ---- */
  cards.push({ title: 'KPI toàn Online', value: p(s.kpi), sub: `Thời gian đã qua ${p(s.elapsed, 0)} · dự kiến cuối tháng ${p(projectedKpi(s.kpi, s.elapsed), 0)}`, tone: s.status.key, badge: s.status.label, progress: s.kpi, mark: s.elapsed });
  if (ctl) {
    cards.push({ title: 'Tỉ lệ đạt SLA', value: p(ctl.slaRate), sub: `${n(ctl.late)} / ${n(ctl.live)} data trễ${ctl.slaCut ? ` · mức trừ ${ctl.slaCut}%` : ''}`, tone: slaTone(ctl.slaRate) });
    cards.push({ title: 'Data lỗi quy trình', value: p(ctl.errRate), sub: `${n(ctl.flaggedCount)} / ${n(ctl.total)} data đã làm`, tone: errTone(ctl.errRate) });
  }
  if (sc?.total) cards.push({ title: 'Call chấm cần chấn chỉnh', value: n(sc.quality.urgent), sub: `${n(sc.quality.weak)} chưa tốt · ${n(sc.quality.good)} tốt trên ${n(sc.total)} call`, tone: sc.quality.urgent ? 'bad' : sc.quality.weak ? 'warn' : 'good' });
  if (ls?.conn) cards.push({ title: 'Kết nối không impact', value: p(ls.noImpact / ls.conn, 0), sub: `${n(ls.noImpact)} / ${n(ls.conn)} data · ${n(ls.high)} nên nghe lại (mức Cao)`, tone: ls.noImpact / ls.conn >= 0.5 ? 'warn' : 'good' });
  cards.push({ title: 'Đạt talktime', value: `${talkPass} / ${all.members.length}`, sub: 'nhân sự đạt chỉ tiêu talktime', tone: talkPass === all.members.length ? 'good' : talkPass >= all.members.length / 2 ? 'warn' : 'bad' });

  /* ---- Nhận định bằng lời ---- */
  const gap = s.kpi - s.elapsed;
  insights.push(s.status.key === 'good'
    ? `KPI toàn Online đạt ${p(s.kpi)}, theo kịp thời gian đã qua của tháng (${p(s.elapsed, 0)}); nếu giữ nhịp này, dự kiến cuối tháng đạt khoảng ${p(projectedKpi(s.kpi, s.elapsed), 0)}.`
    : `KPI toàn Online đạt ${p(s.kpi)}, ${gap < 0 ? `thấp hơn ${(-gap * 100).toFixed(1).replace('.', ',')} điểm phần trăm so với` : 'sát'} thời gian đã qua của tháng (${p(s.elapsed, 0)}) — ${s.status.key === 'warn' ? 'cần đẩy thêm để kịp tiến độ' : 'đang chậm tiến độ'}.`);
  const best = ranked.filter((x) => x.status.key === 'good').slice(0, 3).map((x) => `${nameOf(x.m)} (${p(x.m.kpi, 0)})`);
  const slow = [...ranked].reverse().filter((x) => x.status.key === 'bad').slice(0, 3).map((x) => `${nameOf(x.m)} (${p(x.m.kpi, 0)})`);
  if (best.length) insights.push(`Nhân sự dẫn đầu: ${list(best)}.`);
  if (slow.length) insights.push(`Nhân sự cần hỗ trợ thêm vì đang chậm tiến độ: ${list(slow)}.`);
  insights.push(talkPass === all.members.length ? 'Tất cả nhân sự đã đạt chỉ tiêu talktime.' : `${all.members.length - talkPass} / ${all.members.length} nhân sự chưa đạt chỉ tiêu talktime.`);
  if (ctl) {
    const worstSla = [...ctl.people].filter((x) => x.late > 0).sort((a, b) => b.late - a.late).slice(0, 3).map((x) => `${cn(x)} (${n(x.late)} data)`);
    insights.push(ctl.late === 0
      ? `Không có data nào trễ SLA trong ${week ? 'tuần' : 'tháng'}; tỉ lệ đạt SLA ${p(ctl.slaRate)}.`
      : `Có ${n(ctl.late)} / ${n(ctl.live)} data trễ SLA, tỉ lệ đạt ${p(ctl.slaRate)}${ctl.slaCut ? `, tương ứng mức trừ thưởng ${ctl.slaCut}%` : ''}. Trễ nhiều nhất: ${list(worstSla)}.`);
    const topRule = [...ctl.byRule].filter((r) => !r.rule.soft && r.count > 0).sort((a, b) => b.count - a.count)[0];
    insights.push(ctl.flaggedCount === 0
      ? 'Không phát hiện data đã làm nào chưa đúng quy trình.'
      : `${n(ctl.flaggedCount)} / ${n(ctl.total)} data đã làm chưa đúng quy trình (${p(ctl.errRate)})${topRule ? `; lỗi gặp nhiều nhất: “${topRule.rule.label}” (${n(topRule.count)} data)` : ''}.`);
  } else insights.push('Chưa tải được dữ liệu chi tiết nên báo cáo này chưa có phần SLA và Kiểm soát quy trình.');
  if (scores) insights.push(sc?.total
    ? `Chấm call trong kỳ: ${n(sc.total)} call, ${n(sc.quality.urgent)} call cần chấn chỉnh ngay và ${n(sc.quality.weak)} call chưa tốt${sc.avgScore != null ? `; điểm đánh giá trung bình ${sc.avgScore.toFixed(1).replace('.', ',')}` : ''}.`
    : 'Chưa có call nào được chấm trong kỳ báo cáo.');
  if (ls?.conn) insights.push(`${n(ls.noImpact)} / ${n(ls.conn)} data kết nối thành công nhưng không impact (${p(ls.noImpact / ls.conn)}); ${n(ls.high)} data mức Cao nên nghe lại${ls.contradict ? `, trong đó ${n(ls.contradict)} data ghi chú như chưa nghe máy nhưng chọn "Kết nối thành công"` : ''}${heard ? `; đã nghe ${n(heardCount)} data` : ''}.`);

  /* ---- Biểu đồ ---- */
  const dayLine = (metric, title, note, pctFmt) => {
    const pts = history ? series(history, metric, 'all').filter((x) => x.date >= from && x.date <= asOf) : [];
    if (pts.length >= 2) charts.push({ kind: 'line', title, note, labels: pts.map((x) => dmy(x.date).slice(0, 5)), values: pts.map((x) => x.value), pct: pctFmt });
  };
  dayLine('kpi', 'KPI toàn đội theo ngày', 'Trung bình KPI các nhân sự, theo bản chụp mỗi lần đồng bộ', true);
  dayLine('late', 'Data trễ SLA theo ngày', 'Tổng data trễ SLA toàn đội (càng thấp càng tốt)', false);
  charts.push({ title: 'KPI theo nhân sự', note: `Vạch đứng = thời gian đã qua (${p(s.elapsed, 0)})`, scale: Math.max(1, ...people.map((x) => x.m.kpi ?? 0)), mark: s.elapsed,
    items: ranked.map((x) => ({ label: nameOf(x.m), value: x.m.kpi ?? 0, text: p(x.m.kpi, 0), tone: x.status.key })) });
  if (ctl) {
    const withData = [...ctl.people].filter((x) => x.live > 0);
    charts.push({ title: 'Tỉ lệ đạt SLA theo nhân sự', note: 'Xanh ≥ 98% · cam ≥ 90% · đỏ dưới 90% · thang đo bắt đầu từ 80%', scale: 1, floor: 0.8,
      items: [...withData].sort((a, b) => (a.slaRate ?? 1) - (b.slaRate ?? 1)).map((x) => ({ label: cn(x), value: x.slaRate ?? 0, text: p(x.slaRate, 1), tone: slaTone(x.slaRate) })) });
    charts.push({ title: 'Tỉ lệ lỗi quy trình theo nhân sự', note: 'Xanh dưới 5% · cam đến 15% · đỏ trên 15%', scale: Math.max(0.2, ...withData.map((x) => x.errRate ?? 0)),
      items: [...ctl.people].filter((x) => x.done > 0).sort((a, b) => (b.errRate ?? 0) - (a.errRate ?? 0)).map((x) => ({ label: cn(x), value: x.errRate ?? 0, text: p(x.errRate, 1), tone: errTone(x.errRate) })) });
    const rules = [...ctl.byRule].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
    if (rules.length) charts.push({ title: 'Lỗi theo quy tắc', note: 'Số data vi phạm từng quy tắc', scale: rules[0].count, wide: true, items: rules.map((r) => ({ label: r.rule.label ?? r.rule.id, value: r.count, text: n(r.count), tone: r.rule.soft ? 'info' : 'warn' })) });
  }

  /* ---- Bảng ---- */
  sections.push({ title: 'Tổng quan', head: ['Chỉ tiêu', 'Giá trị', 'Ghi chú'], rows: [
    ['Kỳ báo cáo', range, week ? '7 ngày gần nhất, tính theo ngày tạo data' : 'Cả tháng'],
    ['Ngày số liệu', dmy(asOf), `Thời gian đã qua của tháng: ${p(s.elapsed, 0)}`],
    ['KPI toàn Online (lũy kế tháng)', p(s.kpi), `Điểm chính ${frac(s.main.done, s.main.target)} · Add-on ${frac(s.addon.done, s.addon.target)}`],
    ...(ctl ? [
      ['Tỉ lệ đạt SLA', p(ctl.slaRate), `${n(ctl.late)} / ${n(ctl.live)} data trễ`],
      ['Data đã làm chưa đúng quy trình', n(ctl.flaggedCount), `Tỉ lệ lỗi ${p(ctl.errRate)} trên ${n(ctl.total)} data đã làm`],
    ] : [['SLA và Kiểm soát', 'Chưa có', 'Dữ liệu chi tiết (Data Txx) chưa tải được']]),
  ] });

  sections.push({ title: 'KPI theo nhân sự (lũy kế tháng)', head: ['Team', 'Nhân sự', 'KPI', 'Điểm chính (đã / mục tiêu)', 'Add-on (đã / mục tiêu)', 'Talktime', 'Act đã làm / được chia'],
    rows: ranked.map((x) => [x.t.name, nameOf(x.m), p(x.m.kpi), frac(x.m.main.done, x.m.main.target), frac(x.m.addon.done, x.m.addon.target), x.m.talk?.pass ? 'Đạt' : 'Chưa đạt', frac(x.m.extra.actDone, x.m.extra.assigned)]),
    tones: ranked.map((x) => [null, null, x.status.key, null, null, x.m.talk?.pass ? 'good' : 'bad', null]),
    foot: ['Toàn Online', `${all.members.length} nhân sự`, p(s.kpi), frac(s.main.done, s.main.target), frac(s.addon.done, s.addon.target), `${talkPass} đạt`, frac(all.members.reduce((a, m) => a + (m.extra.actDone ?? 0), 0), all.members.reduce((a, m) => a + (m.extra.assigned ?? 0), 0))] });

  if (ctl) {
    const bySla = [...ctl.people].sort((a, b) => b.late - a.late || (a.name > b.name ? 1 : -1));
    sections.push({ title: `SLA xử lý data (${range})`, head: ['Nhân sự', 'Tổng data', 'Data trễ', 'Tỉ lệ đạt SLA', 'Mức trừ thưởng'],
      rows: bySla.map((x) => [cn(x), n(x.live), n(x.late), p(x.slaRate), x.slaCut == null ? '' : `${x.slaCut}%`]),
      tones: bySla.map((x) => [null, null, x.late ? 'bad' : null, slaTone(x.slaRate), slaTone(x.slaRate)]),
      foot: ['Toàn đội', n(ctl.live), n(ctl.late), p(ctl.slaRate), ctl.slaCut == null ? '' : `${ctl.slaCut}%`] });
    const byErr = [...ctl.people].sort((a, b) => (b.errRate ?? -1) - (a.errRate ?? -1));
    sections.push({ title: `Kiểm soát quy trình (${range})`, head: ['Nhân sự', 'Data đã làm', 'Data lỗi', 'Tỉ lệ lỗi'],
      rows: byErr.map((x) => [cn(x), n(x.done), n(x.flagged), p(x.errRate)]),
      tones: byErr.map((x) => [null, null, x.flagged ? 'warn' : null, errTone(x.errRate)]),
      foot: ['Toàn đội', n(ctl.total), n(ctl.flaggedCount), p(ctl.errRate)] });
    sections.push({ title: 'Lỗi theo quy tắc', head: ['Quy tắc', 'Số data'], rows: ctl.byRule.map((r) => [r.rule.label ?? r.rule.id, n(r.count)]) });
  }
  if (sc?.total) {
    const byUrgent = [...sc.people].sort((a, b) => b.urgent - a.urgent || b.weak - a.weak || (b.avgPenalty ?? 0) - (a.avgPenalty ?? 0));
    sections.push({ title: `Kiểm soát call (${range})`, head: ['Nhân sự', 'Call đã chấm', 'Cần chấn chỉnh', 'Chưa tốt', 'Điểm trừ TB', 'Điểm đánh giá TB'],
      rows: byUrgent.map((x) => [cn(x), n(x.calls), n(x.urgent), n(x.weak), x.avgPenalty == null ? '' : `${x.avgPenalty.toFixed(1).replace('.', ',')}%`, x.avgScore == null ? '' : x.avgScore.toFixed(1).replace('.', ',')]),
      tones: byUrgent.map((x) => [null, null, x.urgent ? 'bad' : null, x.weak ? 'warn' : null, null, x.avgScore == null ? null : x.avgScore >= 4 ? 'good' : x.avgScore >= 3 ? 'warn' : 'bad']),
      foot: ['Toàn đội', n(sc.total), n(sc.quality.urgent), n(sc.quality.weak), sc.avgPenalty == null ? '' : `${sc.avgPenalty.toFixed(1).replace('.', ',')}%`, sc.avgScore == null ? '' : sc.avgScore.toFixed(1).replace('.', ',')] });
    charts.push({ title: 'Chất lượng call được chấm', note: 'Số call theo từng mức xếp loại', scale: Math.max(1, sc.total), items: ['urgent', 'weak', 'good', 'none'].map((k) => ({ label: QUALITY[k].label, value: sc.quality[k], text: n(sc.quality[k]), tone: QUALITY[k].tone === 'bad' ? 'bad' : QUALITY[k].tone === 'warn' ? 'warn' : QUALITY[k].tone === 'good' ? 'good' : 'info' })) });
  }
  if (ls?.conn) {
    const byHigh = [...ls.byPerson].sort((a, b) => b.high - a.high || (b.rate ?? 0) - (a.rate ?? 0));
    const heardBy = (code) => ls.items.filter((i) => i.code === code && heard?.has(heardKey(i.r.retailer, i.r.modifiedTs))).length;
    sections.push({ title: `Nghe lại call (${range})`, head: ['Nhân sự', 'Kết nối thành công', 'Không impact', '% không impact', 'Nên nghe (mức Cao)', 'Đã nghe'],
      rows: byHigh.map((x) => [cn(x), n(x.conn), n(x.noImpact), p(x.rate), n(x.high), heard ? n(heardBy(x.code)) : '']),
      tones: byHigh.map((x) => [null, null, null, x.rate == null ? null : x.rate >= 0.6 ? 'bad' : x.rate >= 0.5 ? 'warn' : null, x.high ? 'bad' : null, null]),
      foot: ['Toàn đội', n(ls.conn), n(ls.noImpact), p(ls.rate), n(ls.high), heard ? n(heardCount) : ''] });
  }
  return { title: `Báo cáo ${week ? 'tuần' : 'tháng'} Online · ${range}`, kind: week ? 'Báo cáo tuần' : 'Báo cáo tháng', range, subtitle: `Report SC ONLINE · số liệu đến ${dmy(asOf)} · xuất lúc ${now.toLocaleString('vi-VN')}`, cards, insights, charts, sections };
}
