#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Calor con memoria y control movil: escalera de pruebas -> casos (a), (b), (c)
# -> videos, poster, figura e informe.
#
#   ./run.sh              todo (~1 h en 4 nucleos)
#   ./run.sh escalera     peldanos rapidos: consistencia, analitico, gradiente,
#                         optimalidad (~5 min)
#   ./run.sh casos        los tres casos en la malla de produccion (~15 min)
#   ./run.sh refina       (b) y (c) con otra malla, otro paso y otro beta (~1 h)
#   ./run.sh salidas      videos, poster, figura e informe
#
# Variables: N_MALLA (40), N_PASOS (100), ITER (3000), NUCLEOS (4).
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

N_MALLA=${N_MALLA:-40}
N_PASOS=${N_PASOS:-100}
ITER=${ITER:-3000}
NUCLEOS=${NUCLEOS:-4}

RAIZ=$(cd ../.. && pwd)
VENV="$RAIZ/.venv"
PY="$VENV/bin/python"

paso() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

prepara() {
  mkdir -p salida tmp
  if [ ! -x "$PY" ]; then
    paso "entorno de Python"
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install -q --upgrade pip
  fi
  "$PY" -c 'import casadi, numpy, scipy, matplotlib' 2>/dev/null || {
    paso "instalando casadi, numpy, scipy y matplotlib"
    "$VENV/bin/pip" install -q casadi numpy scipy matplotlib
  }
  export MPLCONFIGDIR="$PWD/tmp/.mpl"
  # un hilo por proceso: los casos se reparten entre nucleos, no dentro de uno
  export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
}

# Lanza "$@" en segundo plano sin pasar de $NUCLEOS procesos a la vez.
en_paralelo() {
  while [ "$(jobs -rp | wc -l)" -ge "$NUCLEOS" ]; do wait -n; done
  nice "$@" &
}

escalera() {
  paso "consistencia: base de senos = matriz de 5 puntos; CasADi = numpy"
  "$PY" python/escalera.py consistencia
  paso "integrador frente a la solucion exacta de modos de Fourier"
  "$PY" python/escalera.py analitico
  paso "gradiente por AD frente a diferencias finitas"
  "$PY" python/escalera.py gradiente
  paso "optimalidad: IPOPT frente a gradiente conjugado (a, b)"
  "$PY" python/escalera.py optimalidad
}

casos() {
  paso "casos (a), (b), (c) en ${N_MALLA}x${N_MALLA}, ${N_PASOS} pasos"
  for c in a b c; do
    en_paralelo "$PY" python/experimento.py --casos "$c" --n "$N_MALLA" \
      --N "$N_PASOS" --iter "$ITER" --etiqueta "final-$c" --imprime 0
  done
  # (c) desde el reposo en vez de desde la trayectoria guia
  en_paralelo "$PY" python/experimento.py --casos c --n "$N_MALLA" --N "$N_PASOS" \
    --iter "$ITER" --guia reposo --etiqueta reposo --imprime 0
  wait
  for c in a b c; do mv -f "tmp/final-$c-$c.npz" "tmp/final-$c.npz"; done
}

refina() {
  paso "(b) frente a (c) al refinar malla, paso y beta"
  for n in 20 30 50 60; do
    en_paralelo "$PY" python/escalera.py refina --n "$n" --N 100 --iter "$ITER"
  done
  for N in 50 200; do
    en_paralelo "$PY" python/escalera.py refina --n 40 --N "$N" --iter "$ITER"
  done
  for b in 1e-3 1e-5; do
    en_paralelo "$PY" python/escalera.py refina --n 40 --N 100 --beta "$b" --iter "$ITER"
  done
  wait
}

salidas() {
  paso "videos 2400x800 y 1200x400 (WebM VP9 + MP4 H.264)"
  "$PY" python/render.py video
  paso "poster"
  "$PY" python/render.py poster
  paso "figura (b) frente a (c)"
  "$PY" python/render.py figura
  paso "informe de la escalera"
  "$PY" python/informe.py
  ls -lh salida | sed 's/^/  /'
}

case "${1:-todo}" in
  escalera) prepara; escalera ;;
  casos)    prepara; casos ;;
  refina)   prepara; refina ;;
  salidas)  prepara; salidas ;;
  todo)     prepara; escalera; casos; refina; salidas ;;
  *) echo "uso: $0 [todo|escalera|casos|refina|salidas]" >&2; exit 2 ;;
esac

paso "listo"
