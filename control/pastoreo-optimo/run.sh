#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduce el tutorial: escalera de pruebas -> caso grande -> binario del
# visor, poster e informe.
#
#   ./run.sh              todo (el caso grande tarda ~1 h)
#   ./run.sh escalera     solo los peldanos de comprobacion (~5 min)
#   ./run.sh grande       solo el problema de 200 ovejas y 3 perros
#   ./run.sh salidas      binario del visor, poster e informe
#   ./run.sh espectacular rebano irregular y cohesion debil (horas)
#
# Variables utiles: ITER, ITER_ESP, NOVE, NPERRO, TFIN, NFRAMES, KOO, LAMT, LMP.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

ITER=${ITER:-200}
NOVE=${NOVE:-200}
NPERRO=${NPERRO:-3}
TFIN=${TFIN:-400}
NFRAMES=${NFRAMES:-150}
LMP=${LMP:-lmp}

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
  "$PY" -c 'import casadi, numpy, matplotlib' 2>/dev/null || {
    paso "instalando casadi, numpy y matplotlib"
    "$VENV/bin/pip" install -q casadi numpy matplotlib
  }
  export MPLCONFIGDIR="$PWD/tmp/.mpl"
}

escalera() {
  paso "0. convergencia del integrador"
  "$PY" python/escalera.py integrador

  if command -v "$LMP" >/dev/null 2>&1; then
    paso "0b. contraste con la version en LAMMPS"
    "$PY" python/escalera.py lammps --lmp "$LMP"
  else
    echo "  (sin $LMP en el PATH: me salto el contraste con LAMMPS)"
  fi

  paso "1. gradiente por AD frente a diferencias finitas"
  "$PY" python/escalera.py gradiente

  paso "2. un perro y una oveja"
  "$PY" python/escalera.py pareja

  paso "3. veinte ovejas y un perro"
  "$PY" python/escalera.py veinte
}

grande() {
  paso "4. $NOVE ovejas y $NPERRO perros (esto tarda)"
  "$PY" python/experimento.py --n-o "$NOVE" --n-p "$NPERRO" --T "$TFIN" \
        --iter "$ITER"
}

# Segunda parte: el mismo problema con un rebano que no es un disco, cohesion
# debil (el rebano se deja deformar) y los perros repartidos, uno dentro del
# propio rebano. El peso lam_t mantiene al grupo compacto durante todo el
# trayecto, no solo al final.
espectacular() {
  paso "rebano irregular, cohesion debil, perros repartidos (horas)"
  "$PY" python/experimento.py --n-o "$NOVE" --n-p "$NPERRO" --T "$TFIN" \
        --escenario irregular --k-oo "${KOO:-0.3}" --lam-t "${LAMT:-0.3}" \
        --iter "${ITER_ESP:-300}" --etiqueta espectacular

  paso "binario, poster y pagina del caso espectacular"
  "$PY" python/exporta.py --entrada tmp/espectacular.npz \
        --resumen salida/escalera-espectacular.json --n "$NFRAMES" \
        --salida salida/pastoreo-espectacular.herd2 \
        --meta salida/pastoreo-espectacular-meta.json
  "$PY" python/poster.py --herd salida/pastoreo-espectacular.herd2 \
        --meta salida/pastoreo-espectacular-meta.json \
        --salida salida/pastoreo-espectacular-poster.png --avance 0.3
  cp salida/pastoreo-espectacular.herd2 salida/pastoreo-espectacular-meta.json \
     salida/pastoreo-espectacular-poster.png web/
}

salidas() {
  paso "binario para el visor"
  "$PY" python/exporta.py --n "$NFRAMES"

  paso "poster"
  "$PY" python/poster.py --avance 0.45

  paso "informe de la escalera"
  "$PY" python/informe.py

  paso "copia a la demo web"
  cp salida/pastoreo-optimo.herd2 salida/pastoreo-optimo-meta.json web/
  cp salida/pastoreo-optimo-poster.png web/

  printf '\n'
  ls -lh salida web | sed 's/^/  /'
}

case "${1:-todo}" in
  escalera) prepara; escalera ;;
  espectacular) prepara; espectacular ;;
  grande)   prepara; grande ;;
  salidas)  prepara; salidas ;;
  todo)     prepara; escalera; grande; salidas ;;
  *) echo "uso: $0 [todo|escalera|grande|espectacular|salidas]" >&2; exit 2 ;;
esac

paso "listo"
