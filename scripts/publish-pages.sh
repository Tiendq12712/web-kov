#!/bin/sh
# Xuất bản phần giao diện web lên một repo GitHub Pages RIÊNG (Public), giữ repo mã nguồn này ở Private.
# Dùng:  sh scripts/publish-pages.sh <thư-mục-bản-clone-của-repo-pages>
set -e
TARGET="$1"
if [ -z "$TARGET" ] || [ ! -d "$TARGET/.git" ]; then
  echo "Cách dùng: sh scripts/publish-pages.sh <thư-mục-repo-pages-đã-clone>" >&2
  exit 1
fi
sh scripts/build-pages.sh
# _headers chỉ Cloudflare hiểu; GitHub Pages không dùng nên không đưa lên.
rsync -a --delete --exclude '.git' --exclude '_headers' dist/ "$TARGET"/
touch "$TARGET/.nojekyll"          # tắt Jekyll để mọi tệp được phát hành nguyên vẹn
cd "$TARGET"
git add -A
if git diff --cached --quiet; then
  echo "Không có thay đổi để xuất bản."
else
  git commit -q -m "Publish web-kov UI $(date '+%Y-%m-%d %H:%M')"
  git push -u origin HEAD
  echo "Đã xuất bản."
fi
