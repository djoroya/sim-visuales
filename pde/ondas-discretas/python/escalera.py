#!/usr/bin/env python3
"""Escalera de validacion: del operador a los efectos vistosos.

Cada peldano escribe salida/escalera-<peldano>.json. Los peldanos:

  operador      autovalores de la malla uniforme frente a 4/h^2 sin^2(xi/2)
  tiempo        integracion exacta frente al leapfrog del articulo (dt = 0.1 h)
  dispersion    velocidad de grupo medida frente a -cos(xi/2) (malla uniforme)
  rayos1d       centro de energia frente al rayo en los casos del articulo
  equilibrio    centro (g1) frente a silla (g2) en (0, pi): periodo y crecimiento
  convergencia  error frente a h en 1D
  rayos2d       casos 2D: baja frecuencia, rodeo y atrapamiento en (0,0,pi,pi)
  conv2d        error del rodeo frente a h

Uso: python escalera.py <peldano> [<peldano> ...]   (o "todo")
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ondas import (PI, MALLAS, Operador1D, Operador2D, dato_gaussiano,  # noqa: E402
                   energia_1d, evoluciona_1d, leapfrog_1d, momentos_1d,
                   r0_2d, rayo)

RAIZ = Path(__file__).resolve().parents[1]
SAL = RAIZ / "salida"

# punto del rodeo: x0 = 0, xi0 = pi/2 y, en y, el punto de retorno de la misma
# orbita (eta = pi): 2 sin(pi/4) c(0) = 2 c(y_t)  ->  cos(pi y_t/4) = 2^{-1/4}
Y_RODEO = float(np.tan(np.arccos(2 ** -0.25)))   # coordenada fisica, 0.6436
RODEO = (0.0, Y_RODEO, PI / 2, PI)


def guarda(nombre, datos):
    SAL.mkdir(exist_ok=True)
    ruta = SAL / f"escalera-{nombre}.json"
    ruta.write_text(json.dumps(datos, indent=2, ensure_ascii=False))
    print(f"  -> {ruta.relative_to(RAIZ)}")


def r(x, n=3):
    """Redondeo a n cifras significativas (para que el json se lea)."""
    x = float(x)
    if x == 0 or not np.isfinite(x):
        return x
    return float(f"{x:.{n}g}")


def pendiente_log(h, e):
    return float(np.polyfit(np.log(h), np.log(e), 1)[0])


# ------------------------------------------------------------------- peldanos
def operador():
    print("autovalores de la malla uniforme frente a la relacion de dispersion")
    out = {}
    for N in (100, 400, 1600):
        op = Operador1D(N, "uniforme")
        k = np.arange(1, N + 1)
        xi = k * PI * op.h / 2
        teo = 4 / op.h ** 2 * np.sin(xi / 2) ** 2
        err = np.max(np.abs(op.lam - teo) / teo)
        out[str(N)] = {"h": r(op.h), "max_err_rel_autovalor": r(err, 2)}
        print(f"  N={N:5d}  error relativo max {err:.1e}")
    guarda("operador", {
        "que": "autovalores de M^-1 K (uniforme) frente a 4/h^2 sin^2(k pi h/4)",
        "resultados": out})


def tiempo():
    print("integracion exacta frente al leapfrog (g1, xi0 = 7pi/15, T = 5)")
    N, T = 400, 5.0
    op = Operador1D(N, "g1")
    u0 = dato_gaussiano(op, 0.0, 7 * PI / 15)
    ts = np.linspace(0, T, 51)
    ue, ute = evoluciona_1d(op, u0, ts)
    me = momentos_1d(op, ue, energia_1d(op, ue, ute))
    filas = []
    for cfl in (0.1, 0.05, 0.025, 0.0125):
        ul, dt = leapfrog_1d(op, u0, T, cfl=cfl, guarda=ts)
        # u_t del leapfrog por diferencia centrada no hace falta: el centro de
        # |u|^2 basta para comparar trayectorias
        Xl = (op.X[:, None] * np.abs(ul) ** 2 * op.m[:, None]).sum(0) / \
            (np.abs(ul) ** 2 * op.m[:, None]).sum(0)
        Xe = (op.X[:, None] * np.abs(ue) ** 2 * op.m[:, None]).sum(0) / \
            (np.abs(ue) ** 2 * op.m[:, None]).sum(0)
        dif = np.linalg.norm(ul[:, -1] - ue[:, -1]) / np.linalg.norm(ue[:, -1])
        filas.append({"cfl": cfl, "dt": r(dt), "dif_rel_u_T": r(dif),
                      "max_dif_centro": r(np.max(np.abs(Xl - Xe)))})
        print(f"  dt = {cfl:6.4f} h   |u_lf - u_ex|/|u_ex| en T = {dif:.2e}   "
              f"centro: {np.max(np.abs(Xl - Xe)):.2e}")
    orden = pendiente_log([f["dt"] for f in filas], [f["dif_rel_u_T"] for f in filas])
    deriva = np.ptp(me["E"]) / me["E"][0]
    print(f"  orden observado del leapfrog: {orden:.2f}; deriva de energia (exacta): {deriva:.1e}")
    guarda("tiempo", {
        "que": "leapfrog (dt = cfl h) frente a la integracion exacta por autovectores",
        "caso": {"malla": "g1", "N": N, "X0": 0, "xi0": "7pi/15", "T": T},
        "leapfrog": filas, "orden_observado": r(orden),
        "deriva_energia_exacta": r(deriva, 2),
        "nota": "con dt = 0.1 h el leapfrog del articulo comete un error de fase "
                "O(1) a esta frecuencia: omega dt = 0.2 sin(xi/2)/g' no depende "
                "de h. Por eso aqui se integra exactamente en tiempo."})


def dispersion():
    print("velocidad de grupo en malla uniforme frente a -cos(xi/2)")
    N = 1600
    op = Operador1D(N, "uniforme")
    ts = np.linspace(0, 0.4, 41)
    xis = PI * np.linspace(0.05, 1.95, 39)
    filas = []
    for xi0 in xis:
        u, ut = evoluciona_1d(op, dato_gaussiano(op, 0.0, xi0), ts)
        mo = momentos_1d(op, u, energia_1d(op, u, ut))
        v = np.polyfit(ts, mo["X"], 1)[0]
        filas.append({"xi0_pi": r(xi0 / PI, 4), "v_medida": r(v, 5),
                      "v_teorica": r(-np.cos(xi0 / 2), 5),
                      "error": r(v + np.cos(xi0 / 2), 2)})
    err = np.array([abs(f["error"]) for f in filas])
    print(f"  {len(filas)} frecuencias; error max {err.max():.2e}, medio {err.mean():.2e}")
    for f in filas[::6]:
        print(f"    xi0 = {f['xi0_pi']:.3f} pi   v = {f['v_medida']:+.4f}   teoria {f['v_teorica']:+.4f}")
    guarda("dispersion", {
        "que": "pendiente del centro de energia (t en [0, 0.4]) frente a la "
               "velocidad de grupo discreta -cos(xi/2); la continua seria -1",
        "N": N, "h": r(op.h), "max_error": r(err.max(), 2),
        "error_medio": r(err.mean(), 2), "filas": filas})


CASOS_1D = [
    # (etiqueta, malla, X0, xi0, fenomeno)
    ("uniforme-pi/4", "uniforme", 0.0, PI / 4, "baja frecuencia: rebota en los bordes"),
    ("uniforme-pi", "uniforme", 0.0, PI, "no se propaga (v_g = 0)"),
    ("uniforme-7pi/4", "uniforme", 0.0, 7 * PI / 4, "simetrico de pi/4: va a la derecha"),
    ("g1-pi/4", "g1", 0.0, PI / 4, "baja frecuencia en g1: como el continuo"),
    ("g1-7pi/15", "g1", 0.0, 7 * PI / 15, "reflexion interna sin tocar el borde"),
    ("g1-10pi/15", "g1", 0.0, 10 * PI / 15, "reflexion interna, amplitud menor"),
    ("g1-13pi/15", "g1", 0.0, 13 * PI / 15, "reflexion interna, cerca del centro"),
    ("g1-pi", "g1", 0.0, PI, "equilibrio (centro): no se propaga ni se dispersa"),
    ("g2-pi/4", "g2", 0.0, PI / 4, "baja frecuencia en g2"),
    ("g2-x0=1/2-pi", "g2", 0.5, PI, "atrapada en x > 0: toca solo un borde"),
    ("g2-x0=-1/2-pi", "g2", -0.5, PI, "atrapada en x < 0: toca solo un borde"),
    ("g2-pi", "g2", 0.0, PI, "equilibrio (silla): no se propaga pero se dispersa"),
]


def compara_1d(N, malla, X0, xi0, T=5.0, nt=501):
    op = Operador1D(N, malla)
    ts = np.linspace(0, T, nt)
    u, ut = evoluciona_1d(op, dato_gaussiano(op, X0, xi0), ts)
    mo = momentos_1d(op, u, energia_1d(op, u, ut))
    x0 = float(op.malla.ginv(X0))
    xr, xir = rayo(malla, [x0], [xi0], ts)
    xr, xir = xr[:, 0], xir[:, 0]
    Xr = op.malla.g(xr)
    err = np.abs(mo["X"] - Xr)
    exi = np.abs(np.angle(np.exp(1j * (mo["xi"] - xir))))
    # lejos del borde: el rayo a mas de 5 anchuras (de |u|^2) de x = +-1
    sig = 1 / np.sqrt(2 * op.h ** -0.9)
    lejos = np.abs(xr) < 1 - 5 * sig
    # el hamiltoniano del rayo se conserva (comprueba el integrador de rayos)
    lam = 2 * np.sin(xir / 2) * op.malla.c(xr)
    return dict(op=op, ts=ts, mo=mo, Xr=Xr, xr=xr, xir=xir, err=err, exi=exi,
                lejos=lejos, dH=np.max(np.abs(lam - lam[0])), u=u)


def rayos1d():
    print("centro de energia frente al rayo, casos del articulo (N = 1600, T = 5)")
    N = 1600
    filas = []
    for et, malla, X0, xi0, fen in CASOS_1D:
        c = compara_1d(N, malla, X0, xi0)
        le = c["lejos"]
        f = {"caso": et, "fenomeno": fen, "malla": malla, "X0": X0,
             "xi0_pi": r(xi0 / PI, 4),
             "max_err_X": r(c["err"].max()), "medio_err_X": r(c["err"].mean()),
             "max_err_X_lejos_borde": r(c["err"][le].max()) if le.any() else None,
             "fraccion_lejos_borde": r(le.mean(), 2),
             "max_err_xi_lejos_borde": r(c["exi"][le].max()) if le.any() else None,
             "rango_X_rayo": [r(c["Xr"].min()), r(c["Xr"].max())],
             "deriva_hamiltoniano_rayo": r(c["dH"], 2),
             "deriva_energia": r(np.ptp(c["mo"]["E"]) / c["mo"]["E"][0], 2)}
        filas.append(f)
        print(f"  {et:15s} err X max {f['max_err_X']:.2e} (lejos del borde "
              f"{f['max_err_X_lejos_borde']}), medio {f['medio_err_X']:.1e}; "
              f"X en [{f['rango_X_rayo'][0]:+.3f}, {f['rango_X_rayo'][1]:+.3f}]")
    guarda("rayos1d", {
        "que": "distancia entre el centro de energia del paquete (coordenada "
               "fisica) y el rayo del hamiltoniano discreto; xi = frecuencia local "
               "medida con arg(sum conj(u_j) u_{j+1})",
        "N": N, "T": 5.0, "gamma": "h^-0.9", "casos": filas})


def equilibrio():
    print("equilibrio (0, pi): centro en g1, silla en g2")
    N, T = 1600, 8.0
    out = {}
    # linealizacion en coordenada de calculo: [[0, c(0)/2], [2 c'(0)... ]]
    for malla in ("g1", "g2"):
        m = MALLAS[malla]
        eps = 1e-6
        dc0 = (m.dc(eps) - m.dc(-eps)) / (2 * eps)   # c''(0)... derivada de c'
        A = np.array([[0, m.c(0.0) / 2], [2 * dc0, 0]])
        ev = np.linalg.eigvals(A)
        op = Operador1D(N, malla)
        ts = np.linspace(0, T, 401)
        u, ut = evoluciona_1d(op, dato_gaussiano(op, 0.0, PI), ts)
        mo = momentos_1d(op, u, energia_1d(op, u, ut))
        out[malla] = {"autovalores_linealizacion": [str(np.round(e, 4)) for e in ev],
                      "anchura_inicial": r(mo["sx"][0]), "anchura_final": r(mo["sx"][-1]),
                      "anchura_max": r(mo["sx"].max())}
        if malla == "g1":
            # periodo de las oscilaciones pequenas en torno al centro: 2 pi / sqrt(2)
            c = compara_1d(N, "g1", 0.0, 14 * PI / 15, T=T, nt=1601)
            X = c["mo"]["X"]
            cruces = c["ts"][1:][(X[1:] > 0) & (X[:-1] <= 0)]
            Xr = c["Xr"]
            cr_r = c["ts"][1:][(Xr[1:] > 0) & (Xr[:-1] <= 0)]
            out[malla]["periodo_xi0=14pi/15_paquete"] = r(np.mean(np.diff(cruces)), 5)
            out[malla]["periodo_xi0=14pi/15_rayo"] = r(np.mean(np.diff(cr_r)), 5)
            out[malla]["periodo_linealizado"] = r(2 * PI / np.sqrt(2), 5)
        else:
            # crecimiento exponencial de la anchura con la tasa de la silla (1/2)
            sel = (ts > 2) & (ts < 6)
            tasa = np.polyfit(ts[sel], np.log(mo["sx"][sel]), 1)[0]
            out[malla]["tasa_crecimiento_anchura"] = r(tasa)
            out[malla]["tasa_teorica"] = 0.5
        print(f"  {malla}: autovalores {out[malla]['autovalores_linealizacion']}, "
              f"anchura {out[malla]['anchura_inicial']} -> {out[malla]['anchura_final']}")
    print("   ", {k: v for k, v in out["g1"].items() if "periodo" in k})
    print("    tasa silla g2:", out["g2"]["tasa_crecimiento_anchura"], "(teorica 0.5)")
    guarda("equilibrio", {"que": "el punto (0, pi) es centro en g1 y silla en g2",
                          "N": N, "T": T, "resultados": out})


def convergencia():
    print("error frente a h (gamma = h^-0.9)")
    casos = [("g1-7pi/15", "g1", 0.0, 7 * PI / 15),
             ("g1-13pi/15", "g1", 0.0, 13 * PI / 15),
             ("uniforme-pi/4", "uniforme", 0.0, PI / 4),
             ("g2-x0=1/2-pi", "g2", 0.5, PI)]
    Ns = [200, 400, 800, 1600, 3200]
    out = []
    for et, malla, X0, xi0 in casos:
        hs, em, eM = [], [], []
        for N in Ns:
            c = compara_1d(N, malla, X0, xi0, nt=251)
            le = c["lejos"]
            hs.append(c["op"].h)
            em.append(c["err"][le].mean())
            eM.append(c["err"][le].max())
        f = {"caso": et, "N": Ns, "h": [r(h) for h in hs],
             "err_medio_lejos_borde": [r(e) for e in em],
             "err_max_lejos_borde": [r(e) for e in eM],
             "orden_medio": r(pendiente_log(hs, em), 2),
             "orden_max": r(pendiente_log(hs, eM), 2)}
        out.append(f)
        print(f"  {et:15s} " + "  ".join(f"{e:.1e}" for e in em)
              + f"   orden {f['orden_medio']} (max: {f['orden_max']})")
    guarda("convergencia", {
        "que": "error del centro de energia frente al rayo al refinar; el haz se "
               "concentra a la vez (anchura h^0.45 en x, h^0.55 en xi)",
        "casos": out})


def compara_2d(N, malla, X0, Y0, xi0, eta0, T, nt):
    op = Operador2D(N, malla)
    m = op.malla
    C0 = op.a_espectro(op.dato(X0, Y0, xi0, eta0))
    E0 = op.energia_espectral(C0)
    ts = np.linspace(0, T, nt)
    x0, y0 = float(m.ginv(X0)), float(m.ginv(Y0))
    r0 = r0_2d(malla, x0, xi0, y0, eta0)
    xr, _ = rayo(malla, [x0, y0], [xi0, eta0], ts, r0=r0)
    Xr, Yr = m.g(xr[:, 0]), m.g(xr[:, 1])
    Xc, Yc, Es = [], [], []
    for t in ts:
        U, Ut = op.en_t(C0, t)
        mo = op.momentos(op.energia(U, Ut))
        Xc.append(mo["X"]), Yc.append(mo["Y"]), Es.append(mo["E"])
    Xc, Yc, Es = map(np.array, (Xc, Yc, Es))
    err = np.hypot(Xc - Xr, Yc - Yr)
    sig = 1 / np.sqrt(2 * op.h ** -0.9)
    lejos = (np.abs(xr) < 1 - 5 * sig).all(1)
    return dict(op=op, ts=ts, Xc=Xc, Yc=Yc, Xr=Xr, Yr=Yr, err=err, lejos=lejos,
                E=Es, E0=E0, r0=r0)


def periodo_rodeo():
    """Periodo de la orbita del rodeo (rayo), por cruces de x = 0."""
    ts = np.linspace(0, 40, 40001)
    x0, y0 = 0.0, float(MALLAS["g1"].ginv(Y_RODEO))
    r0 = r0_2d("g1", x0, PI / 2, y0, PI)
    xr, _ = rayo("g1", [x0, y0], [PI / 2, PI], ts, r0=r0)
    x = xr[:, 0]
    i = np.where((x[1:] < 0) & (x[:-1] >= 0))[0]
    tc = ts[i] + (ts[i + 1] - ts[i]) * x[i] / (x[i] - x[i + 1])
    return float(np.mean(np.diff(tc)))


def rayos2d():
    print("casos 2D frente al rayo (N = 400)")
    Tp = periodo_rodeo()
    print(f"  periodo del rodeo (rayo): {Tp:.4f}")
    casos = [
        ("uniforme-baja", "uniforme", (0.0, 0.5, PI / 4, PI / 4), 5.0,
         "baja frecuencia: recta y reflexion de Snell"),
        ("g1-baja", "g1", (0.0, 0.5, PI / 4, PI / 4), 5.0,
         "baja frecuencia en g1: casi recta"),
        ("g1-rodeo", "g1", RODEO, 2 * Tp, "efecto rodeo: orbita cerrada"),
        ("uniforme-rodeo", "uniforme", RODEO, 2 * Tp,
         "mismo dato en malla uniforme: solo se mueve en x y rebota"),
        ("uniforme-(0,0,pi,pi)", "uniforme", (0.0, 0.0, PI, PI), 5.0, "atrapada"),
        ("g1-(0,0,pi,pi)", "g1", (0.0, 0.0, PI, PI), 5.0, "atrapada"),
    ]
    filas = []
    for et, malla, d, T, fen in casos:
        t0 = time.time()
        c = compara_2d(400, malla, *d, T=T, nt=161)
        le = c["lejos"]
        f = {"caso": et, "fenomeno": fen, "malla": malla,
             "dato": {"X0": r(d[0], 4), "Y0": r(d[1], 4), "xi0_pi": r(d[2] / PI, 4),
                      "eta0_pi": r(d[3] / PI, 4)}, "T": r(T, 5),
             "max_err": r(c["err"].max()), "medio_err": r(c["err"].mean()),
             "max_err_lejos_borde": r(c["err"][le].max()) if le.any() else None,
             "energia_nodal/espectral": [r(c["E"].min() / c["E0"], 8),
                                         r(c["E"].max() / c["E0"], 8)]}
        if "rodeo" in et:
            f["radio_rayo"] = [r(np.hypot(c["Xr"], c["Yr"]).min(), 4),
                               r(np.hypot(c["Xr"], c["Yr"]).max(), 4)]
        filas.append(f)
        print(f"  {et:22s} err max {f['max_err']:.2e} (lejos {f['max_err_lejos_borde']}),"
              f" medio {f['medio_err']:.1e}  [{time.time() - t0:.0f} s]")
    guarda("rayos2d", {"que": "centro de energia 2D frente al rayo", "N": 400,
                       "periodo_rodeo_rayo": r(Tp, 6), "Y_rodeo": r(Y_RODEO, 6),
                       "casos": filas})


def conv2d():
    print("rodeo: error frente a h")
    Tp = periodo_rodeo()
    Ns = [100, 200, 400, 800, 1600]
    hs, em, eM = [], [], []
    for N in Ns:
        t0 = time.time()
        c = compara_2d(N, "g1", *RODEO, T=Tp, nt=41)
        hs.append(c["op"].h), em.append(c["err"].mean()), eM.append(c["err"].max())
        print(f"  N = {N:5d}  err medio {em[-1]:.2e}  max {eM[-1]:.2e}  [{time.time() - t0:.0f} s]")
    o1, o2 = pendiente_log(hs, em), pendiente_log(hs, eM)
    print(f"  orden: {o1:.2f} (medio), {o2:.2f} (max)")
    guarda("conv2d", {"que": "efecto rodeo (g1), una vuelta: error del centro de "
                             "energia frente al rayo", "periodo": r(Tp, 6),
                      "N": Ns, "h": [r(h) for h in hs],
                      "err_medio": [r(e) for e in em], "err_max": [r(e) for e in eM],
                      "orden_medio": r(o1, 2), "orden_max": r(o2, 2)})


PELDANOS = {f.__name__: f for f in (operador, tiempo, dispersion, rayos1d, equilibrio,
                                     convergencia, rayos2d, conv2d)}

if __name__ == "__main__":
    pedidos = sys.argv[1:] or ["todo"]
    if pedidos == ["todo"]:
        pedidos = list(PELDANOS)
    for p in pedidos:
        print(f"\n== {p}")
        t0 = time.time()
        PELDANOS[p]()
        print(f"  ({time.time() - t0:.0f} s)")
