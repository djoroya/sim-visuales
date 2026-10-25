"""Datos de la animación: la hoja de CalculiX grado a grado → tmp/anim-hoja.json

    python python/animacion.py [espesor_mm]

La superficie media de la malla real (75 × 24 elementos) y su desplazamiento al final de cada paso, de
0 a 30 K por encima de la temperatura de cierre, de grado en grado. La escena (anim/escena.html) lo
dibuja con la malla y lo reutiliza para las hojas del tejado.
"""
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import fem  # noqa: E402

L, B = 150.0, 50.0
S = float(sys.argv[1]) if len(sys.argv) > 1 else 0.2
NX, NY = 75, 24
T0 = 20.0
dTs = list(range(1, 31))

t = time.time()
nodos, _ = fem.escribe(f"tmp/anim_{S}", L, B, S, [T0 + d for d in dTs], nx=NX, ny=NY, nz_capa=1, imprime="MEDIO", salida=False)
pasos = fem.ejecuta(f"tmp/anim_{S}")
print(f"CalculiX: {len(pasos)} pasos en {time.time() - t:.0f} s")
# superficie media en orden de rejilla (i a lo largo, j a lo ancho)
ids = sorted(pasos[0]["U"], key=lambda n: (round(nodos[n][1], 6), round(nodos[n][0], 6)))
assert len(ids) == (NX + 1) * (NY + 1)
xy = [[round(nodos[n][0], 3), round(nodos[n][1], 3)] for n in ids]
U = [[0.0] * (3 * len(ids))] + [[round(v, 3) for n in ids for v in p["U"][n]] for p in pasos]
punta = [0.0] + [float(np.mean([p["U"][n][2] for n in ids if abs(nodos[n][0] - L) < 1e-9])) for p in pasos]
Path("tmp/anim-hoja.json").write_text(json.dumps({"L": L, "b": B, "s": S, "nx": NX, "ny": NY, "dT": [0] + dTs, "xy": xy, "U": U, "punta": punta}))
print("tmp/anim-hoja.json", ", ".join(f"{d} K: {z:.1f} mm" for d, z in zip([0] + dTs, punta) if d % 5 == 0))
