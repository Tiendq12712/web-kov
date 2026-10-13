#!/bin/sh
# Gom đúng các tệp giao diện web vào một thư mục để phát hành (không đưa mã máy chủ cục bộ, tiện ích Chrome, tài liệu).
#   sh scripts/build-pages.sh          -> dist/  (Cloudflare Pages / Workers)
#   sh scripts/build-pages.sh docs     -> docs/  (GitHub Pages: Settings > Pages > Branch main, thư mục /docs)
set -e
OUT="${1:-dist}"
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r index.html privacy.html terms.html manifest.webmanifest sw.js css js icons "$OUT"/
if [ "$OUT" = "docs" ]; then
  touch docs/.nojekyll            # GitHub Pages: tắt Jekyll để mọi tệp được phát hành nguyên vẹn
else
  cp _headers "$OUT"/             # _headers chỉ Cloudflare dùng
fi
echo "Đã gom $(find "$OUT" -type f | wc -l | tr -d ' ') tệp vào $OUT/"
