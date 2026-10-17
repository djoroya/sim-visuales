#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Reproduce el ejemplo de pastoreo: tablas -> simulaciones -> comprobaciones
# -> binario del visor y poster.
#
#   ./run.sh              todo
#   ./run.sh simulacion   solo los ensayos de LAMMPS
#   ./run.sh salidas      comprobaciones, binario y poster
#
# Variables utiles: NOVE, TFIN, FM, RPOS, NFRAMES, LMP.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

NOVE=${NOVE:-30}
TFIN=${TFIN:-900}
FM=${FM:-5.0}
RPOS=${RPOS:-45.0}
NFRAMES=${NFRAMES:-300}
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
    "$VENV/bin/pip" install -q numpy matplotlib
  fi
  export MPLCONFIGDIR="$PWD/tmp/.mpl"
}

tablas() {
  paso "tabla de la fuerza oveja-oveja"
  "$PY" python/tabla.py --escala 1.0 --r0 2.0
  cat > datos/nula.table <<'TAB'
# interaccion nula: el perro no siente la reaccion del rebano (TFM, ec. 5.10)

NULA
N 2 R 0.5 1.0

1 0.5 0.0 0.0
2 1.0 0.0 0.0
TAB
}

simulacion() {
  paso "un perro y una oveja (modelo de Escobedo et al., 2016)"
  $LMP -in lammps/in.pareja -var kappa 0 -var sal datos/pareja_k0 \
       -log datos/log.pareja_k0 -screen none

  paso "fuerza entre dos individuos, para comprobarla"
  $LMP -in lammps/in.fuerzas -var par oo -var sal datos/fuerza_oo.txt \
       -var Fm "$FM" -log tmp/log.foo -screen none
  $LMP -in lammps/in.fuerzas -var par op -var sal datos/fuerza_op.txt \
       -var Fm "$FM" -log tmp/log.fop -screen none

  paso "pastoreo: un perro y $NOVE ovejas (unos segundos)"
  $LMP -in lammps/in.pastoreo -var nove "$NOVE" -var tfin "$TFIN" \
       -var Fm "$FM" -var rpos "$RPOS" -var sal datos/pastoreo \
       -log datos/log.pastoreo -screen none
}

salidas() {
  paso "comprobaciones"
  "$PY" python/verifica.py --fm "$FM"

  paso "binario para el visor"
  "$PY" python/exporta.py --n "$NFRAMES"

  paso "poster de respaldo"
  "$PY" python/poster.py --avance 0.33 --estela 45

  paso "copia a la demo web"
  cp salida/pastoreo.herd salida/pastoreo-meta.json salida/pastoreo-poster.png web/

  printf '\n'
  ls -lh salida web | sed 's/^/  /'
}

case "${1:-todo}" in
  tablas)     prepara; tablas ;;
  simulacion) prepara; tablas; simulacion ;;
  salidas)    prepara; salidas ;;
  todo)       prepara; tablas; simulacion; salidas ;;
  *) echo "uso: $0 [todo|tablas|simulacion|salidas]" >&2; exit 2 ;;
esac

paso "listo"
