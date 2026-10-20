// Eliminación selectiva de armónicos por control óptimo, resuelta por el dual.
// Misma formulación y algoritmo que python/she.py (ahí está la derivación):
//   u_q(τ) = nivel de U que minimiza m(τ) u + L(u),  m(τ) = q·D(τ)
//   q maximiza h(q) = -q·x0 - ε|q|²/4 + ∫ψ(q·D)  (cóncava), con Newton regularizado.
// D(τ) = 2/π [cos(Ea τ); sin(Eb τ)] en [0, π]; simetría de media onda u(τ+π) = -u(τ).

const NM = 2000;                       // muestras para localizar las conmutaciones

/** Prepara un problema: harmónicos (Ea: cosenos, Eb: senos) y niveles (ordenados). */
export function problema(Ea, Eb, U) {
  U = [...U].sort((a, b) => a - b);
  const c = U.slice(0, -1).map((u, k) => u + U[k + 1]);       // umbrales de -m
  const H = [...Ea, ...Eb], n = H.length, na = Ea.length;
  // D en la rejilla de muestras, por filas
  const tau = Float64Array.from({ length: NM + 1 }, (_, i) => (Math.PI * i) / NM);
  const Dm = H.map((h, r) => tau.map((t) => (2 / Math.PI) * (r < na ? Math.cos(h * t) : Math.sin(h * t))));
  return { Ea, Eb, U, c, H, n, na, tau, Dm };
}

const D = (P, t) => P.H.map((h, r) => (2 / Math.PI) * (r < P.na ? Math.cos(h * t) : Math.sin(h * t)));
const Dp = (P, t) => P.H.map((h, r) => (2 / Math.PI) * (r < P.na ? -h * Math.sin(h * t) : h * Math.cos(h * t)));
const prim = (P, t) => P.H.map((h, r) => (2 / Math.PI) * (r < P.na ? Math.sin(h * t) / h : -Math.cos(h * t) / h));
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Índice del nivel óptimo para un valor de m: el primer umbral c_k con -m <= c_k. */
function nivel(P, m) {
  let k = 0; while (k < P.c.length && -m > P.c[k]) k++; return k;
}

/** Conmutaciones de u_q en [0, π] y nivel (valor) de cada tramo. */
export function conmutaciones(P, q) {
  const { tau, Dm, n } = P;
  const m = new Float64Array(NM + 1);
  for (let r = 0; r < n; r++) { const fila = Dm[r], qr = q[r]; if (qr) for (let i = 0; i <= NM; i++) m[i] += qr * fila[i]; }
  const mf = (t) => dot(q, D(P, t)), dmf = (t) => dot(q, Dp(P, t));
  // Puntos donde m es monótona entre uno y el siguiente: las muestras más los extremos de m
  // entre ellas. Sin los extremos, un pulso más estrecho que una muestra (justo cuando nace
  // o muere) pasaría entre dos de ellas sin verse.
  const T = [tau[0]], Mv = [m[0]];
  for (let i = 1; i <= NM; i++) {
    if (i < NM && (m[i] - m[i - 1]) * (m[i + 1] - m[i]) < 0) {
      let a = tau[i - 1], b = tau[i + 1], da = dmf(a);
      for (let it = 0; it < 60 && b - a > 1e-15; it++) { const x = 0.5 * (a + b), dx = dmf(x); if ((dx > 0) === (da > 0)) { a = x; da = dx; } else b = x; }
      const te = 0.5 * (a + b);
      if (te > T[T.length - 1] && te < tau[i]) { T.push(te); Mv.push(mf(te)); T.push(tau[i]); Mv.push(m[i]); }
      else if (te > tau[i] && te < tau[i + 1]) { T.push(tau[i]); Mv.push(m[i]); T.push(te); Mv.push(mf(te)); }
      else { T.push(tau[i]); Mv.push(m[i]); }
    } else { T.push(tau[i]); Mv.push(m[i]); }
  }
  const ts = [];
  let kPrev = nivel(P, Mv[0]);
  for (let i = 1; i < T.length; i++) {
    const k = nivel(P, Mv[i]);
    if (k === kPrev) continue;
    const [lo, hi] = k > kPrev ? [kPrev, k] : [k, kPrev];
    for (let kk = lo; kk < hi; kk++) {
      // raíz de m(τ) + c_kk en [T_{i-1}, T_i] (m monótona en el tramo): bisección
      const f = (t) => mf(t) + P.c[kk];
      let a = T[i - 1], b = T[i], fa = f(a);
      for (let it = 0; it < 60 && b - a > 1e-15; it++) {
        const x = 0.5 * (a + b), fx = f(x);
        if ((fx > 0) === (fa > 0)) { a = x; fa = fx; } else b = x;
      }
      ts.push(0.5 * (a + b));
    }
    kPrev = k;
  }
  ts.sort((a, b) => a - b);
  const bordes = [0, ...ts, Math.PI];
  const niveles = [];
  for (let s = 0; s < bordes.length - 1; s++) niveles.push(P.U[nivel(P, mf(0.5 * (bordes[s] + bordes[s + 1])))]);
  return { ts, niveles };
}

/** Coeficientes de Fourier [a(Ea), b(Eb)] de una onda escalonada (exactos). */
export function coeficientes(P, ts, niveles) {
  const bordes = [0, ...ts, Math.PI], g = new Float64Array(P.n);
  let Pa = prim(P, bordes[0]);
  for (let s = 0; s < niveles.length; s++) {
    const Pb = prim(P, bordes[s + 1]);
    for (let r = 0; r < P.n; r++) g[r] += niveles[s] * (Pb[r] - Pa[r]);
    Pa = Pb;
  }
  return g;
}

/** G(q) = ∫ D u_q, su jacobiano y ∫ψ(q·D). */
function evalua(P, q) {
  const { ts, niveles } = conmutaciones(P, q);
  const g = coeficientes(P, ts, niveles), n = P.n;
  const HG = Array.from({ length: n }, () => new Float64Array(n));
  ts.forEach((t, s) => {
    const d = D(P, t), mp = dot(q, Dp(P, t)), du = niveles[s] - niveles[s + 1];
    const w = -du / (Math.abs(mp) < 1e-12 ? 1e-12 : mp);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) HG[i][j] += w * d[i] * d[j];
  });
  const bordes = [0, ...ts, Math.PI];
  let L = 0; niveles.forEach((u, s) => { L += (bordes[s + 1] - bordes[s]) * u * u; });
  return { g, HG, ts, niveles, psi: dot(q, g) + L };
}

/** Resolución de A d = b (A simétrica definida positiva, pequeña) por Cholesky. */
function resuelveSPD(A, b) {
  const n = b.length, Lm = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
    if (i === j) { if (s <= 0) return null; Lm[i][i] = Math.sqrt(s); } else Lm[i][j] = s / Lm[j][j];
  }
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= Lm[i][k] * y[k]; y[i] = s / Lm[i][i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= Lm[k][i] * x[k]; x[i] = s / Lm[i][i]; }
  return x;
}

/**
 * Resuelve el problema para el objetivo x0 = [aT, bT]. q0: arranque (la solución anterior,
 * al mover un deslizador). Devuelve q, conmutaciones, niveles, residuo x(π), brecha de
 * dualidad (0 en el óptimo) e iteraciones.
 */
export function resuelve(P, x0, opciones = {}) {
  const r = resuelveEps(P, x0, opciones);
  if (Math.max(...r.residuo.map(Math.abs)) < 1e-4 || opciones.sinRescate) return r;
  // Rescate por continuación en ε: con ε grande el dual es más suave y Newton no se atasca en
  // sus pliegues; se baja ε arrancando cada vez de la solución anterior.
  let q = null, rc = null;
  for (const e of [1e-2, 1e-3, 1e-4, 1e-5, opciones.eps ?? 1e-6]) { rc = resuelveEps(P, x0, { ...opciones, eps: e, q0: q }); q = rc.q; }
  rc.iter += r.iter;
  const res = (x) => Math.max(...x.residuo.map(Math.abs));
  let mejor = res(rc) < res(r) ? rc : r;
  // Rescate por desplazamiento: justo donde nace o muere un pulso (dos conmutaciones que se
  // juntan) el dual tiene un pliegue en el que Newton se queda clavado. Un objetivo un poco
  // desplazado no cae en él; su solución sirve de arranque para el objetivo exacto.
  for (const d of [1e-3, -1e-3, 3e-3, -3e-3]) {
    if (res(mejor) < 1e-4) break;
    const xd = x0.map((v) => v * (1 + d));
    const rd = resuelveEps(P, xd, { ...opciones, q0: mejor.q });
    const rf = resuelveEps(P, x0, { ...opciones, q0: rd.q });
    rf.iter += mejor.iter + rd.iter;
    if (res(rf) < res(mejor)) mejor = rf;
  }
  return mejor;
}

function resuelveEps(P, x0, { eps = 1e-6, q0 = null, tol = 1e-11, maxit = 200 } = {}) {
  const n = P.n;
  let q;
  if (q0 && q0.length === n) q = Float64Array.from(q0);
  else {
    // q = 0 es un punto anguloso del dual: se arranca en la dirección de subida, -x0
    const nx = Math.hypot(...x0) || 1e-9;
    q = Float64Array.from(x0, (v, i) => -5 * v / nx + 1e-3 * Math.cos(i));
  }
  const h = (E, q) => -dot(q, x0) - (eps * dot(q, q)) / 4 + E.psi;
  let E = evalua(P, q), hq = h(E, q), mu = 1e-3, it = 0;
  for (; it < maxit; it++) {
    const grad = E.g.map((g, i) => g - x0[i] - (eps * q[i]) / 2);
    if (Math.hypot(...grad) < tol) break;
    const A = E.HG.map((fila, i) => fila.map((v, j) => -v + (i === j ? eps / 2 : 0)));
    let acepta = false;
    while (mu < 1e12) {
      const d = resuelveSPD(A.map((fila, i) => fila.map((v, j) => v + (i === j ? mu : 0))), grad);
      if (!d) { mu *= 4; continue; }
      const qn = q.map((v, i) => v + d[i]), En = evalua(P, qn), hn = h(En, qn);
      let dAd = 0; for (let i = 0; i < n; i++) dAd += d[i] * dot(A[i], d);
      const pred = dot(d, grad) - 0.5 * dAd, rho = pred > 0 ? (hn - hq) / pred : -1;
      if (rho > 1e-4) { q = qn; E = En; hq = hn; mu = Math.max(mu / 3, 1e-12); acepta = true; break; }
      mu *= 4;
    }
    if (!acepta) break;
  }
  const residuo = x0.map((v, i) => v - E.g[i]);
  const bordes = [0, ...E.ts, Math.PI];
  let L = 0; E.niveles.forEach((u, s) => { L += (bordes[s + 1] - bordes[s]) * u * u; });
  const primal = dot(residuo, residuo) + eps * L;
  return { q, ts: E.ts, niveles: E.niveles, residuo, brecha: primal - eps * hq, iter: it };
}

/** Amplitud de los armónicos impares 1..hmax de una onda escalonada (para el espectro). */
export function espectro(ts, niveles, hmax = 49) {
  const bordes = [0, ...ts, Math.PI], out = [];
  for (let h = 1; h <= hmax; h += 2) {
    let a = 0, b = 0;
    niveles.forEach((u, s) => {
      a += u * (Math.sin(h * bordes[s + 1]) - Math.sin(h * bordes[s]));
      b -= u * (Math.cos(h * bordes[s + 1]) - Math.cos(h * bordes[s]));
    });
    out.push({ h, a: (2 / (Math.PI * h)) * a, b: (2 / (Math.PI * h)) * b, amp: (2 / (Math.PI * h)) * Math.hypot(a, b) });
  }
  return out;
}
