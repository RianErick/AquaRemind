#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install platformio
"$VENV_DIR/bin/pio" run --project-dir "$PROJECT_DIR"

echo
echo "AquaRemind preparado com sucesso."
echo "Abra no VS Code: code '$PROJECT_DIR'"
echo "No VS Code, instale as extensoes recomendadas e execute a tarefa Wokwi: Start Simulator."
