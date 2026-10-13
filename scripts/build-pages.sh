#!/bin/sh
# Gom đúng các tệp giao diện web vào dist/ để Cloudflare Pages phát hành.
# Không đưa mã máy chủ cục bộ (server.py, call_report.py), tiện ích Chrome hay tài liệu lên mạng.
set -e
rm -rf dist
mkdir -p dist
cp -r index.html privacy.html terms.html manifest.webmanifest sw.js css js icons _headers dist/
echo "Đã gom $(find dist -type f | wc -l | tr -d ' ') tệp vào dist/"
