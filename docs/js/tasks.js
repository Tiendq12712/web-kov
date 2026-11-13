/** Thống kê "Công việc hỗ trợ" (cột nhân sự ghi lại đã làm gì cho data), tính trên data đã làm; một data có thể có nhiều công việc.
 *  Data chưa ghi công việc hỗ trợ thì chưa có impact nên không được liệt kê thành một dòng (chỉ nằm ở mẫu số "data đã làm"). */
const ratio = (a, b) => (b ? a / b : null);

/** rows: các dòng data chi tiết (đã lọc kỳ/nhân sự). Trả về { done, withTask, withTaskRate, totalTasks, list } với list xếp theo số lần giảm dần. */
export function taskStats(rows) {
  const doneRows = rows.filter((r) => r.status === 'Đã làm'), map = new Map();
  for (const r of doneRows) for (const t of (r.tasks ?? [])) {
    const x = map.get(t) ?? map.set(t, { task: t, n: 0, contacted: 0, conn: 0, impact: 0 }).get(t);
    x.n += 1; x.contacted += r.contact ? 1 : 0; x.conn += r.contact === 'Kết nối thành công' ? 1 : 0; x.impact += r.impact ? 1 : 0;
  }
  const withTask = doneRows.filter((r) => r.tasks?.length).length;
  return {
    done: doneRows.length, withTask, withTaskRate: ratio(withTask, doneRows.length), totalTasks: doneRows.reduce((a, r) => a + (r.tasks?.length ?? 0), 0),
    list: [...map.values()].map((x) => ({ ...x, share: ratio(x.n, doneRows.length), connRate: ratio(x.conn, x.contacted), impactRate: ratio(x.impact, x.n) })).sort((a, b) => b.n - a.n),
  };
}

const codeOf = (h) => /^(\d+)\s*-/.exec(h ?? '')?.[1] ?? '';

/** Xu hướng công việc hỗ trợ theo tháng: mỗi công việc một dòng, mỗi tháng một ô (số lần, % data đã làm, kết nối, impact).
 *  months: danh sách tháng (YYYY-MM hoặc nhãn tháng của data); code: chỉ tính data của một nhân sự (bỏ trống = tất cả). */
export function taskTrend(rows, months, code = '') {
  const per = months.map((m) => taskStats(rows.filter((r) => r.month === m && r.status !== 'Hủy' && (!code || codeOf(r.handler) === code))));
  const names = new Map();
  per.forEach((s) => s.list.forEach((t) => names.set(t.task, (names.get(t.task) ?? 0) + t.n)));
  const list = [...names].sort((a, b) => b[1] - a[1]).map(([task, total]) => ({
    task, total, cells: per.map((s) => s.list.find((t) => t.task === task) ?? null),
  }));
  return { months, done: per.map((s) => s.done), withTaskRate: per.map((s) => s.withTaskRate), list };
}
