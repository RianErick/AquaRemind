#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIO="$PROJECT_DIR/.venv/bin/pio"

echo "========================================"
echo "         AquaRemind - Inicializador"
echo "========================================"

if ! command -v code >/dev/null 2>&1; then
  echo "Erro: VS Code nao foi encontrado."
  exit 1
fi

if [[ ! -x "$PIO" ]]; then
  echo "Primeira execucao: preparando o PlatformIO..."
  "$PROJECT_DIR/scripts/setup.sh"
else
  echo "Compilando o firmware..."
  "$PROJECT_DIR/scripts/build.sh"
fi

echo "Verificando extensoes do VS Code..."
INSTALLED_EXTENSIONS="$(code --list-extensions 2>/dev/null || true)"

if ! grep -qi '^platformio\.platformio-ide$' <<<"$INSTALLED_EXTENSIONS"; then
  code --install-extension platformio.platformio-ide
fi

if ! grep -qi '^wokwi\.wokwi-vscode$' <<<"$INSTALLED_EXTENSIONS"; then
  code --install-extension wokwi.wokwi-vscode
fi

echo "Abrindo o projeto no VS Code..."
code --reuse-window "$PROJECT_DIR" >/dev/null 2>&1 &
"$PROJECT_DIR/simular.sh"

echo
echo "Projeto compilado e aberto."
echo "O painel interativo foi aberto em http://127.0.0.1:8787"
echo "Para iniciar a simulacao no VS Code:"
echo "  1. Pressione F1"
echo "  2. Digite: Wokwi: Start Simulator"
echo "  3. Pressione Enter"
echo
echo "Na primeira vez, o Wokwi pode solicitar a ativacao da licenca gratuita."
