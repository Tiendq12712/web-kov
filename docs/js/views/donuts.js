import { pct, num } from '../format.js';
import { donutChart } from './charts.js';

const sum = (list, pick) => list.reduce((a, m) => a + (pick(m) ?? 0), 0);
const ratio = (a, b) => (b ? a / b : 0);

const CONTACT_CLASSES = ['s2', 's1', 's3', 's4'];     // kết nối, thuê bao, không nghe máy, sai số
const SOURCE_CLASSES = ['s1', 's2', 's3', 's4'];

/** Tình trạng liên hệ: cộng các nhóm CSKH thành một vòng tròn, giữa vòng là tỉ lệ kết nối thành công. */
export const contactDonut = (contact) => {
  const labels = contact.labels.filter((l) => l !== 'Tổng');
  const segments = labels.map((label, i) => ({ label, value: sum(contact.groups, (g) => g.values[i]), cls: CONTACT_CLASSES[i] }));
  const total = sum(segments, (x) => x.value);
  return donutChart({ segments, center: { value: pct(ratio(segments[0].value, total)), label: 'kết nối' } });
};

/** Nguồn data (nhóm CSKH T15 / NA / OI): số data được chia từ đầu tháng đến ngày cuối có dữ liệu. */
const shortSource = (name) => name.replace(/^CSKH\s*/, '').replace(/\s*-\s*DVKH$/, '');
export const sourceDonut = (work) => {
  const groups = work.dataBySource?.groups ?? [];
  const segments = groups.map((g, i) => ({ label: shortSource(g.name), value: sum(g.values.slice(0, work.lastDay), (v) => v), cls: SOURCE_CLASSES[i % 4] }));
  return donutChart({ segments, center: { value: num(sum(segments, (x) => x.value)), label: 'data' } });
};

/** Tình trạng xử lý: đã làm / đang làm / chưa làm trên tổng data được chia. */
export const statusDonut = (work) => {
  const col = (i) => sum(work.status.members, (m) => m.values[i]);
  const segments = [{ label: 'Đã làm', value: col(0), cls: 's2' }, { label: 'Đang làm', value: col(1), cls: 's1' }, { label: 'Chưa làm', value: col(2), cls: 's4' }];
  return donutChart({ segments, center: { value: pct(ratio(segments[0].value, sum(segments, (x) => x.value))), label: 'đã làm' } });
};

