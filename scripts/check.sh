#!/bin/sh
# Kiểm tra tự động bằng Chrome không giao diện: mọi module nạp được, trang khởi động được, các phép tính chính đúng.
#   sh scripts/check.sh          -> kiểm tra mã nguồn (thư mục gốc)
#   sh scripts/check.sh docs     -> kiểm tra bản phát hành trong docs/
DIR="${1:-.}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
if [ ! -x "$CHROME" ]; then echo "Không tìm thấy Chrome ($CHROME) nên bỏ qua kiểm tra tự động."; exit 0; fi
[ "$DIR" = "." ] || { mkdir -p "$DIR/tests" && cp tests/*.html tests/*.js "$DIR/tests/"; }
TMP=$(mktemp -d); RESULT="$TMP/result.txt"
PORT=$((20000 + $$ % 20000))
python3 scripts/check_server.py "$DIR" "$PORT" "$RESULT" &
SERVER=$!
"$CHROME" --headless=new --disable-gpu --no-sandbox --user-data-dir="$TMP/profile" "http://127.0.0.1:$PORT/tests/smoke.html" >/dev/null 2>&1 &
BROWSER=$!
cleanup() { kill $BROWSER $SERVER 2>/dev/null; wait $BROWSER $SERVER 2>/dev/null; [ "$DIR" = "." ] || rm -rf "$DIR/tests"; rm -rf "$TMP"; }
trap cleanup EXIT
i=0
while [ ! -s "$RESULT" ] && [ $i -lt 90 ]; do sleep 1; i=$((i + 1)); done
if [ ! -s "$RESULT" ]; then echo "Kiểm tra tự động: KHÔNG ĐẠT (quá 90 giây không có kết quả)"; exit 1; fi
grep -E "^FAIL|TẤT CẢ|LỖI" "$RESULT"
if grep -q "^TẤT CẢ ĐẠT" "$RESULT"; then echo "Kiểm tra tự động: ĐẠT"; exit 0; fi
echo "Kiểm tra tự động: KHÔNG ĐẠT"; exit 1
