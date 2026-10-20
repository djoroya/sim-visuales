"""Lazo cerrado con el coste COMPILADO (el mismo C que va a WebAssembly) y el resolvedor SPG.

Valida que los recortes del modelo interno (5 subpasos, mapa en 4 instantes, dirección
«detrás» como parámetro) no estropean el controlador, y permite repetir con varias
semillas y escenarios.

    python valida.py <semilla> [escenario] [iter_spg]
"""
import heapq
import os
import json
import sys
import time
from itertools import permutations
from pathlib import Path

import casadi as ca
import numpy as np

import modelo_mpc as mm

AQUI = Path(__file__).parent
import sys as _s; _s.path.insert(0, str(AQUI))
SEMILLA = int(sys.argv[1]) if len(sys.argv) > 1 else 0
ESC = sys.argv[2] if len(sys.argv) > 2 else "corral"
ITER = int(sys.argv[3]) if len(sys.argv) > 3 else 40
rng = np.random.default_rng(SEMILLA)

M, NP, N_H, NU = mm.M, mm.NP, mm.N_H, mm.NU
NSEG, NSEGP = mm.NSEG, mm.NSEGP
GX, GY = mm.GX, mm.GY
N = 80; DT = mm.DT; T_TOTAL = 700.0
NU_O, NU_P, R_OO, C_NUC, D_NUC = 0.45, 5.0, 30.0, 0.5, 3.0
F_M, SIGMA, V_MAX_O, A_MAX = 5.0, 50.0, 2.0, mm.A_MAX
F_SAT = 2 * NU_O * V_MAX_O
F_W, L_W, F_W_P = 20.0, 3.0, mm.F_W_P

# --- escenarios -----------------------------------------------------------------
def rect(cx, cy, lx, ly, lado, ancho):
    """Rectángulo con una puerta de `ancho` en el lado `lado` ('izq','der','arr','abj')."""
    x0, x1, y0, y1 = cx - lx / 2, cx + lx / 2, cy - ly / 2, cy + ly / 2
    m = ancho / 2
    lados = {"abj": [x0, y0, x1, y0], "der": [x1, y0, x1, y1], "arr": [x1, y1, x0, y1], "izq": [x0, y1, x0, y0]}
    seg, puerta = [], None
    for k, (xa, ya, xb, yb) in lados.items():
        if k != lado:
            seg.append([xa, ya, xb, yb]); continue
        mx, my = (xa + xb) / 2, (ya + yb) / 2
        ux, uy = np.sign(xb - xa), np.sign(yb - ya)
        seg.append([xa, ya, mx - ux * m, my - uy * m]); seg.append([mx + ux * m, my + uy * m, xb, yb])
        puerta = [mx - ux * m, my - uy * m, mx + ux * m, my + uy * m]
    return np.array(seg), np.array(puerta), (x0, x1, y0, y1)


if ESC == "corral":
    SEG, PUERTA, CAJA = rect(60, 30, 160, 100, "izq", 18)
    OBJ = np.array([80.0, 30.0]); INI = np.array([170.0, -120.0])
elif ESC == "puerta_arriba":
    SEG, PUERTA, CAJA = rect(0, -40, 140, 90, "arr", 18)
    OBJ = np.array([0.0, -50.0]); INI = np.array([-170.0, -130.0])
elif ESC == "estrecho":
    SEG, PUERTA, CAJA = rect(120, 0, 120, 120, "izq", 12)
    OBJ = np.array([130.0, 0.0]); INI = np.array([-150.0, 110.0])
x0, x1, y0, y1 = CAJA
# valla del campo: el rebaño no puede salirse del mapa (en el visor, los bordes del lienzo)
VALLA = np.array([[-290, -210, 290, -210], [290, -210, 290, 210], [290, 210, -290, 210], [-290, 210, -290, -210.0]])
SEG = np.vstack([SEG, VALLA])
INI = INI + rng.normal(0, 15, 2)


def dentro(X):
    return (X[:, 0] > x0 + 2) & (X[:, 0] < x1 - 2) & (X[:, 1] > y0 + 2) & (X[:, 1] < y1 - 2)


# --- mapa de distancias en la rejilla del modelo ---------------------------------
def geodesica():
    paso = GX[1] - GX[0]; nx, ny = len(GX), len(GY)
    Xg, Yg = np.meshgrid(GX, GY, indexing="ij"); P = np.stack([Xg.ravel(), Yg.ravel()], 1)
    libre = np.ones(nx * ny, bool)
    for xa, ya, xb, yb in SEG:
        a, b = np.array([xa, ya]), np.array([xb, yb]); ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        # 0,45 de celda: con 0,75 una puerta de 12 quedaba cerrada en esta rejilla
        libre &= np.linalg.norm(P - (a + t[:, None] * ab), axis=1) > paso * 0.45
    libre = libre.reshape(nx, ny)
    # un paso entre dos celdas no puede cortar una pared (las paredes no tienen grosor y,
    # según caigan respecto a la rejilla, dos celdas a ambos lados podían quedar libres)
    def cruza(P, Q):
        def o(a, b, c):
            return np.sign((b[..., 0] - a[..., 0]) * (c[..., 1] - a[..., 1]) - (b[..., 1] - a[..., 1]) * (c[..., 0] - a[..., 0]))
        corta = np.zeros(P.shape[:-1], bool)
        for xa, ya, xb, yb in SEG:
            A = np.array([xa, ya]); B = np.array([xb, yb])
            corta |= (o(P, Q, A) != o(P, Q, B)) & (o(A, B, P) != o(A, B, Q))
        return corta
    Pg = np.stack([Xg, Yg], -1)
    vec = [(1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1), (1, 1, 2 ** .5), (1, -1, 2 ** .5), (-1, 1, 2 ** .5), (-1, -1, 2 ** .5)]
    prohibido = {(di, dj): cruza(Pg, Pg + paso * np.array([di, dj])) for di, dj, _ in vec}
    D = np.full((nx, ny), np.inf)
    i0, j0 = int(round((OBJ[0] - GX[0]) / paso)), int(round((OBJ[1] - GY[0]) / paso))
    D[i0, j0] = 0; cola = [(0.0, i0, j0)]
    while cola:
        d, i, j = heapq.heappop(cola)
        if d > D[i, j]:
            continue
        for di, dj, c in vec:
            a, b = i + di, j + dj
            if (0 <= a < nx and 0 <= b < ny and libre[a, b] and not prohibido[(di, dj)][i, j]
                    and d + c * paso < D[a, b]):
                D[a, b] = d + c * paso; heapq.heappush(cola, (D[a, b], a, b))
    fin = np.isfinite(D); Dm = D.copy(); Dm[~fin] = D[fin].max()
    for _ in range(3):
        Dp = np.pad(Dm, 1, mode="edge")
        Dm = np.where(fin, D, (Dp[:-2, 1:-1] + Dp[2:, 1:-1] + Dp[1:-1, :-2] + Dp[1:-1, 2:]) / 4)
    return Dm


DMAP = geodesica()
GDX, GDY = np.gradient(DMAP, GX, GY)


def muestrea(A, q):
    """Interpolación bilineal de una tabla de la rejilla en el punto q."""
    fx = np.clip((q[0] - GX[0]) / (GX[1] - GX[0]), 0, len(GX) - 1.001)
    fy = np.clip((q[1] - GY[0]) / (GY[1] - GY[0]), 0, len(GY) - 1.001)
    i, j = int(fx), int(fy); a, b = fx - i, fy - j
    return (A[i, j] * (1 - a) * (1 - b) + A[i + 1, j] * a * (1 - b) + A[i, j + 1] * (1 - a) * b + A[i + 1, j + 1] * a * b)


Dq = lambda q: muestrea(DMAP, q)
gradq = lambda q: np.array([muestrea(GDX, q), muestrea(GDY, q)])

# parámetros fijos del escenario
SEGv = np.zeros((NSEG, 4)); ACTv = np.zeros(NSEG); SEGv[:len(SEG)] = SEG; ACTv[:len(SEG)] = 1
SEGPv = np.zeros((NSEGP, 4)); ACTPv = np.zeros(NSEGP); SEGPv[0] = PUERTA; ACTPv[0] = 1
SEG_P_PLANTA = np.vstack([SEG, [PUERTA]])

# --- coste compilado y SPG -------------------------------------------------------
fJg = ca.external("mpc_coste", str(AQUI.parent / "wasm" / "libmpc.so"))


def proyecta(x):
    v = x.reshape(-1, 2); n = np.maximum(1.0, np.linalg.norm(v, axis=1))
    return (v / n[:, None]).ravel()


def evalua(x, p):
    J, g = fJg(x, p); return float(J), np.asarray(g).ravel()


def spg(x, p, iters=ITER, memoria=8, gamma=1e-4):
    x = proyecta(x); f, g = evalua(x, p)
    if not (np.isfinite(f) and np.isfinite(g).all()):
        x = np.zeros_like(x); f, g = evalua(x, p)
    hist = [f]; alfa = 1.0 / max(1e-8, np.abs(proyecta(x - g) - x).max()); ev = 1
    for _ in range(iters):
        d = proyecta(x - alfa * g) - x
        if np.abs(d).max() < 1e-7:
            break
        gd = g @ d; fref = max(hist[-memoria:]); lam = 1.0; ok = False
        while lam >= 1e-4:
            xn = x + lam * d; fn, gn = evalua(xn, p); ev += 1
            if np.isfinite(fn) and np.isfinite(gn).all() and fn <= fref + gamma * lam * gd:
                ok = True; break
            lam *= 0.5
        if not ok:
            break
        s, y = xn - x, gn - g; sy = s @ y
        alfa = np.clip((s @ s) / sy, 1e-6, 1e6) if sy > 0 else 1e6
        x, f, g = xn, fn, gn; hist.append(f)
    return x, f, ev


# --- planta ------------------------------------------------------------------------
def paredes_np(P, seg, fw):
    F = np.zeros_like(P)
    for xa, ya, xb, yb in seg:
        a_, b_ = np.array([xa, ya]), np.array([xb, yb]); ab = b_ - a_
        t = np.clip(((P - a_) @ ab) / (ab @ ab), 0, 1)
        d = P - (a_ + t[:, None] * ab); r = np.sqrt((d ** 2).sum(1) + 0.25)
        F += (fw * np.exp(-(r / L_W) ** 2) / r)[:, None] * d
    return F


def vision(X):
    P = X[:, None, :]; Q = X[None, :, :]; ven = np.ones((len(X), len(X)), bool)
    def o(p, q, r):
        return np.sign((q[..., 0] - p[..., 0]) * (r[..., 1] - p[..., 1]) - (q[..., 1] - p[..., 1]) * (r[..., 0] - p[..., 0]))
    for xa, ya, xb, yb in SEG:
        A = np.array([xa, ya]); B = np.array([xb, yb])
        ven &= ~((o(P, Q, A) != o(P, Q, B)) & (o(A, B, P) != o(A, B, Q)))
    return ven


def avanza(X, V, Y, W, acc, pasos=40, h=DT / 40):
    for _ in range(pasos):
        d = X[None] - X[:, None]; r = np.sqrt((d ** 2).sum(2) + 1.0); np.fill_diagonal(r, np.inf)
        g = np.where(vision(X), (1 / R_OO - 1 / r) - C_NUC * (D_NUC / r) ** 8, 0)
        Foo = ((g / r)[:, :, None] * d).sum(1)
        dp = X[:, None] - Y[None]; rp = np.sqrt((dp ** 2).sum(2) + 1.0)
        Fop = ((F_M * np.exp(-(rp / SIGMA) ** 2) / rp)[:, :, None] * dp).sum(1)
        n = np.linalg.norm(Fop, axis=1, keepdims=True) + 1e-9; Fop = Fop * F_SAT * np.tanh(n / F_SAT) / n
        roz = NU_O * (1 + ((V ** 2).sum(1, keepdims=True) / V_MAX_O ** 2) ** 2)
        V = (V + h * (Foo + Fop + paredes_np(X, SEG, F_W))) / (1 + h * roz); X = X + h * V
        dpp = Y[:, None] - Y[None]; rpp = np.sqrt((dpp ** 2).sum(2) + 1.0); np.fill_diagonal(rpp, np.inf)
        Fpp = ((-(1 / rpp - 1 / 10.0) / rpp)[:, :, None] * (-dpp)).sum(1)
        W = (W + h * (Fpp + acc.reshape(NP, 2) + paredes_np(Y, SEG_P_PLANTA, F_W_P))) / (1 + h * NU_P); Y = Y + h * W
        if not (np.isfinite(X).all() and np.isfinite(Y).all()):
            raise FloatingPointError("planta no finita")
    return X, V, Y, W


# --- reducción y coordinación ------------------------------------------------------
def reduce(X, V, Y, W, centros):
    fuera = ~dentro(X)
    if fuera.any():
        X, V = X[fuera], V[fuera]
    for _ in range(8):
        et = np.argmin(((X[:, None] - centros[None]) ** 2).sum(2), 1)
        centros = np.array([X[et == j].mean(0) if (et == j).any() else centros[j] for j in range(M)])
        for j in range(M):
            if not (et == j).any() and len(X) > M:
                lejos = np.min(((X[:, None] - centros[None]) ** 2).sum(2), 1); centros[j] = X[lejos.argmax()]
    et = np.argmin(((X[:, None] - centros[None]) ** 2).sum(2), 1)
    peso = np.array([(et == j).sum() for j in range(M)], float)
    Vc = np.array([V[et == j].mean(0) if peso[j] else np.zeros(2) for j in range(M)])
    zr = np.concatenate([centros.ravel(), Vc.ravel(), Y.ravel(), W.ravel()])
    return zr, np.maximum(peso, 1e-3), centros


def grupos_de(centros, peso, enlace=35.0):
    vivos = list(np.flatnonzero(peso > 0.5)); etiq = {}
    for i in vivos:
        if i in etiq:
            continue
        etiq[i] = i; pila = [i]
        while pila:
            a_ = pila.pop()
            for b_ in vivos:
                if b_ not in etiq and np.linalg.norm(centros[a_] - centros[b_]) < enlace:
                    etiq[b_] = i; pila.append(b_)
    g = {}
    for i, r in etiq.items():
        g.setdefault(r, []).append(i)
    return list(g.values())


def puesto(centros, peso, miembros, psi):
    w_ = peso[miembros] / peso[miembros].sum(); c = (w_[:, None] * centros[miembros]).sum(0)
    r = np.sqrt((w_ * ((centros[miembros] - c) ** 2).sum(1)).sum() + 1)
    g = gradq(c); g = g / (np.linalg.norm(g) + 1e-6)
    R = np.array([[np.cos(psi), -np.sin(psi)], [np.sin(psi), np.cos(psi)]])
    return c + (1.2 * r + 25.0) * (R @ g), g


def asigna(centros, peso, Y, previa):
    """Reparto de tareas: un perro por grupo por prioridad, los que sobran en arco al
    principal; asignación de distancia mínima con histéresis del 20 %."""
    grupos = grupos_de(centros, peso)
    prio = [peso[g].sum() * (1 + Dq(centros[g].mean(0)) / 100) for g in grupos]
    orden = list(np.argsort(prio)[::-1])
    slots = [(gi, 0.0) for gi in orden[:NP]]
    for e in [(orden[0], -0.6), (orden[0], 0.6), (orden[0], -1.0), (orden[0], 1.0)]:
        if len(slots) >= NP:
            break
        slots.append(e)
    pts = [puesto(centros, peso, grupos[gi], ps) for gi, ps in slots]
    coste = lambda perm: sum(np.linalg.norm(Y[j] - pts[perm[j]][0]) for j in range(NP))
    mejor = min(permutations(range(len(slots)), NP), key=coste)
    if previa is not None:
        cont = []
        for j in range(NP):
            cand = [i for i in range(len(slots)) if i not in cont]
            cont.append(min(cand, key=lambda i: np.linalg.norm(pts[i][0] - previa[j])))
        if coste(cont) <= 1.2 * coste(mejor):
            mejor = cont
    G = np.zeros((M, NP)); psi = np.zeros(NP); gdir = np.zeros((2, NP))
    grupo_de = [slots[i][0] for i in mejor]
    global OTRO_ACT
    OTRO_ACT = np.array([[1.0 if (a != b and grupo_de[a] != grupo_de[b]) else 0.0 for b in range(NP)] for a in range(NP)])
    for j, i in enumerate(mejor):
        gi, ps = slots[i]
        G[grupos[gi], j] = peso[grupos[gi]] / peso[grupos[gi]].sum(); psi[j] = ps; gdir[:, j] = pts[i][1]
        # recolocación por arco: si el perro está lejos (en ángulo) de su puesto, se le da
        # como puesto el siguiente punto de paso de un arco alrededor del grupo. El grafo
        # calcula el puesto como centro + R·rot(psi)·gdir sin normalizar gdir, así que basta
        # con poner psi = 0 y gdir = (punto - centro) / R.
        c, r, R = centro_radio(centros, peso, grupos[gi])
        wp = punto_de_paso(Y[j], c, r, pts[i][0])
        if wp is not None:
            psi[j] = 0.0; gdir[:, j] = (wp - c) / R
    return G, psi, gdir, [pts[i][0] for i in mejor]


def centro_radio(centros, peso, miembros):
    w_ = peso[miembros] / peso[miembros].sum(); c = (w_[:, None] * centros[miembros]).sum(0)
    r = np.sqrt((w_ * ((centros[miembros] - c) ** 2).sum(1)).sum() + 1)
    return c, r, 1.2 * r + 25.0


def bloqueado(q):
    """Un punto de paso no vale fuera de la valla ni pegado a una pared."""
    if abs(q[0]) > 280 or abs(q[1]) > 200:
        return True
    for xa, ya, xb, yb in SEG:
        a_, b_ = np.array([xa, ya]), np.array([xb, yb]); ab = b_ - a_
        t = np.clip(((q - a_) @ ab) / (ab @ ab), 0, 1)
        if np.linalg.norm(q - (a_ + t * ab)) < 12:
            return True
    return False


def punto_de_paso(y, c, r, puesto_, paso=np.pi / 4):
    """None si el perro puede ir directo; si no, el siguiente punto de su arco."""
    Ra = r + 80.0
    th_d = np.arctan2(y[1] - c[1], y[0] - c[0]); th_p = np.arctan2(puesto_[1] - c[1], puesto_[0] - c[0])
    dif = (th_p - th_d + np.pi) % (2 * np.pi) - np.pi            # en (-pi, pi]
    if abs(dif) < paso:
        return None
    mejor_s, mejor_c = None, None
    for s in (np.sign(dif) or 1.0, -(np.sign(dif) or 1.0)):     # el corto primero
        largo = abs(dif) if s == np.sign(dif) else 2 * np.pi - abs(dif)
        angs = th_d + s * np.linspace(paso / 2, largo, max(3, int(largo / 0.2)))
        n_bloq = sum(bloqueado(c + Ra * np.array([np.cos(a), np.sin(a)])) for a in angs)
        coste_ = n_bloq * 10 + largo
        if mejor_c is None or coste_ < mejor_c:
            mejor_s, mejor_c = s, coste_
    a = th_d + mejor_s * paso
    return c + Ra * np.array([np.cos(a), np.sin(a)])


# --- lazo cerrado ------------------------------------------------------------------
k_ = np.arange(N) + 0.5; rr = 20 * np.sqrt(k_ / N); th = k_ * np.pi * (3 - 5 ** .5)
X = np.stack([INI[0] + rr * np.cos(th), INI[1] + rr * np.sin(th)], 1) + rng.normal(0, 0.8, (N, 2))
V = np.zeros_like(X)
# perros a ~60 del rebaño en ángulos al azar: unas veces detrás, otras delante
ang = rng.uniform(0, 2 * np.pi) + np.array([0.0, 0.5, -0.5])
Y = INI + 60.0 * np.stack([np.cos(ang), np.sin(ang)], 1); W = np.zeros_like(Y)
Y = np.clip(Y, [-275, -195], [275, 195])     # siempre dentro de la valla (si no, no pueden entrar)
centros = X[rng.choice(N, M, replace=False)]
u = np.zeros(NU); asig = None
DMAPv = DMAP.ravel(order="F")
hX, hY, ms, nin = [X.copy()], [Y.copy()], [], []
t_fin = None
import os
TRAZA = int(os.environ.get("TRAZA", "0"))     # guardar los primeros TRAZA intervalos para comparar con JS
traza = []
for k in range(int(T_TOTAL / DT)):
    if k < TRAZA:
        reg = {"X": X.tolist(), "V": V.tolist(), "Y": Y.tolist(), "W": W.tolist(), "centros": centros.tolist(), "u_ini": u.tolist(),
               "previa": None if asig is None else [list(map(float, q)) for q in asig]}
    zr, peso, centros = reduce(X, V, Y, W, centros)
    G, psi, gdir, asig = asigna(centros, peso, Y, asig)
    p = np.concatenate([zr, peso, G.ravel(order="F"), psi, gdir.ravel(order="F"),
                        SEGv.ravel(order="F"), ACTv, SEGPv.ravel(order="F"), ACTPv, DMAPv, np.full(NP, mm.W_DET_NORMAL), OTRO_ACT.ravel(order="F") * float(os.environ.get("MOL", "1")), np.ones(NP), np.zeros(2 * NP), [0.0], [0.0]])
    t0 = time.perf_counter(); u, f, ev = spg(u, p); ms.append(1000 * (time.perf_counter() - t0))
    acc = u.reshape(N_H, 2 * NP)[0] * A_MAX
    X, V, Y, W = avanza(X, V, Y, W, acc)
    if k < TRAZA:
        reg.update({"p": p.tolist(), "u": u.tolist(), "J": f, "acc": acc.tolist(),
                    "X1": X.tolist(), "V1": V.tolist(), "Y1": Y.tolist(), "W1": W.tolist()})
        traza.append(reg)
        if k == TRAZA - 1:
            json.dump({"seg": SEG.tolist(), "puerta": PUERTA.tolist(), "obj": OBJ.tolist(), "caja": list(CAJA),
                       "dmap": DMAPv.tolist(), "pasos": traza}, open(AQUI.parent / "tmp" / f"traza_{ESC}_{SEMILLA}.json", "w"))
    u = np.concatenate([u[2 * NP:], u[-2 * NP:]])
    hX.append(X.copy()); hY.append(Y.copy()); nin.append(int(dentro(X).sum()))
    if nin[-1] == N:
        t_fin = (k + 1) * DT; break
res = {"escenario": ESC, "semilla": SEMILLA, "iter": ITER, "dentro": nin[-1], "t_fin": t_fin,
       "t_60": next(((i + 1) * DT for i, n in enumerate(nin) if n >= 60), None),
       "ms_medio": float(np.mean(ms)), "ms_max": float(np.max(ms))}
print(json.dumps(res), flush=True)
nombre = f"val_{ESC}_{SEMILLA}_{ITER}"
np.savez_compressed(AQUI / f"{nombre}.npz", X=np.array(hX), Y=np.array(hY), seg=SEG, puerta=PUERTA, obj=OBJ)
json.dump(res, open(AQUI / f"{nombre}.json", "w"))
