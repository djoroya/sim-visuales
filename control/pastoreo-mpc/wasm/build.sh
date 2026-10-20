#!/usr/bin/env bash
# Compila el coste generado por CasADi a WebAssembly (y a una librería nativa para Python).
#   ./wasm/build.sh        (necesita emsdk en ~/emsdk y el venv de sim-visuales)
set -euo pipefail
cd "$(dirname "$0")"
PY=../../../.venv/bin/python
$PY ../python/genera_c.py
gcc -O3 -ffast-math -fPIC -shared mpc_coste.c -o libmpc.so -lm
source ~/emsdk/emsdk_env.sh > /dev/null 2>&1
emcc -O3 -ffast-math mpc_coste.c envoltorio.c -o ../web/mpc.js \
  -s MODULARIZE=1 -s EXPORT_ES6=1 -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker,node \
  -s "EXPORTED_FUNCTIONS=['_mpc_init','_mpc_eval','_malloc','_free']" \
  -s "EXPORTED_RUNTIME_METHODS=['HEAPF64']"
ls -la libmpc.so ../web/mpc.wasm
