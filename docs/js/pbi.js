/**
 * Dữ liệu Power BI "SC sử dụng Customer Info" (Sheet có tab Data: mỗi dòng là một activity).
 * Các cột được nhận theo tên tiêu đề, không phụ thuộc thứ tự.
 */
const text = (v) => (v == null ? '' : String(v).trim());
const MEMBER = /^(\d+)\s*-\s*(.+?)\s*-\s*(.+)$/;

/** Ngày dạng dd/mm/yyyy (chuỗi) hoặc số serial của Google Sheets -> 'YYYY-MM-DD' ('' nếu trống/không đọc được). */
export function toIsoDate(v) {
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text(v));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

/** Danh sách tính năng dạng chuỗi ngăn bằng "|##|" (SC tư vấn) hoặc mảng JSON (RCM, matched). */
function features(v) {
  const t = text(v);
  if (!t) return [];
  if (t.startsWith('[')) { try { return JSON.parse(t).map((x) => text(x)).filter(Boolean); } catch { return []; } }
  return t.split('|##|').map((x) => x.trim()).filter(Boolean);
}

export function parsePbi(rows) {
  if (rows.length < 2) throw new Error('Tab dữ liệu Power BI chưa có dòng nào');
  const head = rows[0].map(text);
  const col = (name) => head.findIndex((h) => h.toLowerCase().startsWith(name.toLowerCase()));
  const idx = {
    id: col('activityid'), retailer: col('retailer_id'), type: col('Loại công việc'), who: col('last_name'), used: col('used_stt'),
    match: col('is_match_feature'), status: col('status'), created: col('createdtime'), modified: col('modifiedtime'),
    support: col('Công việc hỗ trợ'), matched: col('matched_feature'), sc: col('Tính năng SC tư vấn'), rcm: col('Tính năng rcm tư vấn'),
  };
  if (idx.who < 0 || idx.used < 0) throw new Error('Tab dữ liệu Power BI thiếu cột last_name hoặc used_stt');
  const get = (r, k) => (idx[k] >= 0 ? r[idx[k]] : '');
  const acts = rows.slice(1).filter((r) => text(get(r, 'who'))).map((r) => {
    const m = MEMBER.exec(text(get(r, 'who')));
    const sc = features(get(r, 'sc'));
    return {
      id: text(get(r, 'id')), retailer: text(get(r, 'retailer')), type: text(get(r, 'type')),
      code: m?.[1] ?? '', name: m?.[2] ?? text(get(r, 'who')),
      used: text(get(r, 'used')) === 'Có', status: text(get(r, 'status')),
      match: text(get(r, 'match')) === '1' || get(r, 'match') === 1,
      created: toIsoDate(get(r, 'created')), modified: toIsoDate(get(r, 'modified')),
      // Tư vấn tính năng: cột "Công việc hỗ trợ" có công việc "Tư vấn tính năng" (có thể kèm công việc khác, ngăn bằng "|##|").
      support: text(get(r, 'support')), advised: /tư vấn tính năng/i.test(text(get(r, 'support'))), scFeatures: sc,
      matchedFeatures: features(get(r, 'matched')), rcmFeatures: features(get(r, 'rcm')),
    };
  });
  if (!acts.length) throw new Error('Không có activity nào trong tab dữ liệu Power BI');
  const uniq = (key) => [...new Set(acts.map((a) => a[key]).filter(Boolean))].sort();
  const dates = (key) => acts.map((a) => a[key]).filter(Boolean).sort();
  const people = new Map(acts.map((a) => [a.code, a.name]));
  return {
    acts, types: uniq('type'), statuses: uniq('status'),
    people: [...people].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    createdRange: [dates('created')[0] ?? '', dates('created').at(-1) ?? ''], modifiedRange: [dates('modified')[0] ?? '', dates('modified').at(-1) ?? ''],
  };
}
