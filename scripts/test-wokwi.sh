#!/usr/bin/env bash
# Roda os cenarios de tests/ no Wokwi. Uso: ./scripts/test-wokwi.sh [filtro]
# Exemplo: ./scripts/test-wokwi.sh ct06
set -uo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ -f .env.wokwi ]]; then set -a; . ./.env.wokwi; set +a; fi
if [[ -z "${WOKWI_CLI_TOKEN:-}" ]]; then
  echo "Defina WOKWI_CLI_TOKEN ou crie .env.wokwi (token em https://wokwi.com/dashboard/ci)."
  exit 2
fi
if [[ ! -f .pio/build/esp32dev/firmware.bin ]]; then ./scripts/build.sh || exit 2; fi

mkdir -p tests/evidencias
falhas=0; total=0
for cenario in tests/*${1:-}*.yaml; do
  nome="$(basename "$cenario" .yaml)"; total=$((total+1))
  log="tests/evidencias/$nome.log"
  if wokwi-cli --scenario "$cenario" --timeout 90000 --serial-log-file "$log" -q . >"$log.saida" 2>&1; then
    echo "PASSOU  $nome"; rm -f "$log.saida"
  else
    echo "FALHOU  $nome (veja $log.saida)"; falhas=$((falhas+1))
  fi
done
echo "$((total-falhas))/$total cenarios passaram."
[[ $falhas -eq 0 ]]
