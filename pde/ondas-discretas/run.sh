#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Ondas discretas: escalera de validacion -> figuras -> video de portada.
#
#   ./run.sh              todo (~15 min con 4 nucleos)
#   ./run.sh escalera     peldanos de validacion + salida/validacion.md (~3 min)
#   ./run.sh figuras      figuras estaticas (explicativa, casos 1D, validacion)
#   ./run.sh portada      fotogramas (tmp/portada) + webm/mp4 + poster (~10 min)
#
# Variables: HILOS (4 por defecto), NPORTADA (N de la malla 2D, 1000).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

RAIZ=$(cd ../.. && pwd)
VENV="$RAIZ/.venv"
PY="$VENV/bin/python"
HILOS=${HILOS:-4}
NPORTADA=${NPORTADA:-1000}

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

prepara() {
  mkdir -p salida tmp
  if [ ! -x "$PY" ]; then
    paso "entorno de Python"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --upgrade pip
  fi
  "$PY" -c 'import numpy, scipy, matplotlib, PIL' 2>/dev/null || {
    paso "instalando numpy, scipy, matplotlib y pillow"
    "$VENV/bin/pip" install -q numpy scipy matplotlib pillow
  }
  export MPLCONFIGDIR="$PWD/tmp/.mpl"
  export OMP_NUM_THREADS=$HILOS OPENBLAS_NUM_THREADS=$HILOS MKL_NUM_THREADS=$HILOS
  export PYTHONUNBUFFERED=1
}

escalera() {
  paso "escalera de validacion"
  nice "$PY" python/escalera.py todo
  paso "informe"
  "$PY" python/informe.py
}

figuras() {
  paso "figuras estaticas"
  nice "$PY" python/figuras.py
}

portada() {
  paso "fotogramas de portada (N = $NPORTADA)"
  nice "$PY" python/portada.py --N "$NPORTADA"
  paso "video y poster"
  "$PY" python/video.py
  ls -lh salida/ondas-rodeo-portada* | sed 's/^/  /'
}

case "${1:-todo}" in
  escalera) prepara; escalera ;;
  figuras)  prepara; figuras ;;
  portada)  prepara; portada ;;
  todo)     prepara; escalera; figuras; portada ;;
  *) echo "uso: $0 [todo|escalera|figuras|portada]" >&2; exit 2 ;;
esac

paso "listo"
