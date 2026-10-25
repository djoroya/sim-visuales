"""Datos para las animaciones de la sección del modelo → tmp/anim-modelo.json

    python python/modelo_anim.py

La línea central de la hoja (150 × 50 × 0,2 mm, fila del medio de la superficie de unión) de 0 a 30 K
con tres modelos de CalculiX:
- C3D8I con no linealidad geométrica (el del estudio),
- C3D8 (hexaedros lineales sin modos incompatibles), uno por capa: se bloquea en flexión,
- C3D8I lineal (sin NLGEOM): la punta sube en vertical y la hoja se alarga.
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import fem  # noqa: E402

L, B, S, NX, NY = 150.0, 50.0, 0.2, 75, 24
dTs = [2.5 * i for i in range(1, 13)]
CASOS = {"C3D8I": dict(elemento="C3D8I", nlgeom=True), "C3D8": dict(elemento="C3D8", nlgeom=True),
         "lineal": dict(elemento="C3D8I", nlgeom=False)}


def corre(nombre):
    t = time.time()
    job = f"tmp/modelo_{nombre}"
    nodos, _ = fem.escribe(job, L, B, S, [20 + d for d in dTs], nx=NX, ny=NY, nz_capa=1, imprime="MEDIO", salida=False, **CASOS[nombre])
    pasos = fem.ejecuta(job)
    fila = sorted([n for n in pasos[0]["U"] if abs(nodos[n][1] - B / 2) < 1e-6], key=lambda n: nodos[n][0])
    lineas = [[[nodos[n][0], 0.0] for n in fila]]
    for p in pasos:
        lineas.append([[round(nodos[n][0] + p["U"][n][0], 3), round(p["U"][n][2], 3)] for n in fila])
    print(f"{nombre}: {len(pasos)} pasos en {time.time() - t:.0f} s; punta a 30 K: x {lineas[-1][-1][0]:.1f}, z {lineas[-1][-1][1]:.1f} mm")
    return nombre, lineas


with ThreadPoolExecutor(3) as ex:
    res = dict(ex.map(corre, CASOS))
k = fem.Bimetal().k
Path("tmp/anim-modelo.json").write_text(json.dumps({"L": L, "s": S, "k": k, "dT": [0] + dTs, "lineas": res}))
print("tmp/anim-modelo.json")
