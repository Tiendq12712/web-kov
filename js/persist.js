/** Bộ nhớ lưu lâu trong trình duyệt (IndexedDB) cho dữ liệu lớn, ít đổi (ví dụ chi tiết data của tháng đã qua). Lỗi thì coi như không có. */
const DB = 'kpi-persist', STORE = 'kv';

const open = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const run = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
  });
};

/** Đọc giá trị còn hạn (ttl: ms); hết hạn hoặc lỗi thì trả null. */
export async function persistGet(key, ttl) {
  try {
    const hit = await run('readonly', (s) => s.get(key));
    return hit && Date.now() - hit.at < ttl ? hit.value : null;
  } catch { return null; }
}
export const persistSet = (key, value) => run('readwrite', (s) => s.put({ at: Date.now(), value }, key)).catch(() => {});
export const persistClear = () => run('readwrite', (s) => s.clear()).catch(() => {});
