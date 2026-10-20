// Mapa de distancias al destino «por el camino», rodeando paredes (Dijkstra en la rejilla).
// Réplica de geodesica() de python/valida.py: celdas a menos de 0,45 de celda de una pared
// bloqueadas, pasos entre celdas que cortan una pared prohibidos, y las celdas sin valor
// rellenadas con la media de sus vecinas para que la B-spline del coste no salte.
import { GX, GY, PASO_G } from "./constantes.js";

const VEC = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
             [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

const signo = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const orient = (ax, ay, bx, by, cx, cy) => signo((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

/** ¿El segmento P-Q corta alguna pared? */
export function cortaPared(px, py, qx, qy, seg) {
  for (const [xa, ya, xb, yb] of seg) {
    if (orient(px, py, qx, qy, xa, ya) !== orient(px, py, qx, qy, xb, yb)
      && orient(xa, ya, xb, yb, px, py) !== orient(xa, ya, xb, yb, qx, qy)) return true;
  }
  return false;
}

export function distSegmento(px, py, [xa, ya, xb, yb]) {
  const abx = xb - xa, aby = yb - ya;
  let t = ((px - xa) * abx + (py - ya) * aby) / (abx * abx + aby * aby);
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(px - (xa + t * abx), py - (ya + t * aby));
}

/** Devuelve el mapa como Float64Array de nx*ny en orden «x primero» (el de DMAP). */
export function geodesica(seg, obj) {
  const nx = GX.length, ny = GY.length, N = nx * ny;
  const idx = (i, j) => i + nx * j;
  const libre = new Uint8Array(N);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    let ok = true;
    for (const s of seg) if (distSegmento(GX[i], GY[j], s) <= PASO_G * 0.45) { ok = false; break; }
    libre[idx(i, j)] = ok ? 1 : 0;
  }
  const D = new Float64Array(N).fill(Infinity);
  const i0 = Math.round((obj[0] - GX[0]) / PASO_G), j0 = Math.round((obj[1] - GY[0]) / PASO_G);
  D[idx(i0, j0)] = 0;
  const cola = new Monticulo();
  cola.push(0, i0, j0);
  while (cola.n) {
    const [d, i, j] = cola.pop();
    if (d > D[idx(i, j)]) continue;
    for (const [di, dj, c] of VEC) {
      const a = i + di, b = j + dj;
      if (a < 0 || a >= nx || b < 0 || b >= ny || !libre[idx(a, b)]) continue;
      const nd = d + c * PASO_G;
      if (nd >= D[idx(a, b)]) continue;
      if (cortaPared(GX[i], GY[j], GX[a], GY[b], seg)) continue;
      D[idx(a, b)] = nd;
      cola.push(nd, a, b);
    }
  }
  // relleno de las celdas sin valor (paredes): media de las 4 vecinas, 3 pasadas
  let maxv = 0;
  for (const v of D) if (Number.isFinite(v) && v > maxv) maxv = v;
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

/** Gradiente como np.gradient(D, GX, GY): centrado dentro, de un lado en los bordes. */
export function gradiente(D) {
  const nx = GX.length, ny = GY.length;
  const gx = new Float64Array(nx * ny), gy = new Float64Array(nx * ny);
  const idx = (i, j) => i + nx * j;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const k = idx(i, j);
    gx[k] = i === 0 ? (D[idx(1, j)] - D[k]) / PASO_G : i === nx - 1 ? (D[k] - D[idx(i - 1, j)]) / PASO_G
      : (D[idx(i + 1, j)] - D[idx(i - 1, j)]) / (2 * PASO_G);
    gy[k] = j === 0 ? (D[idx(i, 1)] - D[k]) / PASO_G : j === ny - 1 ? (D[k] - D[idx(i, j - 1)]) / PASO_G
      : (D[idx(i, j + 1)] - D[idx(i, j - 1)]) / (2 * PASO_G);
  }
  return [gx, gy];
}

/** Interpolación bilineal de una tabla de la rejilla (como muestrea() en Python). */
export function muestrea(A, x, y) {
  const nx = GX.length, ny = GY.length;
  const fx = Math.min(nx - 1.001, Math.max(0, (x - GX[0]) / PASO_G));
  const fy = Math.min(ny - 1.001, Math.max(0, (y - GY[0]) / PASO_G));
  const i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
  const k = i + nx * j;
  return A[k] * (1 - a) * (1 - b) + A[k + 1] * a * (1 - b) + A[k + nx] * (1 - a) * b + A[k + nx + 1] * a * b;
}

class Monticulo {
  constructor() { this.d = []; this.n = 0; }
  push(d, i, j) {
    const h = this.d; h.push([d, i, j]); let k = h.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (menor(h[k], h[p])) { [h[k], h[p]] = [h[p], h[k]]; k = p; } else break; }
    this.n = h.length;
  }
  pop() {
    const h = this.d, top = h[0], ult = h.pop();
    if (h.length) {
      h[0] = ult; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < h.length && menor(h[l], h[m])) m = l;
        if (r < h.length && menor(h[r], h[m])) m = r;
        if (m === k) break;
        [h[k], h[m]] = [h[m], h[k]]; k = m;
      }
    }
    this.n = h.length;
    return top;
  }
}
// mismo desempate que heapq de Python con tuplas (d, i, j)
const menor = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
