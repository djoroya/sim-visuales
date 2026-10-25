"""Láminas de termobimetal en CalculiX: malla, entrada, ejecución y lectura de resultados.

Una lámina rectangular L × b × s (mm) de dos capas del mismo espesor, empotrada en x = 0. La capa de
abajo (z < s/2) es la de baja dilatación (tipo Invar) y la de arriba la de alta: al calentarse, la
lámina se curva hacia abajo... salvo que se dé la vuelta. Aquí la activa queda ABAJO para que la lámina
se levante (z > 0) al calentarse, que es lo que abre una ventana.

Elementos C3D8I (hexaedros con modos incompatibles: flexión correcta con un elemento por capa en el
espesor). Análisis estático con no linealidad geométrica (NLGEOM): la lámina gira mucho.

Unidades: mm, N, MPa, °C.
"""
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

CCX = os.environ.get("CCX", str(Path(__file__).resolve().parents[3] / ".conda-ccx" / "bin" / "ccx"))


@dataclass
class Bimetal:
    """Un termobimetal equivalente: capas del mismo espesor y módulo, con la diferencia de dilatación
    que da la curvatura específica k del fabricante (k = 3/2 Δα, ecuación [2] del manual de Kanthal)."""
    k: float = 43.0e-6            # 1/K (Kanthal 230, 20–130 °C)
    E: float = 135e3              # MPa
    nu: float = 0.3
    alfa_baja: float = 1.2e-6     # 1/K, capa tipo Invar 36

    @property
    def alfa_alta(self):
        return self.alfa_baja + 2 * self.k / 3


def malla(L, b, s, nx, ny, nz_capa):
    """Nodos y hexaedros de una caja [0,L]×[0,b]×[0,s]; devuelve también qué elementos son de cada capa."""
    nz = 2 * nz_capa
    xs, ys, zs = np.linspace(0, L, nx + 1), np.linspace(0, b, ny + 1), np.linspace(0, s, nz + 1)
    idx = lambda i, j, k: 1 + i + (nx + 1) * (j + (ny + 1) * k)
    nodos = {idx(i, j, k): (x, y, z) for k, z in enumerate(zs) for j, y in enumerate(ys) for i, x in enumerate(xs)}
    elems, capa = {}, {}
    e = 1
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                elems[e] = [idx(i, j, k), idx(i + 1, j, k), idx(i + 1, j + 1, k), idx(i, j + 1, k),
                            idx(i, j, k + 1), idx(i + 1, j, k + 1), idx(i + 1, j + 1, k + 1), idx(i, j + 1, k + 1)]
                capa[e] = "ACTIVA" if k < nz_capa else "PASIVA"
                e += 1
    return nodos, elems, capa


def _lineas(ids, n=16):
    ids = list(ids)
    return "\n".join(", ".join(str(v) for v in ids[i:i + n]) for i in range(0, len(ids), n))


def escribe(trabajo, L, b, s, temps, mat=Bimetal(), nx=40, ny=4, nz_capa=1, presion=None, T0=20.0, inc0=0.1, salida=True,
            imprime="PUNTA"):
    """Entrada de CalculiX. temps: temperaturas uniformes de cada paso (un paso por temperatura).
    presion: MPa sobre la cara de arriba (viento), en un paso final a la última temperatura."""
    nodos, elems, capa = malla(L, b, s, nx, ny, nz_capa)
    empotre = [n for n, (x, _, _) in nodos.items() if x == 0]
    arriba = [e for e, ns in elems.items() if all(nodos[n][2] == s for n in ns[4:])]
    # nodos de la punta en el plano medio (z = s/2)
    pm = [n for n, (x, y, z) in nodos.items() if abs(x - L) < 1e-9 and abs(z - s / 2) < 1e-9]
    medio = [n for n, (x, y, z) in nodos.items() if abs(z - s / 2) < 1e-9]          # superficie media (animación)
    txt = ["*HEADING", f"Termobimetal {L}x{b}x{s} mm", "*NODE"]
    txt += [f"{n}, {x:.9g}, {y:.9g}, {z:.9g}" for n, (x, y, z) in nodos.items()]
    txt += ["*ELEMENT, TYPE=C3D8I, ELSET=TODO"]
    txt += [f"{e}, " + ", ".join(map(str, ns)) for e, ns in elems.items()]
    for nombre in ("ACTIVA", "PASIVA"):
        txt += [f"*ELSET, ELSET={nombre}", _lineas(e for e, c in capa.items() if c == nombre)]
    txt += ["*NSET, NSET=EMPOTRE", _lineas(empotre), "*NSET, NSET=PUNTA", _lineas(pm), "*NSET, NSET=MEDIO", _lineas(medio),
            "*NSET, NSET=NALL", _lineas(nodos)]
    for nombre, alfa in (("ACTIVA", mat.alfa_alta), ("PASIVA", mat.alfa_baja)):
        txt += [f"*MATERIAL, NAME=M{nombre}", "*ELASTIC", f"{mat.E}, {mat.nu}", "*EXPANSION, ZERO=" + f"{T0}", f"{alfa:.6e}",
                f"*SOLID SECTION, ELSET={nombre}, MATERIAL=M{nombre}"]
    txt += ["*BOUNDARY", "EMPOTRE, 1, 3, 0.0", "*INITIAL CONDITIONS, TYPE=TEMPERATURE", f"NALL, {T0}"]
    for T in temps:
        txt += ["*STEP, NLGEOM, INC=1000", "*STATIC", f"{inc0}, 1.0, 1e-9, 0.25", "*TEMPERATURE", f"NALL, {T}"] + _salida(salida, imprime)
    if presion is not None:
        txt += ["*STEP, NLGEOM, INC=1000", "*STATIC", f"{inc0}, 1.0, 1e-9, 0.1", "*DLOAD"]
        txt += [f"{e}, P2, {presion:.6e}" for e in arriba]       # cara 2 del C3D8I = la de arriba (nodos 5-8)
        txt += _salida(salida, imprime)
    Path(trabajo).parent.mkdir(parents=True, exist_ok=True)
    Path(f"{trabajo}.inp").write_text("\n".join(txt) + "\n")
    return nodos, elems


def _salida(fichero, imprime="PUNTA"):
    """Lo que se escribe al final de cada paso (FREQUENCY grande: solo el último incremento)."""
    s = [f"*NODE PRINT, NSET={imprime}, TOTALS=NO, FREQUENCY=100000", "U", "*EL PRINT, ELSET=TODO, FREQUENCY=100000", "S"]
    if fichero:
        s += ["*NODE FILE, FREQUENCY=100000", "U", "*EL FILE, FREQUENCY=100000", "S"]
    return s + ["*END STEP"]


def ejecuta(trabajo):
    d = Path(trabajo).parent
    r = subprocess.run([CCX, "-i", Path(trabajo).name], cwd=d, capture_output=True, text=True,
                       env={**os.environ, "OMP_NUM_THREADS": "4"})
    if "Job finished" not in r.stdout:
        raise RuntimeError(r.stdout[-2000:] + r.stderr[-2000:])
    return lee_dat(f"{trabajo}.dat")


def lee_dat(ruta):
    """Por paso (solo el final de cada uno): desplazamientos de la punta {nodo: (ux,uy,uz)} y tensiones
    {elemento: [(sxx, syy, szz, sxy, sxz, syz) por punto de integración]}."""
    pasos, actual, modo = [], None, None
    for linea in Path(ruta).read_text().splitlines():
        if linea.strip().startswith("displacements"):
            t = float(linea.split()[-1])
            # se escribe en cada incremento: vale el último de cada paso (tiempo total entero)
            if pasos and abs(pasos[-1]["t"] - t) < 1e-9:
                pasos.pop()
            actual = {"U": {}, "S": {}, "t": t}; modo = "U"
            if abs(t - round(t)) < 1e-6:
                pasos.append(actual)
            continue
        if linea.strip().startswith("stresses"):
            modo = "S"; continue
        v = linea.split()
        if not v or actual is None:
            continue
        try:
            nums = [float(x) for x in v]
        except ValueError:
            continue
        if modo == "U" and len(nums) == 4:
            actual["U"][int(nums[0])] = nums[1:]
        elif modo == "S" and len(nums) == 8:
            actual["S"].setdefault(int(nums[0]), []).append(nums[2:])
    return pasos


def arco(L, kappa):
    """Lámina que se curva en un arco de curvatura kappa, empotrada horizontal: punta (x, z)."""
    if abs(kappa) < 1e-15:
        return L, 0.0
    return np.sin(kappa * L) / kappa, (1 - np.cos(kappa * L)) / kappa
