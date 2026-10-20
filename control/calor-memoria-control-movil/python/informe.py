#!/usr/bin/env python3
"""Junta los JSON de salida/ en salida/escalera.md."""

from __future__ import annotations

import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "salida"


def lee(nombre):
    f = SALIDA / nombre
    return json.loads(f.read_text()) if f.exists() else None


def e(x, d=2):
    return f"{x:.{d}e}"


def pc(x, d=1):
    return f"{100 * x:.{d}f} %".replace(".", ",")


def main():
    L = ["# La escalera de pruebas", "",
         "Generado por `python/informe.py` a partir de los JSON de `salida/`. "
         "Cada peldaño comprueba una cosa.", ""]

    c = lee("escalera-consistencia.json")
    if c:
        L += ["## 0. La base de senos es el laplaciano de 5 puntos, y CasADi es numpy", "",
              f"Malla {c['n']}×{c['n']}, {c['N']} pasos, control aleatorio y partícula moviéndose "
              "(fuerza aleatoria). Diferencia máxima en todo el recorrido:", "",
              "| comparación | y | z |", "|---|---:|---:|",
              f"| base de senos frente a matriz de 5 puntos + `splu` | {e(c['senos_vs_matriz_y'])} | {e(c['senos_vs_matriz_z'])} |",
              f"| CasADi (`mapaccum`) frente a numpy | {e(c['casadi_vs_numpy_y'])} | {e(c['casadi_vs_numpy_z'])} |",
              "", f"con `max |y|` = {c['max_y']:.2f}: coinciden a precisión de máquina.", ""]

    a = lee("escalera-analitico.json")
    if a:
        modos = " + ".join(f"{m[2]:g}·sin({m[0]}πx)sin({m[1]}πy)" for m in a["modos"])
        L += ["## 1. Integrador frente a la solución exacta de modos de Fourier", "",
              f"Sin control, dato inicial `y₀ = {modos}`, `z₀ = 0`, T = {a['T']:g}, "
              f"ν = {a['nu']:g}. Cada modo es un sistema 2×2 lineal con solución exacta "
              "(exponencial de la matriz). Error en norma L² discreta en t = T.", "",
              "**Espacio** (semidiscreta exacta en el tiempo frente a la continua):", "",
              "| n | h | sin memoria: err y | orden | con memoria: err y | err z | orden |",
              "|---:|---:|---:|---:|---:|---:|---:|"]
        for s, m in zip(a["sin_memoria"]["espacio"], a["con_memoria"]["espacio"]):
            L.append(f"| {s['n']} | {s['h']:.4f} | {e(s['err_y'])} | {s.get('orden_y', float('nan')):.2f} "
                     f"| {e(m['err_y'])} | {e(m['err_z'])} | {m.get('orden_y', float('nan')):.2f} |")
        L += ["", "**Tiempo** (Euler implícito frente a la semidiscreta exacta, n = 40):", "",
              "| pasos | dt | sin memoria: err y | orden | con memoria: err y | err z | orden |",
              "|---:|---:|---:|---:|---:|---:|---:|"]
        for s, m in zip(a["sin_memoria"]["tiempo"], a["con_memoria"]["tiempo"]):
            L.append(f"| {s['N']} | {s['dt']:.4f} | {e(s['err_y'])} | {s.get('orden_y', float('nan')):.2f} "
                     f"| {e(m['err_y'])} | {e(m['err_z'])} | {m.get('orden_y', float('nan')):.2f} |")
        pm = a["con_memoria"]["produccion"]
        L += ["", f"Órdenes 2 en espacio y 1 en tiempo, los teóricos. En la malla de producción "
              f"(40×40, 100 pasos) el error relativo total con memoria es {pc(pm['err_y_rel'], 2)} en y "
              f"y {pc(pm['err_z_rel'], 2)} en z, dominado por el paso de tiempo.", ""]

    g = lee("escalera-gradiente.json")
    if g:
        L += ["## 2. Gradiente por diferenciación automática frente a diferencias finitas", "",
              "Malla 12×12, 16 pasos, controles aleatorios. Componentes al azar (y, en el caso móvil, "
              "varias de la fuerza sobre la partícula), diferencias centradas.", "",
              "| paso | (b) err. rel. por componente | (c) err. rel. por componente |",
              "|---:|---:|---:|"]
        for fb, fc in zip(g["b"]["tabla"], g["c"]["tabla"]):
            L.append(f"| {fb['eps']:.0e} | {e(fb['err_rel_componente'])} | {e(fc['err_rel_componente'])} |")
        L += ["", f"Derivada direccional en una dirección aleatoria: error relativo "
              f"{e(g['b']['direccional_err_rel'])} en (b) y {e(g['c']['direccional_err_rel'])} en (c). "
              "Lo que queda es el error de truncamiento y redondeo de las diferencias finitas.", ""]

    o = lee("escalera-optimalidad.json")
    if o:
        L += ["## 3. IPOPT encuentra el mínimo (casos cuadráticos)", "",
              f"Con el soporte fijo el coste es cuadrático en f, y el mínimo exacto se puede calcular "
              f"aparte: gradiente conjugado sobre las ecuaciones normales `H f = −g₀`, con `H v` sacado "
              f"del propio gradiente. Malla {o['n']}×{o['n']}, {o['N']} pasos.", "",
              "| caso | J (gradiente conjugado) | J (IPOPT) | dif. rel. en J | dif. rel. en f | iter. CG | iter. IPOPT |",
              "|---|---:|---:|---:|---:|---:|---:|"]
        for k in ("a", "b"):
            r = o[k]
            L.append(f"| ({k}) | {r['J_cg']:.8e} | {r['J_ipopt']:.8e} | {e(r['dif_rel_J'], 1)} "
                     f"| {e(r['dif_rel_U'], 1)} | {r['iter_cg']} | {r['ipopt_iteraciones']} |")
        L += ["", "En (b), además, esto descarta que el residuo de memoria sea culpa del optimizador: "
              "es el mínimo de verdad.", ""]

    casos = {}
    for k in "abc":
        r = lee(f"casos-final-{k}.json")
        if r:
            casos[k] = r[k]
    rep = lee("casos-reposo.json")
    if casos:
        L += ["## 4. Los tres casos (malla de producción)", "",
              "`|y(T)|/|y₀|`: temperatura final relativa a la inicial. `|z(T)|/|z_libre(T)|`: memoria "
              "final relativa a la del sistema con memoria sin control.", "",
              "| caso | n | pasos | `|y(T)|/|y₀|` | (sin control) | `|z(T)|/|z_libre|` | esfuerzo `∫∫f²` | iter. | s | estado |",
              "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"]
        filas = [(k, casos[k]) for k in casos]
        if rep:
            filas.append(("c desde reposo", rep["c"]))
        for k, r in filas:
            L.append(f"| ({k}) {r['nombre']} | {r['n']} | {r['N']} | {e(r['yT_rel'])} | {e(r['yT_rel_libre'])} "
                     f"| {e(r['zT_rel'])} | {r['esfuerzo_f']:.3f} | {r['iteraciones']} | {r['segundos']:.0f} | {r['estado']} |")
        L += ["", "En (a) la memoria no cuenta (no hay memoria que apagar); la columna de z se deja "
              "como dato, no como objetivo.", ""]

    ref = sorted(SALIDA.glob("escalera-refina-*.json"))
    if ref:
        L += ["## 5. (b) frente a (c) al refinar", "",
              "El resultado cualitativo —con soporte fijo queda memoria, con soporte móvil no— "
              "no puede depender de la malla, del paso ni del peso del esfuerzo.", "",
              "| n | pasos | β | (b) `|y(T)|/|y₀|` | (b) `|z(T)|/|z_libre|` | (b) esfuerzo | (c) `|y(T)|/|y₀|` | (c) `|z(T)|/|z_libre|` | (c) esfuerzo | (b)/(c) en z |",
              "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
        filas = []
        for f in ref:
            r = json.loads(f.read_text())
            if "b" in r and "c" in r:
                filas.append(r)
        for k in ("b", "c"):
            if k in casos:
                pass
        if "b" in casos and "c" in casos:
            filas.append({"b": casos["b"], "c": casos["c"]})
        filas.sort(key=lambda r: (r["b"]["beta"], r["b"]["N"], r["b"]["n"]))
        for r in filas:
            b, c_ = r["b"], r["c"]
            L.append(f"| {b['n']} | {b['N']} | {b['beta']:g} | {e(b['yT_rel'])} | {e(b['zT_rel'])} | {b['esfuerzo_f']:.3f} "
                     f"| {e(c_['yT_rel'])} | {e(c_['zT_rel'])} | {c_['esfuerzo_f']:.3f} | {b['zT_rel'] / c_['zT_rel']:.0f}× |")
        L.append("")

    (SALIDA / "escalera.md").write_text("\n".join(L) + "\n")
    print(f"-> salida/escalera.md ({len(L)} líneas)")


if __name__ == "__main__":
    main()
