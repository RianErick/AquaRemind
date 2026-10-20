#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${AQUAREMIND_PORT:-8787}"
URL="http://127.0.0.1:$PORT"

if curl -fsS "$URL" >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
  echo "Simulador aberto em $URL"
  exit 0
fi

cd "$PROJECT_DIR/simulador"
nohup python3 -m http.server "$PORT" --bind 127.0.0.1 \
  </dev/null >/tmp/aquaremind-simulador.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > /tmp/aquaremind-simulador.pid

for _ in {1..30}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
    echo "Simulador aberto em $URL"
    exit 0
  fi
  sleep 0.2
done

echo "Nao foi possivel iniciar o simulador. Consulte /tmp/aquaremind-simulador.log"
exit 1
