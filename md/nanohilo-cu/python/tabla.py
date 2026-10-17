#!/usr/bin/env python3
"""Tabla de validacion: lo calculado frente a la referencia.

Lee datos/validacion.txt (lo que escriben in.validacion e in.falla) y produce
salida/validacion.md.
"""

from __future__ import annotations

import argparse
from pathlib import Path

# clave -> (nombre, unidad, valor de referencia, fuente)
REFERENCIA = {
    "a0": ("Parametro de red $a_0$", "A", 3.615,
           "Cu fcc a 298 K (exp.); dato de ajuste del potencial"),
    "ecoh": ("Energia cohesiva $E_{coh}$", "eV/atomo", 3.54,
             "exp. (Kittel, *Solid State Physics*)"),
    "C11": ("$C_{11}$", "GPa", 168.4, "Cu monocristalino a 300 K (Simmons y Wang)"),
    "C12": ("$C_{12}$", "GPa", 121.4, "Cu monocristalino a 300 K (Simmons y Wang)"),
    "C44": ("$C_{44}$", "GPa", 75.4, "Cu monocristalino a 300 K (Simmons y Wang)"),
    "E100_de_Cij": ("Modulo de Young $E_{[100]}$ (de los $C_{ij}$)", "GPa", 66.7,
                    "de los $C_{ij}$ experimentales de la misma fuente"),
    "E100_directo": ("Modulo de Young $E_{[100]}$ (traccion directa)", "GPa", 66.7,
                     "de los $C_{ij}$ experimentales de la misma fuente"),
    "gamma_isf": ("Energia de falla de apilamiento $\\gamma_{isf}$", "mJ/m$^2$", 45.0,
                  "exp.; 44,4 mJ/m$^2$ en el articulo de Mishin"),
}
ORDEN = ["a0", "ecoh", "C11", "C12", "C44",
         "E100_de_Cij", "E100_directo", "gamma_isf"]

CABECERA = """# Validacion del potencial

Potencial: **EAM de Cu de Mishin et al.**, `Cu_mishin1.eam.alloy`
(Y. Mishin, M. J. Mehl, D. A. Papaconstantopoulos, A. F. Voter y J. D. Kress,
*Structural stability and lattice defects in copper: ab initio, tight-binding
and embedded-atom calculations*, Phys. Rev. B **63**, 224106, 2001).

Todo se calcula a 0 K con el mismo potencial y la misma instalacion de LAMMPS
que la simulacion del nanohilo (`lammps/in.validacion` y `lammps/in.falla`).

"""

PIE = """
Las cuatro primeras magnitudes forman parte del conjunto al que se ajusto el
potencial, asi que un acuerdo tan bueno **no mide la capacidad predictiva del
potencial**: comprueba que la cadena (potencial, LAMMPS, celdas, deformaciones
y conversion de unidades) esta bien montada. La energia de falla de
apilamiento es mas interesante: gobierna la disociacion de dislocaciones en
parciales de Shockley, que es justo el mecanismo que se ve en la animacion.

Las dos medidas de $E_{[100]}$ se obtienen por caminos distintos --- de las
constantes elasticas y estirando la celda mientras se deja relajar la seccion
a tension transversal nula --- y coinciden en 4 cifras, que es la comprobacion
interna de que la deformacion aplicada y la tension medida son coherentes.
"""


def main() -> int:
    raiz = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--datos", default=str(raiz / "datos" / "validacion.txt"))
    ap.add_argument("--salida", default=str(raiz / "salida" / "validacion.md"))
    args = ap.parse_args()

    valores = {}
    for linea in Path(args.datos).read_text().splitlines():
        partes = linea.split()
        if len(partes) == 2:
            valores[partes[0]] = float(partes[1])

    filas = []
    for clave in ORDEN:
        if clave not in valores:
            continue
        nombre, unidad, ref, fuente = REFERENCIA[clave]
        obt = valores[clave]
        err = 100.0 * (obt - ref) / ref
        filas.append(f"| {nombre} | {unidad} | {obt:.4g} | {ref:g} | {err:+.2f} % | {fuente} |")

    tabla = ("| Magnitud | Unidad | Calculado | Referencia | Error | Fuente de la referencia |\n"
             "|---|---|---:|---:|---:|---|\n" + "\n".join(filas) + "\n")

    destino = Path(args.salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(CABECERA + tabla + PIE)
    print(tabla)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
