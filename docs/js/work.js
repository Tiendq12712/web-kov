/** Đọc tab "Theo dõi công việc ONL": các bảng pivot (tồn theo ngày, tình trạng xử lý, liên hệ, call/ACT, data đã chia).
 *  Mỗi khối được nhận ra theo tiêu đề cột, không theo vị trí cố định. */
const MEMBER = /^(\d+)\s*-\s*(.+?)\s*-\s*(.+)$/;
const HEADER_LABELS = new Set(['Người xử lý', 'Data', 'Data đã làm']);
const TOTAL_LABEL = 'Grand Total';
const FIRST_VALUE_COL = 2;   // cột C

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const number = (v) => (typeof v === 'number' ? v : null);

/** Đọc một khối bảng bắt đầu từ dòng tiêu đề `r`. */
function readBlock(rows, r, title) {
  const header = rows[r];
  const labels = [];
  for (let c = FIRST_VALUE_COL; header[c] !== '' && header[c] != null; c++) labels.push(header[c]);

  const members = [];
  const groups = [];
  for (let i = r + 1; text(rows[i]?.[1]); i++) {
    const name = text(rows[i][1]);
    if (name === TOTAL_LABEL || name.startsWith('Tỉ lệ')) continue;
    const values = labels.map((_, k) => number(rows[i][FIRST_VALUE_COL + k]));
    const m = MEMBER.exec(name);
    if (m) members.push({ code: m[1], name: m[2], values });
    else groups.push({ name, values });
  }
  return { rowHeader: text(header[1]), title, labels, members, groups };
}

const isDays = (b) => typeof b.labels[0] === 'number' && b.labels.includes('Tổng');

/** Phân loại khối theo nhãn cột / tiêu đề phía trên. */
function classify(b) {
  if (b.labels.includes('Tổng act')) return 'callsPerAct';
  if (b.labels.includes('Đã làm')) return 'status';
  if (b.labels.includes('CSKH T15 - DVKH')) return 'sources';
  if (b.rowHeader === 'Data đã làm') return 'contact';
  if (isDays(b) && b.rowHeader === 'Người xử lý') {
    if (/CHƯA LÀM \+ ĐANG LÀM/i.test(b.title)) return 'backlogAll';
    if (/CHƯA LÀM/i.test(b.title)) return 'backlogTodo';
    if (/ĐÃ CHIA/i.test(b.title)) return 'assigned';
  }
  if (isDays(b) && b.rowHeader === 'Data') {
    return b.groups.some((g) => /^CSKH/.test(g.name)) ? 'dataBySource' : 'dataByIndustry';
  }
  return null;
}

export function parseWork(rows) {
  const blocks = {};
  let title = '';
  rows.forEach((row, r) => {
    if (text(row[0])) title = text(row[0]);
    if (!HEADER_LABELS.has(text(row[1]))) return;
    const block = readBlock(rows, r, title);
    const kind = classify(block);
    if (kind && !blocks[kind]) blocks[kind] = block;
  });
  if (!blocks.status) throw new Error('Không tìm thấy bảng "Theo tình trạng xử lý" trong tab công việc');

  const dayCount = (b) => b?.labels.findIndex((l) => l === 'Tổng') ?? 0;
  const days = blocks.assigned ? Array.from({ length: dayCount(blocks.assigned) }, (_, i) => i + 1) : [];
  // Ngày cuối cùng đã có data được chia (những ngày sau chưa tới nên bỏ qua).
  const lastDay = days.filter((d) => blocks.assigned.members.some((m) => m.values[d - 1] > 0)).at(-1) ?? 0;
  return { ...blocks, lastDay };
}

/** Đọc khối công việc nếu tab có; tab không có các bảng này thì trả về null (tab Công việc sẽ ẩn). */
export function tryParseWork(rows) {
  try { return parseWork(rows); } catch { return null; }
}
