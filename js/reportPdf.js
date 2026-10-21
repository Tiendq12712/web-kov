/** Dựng trang HTML (khổ A4 dọc) của báo cáo tuần/tháng để in ra PDF: banner, thẻ chỉ số, nhận định, biểu đồ thanh có màu và các bảng. */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pctOf = (v, scale) => `${Math.max(0, Math.min(100, scale ? (v / scale) * 100 : 0)).toFixed(1)}%`;

const card = (c) => `<div class="card t-${c.tone ?? 'info'}"><div class="card__t">${esc(c.title)}${c.badge ? `<span class="pill">${esc(c.badge)}</span>` : ''}</div>
  <div class="card__v">${esc(c.value)}</div><div class="card__s">${esc(c.sub)}</div>
  ${c.progress != null ? `<div class="track"><i style="width:${pctOf(c.progress, 1)}"></i>${c.mark != null ? `<b style="left:${pctOf(c.mark, 1)}"></b>` : ''}</div>` : ''}</div>`;

const chart = (c) => `<section class="chart${c.wide ? ' chart--wide' : ''}"><h3>${esc(c.title)}</h3><p class="note">${esc(c.note ?? '')}</p>
  ${c.items.map((i) => `<div class="row"><span class="lab">${esc(i.label)}</span><span class="track track--s"><i class="t-${i.tone}" style="width:${pctOf(i.value - (c.floor ?? 0), c.scale - (c.floor ?? 0))}"></i>${c.mark != null ? `<b style="left:${pctOf(c.mark, c.scale)}"></b>` : ''}</span><span class="val">${esc(i.text)}</span></div>`).join('')}</section>`;

const table = (sec) => `<h2>${esc(sec.title)}</h2><table><thead><tr>${sec.head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
  sec.rows.map((r, ri) => `<tr>${r.map((c, ci) => `<td${sec.tones?.[ri]?.[ci] ? ` class="c-${sec.tones[ri][ci]}"` : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>${
  sec.foot ? `<tfoot><tr>${sec.foot.map((c) => `<td>${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table>`;

export function reportHtml(report) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(report.title)}</title><style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root { --blue: #2f63e0; --good: #1f9d55; --warn: #e08a1e; --bad: #d64545; --info: #5b6b86; --ink: #1c2433; --muted: #66728a; --line: #dde3ee; }
  body { margin: 0; font: 11px/1.45 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: var(--ink); }
  .banner { background: linear-gradient(120deg, #1d3f9e, #2f63e0 60%, #3aa0f0); color: #fff; border-radius: 10px; padding: 16px 18px; }
  .banner small { letter-spacing: .08em; text-transform: uppercase; opacity: .85; font-size: 10px; }
  .banner h1 { margin: 3px 0 2px; font-size: 21px; } .banner p { margin: 0; opacity: .85; font-size: 10px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .card { border: 1px solid var(--line); border-top: 4px solid var(--info); border-radius: 8px; padding: 8px 10px; break-inside: avoid; }
  .card__t { font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); display: flex; justify-content: space-between; gap: 4px; }
  .pill { font-size: 9px; padding: 0 6px; border-radius: 99px; background: var(--info); color: #fff; text-transform: none; letter-spacing: 0; }
  .card__v { font-size: 22px; font-weight: 700; margin: 2px 0; } .card__s { font-size: 10px; color: var(--muted); }
  .t-good { border-top-color: var(--good); } .t-warn { border-top-color: var(--warn); } .t-bad { border-top-color: var(--bad); }
  .card.t-good .card__v, .card.t-good .pill { color: var(--good); } .card.t-warn .card__v { color: var(--warn); } .card.t-bad .card__v { color: var(--bad); }
  .card.t-good .pill { background: #e3f5ea; } .card.t-warn .pill { background: var(--warn); } .card.t-bad .pill { background: var(--bad); }
  .track { position: relative; height: 7px; border-radius: 99px; background: #e8edf6; margin-top: 7px; } .track i { display: block; height: 100%; border-radius: 99px; background: var(--info); }
  .track b { position: absolute; top: -3px; width: 2px; height: 13px; background: var(--ink); }
  .card.t-good .track i { background: var(--good); } .card.t-warn .track i { background: var(--warn); } .card.t-bad .track i { background: var(--bad); }
  .insights { background: #f4f7fd; border-left: 4px solid var(--blue); border-radius: 6px; padding: 8px 14px 8px 12px; margin: 4px 0 8px; break-inside: avoid; }
  .insights h2 { margin: 0 0 4px; font-size: 13px; color: var(--blue); } .insights ul { margin: 0; padding-left: 16px; } .insights li { margin: 2px 0; }
  .charts { columns: 2; column-gap: 12px; }
  .chart { break-inside: avoid; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin: 0 0 8px; }
  .chart h3 { margin: 0; font-size: 12px; } .note { margin: 0 0 5px; color: var(--muted); font-size: 9px; }
  .row { display: grid; grid-template-columns: 112px 1fr 38px; align-items: center; gap: 6px; margin: 3px 0; }
  .lab { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .val { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .chart--wide .row { grid-template-columns: 1fr; gap: 1px; margin: 5px 0; } .chart--wide .lab { white-space: normal; }
  .track--s { margin: 0; height: 9px; } .track--s i.t-good { background: var(--good); } .track--s i.t-warn { background: var(--warn); } .track--s i.t-bad { background: var(--bad); } .track--s i.t-info { background: var(--info); }
  h2.sec, h2 { font-size: 13px; margin: 14px 0 5px; color: #1d3f9e; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 4px; } th, td { border: 1px solid var(--line); padding: 3px 6px; text-align: center; }
  td:first-child, th:first-child { text-align: left; } th { background: #e8eefb; color: #1d3f9e; } tbody tr:nth-child(even) td { background: #fafbfe; }
  tfoot td { font-weight: 700; background: #eef2fa; } tr { break-inside: avoid; } thead { display: table-header-group; }
  td.c-good { background: #e3f5ea !important; color: #146c3a; font-weight: 600; } td.c-warn { background: #fdf0dc !important; color: #9a5a08; font-weight: 600; } td.c-bad { background: #fbe3e3 !important; color: #a82d2d; font-weight: 600; }
  .foot { margin-top: 12px; color: var(--muted); font-size: 9px; text-align: center; }
  </style></head><body>
  <div class="banner"><small>${esc(report.kind)} · Team Online</small><h1>${esc(report.range)}</h1><p>${esc(report.subtitle)}</p></div>
  <div class="cards">${report.cards.map(card).join('')}</div>
  <div class="insights"><h2>Nhận định chính</h2><ul>${report.insights.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
  <div class="charts">${report.charts.map(chart).join('')}</div>
  ${report.sections.map(table).join('')}
  <p class="foot">Report SC ONLINE · tài liệu nội bộ</p></body></html>`;
}
