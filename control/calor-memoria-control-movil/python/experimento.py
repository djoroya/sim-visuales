#!/usr/bin/env python3
"""Resuelve los casos (a), (b), (c) y guarda trayectorias y metricas.

    python/experimento.py [--n 40] [--N 100] [--casos abc] [--iter 600]
                          [--etiqueta final] [--beta 1e-3] [--guia lazo|reposo]

Salidas: tmp/<etiqueta>-<caso>.npz (trayectorias) y
salida/casos-<etiqueta>.json (metricas).
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from modelo import Params, norma, simula_np
from ocp import CASOS, Pesos, Problema, guia_lazo

RAIZ = Path(__file__).resolve().parents[1]
SALIDA, TMP = RAIZ / "salida", RAIZ / "tmp"


def z_libre(p: Params) -> float:
    """|z(T)| del sistema con memoria sin control: la referencia de la memoria."""
    _, zs, _ = simula_np(p)
    return norma(zs[-1], p)


def corre(p: Params, caso: str, pesos: Pesos = Pesos(), iters: int = 600,
          guia: str = "lazo", imprime: int = 0, guarda: Path | None = None,
          U0=None) -> dict:
    zr = z_libre(p)
    pr = Problema(p, caso, pesos, z_ref=zr)
    if U0 is None:
        U0 = pr.U_inicial(guia_lazo(pr.p) if (pr.movil and guia == "lazo") else None)
    U, info = pr.resuelve(U0, max_iter=iters, imprime=imprime)
    y, z, d, F, g = pr.trayectoria(U)
    q = pr.p
    ys_l, zs_l, _ = simula_np(q)                      # mismo caso sin control
    res = {
        "caso": caso, "nombre": CASOS[caso]["nombre"],
        "n": q.n, "N": q.N, "T": q.T, "nu": q.nu, "mu": q.mu, "lado": q.lado,
        "beta": pesos.beta, "gamma": pesos.gamma, "guia": guia if pr.movil else None,
        "y0": norma(y[0], q),
        "yT_rel": norma(y[-1], q) / norma(y[0], q),
        "zT_rel": norma(z[-1], q) / zr,
        "yT_rel_libre": norma(ys_l[-1], q) / norma(y[0], q),
        "zT_rel_libre": norma(zs_l[-1], q) / zr,
        "z_ref": zr,
        "esfuerzo_f": float(q.dt * q.h**2 * np.sum(F**2)),
        "max_f": float(np.abs(F).max()),
        "construir_s": pr.t_construir,
        **{f"J_{k}": v for k, v in pr.desglose(U).items()},
        **info,
    }
    if guarda is not None:
        guarda.parent.mkdir(exist_ok=True, parents=True)
        np.savez_compressed(guarda, y=y.astype(np.float32), z=z.astype(np.float32),
                            d=d, F=F.astype(np.float32),
                            g=np.zeros((0, 2)) if g is None else g, U=U,
                            res=json.dumps(res))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--N", type=int, default=100)
    ap.add_argument("--casos", default="abc")
    ap.add_argument("--iter", type=int, default=600)
    ap.add_argument("--beta", type=float, default=Pesos().beta)
    ap.add_argument("--guia", default="lazo")
    ap.add_argument("--etiqueta", default="final")
    ap.add_argument("--imprime", type=int, default=5)
    a = ap.parse_args()
    p = Params(n=a.n, N=a.N)
    pesos = Pesos(beta=a.beta)
    todos = {}
    for caso in a.casos:
        print(f"\n== caso {caso}: {CASOS[caso]['nombre']}  (n={a.n}, N={a.N})", flush=True)
        t0 = time.perf_counter()
        r = corre(p, caso, pesos, a.iter, a.guia, a.imprime,
                  TMP / f"{a.etiqueta}-{caso}.npz")
        r["total_s"] = time.perf_counter() - t0
        todos[caso] = r
        print({k: r[k] for k in ("yT_rel", "zT_rel", "esfuerzo_f", "iteraciones",
                                 "estado", "segundos")}, flush=True)
        SALIDA.mkdir(exist_ok=True)
        f = SALIDA / f"casos-{a.etiqueta}.json"
        previo = json.loads(f.read_text()) if f.exists() else {}
        previo.update(todos)
        f.write_text(json.dumps(previo, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
