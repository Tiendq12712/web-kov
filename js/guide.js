/** Hướng dẫn sử dụng đầy đủ: cửa sổ có mục lục + tìm kiếm; nội dung theo quyền của người xem. */
const MANAGER = ['admin', 'manager'];

/** Mỗi mục: id, icon, tiêu đề, (roles: chỉ hiện cho các quyền này), nội dung là danh sách khối. */
const SECTIONS = [
  { id: 'start', icon: '🚀', title: 'Bắt đầu', body: [
    ['p', 'Report SC ONLINE là trang báo cáo tiến độ KPI hằng tháng của team ONLINE CS. Dữ liệu đọc trực tiếp từ Google Sheet của công ty bằng chính tài khoản Google của bạn.'],
    ['h', 'Đăng nhập'],
    ['ul', ['Bấm “Đăng nhập bằng Google” và chọn tài khoản @kiotviet.com. Tài khoản khác sẽ bị từ chối.', 'Đăng nhập một lần là dùng được trong ngày; sang ngày mới cần đăng nhập lại.', 'Mở lại web trong ngày, trang hiện ngay số liệu đã lưu kèm thanh “làm mới”. Bấm lần đầu vào bất kỳ đâu hoặc nút làm mới để lấy dữ liệu mới nhất; Google có thể hiện cửa sổ xác nhận ngắn.', 'Chưa có quyền? Liên hệ quản trị để được thêm vào mục Tài khoản.']],
    ['h', 'Làm mới dữ liệu'],
    ['ul', ['Trên điện thoại: kéo từ đầu trang xuống để làm mới.', 'Trên máy tính: dùng nút làm mới ở thanh thông báo hoặc tải lại trang.', 'Dòng “Cập nhật” cho biết lần đồng bộ CRM gần nhất; số liệu chỉ mới bằng thời điểm đó.']],
    ['h', 'Kiểm soát data'],
    ['p', 'Trang Báo cáo → Kiểm soát kiểm tra data "Đã làm" theo Quy trình ONLINE: số cuộc gọi tối thiểu, mô tả và thông tin ghi nhận, ticket, nhóm tính năng khi tư vấn tính năng, cùng tiến độ SLA và mức trừ thưởng theo quy định. Quản lý xem cả team và danh sách data cần rà; nhân sự chỉ xem phần của mình. Đây là cảnh báo tự động, không thay cho việc quản lý rà soát.'],
    ['h', 'Xuất bảng ra Excel hoặc PDF'],
    ['ul', ['Phía trên mỗi bảng có hai nút “⬇ Excel” và “⬇ PDF” (ở góc phải).', 'Excel: tải về file .xlsx của đúng bảng đang xem (số được giữ dạng số để tính toán).', 'PDF: mở hộp thoại in, chọn “Lưu dưới dạng PDF”; khổ A4 ngang, chỉ gồm bảng đó.', 'Bảng được xuất đúng như đang hiển thị (theo bộ lọc, khu vực, tháng bạn chọn).']],
    ['h', 'Cài như ứng dụng'],
    ['p', 'Trên điện thoại chọn “Thêm vào Màn hình chính” (iPhone: nút Chia sẻ của Safari). Trên Chrome máy tính dùng biểu tượng cài đặt ở thanh địa chỉ.'],
  ] },
  { id: 'nav', icon: '🧭', title: 'Điều hướng và chọn tháng', body: [
    ['ul', ['Thanh tab phía trên (máy tính) hoặc thanh dưới cùng (điện thoại) gồm: Tổng quan, Team, Báo cáo, Phân tích, Thư viện, Chia sẻ.', 'Mục có dấu ▾ (Team, Báo cáo, Phân tích) mở ra danh sách để chọn; tab đang chọn hiện tên đầy đủ, ví dụ “Báo cáo: Công việc”.', 'Màn hình hẹp: các tab khác chỉ hiện biểu tượng, rê chuột để xem tên.', 'Ô chọn tháng nằm trong các mục theo tháng (Tổng quan, Team, Công việc, SLA, Năng suất). Trang nhớ tháng bạn chọn và đường dẫn có thể gửi cho đồng nghiệp.', 'Nút tròn tài khoản (góc phải) mở menu: Thiết lập (quản trị), Hướng dẫn sử dụng, Giao diện sáng/tối và Đăng xuất.']],
  ] },
  { id: 'overview', icon: '📊', title: 'Tổng quan', body: [
    ['p', 'Màn hình chính. Thành viên thấy tiến độ của mình; quản lý thấy toàn bộ team.'],
    ['ul', ['Thẻ đầu trang: KPI đạt được, tỉ lệ hoàn thành và mức theo kịp thời gian đã qua của tháng.', 'Nhãn trạng thái: “Đạt tiến độ” = KPI theo kịp thời gian; “Cần đẩy” = từ 70% trở lên nhưng chưa kịp; “Chậm” = dưới 70%.', 'Bảng nhân sự: bấm vào một người để xem chi tiết từng chỉ tiêu; có nút xem chi tiết công và chi tiết SLA.', 'Biểu tượng bảng màu đổi kiểu tô màu: thanh màu, ít màu hoặc nhiều màu.', 'Các bảng thống kê bấm vào tiêu đề cột để sắp xếp, bấm lần nữa để đổi chiều.', 'Bấm vào một biểu đồ để xem phóng to (Esc hoặc bấm ra ngoài để đóng).', 'Mỗi nhân sự có đầu số kèm tên để phân biệt người trùng tên.', 'Thẻ “Việc cần làm hôm nay” gợi ý việc ưu tiên (data sắp trễ SLA, ngày chưa chấm công…).']],
    ['p', 'Nhân vật robot ở góc màn hình nhắc nhở khi tiến độ chậm và chúc mừng khi vượt tiến độ; bấm vào lời thoại để đi thẳng tới phần cần xem, bấm X để thu gọn.'],
  ] },
  { id: 'team', icon: '👥', title: 'Team', body: [
    ['ul', ['Chọn một team trong nhóm “Team” để xem KPI và nhân sự của team đó.', 'Bảng nhân sự có cột cố định bên trái để cuộn ngang vẫn thấy tên; bấm tiêu đề cột để sắp xếp.', 'Chọn tháng ngay trong tab; có thể so sánh với tháng khác ở mục So sánh (quản lý).']],
  ] },
  { id: 'work', icon: '🗂️', title: 'Báo cáo: Theo dõi công việc', body: [
    ['ul', ['Thống kê tiến độ xử lý data theo nhân sự: đã xử lý, còn tồn, theo loại công việc.', 'Bảng chia data theo ngày cho cả tháng; cột nhân sự và cột tổng cuối được ghim nên luôn nhìn thấy khi cuộn.', 'Có thể lọc theo khu vực (Miền Nam, Miền Bắc, T15…) khi dữ liệu có.', 'Chọn tháng trong tab; số liệu lấy theo file KPI của tháng đó.']],
  ] },
  { id: 'sla', icon: '⏱️', title: 'Báo cáo: SLA', body: [
    ['p', 'Data ONL có hạn xử lý 7 ngày. Mục này thống kê data đã trễ và sắp trễ SLA.'],
    ['ul', ['Quản lý: bảng tổng theo nhân sự gồm SL trễ, SL sắp trễ và tỉ lệ trễ tính trên tổng data được giao.', 'Bảng chi tiết trễ/sắp trễ theo ngày để biết đợt data nào cần xử lý trước.', 'Nhân sự: chỉ thấy data của mình, kèm nút xem chi tiết từ màn hình Tổng quan.', 'Tiêu đề cột căn giữa, bấm để sắp xếp.']],
  ] },
  { id: 'cinfo', icon: 'ℹ️', title: 'Báo cáo: Customer Info', body: [
    ['ul', ['Chỉ hiện khi quản trị đã thêm link Power BI vào cấu hình.', 'Thống kê tỉ lệ SC dùng Customer Info, tư vấn tính năng và Act TVTN theo RCM (kèm tỉ lệ %).', 'Quản lý xem cả team, nhân sự xem phần của mình.']],
  ] },
  { id: 'report', icon: '📞', title: 'Báo cáo: Năng suất', body: [
    ['ul', ['Cuộc gọi, talktime và ngày công theo nhân sự, theo tháng.', 'Ô công để trống ở những ngày đã qua (trừ Chủ nhật) được tính là “chưa chấm công”.', 'Mã nhân sự giữa file KPI và file năng suất được tự khớp theo tên, nên lệch mã vẫn ra đúng người.']],
  ] },
  { id: 'hr', icon: '🌴', title: 'Báo cáo: Phép năm', body: [
    ['p', 'Danh sách nhân sự và phép năm 2026, lấy từ Sheet “Danh sách nhân sự SC” trong mục Danh sách link của cấu hình.'],
    ['ul', ['Thành viên: xem phép của mình (còn lại, đã dùng, được thêm, tồn từ 2025) và bảng theo từng tháng.', 'Quản lý: bốn thẻ tổng (nhân sự, phép đã dùng, còn lại, nợ phép), bảng cả team có tìm kiếm, lọc khu vực, sắp xếp và ma trận phép đã dùng theo tháng.', '“Còn lại” lấy theo tháng gần nhất đã có số liệu. Số âm (đỏ) nghĩa là đang dùng vượt phép được hưởng.', 'Thấy số chưa đúng? Báo quản lý ở mục Chia sẻ để sửa trong Sheet.']],
  ] },
  { id: 'analysis', icon: '📈', title: 'Phân tích (quản lý)', roles: MANAGER, body: [
    ['ul', ['Xu hướng: biến động KPI theo từng ngày, dựa trên bản chụp lưu mỗi ngày trong tab Lịch sử.', 'So sánh tháng: đặt hai tháng cạnh nhau để thấy chênh lệch từng chỉ tiêu và từng người.', 'Chất lượng kết nối: phân tích từng cuộc gọi (Sheet Dữ liệu call): tỉ lệ kết nối, cuộc ngắn, khách ngắt máy, khung giờ, lý do không kết nối, so sánh qua các tháng.', 'Chuyển Offline → Online: thống kê data có mô tả "Chuyển đổi từ Offline sang Online" theo tháng, nguồn data, tỉnh/thành phố và miền, ngành hàng, tình trạng xử lý.', 'Phân tích tệp data: chọn một nguồn data (ví dụ Fnb kitchen print fail) để xem công việc hỗ trợ, tỉ lệ kết nối, impact, add-on, tồn đọng và so với toàn data; có gợi ý hành động.', 'Thành viên không thấy nhóm Phân tích.']],
  ] },
  { id: 'library', icon: '📚', title: 'Thư viện', body: [
    ['ul', ['Kho tài liệu của team (quy trình, biểu mẫu, hướng dẫn), mỗi mục có biểu tượng theo loại tệp.', 'Bấm vào tài liệu để mở trong tab mới. Chỉ hiện khi đã có link thư viện trong cấu hình.']],
  ] },
  { id: 'chat', icon: '💬', title: 'Chia sẻ', body: [
    ['ul', ['Gửi tin cho quản lý khi gặp khó khăn và xem phản hồi; hội thoại chưa có tin nhắn sẽ không hiện.', 'Tin mới tự cập nhật, có chấm báo số tin chưa đọc trên tab.', 'Lần đầu gửi tin Google xin thêm quyền ghi Sheet; sau khi đồng ý sẽ không hỏi lại trong ngày.', 'Quản lý xem được danh sách các hội thoại và trả lời từng người.']],
  ] },
  { id: 'settings', icon: '⚙️', title: 'Thiết lập (Admin / Quản trị)', roles: MANAGER, body: [
    ['p', 'Mở từ menu tài khoản. Quyền vào từng mục:'],
    ['ul', ['Tài khoản (Admin và Quản trị): thêm, sửa, xóa người dùng với Email, Phân quyền, Tên/Biệt danh, Giới tính và Đầu số. Admin quản lý được mọi người trừ Admin khác; Quản trị chỉ quản lý Thành viên.', 'Cấu hình (chỉ Admin): danh sách link Sheet (KPI, Năng suất, PBI, Thư viện, Danh sách nhân sự SC), cấu hình đồng bộ và kiểm tra quyền Sheet.', 'Đồng bộ CRM (chỉ Admin): chạy đồng bộ từ CRM về Sheet qua server cục bộ 127.0.0.1:8080; xem tiến độ và nhật ký, có nút Dừng.', 'Xuất Call (chỉ Admin): xuất dữ liệu cuộc gọi theo khoảng ngày vào Sheet.']],
    ['p', 'Đồng bộ CRM và Xuất Call cần bật server cục bộ trên máy Admin (python server.py 8080) và nhập cookie hợp lệ khi được yêu cầu.'],
  ] },
  { id: 'roles', icon: '🔐', title: 'Phân quyền', body: [
    ['table', ['Quyền', 'Xem báo cáo', 'Phân tích', 'Tài khoản', 'Cấu hình / CRM / Call'], [
      ['Thành viên', 'Phần của mình', '—', '—', '—'],
      ['Quản trị', 'Toàn team', '✓', 'Quản lý Thành viên', '—'],
      ['Admin', 'Toàn team', '✓', 'Mọi người trừ Admin', '✓'],
    ]],
  ] },
  { id: 'faq', icon: '🛟', title: 'Xử lý sự cố', body: [
    ['ul', ['“Không có quyền truy cập Sheet”: tài khoản của bạn chưa được chia sẻ Sheet; nhờ Admin dùng “Kiểm tra quyền Sheet” trong Cấu hình rồi chia sẻ lại.', 'Gửi tin vẫn hỏi đăng nhập: cho phép cửa sổ bật lên (pop-up) của trang và đồng ý quyền ghi một lần.', 'Số liệu chưa mới: kiểm tra dòng “Cập nhật”; nếu cũ, nhờ Admin chạy Đồng bộ CRM, rồi làm mới trang.', 'Không thấy một tab: tab chỉ hiện khi dữ liệu và quyền phù hợp (ví dụ Phép năm cần link nhân sự, Phân tích chỉ cho quản lý).', 'Giao diện lỗi sau khi cập nhật: tải lại trang hai lần để nhận bản mới nhất.']],
  ] },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const block = ([kind, a, b]) => kind === 'p' ? `<p>${esc(a)}</p>` : kind === 'h' ? `<h4>${esc(a)}</h4>`
  : kind === 'ul' ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
  : `<div class="guide__table"><table><thead><tr>${a.map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${b.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const text = (s) => s.title + ' ' + s.body.map(([, a, b]) => (Array.isArray(a) ? a.join(' ') + ' ' + (b ?? []).flat().join(' ') : a)).join(' ');
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

let root = null;
export function openGuide(role, { onTour } = {}) {
  if (root) return;
  const list = SECTIONS.filter((s) => !s.roles || s.roles.includes(role));
  root = document.createElement('div');
  root.className = 'guide';
  root.innerHTML = `<div class="guide__panel" role="dialog" aria-modal="true" aria-labelledby="guide-title">
    <header class="guide__head"><h2 id="guide-title">Hướng dẫn sử dụng</h2>
      <input class="search guide__search" type="search" placeholder="Tìm trong hướng dẫn…" aria-label="Tìm trong hướng dẫn">
      <button class="btn btn--ghost" type="button" data-guide="tour">Xem tour nhanh</button>
      <button class="guide__close" type="button" data-guide="close" aria-label="Đóng">✕</button></header>
    <div class="guide__main"><nav class="guide__toc" aria-label="Mục lục">${list.map((s) => `<a href="#g-${s.id}" data-guide-go="${s.id}"><span>${s.icon}</span>${esc(s.title)}</a>`).join('')}</nav>
    <div class="guide__body">${list.map((s) => `<section id="g-${s.id}" data-text="${esc(plain(text(s)))}"><h3><span>${s.icon}</span>${esc(s.title)}</h3>${s.body.map(block).join('')}</section>`).join('')}<p class="guide__empty" hidden>Không có mục nào khớp từ khóa.</p></div></div></div>`;
  document.body.append(root);
  document.documentElement.style.overflow = 'hidden';
  const body = root.querySelector('.guide__body');
  const close = () => { root.remove(); root = null; document.documentElement.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.addEventListener('click', (e) => {
    if (e.target === root) return close();
    const go = e.target.closest('[data-guide-go]');
    if (go) { e.preventDefault(); root.querySelector(`#g-${go.dataset.guideGo}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const act = e.target.closest('[data-guide]')?.dataset.guide;
    if (act === 'close') close(); else if (act === 'tour') { close(); onTour?.(); }
  });
  root.querySelector('.guide__search').addEventListener('input', (e) => {
    const q = plain(e.target.value.trim());
    let shown = 0;
    for (const sec of body.querySelectorAll('section')) { const ok = !q || sec.dataset.text.includes(q); sec.hidden = !ok; shown += ok; }
    root.querySelectorAll('[data-guide-go]').forEach((a) => { a.hidden = body.querySelector(`#g-${a.dataset.guideGo}`).hidden; });
    body.querySelector('.guide__empty').hidden = shown > 0;
  });
  root.querySelector('.guide__search').focus();
}
