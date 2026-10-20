// Planificador de rutas de los perros: un mapa de distancias hacia el puesto de cada perro
// en la rejilla, con las paredes como obstáculos y las zonas de los grupos (el suyo y los
// de otros perros) como terreno caro. El perro sigue la pendiente con un punto de paso por
// delante. Sustituye a las reglas sueltas (arcos, puerta, esquinas) por un solo mecanismo.
import { GX, GY, PASO_G } from "./constantes.js";
import { cortaPared, distSegmento } from "./mapa.js";

const VEC = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
             [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const nx = GX.length, ny = GY.length, N = nx * ny;
const idx = (i, j) => i + nx * j;

/** Precalcula, para unas paredes, qué celdas están libres y qué pasos entre celdas las cortan. */
export function preparaRejilla(seg, margen = 6) {
  const libre = new Uint8Array(N), bloq = new Uint8Array(N * 8);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    let ok = true;
    // margen para los perros: que la ruta no roce las esquinas (la puerta de 18 deja sitio)
    for (const s of seg) if (distSegmento(GX[i], GY[j], s) <= margen) { ok = false; break; }
    libre[idx(i, j)] = ok ? 1 : 0;
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    VEC.forEach(([di, dj], v) => {
      const a = i + di, b = j + dj;
      if (a < 0 || a >= nx || b < 0 || b >= ny) { bloq[idx(i, j) * 8 + v] = 1; return; }
      bloq[idx(i, j) * 8 + v] = cortaPared(GX[i], GY[j], GX[a], GY[b], seg) ? 1 : 0;
    });
  }
  return { libre, bloq, seg };
}

const celda = (x, y) => [Math.min(nx - 1, Math.max(0, Math.round((x - GX[0]) / PASO_G))),
                         Math.min(ny - 1, Math.max(0, Math.round((y - GY[0]) / PASO_G)))];

/**
 * Siguiente punto de paso del perro (yx, yy) hacia (gx, gy). zonas: [{x, y, R, peso}]
 * (atravesar el interior cuesta más, hasta (1 + peso) veces en el centro).
 * Devuelve null si el perro puede ir en línea recta sin cortar paredes ni zonas.
 */
export function puntoDeRuta(rej, yx, yy, gx, gy, zonas, avance = 8) {
  const recta = !cortaPared(yx, yy, gx, gy, rej.seg) && zonas.every((z) => distSegmento(z.x, z.y, [yx, yy, gx, gy]) > z.R);
  if (recta) return null;
  // coste de pisar cada celda (zonas), solo donde hace falta
  const pen = (k) => {
    const x = GX[k % nx], y = GY[(k / nx) | 0]; let c = 1;
    for (const z of zonas) { const d = Math.hypot(x - z.x, y - z.y); if (d < z.R) c += z.peso * (1 - d / z.R) ** 2; }
    return c;
  };
  const D = new Float64Array(N).fill(Infinity);
  const [gi, gj] = celda(gx, gy), [si, sj] = celda(yx, yy);
  const objetivo = idx(si, sj);
  D[idx(gi, gj)] = 0;
  const cola = [[0, gi, gj]];
  const push = (e) => { cola.push(e); let k = cola.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (cola[k][0] < cola[p][0]) { [cola[k], cola[p]] = [cola[p], cola[k]]; k = p; } else break; } };
  const pop = () => { const top = cola[0], ult = cola.pop(); if (cola.length) { cola[0] = ult; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < cola.length && cola[l][0] < cola[m][0]) m = l; if (r < cola.length && cola[r][0] < cola[m][0]) m = r; if (m === k) break; [cola[k], cola[m]] = [cola[m], cola[k]]; k = m; } } return top; };
  while (cola.length) {
    const [d, i, j] = pop(), k = idx(i, j);
    if (d > D[k]) continue;
    if (k === objetivo) break;                         // basta con llegar a la celda del perro
    for (let v = 0; v < 8; v++) {
      if (rej.bloq[k * 8 + v]) continue;
      const [di, dj, c] = VEC[v], a = i + di, b = j + dj, ka = idx(a, b);
      if (!rej.libre[ka] && ka !== objetivo) continue;
      const nd = d + c * PASO_G * pen(ka);
      if (nd < D[ka]) { D[ka] = nd; push([nd, a, b]); }
    }
  }
  if (!Number.isFinite(D[objetivo])) return [gx, gy];
  // bajar por la pendiente desde la celda del perro unos pasos (descenso discreto) y quedarse
  // con el punto más lejano que el perro ve en línea recta: si no, el MPC tiraría en recta
  // hacia un punto tras una esquina y el perro empujaría contra la pared
  let ci = si, cj = sj, visto = null;
  for (let paso = 0; paso < avance; paso++) {
    let mejor = -1, md = D[idx(ci, cj)];
    VEC.forEach(([di, dj], v) => {
      if (rej.bloq[idx(ci, cj) * 8 + v]) return;
      const a = ci + di, b = cj + dj; const dd = D[idx(a, b)];
      if (dd < md) { md = dd; mejor = v; }
    });
    if (mejor < 0) break;
    ci += VEC[mejor][0]; cj += VEC[mejor][1];
    if (holgado(yx, yy, GX[ci], GY[cj], rej.seg) && rej.libre[idx(ci, cj)]) visto = [GX[ci], GY[cj]];
    if (md === 0) break;
  }
  return visto || [GX[ci], GY[cj]];
}

/** Recta sin cortar paredes ni rozar sus extremos (el perro se quedaría atascado en la esquina). */
function holgado(x0, y0, x1, y1, seg) {
  if (cortaPared(x0, y0, x1, y1, seg)) return false;
  for (const [ax, ay, bx, by] of seg) {
    if (distSegmento(ax, ay, [x0, y0, x1, y1]) < 3 || distSegmento(bx, by, [x0, y0, x1, y1]) < 3) return false;
  }
  return true;
}

/**
 * Mapa de distancias completo hacia (gx, gy) con una rejilla precalculada (rápido: no
 * comprueba paredes por paso). Mismo relleno de celdas bloqueadas que geodesica().
 */
export function mapaHacia(rej, gx, gy) {
  const D = new Float64Array(N).fill(Infinity);
  const [gi, gj] = celda(gx, gy);
  D[idx(gi, gj)] = 0;
  const cola = [[0, gi, gj]];
  const push = (e) => { cola.push(e); let k = cola.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (cola[k][0] < cola[p][0]) { [cola[k], cola[p]] = [cola[p], cola[k]]; k = p; } else break; } };
  const pop = () => { const top = cola[0], ult = cola.pop(); if (cola.length) { cola[0] = ult; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < cola.length && cola[l][0] < cola[m][0]) m = l; if (r < cola.length && cola[r][0] < cola[m][0]) m = r; if (m === k) break; [cola[k], cola[m]] = [cola[m], cola[k]]; k = m; } } return top; };
  while (cola.length) {
    const [d, i, j] = pop(), k = idx(i, j);
    if (d > D[k]) continue;
    for (let v = 0; v < 8; v++) {
      if (rej.bloq[k * 8 + v]) continue;
      const [di, dj, c] = VEC[v], ka = idx(i + di, j + dj);
      if (!rej.libre[ka]) continue;
      const nd = d + c * PASO_G;
      if (nd < D[ka]) { D[ka] = nd; push([nd, i + di, j + dj]); }
    }
  }
  let maxv = 0; for (const v of D) if (Number.isFinite(v) && v > maxv) maxv = v;
  let Dm = D.map((v) => (Number.isFinite(v) ? v : maxv));
  for (let pasada = 0; pasada < 3; pasada++) {
    const nuevo = new Float64Array(N);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const k = idx(i, j);
      if (Number.isFinite(D[k])) { nuevo[k] = D[k]; continue; }
      const v = (ii, jj) => Dm[idx(Math.min(nx - 1, Math.max(0, ii)), Math.min(ny - 1, Math.max(0, jj)))];
      nuevo[k] = (v(i - 1, j) + v(i + 1, j) + v(i, j - 1) + v(i, j + 1)) / 4;
    }
    Dm = nuevo;
  }
  return Dm;
}
