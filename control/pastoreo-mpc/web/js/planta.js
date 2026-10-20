// La «realidad»: 200 u 80 ovejas y 3 perros con el modelo completo. Réplica de avanza()
// de python/valida.py: cohesión del TFM + espacio personal, solo entre ovejas que se ven
// (el segmento que las une no corta una pared), miedo saturado, rozamiento que limita la
// velocidad (implícito), paredes de potencial, y verjas que solo ven los perros.
import { NU_O, NU_P, R_OO, C_NUC, D_NUC, F_M, SIGMA, V_MAX_O, F_SAT, F_W, L_W, F_W_P, NP, DT, SUBPASOS_PLANTA } from "./constantes.js";
import { cortaPared } from "./mapa.js";

function paredes(px, py, seg, fw, out) {
  // suma en out[0..1] la fuerza de las paredes sobre el punto (px, py)
  for (const [xa, ya, xb, yb] of seg) {
    const abx = xb - xa, aby = yb - ya;
    let t = ((px - xa) * abx + (py - ya) * aby) / (abx * abx + aby * aby);
    t = Math.min(1, Math.max(0, t));
    const dx = px - (xa + t * abx), dy = py - (ya + t * aby);
    const r = Math.sqrt(dx * dx + dy * dy + 0.25);
    const c = fw * Math.exp(-(r / L_W) * (r / L_W)) / r;
    out[0] += c * dx; out[1] += c * dy;
  }
}

/**
 * Avanza un intervalo DT con la aceleración de los perros fija.
 * X, V: Float64Array(2N) de las ovejas [x0,y0,x1,y1...]; Y, W: Float64Array(2NP).
 * seg: paredes (incluida la valla); segPerro: seg + verjas de los perros.
 * Modifica X, V, Y, W en sitio. `fotos` (opcional) recibe copias cada `cada` subpasos.
 */
export function avanza(X, V, Y, W, acc, seg, segPerro, fotos = null, cada = 10) {
  const N = X.length / 2, h = DT / SUBPASOS_PLANTA;
  const ven = new Uint8Array(N * N);
  const F = new Float64Array(2 * N), tmp = [0, 0];
  for (let paso = 0; paso < SUBPASOS_PLANTA; paso++) {
    // visibilidad (simétrica)
    for (let i = 0; i < N; i++) {
      ven[i * N + i] = 1;
      for (let k = i + 1; k < N; k++) {
        const v = cortaPared(X[2 * i], X[2 * i + 1], X[2 * k], X[2 * k + 1], seg) ? 0 : 1;
        ven[i * N + k] = v; ven[k * N + i] = v;
      }
    }
    // fuerzas sobre las ovejas (con las posiciones de este subpaso)
    for (let i = 0; i < N; i++) {
      const xi = X[2 * i], yi = X[2 * i + 1];
      let fx = 0, fy = 0;
      for (let k = 0; k < N; k++) {
        if (k === i || !ven[i * N + k]) continue;
        const dx = X[2 * k] - xi, dy = X[2 * k + 1] - yi;
        const r = Math.sqrt(dx * dx + dy * dy + 1.0);
        const g = (1 / R_OO - 1 / r) - C_NUC * Math.pow(D_NUC / r, 8);
        fx += (g / r) * dx; fy += (g / r) * dy;
      }
      let ox = 0, oy = 0;
      for (let j = 0; j < NP; j++) {
        const dx = xi - Y[2 * j], dy = yi - Y[2 * j + 1];
        const rp = Math.sqrt(dx * dx + dy * dy + 1.0);
        const c = F_M * Math.exp(-(rp / SIGMA) * (rp / SIGMA)) / rp;
        ox += c * dx; oy += c * dy;
      }
      const n = Math.hypot(ox, oy) + 1e-9, s = F_SAT * Math.tanh(n / F_SAT) / n;
      tmp[0] = 0; tmp[1] = 0; paredes(xi, yi, seg, F_W, tmp);
      F[2 * i] = fx + ox * s + tmp[0]; F[2 * i + 1] = fy + oy * s + tmp[1];
    }
    for (let i = 0; i < N; i++) {
      const vx = V[2 * i], vy = V[2 * i + 1];
      const q = (vx * vx + vy * vy) / (V_MAX_O * V_MAX_O);
      const roz = NU_O * (1 + q * q);
      V[2 * i] = (vx + h * F[2 * i]) / (1 + h * roz);
      V[2 * i + 1] = (vy + h * F[2 * i + 1]) / (1 + h * roz);
      X[2 * i] += h * V[2 * i]; X[2 * i + 1] += h * V[2 * i + 1];
    }
    // perros
    const Fp = new Float64Array(2 * NP);
    for (let j = 0; j < NP; j++) {
      let fx = 0, fy = 0;
      for (let k = 0; k < NP; k++) {
        if (k === j) continue;
        const dx = Y[2 * j] - Y[2 * k], dy = Y[2 * j + 1] - Y[2 * k + 1];
        const r = Math.sqrt(dx * dx + dy * dy + 1.0);
        const c = -(1 / r - 1 / 10.0) / r;
        fx += c * -dx; fy += c * -dy;
      }
      tmp[0] = 0; tmp[1] = 0; paredes(Y[2 * j], Y[2 * j + 1], segPerro, F_W_P, tmp);
      Fp[2 * j] = fx + acc[2 * j] + tmp[0]; Fp[2 * j + 1] = fy + acc[2 * j + 1] + tmp[1];
    }
    for (let j = 0; j < 2 * NP; j++) { W[j] = (W[j] + h * Fp[j]) / (1 + h * NU_P); Y[j] += h * W[j]; }
    if (fotos && (paso + 1) % cada === 0) fotos.push({ X: X.slice(), Y: Y.slice() });
  }
}
