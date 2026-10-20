// Método clásico de la SHE de tres niveles (cuarto de onda, solo senos): ecuaciones, jacobiano
// y Newton con paso limitado. Lo usan banco.mjs y continuacion.mjs.
export const TOL = 1e-10;                // éxito: |error| máximo en las N ecuaciones

let semilla = 12345;
export const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };

export function armonicos(N) { const H = [1]; for (let h = 5; H.length < N; h += 2) if (h % 3) H.push(h); return H; }

export function residuo(th, H, m) {
  return H.map((h, j) => {
    let s = 0; th.forEach((t, k) => { s += (k % 2 ? -1 : 1) * Math.cos(h * t); });
    return (4 / (h * Math.PI)) * s - (j === 0 ? m : 0);
  });
}
export function jacobiano(th, H) {
  return H.map((h) => th.map((t, k) => -(4 / Math.PI) * (k % 2 ? -1 : 1) * Math.sin(h * t)));
}
export function resuelveLineal(A, b) {          // Gauss con pivoteo parcial
  const n = b.length, M = A.map((f, i) => [...f, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = c + 1; i < n; i++) { const f = M[i][c] / M[c][c]; for (let k = c; k <= n; k++) M[i][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]; x[i] = s / M[i][i]; }
  return x;
}
export const valido = (th) => th.every((t, k) => t > 0 && t < Math.PI / 2 && (k === 0 || t > th[k - 1]));
export const errMax = (th, H, m) => Math.max(...residuo(th, H, m).map(Math.abs));

/** Newton con paso limitado (0,1 rad); éxito si converge a ángulos válidos. */
export function newton(th0, H, m, maxit = 100) {
  let th = [...th0];
  for (let it = 0; it < maxit; it++) {
    const F = residuo(th, H, m);
    if (Math.max(...F.map(Math.abs)) < TOL) break;
    const d = resuelveLineal(jacobiano(th, H), F.map((v) => -v));
    if (!d || d.some((v) => !Number.isFinite(v))) return null;
    const n = Math.max(...d.map(Math.abs)), f = n > 0.1 ? 0.1 / n : 1;
    th = th.map((t, k) => t + f * d[k]);
  }
  return valido(th) && errMax(th, H, m) < TOL ? th : null;
}

