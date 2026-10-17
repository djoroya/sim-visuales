#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduce el ejemplo de la grieta: validacion -> simulacion -> video,
# imagenes y datos del visor.
#
#   ./run.sh              todo
#   ./run.sh validacion   constantes elasticas y energia de superficie
#   ./run.sh simulacion   el ensayo de fractura (unos 3 minutos)
#   ./run.sh salidas      video, imagenes y binario del visor
#
# Variables utiles: NX, NY, EPS, TFIN, HILOS, LMP.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

NX=${NX:-300}
NY=${NY:-72}
EPS=${EPS:-0.040}
TFIN=${TFIN:-240}
NVOLC=${NVOLC:-240}
HILOS=${HILOS:-4}
SMAX=${SMAX:-3.2}
LMP=${LMP:-lmp}

RAIZ=$(cd ../.. && pwd)
VENV="$RAIZ/.venv"
PY="$VENV/bin/python"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

prepara() {
  mkdir -p datos salida tmp web
  if [ ! -x "$PY" ]; then
    paso "entorno de Python"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --upgrade pip
    "$VENV/bin/pip" install -q numpy matplotlib pillow
  fi
  export MPLCONFIGDIR="$PWD/tmp/.mpl"
}

validacion() {
  paso "constantes elasticas y energia de superficie"
  $LMP -in lammps/in.elastico -log datos/log.elastico -screen none
}

simulacion() {
  paso "propagacion de la grieta (unos 3 minutos)"
  $LMP -sf omp -pk omp "$HILOS" -in lammps/in.grieta \
       -var nx "$NX" -var ny "$NY" -var eps "$EPS" -var tfin "$TFIN" \
       -var nvolc "$NVOLC" -var sal datos/grieta \
       -log datos/log.grieta -screen none
  paso "posicion y velocidad de la punta"
  "$PY" python/punta.py
}

salidas() {
  paso "tabla de validacion"
  "$PY" python/valida.py

  paso "fotogramas del fondo de portada (campo continuo)"
  "$PY" python/render.py --desde 85 --hasta 215 --salida tmp/portada \
        --ancho 1280 --alto 320 --smax 3.0 --suavizado 1.8 --celda 1.1 \
        --dibujo campo --procesos "$HILOS"

  paso "video en bucle"
  "$PY" python/video.py --fps 20 --crf-webm 38 --crf-mp4 30

  paso "imagenes fijas, poster y OG"
  "$PY" python/render.py --frames 95 150 205 --salida tmp/fijas \
        --ancho 1600 --alto 500 --ventana 150 47 --radio 0.8 --smax "$SMAX" \
        --suavizado 1.6 --procesos "$HILOS"
  "$PY" python/render.py --frames 150 --salida tmp/fijas-claro \
        --ancho 1600 --alto 500 --ventana 150 47 --radio 0.8 --smax "$SMAX" \
        --suavizado 1.6 --claro
  "$PY" python/render.py --frames 150 --salida tmp/og --ancho 1200 --alto 630 \
        --ventana 78 41 --radio 0.8 --smax "$SMAX" --suavizado 1.5
  "$PY" python/render.py --frames 150 --salida tmp/poster --ancho 1920 \
        --alto 480 --smax 3.0 --suavizado 1.8 --celda 1.1 --dibujo campo
  "$PY" python/imagenes.py

  paso "datos del visor"
  "$PY" python/exporta.py --cada-frame 4 --submuestreo 4 --smax "$SMAX"
  cp salida/grieta.crack salida/grieta-meta.json web/

  printf '\n'
  ls -lh salida | sed 's/^/  /'
}

case "${1:-todo}" in
  validacion) prepara; validacion ;;
  simulacion) prepara; simulacion ;;
  salidas)    prepara; salidas ;;
  todo)       prepara; validacion; simulacion; salidas ;;
  *) echo "uso: $0 [todo|validacion|simulacion|salidas]" >&2; exit 2 ;;
esac

paso "listo"
