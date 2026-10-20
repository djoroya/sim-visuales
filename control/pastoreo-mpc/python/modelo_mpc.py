"""Coste del MPC de pastoreo con corrales, totalmente parametrizado, para exportarlo a C.

Todo lo que depende del escenario entra como parámetro, para que el navegador pueda
cambiar corral y destino sin regenerar código:
  - z0 (estado de M superovejas y NP perros), w (pesos de las superovejas)
  - GRP (M x NP) y PSI (NP): el puesto asignado a cada perro (coordinación)
  - SEG (NSEG x 4) + ACT (NSEG): paredes para ovejas y perros
  - SEGP (NSEGP x 4) + ACTP (NSEGP): segmentos que solo ven los perros (verjas)
  - DMAP: valores del mapa de distancias al destino en la rejilla fija GX x GY

Salida: J y su gradiente respecto a las incógnitas u (2·NP·N_H, aceleraciones / a_max).
"""
import casadi as ca
import numpy as np

# --- dimensiones y constantes (las mismas del prototipo en Python) --------------
M, NP, N_H, MSUB = 10, 3, 20, 5
W_DET_NORMAL = 0.3                               # peso habitual de la guía de cada perro
W_MOL_DEF = 2.0                                  # peso de «no molestar» al grupo de otro perro
K_MAPA = 4                                      # instantes del horizonte con mapa
DT = 2.5; H = DT / MSUB
NSEG, NSEGP = 10, 2
NU_O, NU_P = 0.45, 5.0
R_OO = 30.0
F_M, SIGMA = 5.0, 50.0
V_MAX_O, V_MAX_P = 2.0, 2.8
A_MAX = V_MAX_P * NU_P
F_W, L_W = 20.0, 3.0
F_W_P = 4 * A_MAX
GX = np.arange(-300.0, 300.0 + 1e-9, 6.0)      # rejilla del mapa de distancias
GY = np.arange(-220.0, 220.0 + 1e-9, 6.0)
NZ = 4 * (M + NP)
NU = 2 * NP * N_H


def paredes(P, seg, act, fw):
    F = ca.MX.zeros(2, P.shape[1])
    for s in range(seg.shape[0]):
        xa, ya, xb, yb = seg[s, 0], seg[s, 1], seg[s, 2], seg[s, 3]
        abx, aby = xb - xa, yb - ya
        L2 = abx * abx + aby * aby + 1e-9
        t = ((P[0, :] - xa) * abx + (P[1, :] - ya) * aby) / L2
        t = ca.fmin(ca.fmax(t, 0), 1)
        dx = P[0, :] - (xa + t * abx); dy = P[1, :] - (ya + t * aby)
        r = ca.sqrt(dx ** 2 + dy ** 2 + 0.25)
        c = act[s] * fw * ca.exp(-(r / L_W) ** 2) / r
        F = F + ca.vertcat(c * dx, c * dy)
    return F


def radial(A, B, g, peso=None, diag=False):
    n, m = A.shape[1], B.shape[1]
    dx = ca.repmat(B[0, :], n, 1) - ca.repmat(A[0, :].T, 1, m)
    dy = ca.repmat(B[1, :], n, 1) - ca.repmat(A[1, :].T, 1, m)
    r = ca.sqrt(dx * dx + dy * dy + 1.0)
    c = g(r) / r
    if peso is not None:
        c = c * ca.repmat(peso.T, n, 1)
    if diag:
        c = c * (ca.DM.ones(n, m) - ca.DM.eye(n))
    uno = ca.DM.ones(m, 1)
    return ca.horzcat(ca.mtimes(c * dx, uno), ca.mtimes(c * dy, uno)).T


def construir():
    u = ca.MX.sym("u", NU)
    z0 = ca.MX.sym("z0", NZ); w = ca.MX.sym("w", M)
    GRP = ca.MX.sym("grp", M, NP); PSI = ca.MX.sym("psi", NP)
    SEG = ca.MX.sym("seg", NSEG, 4); ACT = ca.MX.sym("act", NSEG)
    SEGP = ca.MX.sym("segp", NSEGP, 4); ACTP = ca.MX.sym("actp", NSEGP)
    DMAP = ca.MX.sym("dmap", len(GX) * len(GY))

    # B-spline cúbica con los valores del mapa como puntos de control: sin ajuste (que
    # obligaría a resolver un sistema en cada llamada), suaviza del orden de una celda
    paso_g = GX[1] - GX[0]
    kx = list(GX[0] + (np.arange(len(GX) + 4) - 2) * paso_g)
    ky = list(GY[0] + (np.arange(len(GY) + 4) - 2) * paso_g)
    qs = ca.MX.sym("q", 2); cs = ca.MX.sym("c", len(GX) * len(GY))
    interp = ca.Function("D", [qs, cs], [ca.bspline(qs, cs, [kx, ky], [3, 3], 1, {})])
    DIST = lambda q: interp(q, DMAP)

    # dinámica reducida (ver el prototipo: fuerza saturada, paredes sin saturar)
    zs = ca.MX.sym("z", NZ); as_ = ca.MX.sym("a", 2 * NP); ws = ca.MX.sym("w", M)
    segs = ca.MX.sym("s", NSEG, 4); acts = ca.MX.sym("ac", NSEG)
    segps = ca.MX.sym("sp", NSEGP, 4); actps = ca.MX.sym("acp", NSEGP)

    def campo(z, a):
        X = ca.reshape(z[0:2 * M], 2, M); V = ca.reshape(z[2 * M:4 * M], 2, M)
        Y = ca.reshape(z[4 * M:4 * M + 2 * NP], 2, NP); W = ca.reshape(z[4 * M + 2 * NP:], 2, NP)
        Fop = radial(X, Y, lambda r: -F_M * ca.exp(-(r * r) / SIGMA ** 2))
        F = radial(X, X, lambda r: -(1.0 / r - 1.0 / R_OO), peso=ws, diag=True) + Fop
        tope = 1.2 * NU_O * V_MAX_O
        nF = ca.sqrt(ca.sum1(F * F) + 1e-9)
        F = F * ca.repmat(tope * ca.tanh(nF / tope) / nF, 2, 1)
        dV = -NU_O * V + F + paredes(X, segs, acts, F_W)
        dW = (-NU_P * W + radial(Y, Y, lambda r: -(1.0 / r - 1.0 / 10.0), diag=True)
              + ca.reshape(a, 2, NP) + paredes(Y, segs, acts, F_W_P) + paredes(Y, segps, actps, F_W_P))
        return ca.vertcat(ca.vec(V), ca.vec(dV), ca.vec(W), ca.vec(dW))

    # un subpaso de RK4 en SX (código compacto); el intervalo lo encadena MSUB veces en
    # MX, para que el C del subpaso y su derivada aparezcan una sola vez
    k1 = campo(zs, as_); k2 = campo(zs + H / 2 * k1, as_)
    k3 = campo(zs + H / 2 * k2, as_); k4 = campo(zs + H * k3, as_)
    sub = ca.Function("sub", [zs, as_, ws, segs, acts, segps, actps],
                      [zs + H / 6 * (k1 + 2 * k2 + 2 * k3 + k4)]).expand()
    zm = ca.MX.sym("z", NZ); am = ca.MX.sym("a", 2 * NP); wm = ca.MX.sym("w", M)
    sm = ca.MX.sym("s", NSEG, 4); acm = ca.MX.sym("ac", NSEG)
    spm = ca.MX.sym("sp", NSEGP, 4); acpm = ca.MX.sym("acp", NSEGP)
    zk = zm
    for _ in range(MSUB):
        zk = sub(zk, am, wm, sm, acm, spm, acpm)
    paso = ca.Function("paso", [zm, am, wm, sm, acm, spm, acpm], [zk])

    U = ca.reshape(u, 2 * NP, N_H)
    Z = paso.mapaccum(N_H)(z0, U * A_MAX, ca.repmat(w, 1, N_H), ca.repmat(SEG, 1, N_H),
                           ca.repmat(ACT, 1, N_H), ca.repmat(SEGP, 1, N_H), ca.repmat(ACTP, 1, N_H))
    wn = w / ca.sum1(w)
    Xk = Z[0:2 * M, :]; Yk = Z[4 * M:4 * M + 2 * NP, :]
    cmx = ca.mtimes(wn.T, Xk[0::2, :]); cmy = ca.mtimes(wn.T, Xk[1::2, :])
    # El mapa (B-spline genérica de CasADi, lo caro) solo en K_MAPA instantes del
    # horizonte; el seguimiento se promedia en ellos y el último es el final.
    KS = list(range(N_H // K_MAPA - 1, N_H, N_H // K_MAPA))
    XS = Xk[:, KS]
    pts = ca.vertcat(ca.reshape(XS[0::2, :], 1, M * len(KS)), ca.reshape(XS[1::2, :], 1, M * len(KS)))
    Dk = ca.reshape(interp.map(M * len(KS))(pts, DMAP), M, len(KS))
    huber = 0.25 * (ca.sqrt(1.0 + (Dk / 20.0) ** 2) - 1.0)
    seguir = ca.mtimes(wn.T, huber)
    radio = ca.sqrt(ca.sum1(wn * ((Xk[0::2, :] - ca.repmat(cmx, M, 1)) ** 2
                                  + (Xk[1::2, :] - ca.repmat(cmy, M, 1)) ** 2)) + 1.0)
    cerca = 0; sx = 0; sy = 0
    for j in range(NP):
        ex = Yk[2 * j, :] - cmx; ey = Yk[2 * j + 1, :] - cmy
        dj = ca.sqrt(ex ** 2 + ey ** 2 + 1.0)
        cerca = cerca + ca.sum2((ca.fmax(0, dj - (1.5 * radio + 60.0)) / 50.0) ** 2) / (N_H * NP)
        sx = sx + ex / dj; sy = sy + ey / dj
    Dmed = ca.mtimes(wn.T, Dk)                                   # 1 x K_MAPA
    sxs, sys_ = sx[:, KS], sy[:, KS]
    reparto = ca.sum2(ca.exp(-(Dmed / 40.0) ** 2) * (sxs ** 2 + sys_ ** 2)) / (len(KS) * NP ** 2)

    # puestos de coordinación: la dirección «detrás» de cada perro (unitaria, en sentido
    # contrario al camino de su grupo) llega como parámetro, calculada fuera por decisión
    GDIR = ca.MX.sym("gdir", 2, NP)
    CGX = ca.mtimes(GRP.T, Xk[0::2, :]); CGY = ca.mtimes(GRP.T, Xk[1::2, :])     # NP x N_H
    RG = ca.sqrt(ca.mtimes(GRP.T, Xk[0::2, :] ** 2 + Xk[1::2, :] ** 2) - CGX ** 2 - CGY ** 2 + 1.0)
    gx = ca.repmat(GDIR[0, :].T, 1, N_H); gy = ca.repmat(GDIR[1, :].T, 1, N_H)
    c_ = ca.repmat(ca.cos(PSI), 1, N_H); s_ = ca.repmat(ca.sin(PSI), 1, N_H)
    R_ = 1.2 * RG + 25.0
    BX = CGX + R_ * (c_ * gx - s_ * gy); BY = CGY + R_ * (s_ * gx + c_ * gy)
    # por perro: el peso de la guía (WD) es un parámetro, para que quien asigna los roles
    # pueda reforzarla en maniobras precisas (cruzar una puerta) sin regenerar el código
    WD = ca.MX.sym("wd", NP)
    detras = ca.mtimes(WD.T, ca.sum2((Yk[0::2, :] - BX) ** 2 + (Yk[1::2, :] - BY) ** 2) / 50.0 ** 2)
    # Tránsito: un perro lejos de su puesto paga por meterse en la zona del rebaño (radio
    # del grupo + 40), para que rodee en vez de atravesar y empujar en mala dirección.
    lejos_p = 1 - ca.exp(-((Yk[0::2, :] - BX) ** 2 + (Yk[1::2, :] - BY) ** 2) / 40.0 ** 2)
    d_g = ca.sqrt((Yk[0::2, :] - CGX) ** 2 + (Yk[1::2, :] - CGY) ** 2 + 1.0)
    invade = ca.fmax(0, (RG + 40.0) - d_g) / 40.0
    # por perro (WT): quien asigna los roles lo apaga para el perro que cruza una puerta,
    # porque la zona de su grupo puede cubrir justo la puerta por fuera
    WT = ca.MX.sym("wt", NP)
    transito = ca.mtimes(WT.T, ca.sum2(lejos_p * invade ** 2)) / (N_H * NP)
    # No molestar: el perro j paga por entrar en la zona de influencia (radio + 50) del
    # grupo de otro perro k, si es un grupo distinto del suyo (OTRO[j, k] = 1, lo decide el
    # asignador). Dos perros en el arco del mismo grupo trabajan juntos y no cuentan.
    OTRO = ca.MX.sym("otro", NP, NP)
    molesta = 0
    for j in range(NP):
        for k_ in range(NP):
            if j == k_:
                continue
            djk = ca.sqrt((Yk[2 * j, :] - CGX[k_, :]) ** 2 + (Yk[2 * j + 1, :] - CGY[k_, :]) ** 2 + 1.0)
            molesta = molesta + OTRO[j, k_] * ca.sumsqr(ca.fmax(0, RG[k_, :] + 50.0 - djk) / 50.0)
    molesta = molesta / (N_H * NP)
    W_DET = 0.3                 # peso normal de la guía (se pasa en WD)
    W_TRANS = 2.0
    W_MOL = W_MOL_DEF
    # Suavidad (move suppression): cambios de aceleración entre intervalos consecutivos del
    # plan, y del primero respecto a la que se está aplicando ahora (UPREV). El peso WDU es un
    # parámetro, para ajustarlo sin regenerar el código.
    UPREV = ca.MX.sym("uprev", 2 * NP); WDU = ca.MX.sym("wdu")
    dU = ca.horzcat(U[:, 0] - UPREV, U[:, 1:] - U[:, :-1])
    suave = WDU * ca.sumsqr(dU) / (N_H * NP)
    # Reunir: dispersión del rebaño (radio de giro de las superovejas al cuadrado) a lo largo
    # del horizonte y al final, en unidades de un rebaño de 80 en reposo (~25^2). El peso WREU
    # es un parámetro. Un rebaño junto se conduce mejor y no deja rezagadas.
    WREU = ca.MX.sym("wreu")
    disp_k = (radio ** 2 - 1.0) / 25.0 ** 2
    reunir = WREU * (ca.sum2(disp_k) / N_H + disp_k[-1])
    J = (reunir + suave + ca.sum2(seguir) / len(KS) + 2.0 * seguir[-1] + cerca + reparto + 0.2 * ca.sumsqr(U) / (N_H * NP)
         + detras / (N_H * NP) * (1 - ca.exp(-(ca.mtimes(wn.T, Dk[:, 0]) / 40.0) ** 2))
         + W_TRANS * transito + W_MOL * molesta)

    p = ca.vertcat(z0, w, ca.vec(GRP), PSI, ca.vec(GDIR), ca.vec(SEG), ACT, ca.vec(SEGP), ACTP, DMAP, WD, ca.vec(OTRO), WT, UPREV, WDU, WREU)
    fJg = ca.Function("mpc_coste", [u, p], [J, ca.gradient(J, u)], ["u", "p"], ["J", "g"])
    # la simulación del modelo reducido, por si hiciera falta en el navegador
    return fJg, p.numel()
