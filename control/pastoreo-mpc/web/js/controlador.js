// El controlador: de 80 ovejas a 10 superovejas, reparto de tareas entre perros con
// recolocación por arco, y el MPC resuelto con gradiente proyectado espectral (SPG) sobre
// el coste compilado a WebAssembly. Réplica de python/valida.py (reduce, grupos_de,
// asigna, punto_de_paso, spg) para que las dos versiones se puedan comparar.
import { M, NP, N_H, NU, NZ, NSEG, NSEGP, A_MAX, GX, GY, W_DET_NORMAL } from "./constantes.js";
import { muestrea, distSegmento, cortaPared } from "./mapa.js";
import { puntoDeRuta } from "./rutas.js";

// --- coste (WebAssembly) --------------------------------------------------------------
export async function cargaCoste(crearModulo) {
  const m = await crearModulo();
  if (m._mpc_init() !== 0) throw new Error("mpc_init");
  const NPAR = NZ + M + M * NP + NP + 2 * NP + 4 * NSEG + NSEG + 4 * NSEGP + NSEGP + GX.length * GY.length + NP + NP * NP + NP + 2 * NP + 2;
  const pu = m._malloc(8 * NU), pp = m._malloc(8 * NPAR), pJ = m._malloc(8), pg = m._malloc(8 * NU);
  let evals = 0;
  return {
    NPAR,
    fijaParametros(p) { m.HEAPF64.set(p, pp / 8); },
    /** J y gradiente en u (los parámetros, los últimos fijados). */
    evalua(u) {
      m.HEAPF64.set(u, pu / 8);
      m._mpc_eval(pu, pp, pJ, pg);
      evals++;
      return [m.HEAPF64[pJ / 8], m.HEAPF64.slice(pg / 8, pg / 8 + NU)];
    },
    get evals() { return evals; },
  };
}

// --- SPG ------------------------------------------------------------------------------
function proyecta(x) {
  const y = new Float64Array(x.length);
  for (let k = 0; k < x.length; k += 2) {
    const n = Math.max(1, Math.hypot(x[k], x[k + 1]));
    y[k] = x[k] / n; y[k + 1] = x[k + 1] / n;
  }
  return y;
}
const finito = (v) => v.every(Number.isFinite);
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/** Birgin-Martínez-Raydan (2000), como spg() en Python. */
export function spg(coste, x0, iters = 30, memoria = 8, gamma = 1e-4) {
  let x = proyecta(x0);
  let [f, g] = coste.evalua(x);
  if (!(Number.isFinite(f) && finito(g))) { x = new Float64Array(x.length); [f, g] = coste.evalua(x); }
  const hist = [f];
  let maxd = 0; { const p = proyecta(x.map((v, i) => v - g[i])); for (let i = 0; i < x.length; i++) maxd = Math.max(maxd, Math.abs(p[i] - x[i])); }
  let alfa = 1 / Math.max(1e-8, maxd);
  for (let it = 0; it < iters; it++) {
    const p = proyecta(x.map((v, i) => v - alfa * g[i]));
    const d = p.map((v, i) => v - x[i]);
    if (d.every((v) => Math.abs(v) < 1e-7)) break;
    const gd = dot(g, d), fref = Math.max(...hist.slice(-memoria));
    let lam = 1, ok = false, xn, fn, gn;
    while (lam >= 1e-4) {
      xn = x.map((v, i) => v + lam * d[i]);
      [fn, gn] = coste.evalua(xn);
      if (Number.isFinite(fn) && finito(gn) && fn <= fref + gamma * lam * gd) { ok = true; break; }
      lam *= 0.5;
    }
    if (!ok) break;
    const s = xn.map((v, i) => v - x[i]), yv = gn.map((v, i) => v - g[i]);
    const sy = dot(s, yv);
    alfa = sy > 0 ? Math.min(1e6, Math.max(1e-6, dot(s, s) / sy)) : 1e6;
    x = xn; f = fn; g = gn; hist.push(f);
  }
  return [x, f];
}

// --- reducción a superovejas ------------------------------------------------------------
/** X, V de las ovejas que siguen fuera (Float64Array 2n). Devuelve centros, peso, Vc. */
export function reduce(X, V, centros) {
  const n = X.length / 2;
  const et = new Int32Array(n);
  const asigna_ = () => {
    for (let i = 0; i < n; i++) {
      let mj = 0, md = Infinity;
      for (let j = 0; j < M; j++) {
        const d = (X[2 * i] - centros[2 * j]) ** 2 + (X[2 * i + 1] - centros[2 * j + 1]) ** 2;
        if (d < md) { md = d; mj = j; }
      }
      et[i] = mj;
    }
  };
  for (let rep = 0; rep < 8; rep++) {
    asigna_();
    const sx = new Float64Array(M), sy = new Float64Array(M), cnt = new Float64Array(M);
    for (let i = 0; i < n; i++) { sx[et[i]] += X[2 * i]; sy[et[i]] += X[2 * i + 1]; cnt[et[i]]++; }
    for (let j = 0; j < M; j++) if (cnt[j]) { centros[2 * j] = sx[j] / cnt[j]; centros[2 * j + 1] = sy[j] / cnt[j]; }
    for (let j = 0; j < M; j++) {
      if (cnt[j] || n <= M) continue;
      let mi = 0, mv = -1;                    // grupo vacío: a la oveja más aislada
      for (let i = 0; i < n; i++) {
        let md = Infinity;
        for (let q = 0; q < M; q++) md = Math.min(md, (X[2 * i] - centros[2 * q]) ** 2 + (X[2 * i + 1] - centros[2 * q + 1]) ** 2);
        if (md > mv) { mv = md; mi = i; }
      }
      centros[2 * j] = X[2 * mi]; centros[2 * j + 1] = X[2 * mi + 1];
    }
  }
  asigna_();
  const peso = new Float64Array(M), Vc = new Float64Array(2 * M);
  for (let i = 0; i < n; i++) { peso[et[i]]++; Vc[2 * et[i]] += V[2 * i]; Vc[2 * et[i] + 1] += V[2 * i + 1]; }
  for (let j = 0; j < M; j++) {
    if (peso[j]) { Vc[2 * j] /= peso[j]; Vc[2 * j + 1] /= peso[j]; }
    peso[j] = Math.max(peso[j], 1e-3);
  }
  return { centros, peso, Vc };
}

// --- coordinación ----------------------------------------------------------------------
/** Interruptor de «no molestar» (para compararlo encendido y apagado). */
export const MOLESTAR = { activo: true };
export function gruposDe(centros, peso, enlace = 35) {
  const vivos = []; for (let j = 0; j < M; j++) if (peso[j] > 0.5) vivos.push(j);
  const etiq = new Map();
  for (const i of vivos) {
    if (etiq.has(i)) continue;
    etiq.set(i, i); const pila = [i];
    while (pila.length) {
      const a = pila.pop();
      for (const b of vivos) {
        if (!etiq.has(b) && Math.hypot(centros[2 * a] - centros[2 * b], centros[2 * a + 1] - centros[2 * b + 1]) < enlace) {
          etiq.set(b, i); pila.push(b);
        }
      }
    }
  }
  const g = new Map();
  for (const [i, r] of etiq) { if (!g.has(r)) g.set(r, []); g.get(r).push(i); }
  return [...g.values()];
}

function centroRadio(centros, peso, miembros) {
  let W = 0; for (const i of miembros) W += peso[i];
  let cx = 0, cy = 0; for (const i of miembros) { cx += peso[i] / W * centros[2 * i]; cy += peso[i] / W * centros[2 * i + 1]; }
  let v = 0; for (const i of miembros) v += peso[i] / W * ((centros[2 * i] - cx) ** 2 + (centros[2 * i + 1] - cy) ** 2);
  const r = Math.sqrt(v + 1);
  return { cx, cy, r, R: 1.2 * r + 25 };
}

function puesto(centros, peso, miembros, psi, mapa) {
  const { cx, cy, r, R } = centroRadio(centros, peso, miembros);
  let gx = muestrea(mapa.gx, cx, cy), gy = muestrea(mapa.gy, cx, cy);
  const n = Math.hypot(gx, gy) + 1e-6; gx /= n; gy /= n;
  const c = Math.cos(psi), s = Math.sin(psi);
  return { px: cx + R * (c * gx - s * gy), py: cy + R * (s * gx + c * gy), gx, gy };
}

function* permutaciones(n, k, pref = []) {
  if (pref.length === k) { yield pref; return; }
  for (let i = 0; i < n; i++) if (!pref.includes(i)) yield* permutaciones(n, k, [...pref, i]);
}

/**
 * Sacar el rebaño del corral. Entra UN perro (el más cercano a la puerta, o el que ya está
 * dentro): su puesto, detrás de todas las ovejas de dentro, en el lado opuesto a la puerta;
 * su ruta rodea el rebaño con una zona amplia, así que bordea por la pared en vez de ir
 * hacia ellas y aplastarlas contra el fondo. Los otros dos esperan fuera, a los lados de la
 * puerta, sin taponarla, para recoger a las que salen. Sobrescribe los roles de `asig`.
 */
function maniobraSacar(centros, peso, Y, corral, rejilla, asig) {
  const [x0, x1, y0, y1] = corral.caja, [ax, ay, bx, by] = corral.puerta;
  const enCaja = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
  const dentro = []; for (let i = 0; i < M; i++) if (peso[i] > 0.5 && enCaja(centros[2 * i], centros[2 * i + 1])) dentro.push(i);
  if (!dentro.length) return;
  const { cx, cy, r, R } = centroRadio(centros, peso, dentro);
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  let nx = -(by - ay), ny = bx - ax; const nn = Math.hypot(nx, ny); nx /= nn; ny /= nn;
  if (nx * (mx - (x0 + x1) / 2) + ny * (my - (y0 + y1) / 2) < 0) { nx = -nx; ny = -ny; }   // hacia fuera
  const tx = -ny, ty = nx;
  // puesto del que entra: detrás del rebaño respecto a la puerta, dentro del corral
  let ux = cx - (mx - 18 * nx), uy = cy - (my - 18 * ny); const un = Math.hypot(ux, uy) + 1e-9; ux /= un; uy /= un;
  const puesto = [Math.min(x1 - 10, Math.max(x0 + 10, cx + (r + 25) * ux)), Math.min(y1 - 10, Math.max(y0 + 10, cy + (r + 25) * uy))];
  // el que entra: el que ya esté dentro y, si no, el más cercano a la puerta
  let j0 = -1;
  for (let j = 0; j < NP; j++) if (enCaja(Y[2 * j], Y[2 * j + 1])) { j0 = j; break; }
  if (j0 < 0) { let bd = Infinity; for (let j = 0; j < NP; j++) { const d = Math.hypot(Y[2 * j] - (mx + 18 * nx), Y[2 * j + 1] - (my + 18 * ny)); if (d < bd) { bd = d; j0 = j; } } }
  const col = (j, punto, fuerte) => {
    for (let i = 0; i < M; i++) asig.G[i + M * j] = 0;
    let W = 0; for (const i of dentro) W += peso[i];
    for (const i of dentro) asig.G[i + M * j] = peso[i] / W;
    asig.psi[j] = 0; asig.gdir[2 * j] = (punto[0] - cx) / R; asig.gdir[2 * j + 1] = (punto[1] - cy) / R;
    asig.wd[j] = fuerte ? 10 * W_DET_NORMAL : W_DET_NORMAL; asig.wt[j] = fuerte ? 0 : 1;
    for (let q = 0; q < NP; q++) asig.otro[j + NP * q] = 0;
  };
  const wp = rejilla ? puntoDeRuta(rejilla, Y[2 * j0], Y[2 * j0 + 1], puesto[0], puesto[1], [{ x: cx, y: cy, R: r + 45, peso: 10 }]) : null;
  col(j0, wp || puesto, true);
  // Mientras va en ruta, la guía se impone: entrar empuja al rebaño hacia el fondo y, en el
  // horizonte de 50, eso sube el coste; que haga falta para ponerse detrás queda fuera de su vista.
  if (wp) asig.wd[j0] = 50 * W_DET_NORMAL;
  asig.roles[j0] = { ...asig.roles[j0], destino: wp || puesto, arco: !!wp, sacar: "entra" };
  // Los demás: mientras la mayoría siga dentro, esperan fuera a los lados de la puerta;
  // después, llevan al destino a las que ya han salido (su papel normal), salvo que ese
  // papel sea también entrar en el corral: entonces esperan.
  let Wd = 0, Wt = 0; for (let i = 0; i < M; i++) if (peso[i] > 0.5) { Wt += peso[i]; if (dentro.includes(i)) Wd += peso[i]; }
  const mayoriaDentro = Wd > Wt / 2;
  const esperas = [[mx + 70 * nx + 45 * tx, my + 70 * ny + 45 * ty], [mx + 70 * nx - 45 * tx, my + 70 * ny - 45 * ty]];
  const otros = []; for (let j = 0; j < NP; j++) if (j !== j0) otros.push(j);
  const d = (j, e) => Math.hypot(Y[2 * j] - e[0], Y[2 * j + 1] - e[1]);
  if (otros.length === 2 && d(otros[0], esperas[1]) + d(otros[1], esperas[0]) < d(otros[0], esperas[0]) + d(otros[1], esperas[1])) esperas.reverse();
  otros.forEach((j, k) => {
    const suyo = []; for (let i = 0; i < M; i++) if (asig.G[i + M * j] > 0) suyo.push(i);
    const suyoDentro = suyo.some((i) => dentro.includes(i));
    if (!mayoriaDentro && suyo.length && !suyoDentro) return;      // sigue con su grupo de fuera
    const e = [Math.max(-275, Math.min(275, esperas[k][0])), Math.max(-195, Math.min(195, esperas[k][1]))];
    const w = rejilla ? puntoDeRuta(rejilla, Y[2 * j], Y[2 * j + 1], e[0], e[1], []) : null;
    col(j, w || e, !!w);
    asig.roles[j] = { ...asig.roles[j], destino: w || e, arco: !!w, sacar: "espera" };
  });
}

/** Reparto de tareas (asigna() de Python). previa: puestos del paso anterior o null. */
export function asigna(centros, peso, Y, previa, mapa, seg, corral = null, compromiso = null, obj = null, rejilla = null, sacando = false, suaves = null) {
  const grupos = gruposDe(centros, peso);
  const cent = grupos.map((g) => { let mx = 0, my = 0; for (const i of g) { mx += centros[2 * i]; my += centros[2 * i + 1]; } return [mx / g.length, my / g.length]; });
  const prio = grupos.map((g, gi) => {
    let s = 0; for (const i of g) s += peso[i];
    let p = s * (1 + muestrea(mapa.D, cent[gi][0], cent[gi][1]) / 100);
    // encerrados: con una pared del corral entre el grupo y el destino (los más difíciles,
    // y nadie más los va a sacar)
    if (corral && obj && cortaPared(cent[gi][0], cent[gi][1], obj[0], obj[1], corral.seg)) p *= 3;
    return p;
  });
  // argsort ascendente estable y al revés, como np.argsort(prio)[::-1]
  const orden = prio.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[1]).reverse();
  const slots = orden.slice(0, NP).map((gi) => [gi, 0.0]);
  for (const e of [[orden[0], -0.6], [orden[0], 0.6], [orden[0], -1.0], [orden[0], 1.0]]) {
    if (slots.length >= NP) break;
    slots.push(e);
  }
  const pts = slots.map(([gi, ps]) => puesto(centros, peso, grupos[gi], ps, mapa));
  const coste = (perm) => perm.reduce((s, i, j) => s + Math.hypot(Y[2 * j] - pts[i].px, Y[2 * j + 1] - pts[i].py), 0);
  let mejor = null, cm = Infinity;
  for (const perm of permutaciones(slots.length, NP)) { const c = coste(perm); if (c < cm) { cm = c; mejor = perm; } }
  // compromiso de puerta: el perro que cruzaba por un grupo lo mantiene mientras exista
  let fijo = null;
  if (compromiso) {
    let gi = -1, bd = 60;
    grupos.forEach((g, i) => { const d = Math.hypot(cent[i][0] - compromiso.c[0], cent[i][1] - compromiso.c[1]); if (d < bd) { bd = d; gi = i; } });
    const si = slots.findIndex(([g]) => g === gi);
    if (si >= 0) fijo = { j: compromiso.j, si };
  }
  if (fijo) {
    let mb = null, cb = Infinity;
    for (const perm of permutaciones(slots.length, NP)) { if (perm[fijo.j] !== fijo.si) continue; const c = coste(perm); if (c < cb) { cb = c; mb = perm; } }
    if (mb) mejor = mb;
  } else if (previa) {
    const cont = [];
    for (let j = 0; j < NP; j++) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (cont.includes(i)) continue;
        const d = Math.hypot(pts[i].px - previa[j][0], pts[i].py - previa[j][1]);
        if (d < bd) { bd = d; bi = i; }
      }
      cont.push(bi);
    }
    if (coste(cont) <= 1.2 * coste(mejor)) mejor = cont;
  }
  const G = new Float64Array(M * NP), psi = new Float64Array(NP), gdir = new Float64Array(2 * NP);
  // peso de la guía de cada perro: el normal, y diez veces más mientras cruza una puerta
  const wd = new Float64Array(NP).fill(W_DET_NORMAL);
  // otro[j + NP*k] = 1 si el perro k lleva un grupo distinto del de j (orden columna)
  const otro = new Float64Array(NP * NP);
  const wt = new Float64Array(NP).fill(1);    // peso del tránsito de cada perro
  mejor.forEach((i, j) => mejor.forEach((i2, k) => { if (j !== k && slots[i][0] !== slots[i2][0]) otro[j + NP * k] = MOLESTAR.activo ? 1 : 0; }));
  const roles = [], enRuta = [];
  mejor.forEach((i, j) => {
    const [gi, ps] = slots[i], mi = grupos[gi];
    let W = 0; for (const q of mi) W += peso[q];
    for (const q of mi) G[q + M * j] = peso[q] / W;            // columna j (orden F)
    psi[j] = ps; gdir[2 * j] = pts[i].gx; gdir[2 * j + 1] = pts[i].gy;
    const { cx, cy, r, R } = centroRadio(centros, peso, mi);
    // el puesto no puede quedar al otro lado de una pared respecto a su grupo (p. ej. con
    // el grupo arrinconado): se acerca al grupo hasta justo antes de la pared
    if (corral && cortaPared(cx, cy, pts[i].px, pts[i].py, corral.seg)) {
      let lo = 0, hi = 1;
      for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2; if (cortaPared(cx, cy, cx + m * (pts[i].px - cx), cy + m * (pts[i].py - cy), corral.seg)) hi = m; else lo = m; }
      const L = Math.hypot(pts[i].px - cx, pts[i].py - cy), t = Math.max(0, lo - 8 / Math.max(L, 1e-9));
      pts[i] = { ...pts[i], px: cx + t * (pts[i].px - cx), py: cy + t * (pts[i].py - cy) };
    }
    // ni fuera del campo
    const dest = [Math.max(-275, Math.min(275, pts[i].px)), Math.max(-195, Math.min(195, pts[i].py))];
    // ruta: si no puede ir recto (pared, la zona de su grupo o la de otro perro), sigue el
    // mapa de distancias hacia su puesto; el MPC ve como puesto el siguiente punto de paso
    let wp = null;
    if (rejilla) {
      // su grupo: solo el cuerpo del rebaño (no cruzarlo por el medio); su puesto, a 1,2r + 25
      // del centro, tiene que quedar fuera de la zona o el perro estaría siempre «en ruta»
      const zonas = [{ x: cx, y: cy, R: r + 15, peso: 6 }];
      mejor.forEach((i2, k) => {
        if (k === j || slots[i2][0] === gi) return;
        const o = centroRadio(centros, peso, grupos[slots[i2][0]]);
        zonas.push({ x: o.cx, y: o.cy, R: o.r + 50, peso: 4 });
      });
      wp = puntoDeRuta(rejilla, Y[2 * j], Y[2 * j + 1], dest[0], dest[1], zonas);
    }
    if (!wp && (dest[0] !== pts[i].px || dest[1] !== pts[i].py)) wp = dest;
    if (wp) {
      psi[j] = 0; gdir[2 * j] = (wp[0] - cx) / R; gdir[2 * j + 1] = (wp[1] - cy) / R;
      // Si lo que hay en medio es una pared (puerta, esquina), maniobra precisa: guía fuerte
      // y sin evitar zonas (el planificador ya las rodea). Si es solo rodear el rebaño en
      // campo abierto, el punto de paso basta y el MPC sigue con sus términos normales.
      if (cortaPared(Y[2 * j], Y[2 * j + 1], dest[0], dest[1], seg)) {
        wd[j] = 10 * W_DET_NORMAL; wt[j] = 0; enRuta.push(j);
      }
    }
    roles.push({ cr: { cx, cy, R }, cx, cy, rg: r, grupo: gi, psi: ps, arco: !!wp, destino: wp || dest });
  });
  if (sacando && corral) maniobraSacar(centros, peso, Y, corral, rejilla, { G, psi, gdir, wd, wt, otro, roles });
  // compromiso: el perro que lleva un grupo encerrado (pared entre el grupo y el destino)
  // lo mantiene mientras siga encerrado, aunque cambien las prioridades
  const encerrado = (gi) => corral && obj && cortaPared(cent[gi][0], cent[gi][1], obj[0], obj[1], corral.seg);
  let nuevoCompromiso = null;
  mejor.forEach((i, j) => { if (!nuevoCompromiso && encerrado(slots[i][0])) nuevoCompromiso = { j, c: cent[slots[i][0]] }; });
  // Suavizado de los puntos de referencia: el punto al que va cada perro se mueve como mucho
  // la mitad del salto entre una decisión y la siguiente; un salto muy grande (cambio de
  // tarea) se acepta de golpe. Se recalcula el puesto que ve el MPC a partir del punto filtrado.
  if (suaves) {
    for (let j = 0; j < NP; j++) {
      let W = 0, cx = 0, cy = 0;
      for (let i = 0; i < M; i++) { const g = G[i + M * j]; W += g; cx += g * centros[2 * i]; cy += g * centros[2 * i + 1]; }
      if (W <= 0) continue;
      let v = 0; for (let i = 0; i < M; i++) { const g = G[i + M * j]; v += g * ((centros[2 * i] - cx) ** 2 + (centros[2 * i + 1] - cy) ** 2); }
      const R = 1.2 * Math.sqrt(v + 1) + 25;
      const c = Math.cos(psi[j]), sn = Math.sin(psi[j]);
      let px = cx + R * (c * gdir[2 * j] - sn * gdir[2 * j + 1]), py = cy + R * (sn * gdir[2 * j] + c * gdir[2 * j + 1]);
      const prev = suaves[j];
      if (prev && Math.hypot(px - prev[0], py - prev[1]) < 60) { px = prev[0] + 0.5 * (px - prev[0]); py = prev[1] + 0.5 * (py - prev[1]); }
      suaves[j] = [px, py];
      psi[j] = 0; gdir[2 * j] = (px - cx) / R; gdir[2 * j + 1] = (py - cy) / R;
      roles[j] = { ...roles[j], destino: [px, py] };
    }
  }
  // el que sigue una ruta no evita zonas en el MPC: ya lo hace el planificador
  for (const j of enRuta) for (let q = 0; q < NP; q++) otro[j + NP * q] = 0;
  return { compromiso: nuevoCompromiso, G, psi, gdir, wd, otro, wt, previa: mejor.map((i) => [pts[i].px, pts[i].py]), roles, nGrupos: grupos.length };
}

/** Vector de parámetros en el orden de modelo_mpc.py. */
export function empaqueta(NPAR, red, Y, W, asig, segv, actv, segpv, actpv, mapaD, uprev, wdu, wreu = 0) {
  const p = new Float64Array(NPAR); let o = 0;
  const pon = (arr) => { p.set(arr, o); o += arr.length; };
  pon(red.centros); pon(red.Vc); pon(Y); pon(W);                // z0
  pon(red.peso); pon(asig.G); pon(asig.psi); pon(asig.gdir);
  pon(segv); pon(actv); pon(segpv); pon(actpv); pon(mapaD); pon(asig.wd); pon(asig.otro); pon(asig.wt); pon(uprev); pon([wdu]); pon([wreu]);
  if (o !== NPAR) throw new Error(`parámetros: ${o} != ${NPAR}`);
  return p;
}

/** Paredes en el formato del coste: vec(SEG) NSEG x 4 en orden columna, y activas. */
export function paredesParametro(lista, n) {
  const s = new Float64Array(4 * n), a = new Float64Array(n);
  lista.forEach((q, i) => { for (let c = 0; c < 4; c++) s[i + n * c] = q[c]; a[i] = 1; });
  return [s, a];
}

export { A_MAX, N_H, NP };
