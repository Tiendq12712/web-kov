/** Bộ lọc dùng chung: đổi tháng hoặc nhân sự ở một báo cáo thì các báo cáo khác cũng đổi theo. */
import { state } from './state.js';

const MONTH_SLICES = () => [state.xfer, state.jobs, state.listen, state.callctl, state.segment];
const PERSON_SLICES = () => [[state.listen, 'person'], [state.callctl, 'person'], [state.control, 'person'], [state.trend, 'who']];
export function shareMonth(value) { for (const slice of MONTH_SLICES()) slice.month = value; }
export function sharePerson(value) { for (const [slice, key] of PERSON_SLICES()) slice[key] = value; }

