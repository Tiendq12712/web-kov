/* Service worker: chỉ cache "vỏ" ứng dụng (HTML/CSS/JS/icon cùng origin).
   Dữ liệu KPI và đăng nhập Google (khác origin) KHÔNG bao giờ được cache. */
const CACHE = 'kpi-shell-v248';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/main.js', 'js/config.js', 'js/auth.js', 'js/sheet.js', 'js/persist.js', 'js/quality.js', 'js/periodReport.js', 'js/callScores.js', 'js/listen.js', 'js/tasks.js', 'js/views/tasks.js', 'js/app/state.js', 'js/app/route.js', 'js/app/nav.js', 'js/app/hooks.js', 'js/app/filters.js', 'js/app/heard.js', 'js/app/reportExport.js', 'js/app/background.js', 'js/app/today.js', 'js/today.js', 'js/views/today.js', 'js/audit.js', 'js/addonScore.js', 'js/cinfoWeekly.js', 'js/addonDetail.js', 'js/views/addonDetail.js', 'js/views/addonScore.js', 'js/heard.js', 'js/jobType.js', 'js/views/jobType.js', 'js/views/listen.js', 'js/views/callScores.js', 'js/reportPdf.js', 'js/data.js',
  'js/report.js', 'js/work.js', 'js/crm.js', 'js/directory.js', 'js/settingsController.js', 'js/sheetTable.js', 'js/dom.js', 'js/format.js', 'js/metrics.js', 'js/chat.js', 'js/hr.js', 'js/connect.js', 'js/calls.js', 'js/segment.js', 'js/transfer.js', 'js/views/transfer.js', 'js/control.js', 'js/views/control.js', 'js/slaDetail.js', 'js/views/slaDetail.js', 'js/addons.js', 'js/views/addons.js', 'js/views/segment.js', 'js/views/connectCalls.js', 'js/views/connect.js', 'js/views/hr.js', 'js/coach.js', 'js/views/coach.js', 'js/library.js', 'js/views/library.js', 'js/access.js', 'js/compare.js', 'js/views/compare.js', 'js/history.js', 'js/todo.js', 'js/views/trend.js', 'js/views/todo.js', 'js/pbi.js', 'js/views/cinfo.js', 'js/sla.js', 'js/views/sla.js', 'js/snapshot.js', 'js/chatController.js', 'js/syncTime.js', 'js/welcome.js', 'js/tour.js', 'js/guide.js', 'js/export.js', 'js/tip.js', 'js/zoom.js', 'js/mobileShell.js', 'js/tableSort.js', 'js/views/chat.js', 'js/views/timesheet.js',
  'js/views/components.js', 'js/views/charts.js', 'js/views/overview.js', 'js/views/team.js',
  'js/views/detail.js', 'js/views/report.js', 'js/views/heat.js', 'js/views/work.js', 'js/views/donuts.js', 'js/views/settings.js',
  'icons/icon-192.png', 'icons/mark.png', 'icons/favicon.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' bỏ qua bộ nhớ đệm HTTP của trình duyệt để chắc chắn lưu bản mới nhất từ server.
  const fresh = SHELL.map((url) => new Request(url, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: mở nhanh từ cache, đồng thời cập nhật bản mới cho lần sau.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const refresh = fetch(request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    if (cached) { refresh.catch(() => {}); return cached; }
    try { return await refresh; }
    catch { return request.mode === 'navigate' ? cache.match('index.html') : Response.error(); }
  })());
});
