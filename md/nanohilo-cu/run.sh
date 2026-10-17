#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduce todo el trabajo: validacion -> simulacion -> grafica -> video.
#
#   ./run.sh              todo
#   ./run.sh validacion   solo la validacion del potencial
#   ./run.sh simulacion   solo el ensayo de traccion
#   ./run.sh render       solo fotogramas, video, poster y grafica
#
# Variables utiles:  HILOS (threads de OpenMP), NSEC/NLONG (tamano del hilo),
# RMELLA (radio de la mella en A), FPS.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

HILOS=${HILOS:-10}
NSEC=${NSEC:-16}
NLONG=${NLONG:-45}
RMELLA=${RMELLA:-12.0}
EPSMAX=${EPSMAX:-0.60}
FPS=${FPS:-30}
LMP=${LMP:-lmp}
POT=${POT:-/usr/share/lammps/potentials/Cu_mishin1.eam.alloy}

RAIZ=$(cd ../.. && pwd)
VENV="$RAIZ/.venv"
PY="$VENV/bin/python"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

prepara() {
  mkdir -p datos/frames datos/render salida tmp
  if [ ! -x "$PY" ]; then
    paso "entorno de Python"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --upgrade pip
    "$VENV/bin/pip" install -q numpy matplotlib
  fi
  export MPLCONFIGDIR="$PWD/datos/.mpl"
}

validacion() {
  paso "validacion del potencial (a0, E_coh, C_ij, E[100])"
  $LMP -in lammps/in.validacion -var pot "$POT" -log datos/log.validacion -screen none
  paso "energia de falla de apilamiento"
  $LMP -in lammps/in.falla -var pot "$POT" -log datos/log.falla -screen none
  "$PY" python/tabla.py
}

simulacion() {
  paso "ensayo de traccion del nanohilo (unos minutos)"
  rm -f datos/frames/*.lammpstrj datos/curva.txt
  $LMP -sf omp -pk omp "$HILOS" -in lammps/in.nanohilo \
       -var pot "$POT" -var nsec "$NSEC" -var nlong "$NLONG" \
       -var rmella "$RMELLA" -var epsmax "$EPSMAX" \
       -log datos/log.nanohilo -screen none
}

render() {
  paso "curva tension-deformacion"
  "$PY" python/curva.py

  paso "fotogramas"
  "$PY" python/render.py --procesos "$HILOS"

  paso "video y poster"
  local n dur
  n=$(find datos/render -name 'f*.png' | wc -l)
  dur=$(awk -v n="$n" -v f="$FPS" 'BEGIN{printf "%.3f", n/f}')
  # fundido a blanco al principio y al final: el bucle cierra sin salto
  local filtro="fade=t=in:st=0:d=0.30:c=white,fade=t=out:st=$(awk -v d="$dur" 'BEGIN{printf "%.3f", d-0.60}'):d=0.60:c=white"

  ffmpeg -y -loglevel error -framerate "$FPS" -i datos/render/f%04d.png \
    -vf "$filtro" -c:v libvpx-vp9 -crf 40 -b:v 0 -row-mt 1 -deadline good \
    -cpu-used 1 -pix_fmt yuv420p -an salida/nanohilo-cu.webm
  ffmpeg -y -loglevel error -framerate "$FPS" -i datos/render/f%04d.png \
    -vf "$filtro" -c:v libx264 -preset veryslow -crf 30 -profile:v high \
    -pix_fmt yuv420p -movflags +faststart -an salida/nanohilo-cu.mp4

  cp "datos/render/f$(printf '%04d' "$(cat datos/render/mejor.txt)").png" \
     salida/nanohilo-cu-poster.png

  printf '\n'
  ls -lh salida | sed 's/^/  /'
}

case "${1:-todo}" in
  validacion) prepara; validacion ;;
  simulacion) prepara; simulacion ;;
  render)     prepara; render ;;
  todo)       prepara; validacion; simulacion; render ;;
  *) echo "uso: $0 [todo|validacion|simulacion|render]" >&2; exit 2 ;;
esac

paso "listo"
