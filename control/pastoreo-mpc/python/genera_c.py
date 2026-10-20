"""Genera el C del coste del MPC (y su gradiente) a partir de modelo_mpc.py.

    python python/genera_c.py      ->  wasm/mpc_coste.c, wasm/mpc_coste.h
"""
from pathlib import Path
import os
import modelo_mpc as mm

RAIZ = Path(__file__).resolve().parents[1]
os.chdir(RAIZ / "wasm")
f, n = mm.construir()
f.generate("mpc_coste.c", {"with_header": True})
print(f"wasm/mpc_coste.c: {n} parámetros, {mm.NU} incógnitas")
