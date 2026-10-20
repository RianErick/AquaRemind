#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="$PROJECT_DIR/3d/aquaremind.scad"

mkdir -p "$PROJECT_DIR/3d/export"

if command -v openscad >/dev/null 2>&1; then
  run_openscad() { openscad "$@"; }
elif command -v docker >/dev/null 2>&1; then
  run_openscad() {
    docker run --rm -u "$(id -u):$(id -g)" -v "$PROJECT_DIR:/work" \
      -w /work openscad/openscad:latest openscad "$@"
  }
  MODEL="3d/aquaremind.scad"
else
  echo "OpenSCAD e Docker nao encontrados. Instale um deles para exportar o modelo."
  exit 1
fi

for PART in cap enclosure cover assembly; do
  run_openscad -o "3d/export/$PART.stl" -D "part=\"$PART\"" "$MODEL"
done
python3 -s "$PROJECT_DIR/scripts/render-preview.py" \
  "$PROJECT_DIR/3d/export/assembly.stl" "$PROJECT_DIR/3d/export/preview.png"
echo "STLs e preview gerados em $PROJECT_DIR/3d/export"
