/** Địa chỉ #/<tháng>/<tab> và việc nhớ nơi đang xem của từng tài khoản. */
import { state } from './state.js';

export const readHash = () => {
  const [month, tab] = location.hash.replace(/^#\/?/, '').split('/');
  return { month, tab };
};
/** Nhớ tab và tháng đang xem của từng tài khoản để lần mở sau vào lại đúng chỗ. */
export const lastKey = (email) => `kpi.last.${email}`;
export const readLast = (email) => { try { return JSON.parse(localStorage.getItem(lastKey(email))) ?? {}; } catch { return {}; } };
export const writeHash = () => {
  try { history.replaceState(null, '', `#/${state.month}/${state.tab}`); } catch { /* khung nhúng hoặc môi trường kiểm tra không cho đổi địa chỉ: bỏ qua */ }
  if (state.me?.email && state.month) { try { localStorage.setItem(lastKey(state.me.email), JSON.stringify({ month: state.month, tab: state.tab })); } catch { /* không lưu được thì thôi */ } }
};

