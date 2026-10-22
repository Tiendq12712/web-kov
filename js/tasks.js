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
