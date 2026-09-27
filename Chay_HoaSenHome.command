#!/bin/zsh
set -e

cd -- "$(dirname -- "$0")"
port=8765
url="http://127.0.0.1:${port}/"

if lsof -nP -iTCP:${port} -sTCP:LISTEN >/dev/null 2>&1; then
  if curl --fail --silent --max-time 2 "${url}api/presets" >/dev/null; then
    echo "Hoa Sen Home đã chạy tại ${url}"
    open "$url"
    exit 0
  fi
  echo "Cổng ${port} đang được một chương trình khác sử dụng."
  read -k 1 '?Nhấn phím bất kỳ để đóng...'
  exit 1
fi

python3 server.py --host 127.0.0.1 --port "$port" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM

ready=0
for i in {1..40}; do
  if curl --fail --silent --max-time 1 "${url}api/presets" >/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then break; fi
  sleep 0.25
done

if [ "$ready" -ne 1 ]; then
  echo "Không thể khởi động Hoa Sen Home. Kiểm tra Python 3 rồi thử lại."
  read -k 1 '?Nhấn phím bất kỳ để đóng...'
  exit 1
fi

open "$url"
echo "Hoa Sen Home đang chạy tại ${url}"
echo "Giữ cửa sổ Terminal này mở trong lúc sử dụng web. Đóng cửa sổ để dừng máy chủ."
wait "$server_pid"
