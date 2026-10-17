#!/usr/bin/env python3
"""El caso grande: 200 ovejas, 3 perros, heuristica contra optimo.

Resuelve el problema completo arrancando en caliente desde la heuristica y
guarda las dos trayectorias (la de la heuristica y la optima) para el visor,
junto con los tiempos, el desglose del coste y las metricas de convergencia.

    python/experimento.py --iter 200
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from escalera import SALIDA, TMP, compara, guarda, titulo, _imprime_comparacion
from modelo import Params, estado_inicial, medidas_np
from ocp import Malla, Pesos
from politica import Heuristica


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-o", type=int, default=200)
    ap.add_argument("--n-p", type=int, default=3)
    ap.add_argument("--T", type=float, default=400.0)
    ap.add_argument("--n", type=int, default=160)
    ap.add_argument("--m", type=int, default=10)
    ap.add_argument("--iter", type=int, default=200)
    ap.add_argument("--a-max", type=float, default=25.0)
    ap.add_argument("--lam", type=float, default=0.2)
    ap.add_argument("--bet", type=float, default=0.2)
    ap.add_argument("--gam", type=float, default=0.5)
    ap.add_argument("--lam-t", type=float, default=0.0,
                    help="peso de la dispersion durante el horizonte, no solo "
                         "al final")
    ap.add_argument("--r-pos", type=float, default=None,
                    help="distancia perro-rebano de la heuristica (por defecto, "
                         "radio del rebano + 25)")
    ap.add_argument("--semilla", type=int, default=90210)
    ap.add_argument("--etiqueta", default="grande")
    ap.add_argument("--imprime", type=int, default=5)
    ap.add_argument("--arranque", choices=("caliente", "frio"), default="caliente")
    args = ap.parse_args()

    titulo(f"4. {args.n_o} ovejas y {args.n_p} perros")
    p = Params(n_o=args.n_o, n_p=args.n_p)
    ma = Malla(T=args.T, n=args.n, m=args.m)
    pesos = Pesos(lam=args.lam, bet=args.bet, gam=args.gam, lam_t=args.lam_t)
    radio = 45.0
    z0 = estado_inicial(p, semilla=args.semilla, radio=radio)

    # con 200 ovejas el rebano mide mas que con 30, y la heuristica del TFM
    # lleva al perro a una distancia fija del centro: si se queda corta, el
    # perro entra en el rebano y lo revienta desde dentro
    r_pos = args.r_pos
    if r_pos is None:
        X0 = z0[: 2 * p.n_o].reshape(2, p.n_o, order="F")
        r_pos = float(np.sqrt(((X0 - X0.mean(axis=1, keepdims=True)) ** 2)
                              .sum(axis=0).max())) + 25.0
    pol = Heuristica(r_pos=r_pos)
    print(f"  heuristica con r_pos = {r_pos:.0f}")

    t0 = time.perf_counter()
    res, (Zh, Ah, esf), (Z, A), pr = compara(
        p, ma, pesos, z0, args.a_max, pol, args.iter, imprime=args.imprime,
        etiqueta=args.etiqueta, arranque=args.arranque)
    res["total_s"] = time.perf_counter() - t0
    res["malla"] = {"T": ma.T, "n": ma.n, "m": ma.m, "h": ma.h, "dt": ma.dt}
    res["pesos"] = {"lam": pesos.lam, "bet": pesos.bet, "gam": pesos.gam,
                    "lam_t": pesos.lam_t}
    res["a_max"] = args.a_max
    res["r_pos"] = r_pos
    res["variables"] = 2 * p.n_p * ma.n
    res["n_o"], res["n_p"] = p.n_o, p.n_p

    np.savez_compressed(TMP / f"{args.etiqueta}.npz", Zh=Zh, Ah=Ah, Z=Z, A=A,
                        z0=z0, esf=esf)
    _imprime_comparacion(res)
    print(f"  total {res['total_s'] / 60:.1f} min")
    guarda(args.etiqueta, res)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
