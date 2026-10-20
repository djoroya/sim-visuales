#!/usr/bin/env bash
# Regenera los bucles de la portada, los copia a la web y mide el contraste.
#
#   ./run.sh                 # todos
#   ./run.sh pastoreo        # uno
#
# Con `nice` y 4 procesos como mucho: en esta maquina suele haber
# optimizaciones largas corriendo y no hay que frenarlas.
set -euo pipefail
cd "$(dirname "$0")"
PY=../../.venv/bin/python

sims=("${@:-pastoreo nanohilo}")
for s in ${sims[@]}; do
  echo "== $s"
  nice -n 10 "$PY" "$s.py" --procesos 4
  "$PY" -c "import comun; comun.publica('$s', '$s')"
done

echo "== contraste"
"$PY" contraste.py
