#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduce todo: validacion -> simulacion -> curva, binario del visor y
# poster. La animacion no se renderiza a video: la dibuja el visor web a
# partir del binario .nw (ver ../../visor).
#
#   ./run.sh              todo
#   ./run.sh validacion   solo la validacion del potencial
#   ./run.sh simulacion   solo el ensayo de traccion
#   ./run.sh salidas      solo curva, binario y poster (reusa los volcados)
#
# Variables utiles: HILOS, NSEC, NLONG, EPSMAX, NFRAMES, LMP, POT.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

HILOS=${HILOS:-4}
NSEC=${NSEC:-8}
NLONG=${NLONG:-20}
EPSMAX=${EPSMAX:-1.2}
NFRAMES=${NFRAMES:-80}
LMP=${LMP:-lmp}
POT=${POT:-/usr/share/lammps/potentials/Cu_mishin1.eam.alloy}

RAIZ=$(cd ../.. && pwd)
VENV="$RAIZ/.venv"
PY="$VENV/bin/python"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

prepara() {
  mkdir -p datos/frames salida
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
       -var pot "$POT" -var nsec "$NSEC" -var nlong "$NLONG" -var epsmax "$EPSMAX" \
       -log datos/log.nanohilo -screen none
}

salidas() {
  paso "curva tension-deformacion"
  "$PY" python/curva.py

  paso "binario para el visor"
  "$PY" python/exporta.py --n "$NFRAMES"

  paso "poster de respaldo"
  "$PY" python/render.py --poster salida/nanohilo-cu-poster.png

  paso "vista previa de la animacion (tmp/vista-previa.png)"
  "$PY" python/vista_previa.py --filas 8

  paso "comprobaciones del visor"
  ( cd ../../visor && npm test )

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
