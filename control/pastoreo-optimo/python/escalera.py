#!/usr/bin/env python3
"""La escalera de pruebas: del gradiente al rebano entero.

Cada peldano comprueba una cosa y solo una, y ninguno se salta:

    0. integrador   el paso de RK4 elegido no decide el resultado
    0b. lammps      esta dinamica es la misma que la ya validada en LAMMPS
    1. gradiente    el gradiente por AD coincide con diferencias finitas
    2. pareja       1 perro + 1 oveja: sale la estrategia de Escobedo et al.
    3. veinte       20 ovejas + 1 perro: el optimo bate a la heuristica
    informe         junta los resultados en salida/escalera.md

    python/escalera.py <peldano> [...]
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import casadi as ca
import numpy as np

from modelo import Params, estado_inicial, func_intervalo, medidas_np
from ocp import Malla, Pesos, Problema
from politica import Heuristica, func_accion
from simula import rollout_control, rollout_politica

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "salida"
TMP = RAIZ / "tmp"


def guarda(nombre: str, datos: dict) -> None:
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / f"escalera-{nombre}.json").write_text(
        json.dumps(datos, indent=1, ensure_ascii=False, default=float))
    print(f"-> salida/escalera-{nombre}.json")


def titulo(t: str) -> None:
    print(f"\n\033[1m== {t}\033[0m")


# --- 0. convergencia del integrador ----------------------------------------

def peldano_integrador(args) -> dict:
    """El paso de RK4 no puede estar decidiendo el resultado.

    Se integra el mismo control (constante a trozos) con pasos cada vez mas
    finos y se mira cuanto se mueve la solucion. El de referencia es h/8.
    """
    titulo("0. convergencia del integrador")
    p = Params(n_o=args.n_o, n_p=args.n_p)
    z0 = estado_inicial(p)
    rng = np.random.default_rng(7)
    n = 80
    T = 200.0
    A = 10.0 * rng.standard_normal((2 * p.n_p, n))   # control arbitrario pero fijo

    ref = None
    filas = []
    for m in (1, 2, 5, 10, 20, 40):
        paso = func_intervalo(p, T / (n * m), m)
        t0 = time.perf_counter()
        Z = rollout_control(paso, z0, A)
        dt = time.perf_counter() - t0
        med = medidas_np(Z, p)
        fin = Z[:, -1]
        if ref is None or m == 40:
            ref = fin
        filas.append({"m": m, "h": T / (n * m), "segundos": dt,
                      "cm": med["cm"][:, -1].tolist(),
                      "dispersion": float(med["dispersion"][-1]),
                      "_fin": fin})
    res = []
    for f in filas:
        err = float(np.abs(np.asarray(f.pop("_fin")) - ref).max())
        f["err_max_vs_h8"] = err
        res.append(f)
        print(f"  m={f['m']:3d}  h={f['h']:6.3f}  {f['segundos']:5.2f} s   "
              f"|z(T)-z_ref|_inf = {err:9.3e}   cm=({f['cm'][0]:7.2f},{f['cm'][1]:7.2f})")
    datos = {"n_o": p.n_o, "n_p": p.n_p, "T": T, "n": n, "mallas": res}
    guarda("integrador", datos)
    return datos


# --- 0b. contraste con LAMMPS ----------------------------------------------

def _escribe_data(ruta: Path, z0: np.ndarray, p: Params, caja: float = 600.0):
    X = z0[: 2 * p.n_o].reshape(2, p.n_o, order="F")
    Y = z0[4 * p.n_o: 4 * p.n_o + 2 * p.n_p].reshape(2, p.n_p, order="F")
    lineas = ["# pastoreo: contraste CasADi vs LAMMPS", "",
              f"{p.n_o + p.n_p} atoms", "2 atom types", "",
              f"{-caja} {caja} xlo xhi", f"{-caja} {caja} ylo yhi",
              "-0.5 0.5 zlo zhi", "", "Masses", "", "1 1.0", "2 1.0", "",
              "Atoms # atomic", ""]
    # el perro es el atomo 1 (tipo 2), como en particulas/pastoreo
    for j in range(p.n_p):
        lineas.append(f"{j + 1} 2 {Y[0, j]:.10f} {Y[1, j]:.10f} 0.0")
    for i in range(p.n_o):
        lineas.append(f"{p.n_p + i + 1} 1 {X[0, i]:.10f} {X[1, i]:.10f} 0.0")
    ruta.write_text("\n".join(lineas) + "\n")


def _lee_trj(ruta: Path):
    pasos, cuadros, tipos = [], [], None
    bloques = ruta.read_text().split("ITEM: TIMESTEP\n")[1:]
    for b in bloques:
        lin = b.splitlines()
        pasos.append(int(lin[0]))
        i = next(k for k, l in enumerate(lin) if l.startswith("ITEM: ATOMS"))
        d = np.array([l.split() for l in lin[i + 1:] if l.strip()], dtype=float)
        d = d[np.argsort(d[:, 0])]
        if tipos is None:
            tipos = (d[:, 1] == 2).astype(int)
        cuadros.append(d[:, 2:4])
    return np.array(pasos), np.array(cuadros), tipos


def peldano_lammps(args) -> dict:
    """La misma dinamica, dos implementaciones independientes.

    `particulas/pastoreo/` resuelve este modelo con LAMMPS (tabla para g_oo,
    fix addforce para g_op, velocity-Verlet con dt = 0,01) y esta validado
    contra una solucion analitica. Aqui se integra con RK4 en CasADi y con la
    fuerza regularizada. Si las dos coinciden partiendo del mismo estado, la
    dinamica de este tutorial es la de alli.
    """
    titulo("0b. contraste con la version en LAMMPS")
    p = Params(n_o=30, n_p=1)
    z0 = estado_inicial(p)
    TMP.mkdir(exist_ok=True)
    data = TMP / "contraste.data"
    _escribe_data(data, z0, p)

    # la tabla de g_oo la genera el tutorial anterior; el perro no siente la
    # reaccion del rebano, asi que los pares 1-2 y 2-2 llevan una tabla nula
    tabla = RAIZ.parent.parent / "particulas" / "pastoreo" / "python" / "tabla.py"
    subprocess.run([sys.executable, str(tabla), "--escala", "1.0", "--r0", "2.0",
                    "--salida", str(TMP / "oveja-oveja.table")], check=True)
    (TMP / "nula.table").write_text(
        "# interaccion nula\n\nNULA\nN 2 R 0.5 1.0\n\n1 0.5 0.0 0.0\n2 1.0 0.0 0.0\n")

    T, volc = args.T, 1.0
    orden = [args.lmp, "-in", str(RAIZ / "lammps" / "in.contraste"),
             "-var", "data", str(data), "-var", "tfin", str(T),
             "-var", "sal", str(TMP / "contraste"),
             "-log", str(TMP / "log.contraste"), "-screen", "none"]
    print("  " + " ".join(orden))
    t0 = time.perf_counter()
    subprocess.run(orden, check=True, cwd=RAIZ)
    t_lmp = time.perf_counter() - t0

    pasos, pos, tipos = _lee_trj(TMP / "contraste.lammpstrj")
    t_l = pasos * 0.01

    # mismo escenario con el modelo de aqui, control nulo
    n = int(T / volc)
    m = 10
    paso = func_intervalo(p, volc / m, m)
    t0 = time.perf_counter()
    Z = rollout_control(paso, z0, np.zeros((2 * p.n_p, n)))
    t_cas = time.perf_counter() - t0
    med = medidas_np(Z, p)

    # LAMMPS vuelca el perro primero; aqui el estado lleva ovejas y luego perros
    ovl = pos[:, tipos == 0, :]
    cm_l = ovl.mean(axis=1).T
    disp_l = ((ovl - ovl.mean(axis=1, keepdims=True)) ** 2).sum(axis=2).mean(axis=1)
    j = np.searchsorted(t_l, np.arange(n + 1) * volc)
    j = np.clip(j, 0, len(t_l) - 1)

    err_cm = np.linalg.norm(med["cm"] - cm_l[:, j], axis=0)
    err_disp = np.abs(med["dispersion"] - disp_l[j])
    filas = []
    for k in range(0, n + 1, max(1, n // 8)):
        filas.append({"t": k * volc, "err_cm": float(err_cm[k]),
                      "cm_casadi": med["cm"][:, k].tolist(),
                      "cm_lammps": cm_l[:, j[k]].tolist(),
                      "disp_casadi": float(med["dispersion"][k]),
                      "disp_lammps": float(disp_l[j[k]])})
        print(f"  t={k * volc:5.0f}  |cm_casadi - cm_lammps| = {err_cm[k]:8.4f}"
              f"   dispersion {med['dispersion'][k]:8.1f} vs {disp_l[j[k]]:8.1f}")
    datos = {"T": T, "n_o": p.n_o, "segundos_lammps": t_lmp, "segundos_casadi": t_cas,
             "err_cm_max": float(err_cm.max()), "err_cm_final": float(err_cm[-1]),
             "err_disp_max": float(err_disp.max()),
             "recorrido_cm": float(np.linalg.norm(med["cm"][:, -1] - med["cm"][:, 0])),
             "muestras": filas}
    print(f"  error maximo del centro del rebano: {err_cm.max():.4f} "
          f"sobre un recorrido de {datos['recorrido_cm']:.1f}")
    guarda("lammps", datos)
    return datos


# --- 1. gradiente -----------------------------------------------------------

def peldano_gradiente(args) -> dict:
    titulo("1. gradiente por AD frente a diferencias finitas")
    p = Params(n_o=4, n_p=2)
    z0 = estado_inicial(p, centro=(-60.0, 40.0), radio=15.0)
    ma = Malla(T=40.0, n=10, m=4)
    pr = Problema(p, ma, Pesos(), z0, a_max=25.0)
    rng = np.random.default_rng(0)
    A = rng.uniform(-10, 10, (2 * p.n_p, ma.n))

    t0 = time.perf_counter()
    g = np.asarray(pr.gradJ(A=ca.DM(A))["g"]).ravel(order="F")
    t_ad = time.perf_counter() - t0

    filas = []
    t0 = time.perf_counter()
    for eps in (1e-4, 1e-5, 1e-6, 1e-7):
        gfd = np.zeros_like(g)
        plano = A.ravel(order="F")
        for i in range(g.size):
            mas, menos = plano.copy(), plano.copy()
            mas[i] += eps
            menos[i] -= eps
            gfd[i] = (pr.coste(mas.reshape(A.shape, order="F"))
                      - pr.coste(menos.reshape(A.shape, order="F"))) / (2 * eps)
        err = float(np.abs(g - gfd).max() / np.abs(gfd).max())
        filas.append({"eps": eps, "err_rel_max": err})
        print(f"  eps={eps:7.0e}   error relativo maximo = {err:.2e}")
    t_fd = (time.perf_counter() - t0) / len(filas)

    datos = {"variables": int(g.size), "n_o": p.n_o, "n_p": p.n_p,
             "segundos_ad": t_ad, "segundos_df": t_fd,
             "veces_mas_rapido": t_fd / t_ad, "pruebas": filas,
             "mejor": min(f["err_rel_max"] for f in filas)}
    print(f"  un gradiente: {t_ad * 1e3:.1f} ms por AD, {t_fd * 1e3:.0f} ms por "
          f"diferencias finitas ({t_fd / t_ad:.0f} veces mas)")
    guarda("gradiente", datos)
    return datos


# --- 2. un perro y una oveja ------------------------------------------------

def _alineacion(Z, p: Params):
    """cos del angulo entre (oveja - perro) y (objetivo - oveja)."""
    X = Z[0:2, :]
    Y = Z[4 * p.n_o: 4 * p.n_o + 2, :]
    obj = np.asarray(p.objetivo).reshape(2, 1)
    u, v = X - Y, obj - X
    nu = np.linalg.norm(u, axis=0) * np.linalg.norm(v, axis=0) + 1e-12
    return (u * v).sum(axis=0) / nu, np.linalg.norm(u, axis=0)


def peldano_pareja(args) -> dict:
    """El caso de Escobedo-Ibanez-Zuazua (2016): un perro, una oveja.

    Lo que describen alli: el perro no persigue a la oveja en linea recta,
    primero se coloca *detras* (en la prolongacion de la linea objetivo-oveja)
    y luego empuja; la distancia perro-oveja se estabiliza porque la repulsion
    decae con la distancia. Se comprueban las dos cosas, y en particular el
    caso dificil: el perro empieza del lado equivocado y tiene que rodear.
    """
    titulo("2. un perro y una oveja")
    p = Params(n_o=1, n_p=1)
    pesos = Pesos(lam=0.0, bet=0.01, gam=0.5)
    casos = {
        # el perro ya esta detras: deberia limitarse a empujar
        "detras": (np.array([-150.0, 100.0, 0, 0, -200.0, 135.0, 0, 0]),
                   Malla(T=80.0, n=80, m=10)),
        # el perro esta delante, entre la oveja y el objetivo: tiene que rodear,
        # y rodear lleva tiempo, asi que este caso necesita mas horizonte
        "delante": (np.array([-150.0, 100.0, 0, 0, -100.0, 65.0, 0, 0]),
                    Malla(T=200.0, n=200, m=10)),
    }
    salida = {}
    for nombre, (z0, ma) in casos.items():
        pr = Problema(p, ma, pesos, z0, a_max=25.0)
        pi = func_accion(p, Heuristica())
        _, Ah, _ = rollout_politica(p, pi, z0, ma.n, ma.h, ma.m, a_max=25.0)
        # dos arranques: el trivial y el de la heuristica
        for arranque, A0 in (("frio", np.zeros((2, ma.n))), ("caliente", Ah)):
            A, info = pr.resuelve(A0, max_iter=args.iter, imprime=0)
            Z = pr.estados(A)
            med = medidas_np(Z, p)
            cos, dpo = _alineacion(Z, p)
            llegada = next((k * ma.dt for k, d in enumerate(med["distancia"])
                            if d < 10), None)
            # fase de conduccion: desde que arranca hasta que la oveja esta cerca
            fase = slice(0, int((llegada or ma.T) / ma.dt) + 1)
            clave = f"{nombre}-{arranque}"
            salida[clave] = {
                "info": info, "coste": pr.desglose(A),
                "coste_arranque": pr.desglose(A0),
                "dist_inicial": float(med["distancia"][0]),
                "dist_final": float(med["distancia"][-1]),
                "t_llegada": llegada,
                "cos_medio_conduccion": float(np.mean(cos[fase])),
                "cos_inicial": float(cos[0]),
                "dist_perro_oveja_conduccion": float(np.median(dpo[fase])),
                "a_medio": float(np.abs(A).mean()),
                "cos": cos.tolist(), "d_perro_oveja": dpo.tolist(),
                "distancia": med["distancia"].tolist(),
            }
            np.savez_compressed(TMP / f"pareja-{clave}.npz", Z=Z, A=A)
            print(f"  [{clave:16s}] {info['estado']} en {info['iteraciones']} iter, "
                  f"{info['segundos']:.1f} s;  J {pr.desglose(A0)['J']:.3f} -> "
                  f"{pr.desglose(A)['J']:.3f};  dist {med['distancia'][0]:.0f} -> "
                  f"{med['distancia'][-1]:.1f}"
                  + (f", llega en t={llegada:.0f}" if llegada else ", no llega"))
            print(f"  {'':18s} alineacion media durante la conduccion: "
                  f"cos = {salida[clave]['cos_medio_conduccion']:.3f} "
                  f"(empieza en {cos[0]:.3f}); distancia perro-oveja "
                  f"{salida[clave]['dist_perro_oveja_conduccion']:.1f}")
    guarda("pareja", salida)
    return salida


# --- 3. veinte ovejas -------------------------------------------------------

def compara(p: Params, ma: Malla, pesos: Pesos, z0, a_max, pol: Heuristica,
            iteraciones: int, imprime: int = 0, etiqueta: str = "",
            arranque: str = "caliente", disp_ref: float | None = None):
    """Heuristica (lazo cerrado) contra optimo (arrancando de ella, o de cero
    si `arranque` es "frio": sirve para medir cuanto aporta el arranque en
    caliente a esta escala)."""
    pr = Problema(p, ma, pesos, z0, a_max=a_max, disp_ref=disp_ref)
    pi = func_accion(p, pol)
    t0 = time.perf_counter()
    Zh, Ah, esf = rollout_politica(p, pi, z0, ma.n, ma.h, ma.m, a_max=a_max)
    t_h = time.perf_counter() - t0
    A0 = Ah if arranque == "caliente" else np.zeros_like(Ah)
    A, info = pr.resuelve(A0, max_iter=iteraciones, imprime=imprime)
    Z = pr.estados(A)
    resumen = {
        "etiqueta": etiqueta, "arranque": arranque,
        "coste_arranque": pr.desglose(A0),
        "construir_s": pr.t_construir, "heuristica_s": t_h, "optimo": info,
        "disp_ref": pr.disp_ref,
        "heuristica": _resumen(Zh, Ah, p, ma, pr, esfuerzo=esf),
        "optimo_res": _resumen(Z, A, p, ma, pr),
    }
    return resumen, (Zh, Ah, esf), (Z, A), pr


def _resumen(Z, A, p: Params, ma: Malla, pr: Problema, esfuerzo=None) -> dict:
    med = medidas_np(Z, p)
    llega = next((k * ma.dt for k, d in enumerate(med["distancia"]) if d < 20), None)
    return {
        "coste": pr.desglose(A),
        "dist_final": float(med["distancia"][-1]),
        "dist_min": float(med["distancia"].min()),
        "t_dist20": llega,
        "disp_inicial": float(med["dispersion"][0]),
        "disp_final": float(med["dispersion"][-1]),
        "esfuerzo_medio": float(np.abs(A).mean()),
        "esfuerzo_int": float(esfuerzo.sum() if esfuerzo is not None
                              else ma.dt * (A ** 2).sum()),
    }


def peldano_veinte(args) -> dict:
    titulo("3. veinte ovejas y un perro")
    p = Params(n_o=20, n_p=1)
    ma = Malla(T=400.0, n=160, m=10)
    z0 = estado_inicial(p, radio=35.0)
    res, (Zh, Ah, esf), (Z, A), pr = compara(
        p, ma, Pesos(bet=0.2), z0, 25.0, Heuristica(), args.iter, etiqueta="20+1")
    np.savez_compressed(TMP / "veinte.npz", Zh=Zh, Ah=Ah, Z=Z, A=A, esf=esf)
    _imprime_comparacion(res)
    guarda("veinte", res)
    return res


def _imprime_comparacion(res: dict) -> None:
    h, o = res["heuristica"], res["optimo_res"]
    print(f"  optimo: {res['optimo']['estado']} en {res['optimo']['iteraciones']} "
          f"iteraciones, {res['optimo']['segundos']:.0f} s "
          f"(construir el grafo: {res['construir_s']:.1f} s)")
    print(f"  {'':22s}{'heuristica':>12s}{'optimo':>12s}")
    for clave, nombre in (("coste", "J"), ("dist_final", "distancia final"),
                          ("disp_final", "dispersion final"),
                          ("esfuerzo_int", "esfuerzo integral")):
        va = h[clave]["J"] if clave == "coste" else h[clave]
        vb = o[clave]["J"] if clave == "coste" else o[clave]
        print(f"  {nombre:22s}{va:12.3f}{vb:12.3f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="peldano", required=True)

    s = sub.add_parser("integrador")
    s.add_argument("--n-o", type=int, default=30)
    s.add_argument("--n-p", type=int, default=3)
    s.set_defaults(fn=peldano_integrador)

    s = sub.add_parser("lammps")
    s.add_argument("--lmp", default="lmp")
    s.add_argument("--T", type=float, default=60.0)
    s.set_defaults(fn=peldano_lammps)

    s = sub.add_parser("gradiente")
    s.set_defaults(fn=peldano_gradiente)

    s = sub.add_parser("pareja")
    s.add_argument("--iter", type=int, default=400)
    s.set_defaults(fn=peldano_pareja)

    s = sub.add_parser("veinte")
    s.add_argument("--iter", type=int, default=300)
    s.set_defaults(fn=peldano_veinte)

    args = ap.parse_args()
    args.fn(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
