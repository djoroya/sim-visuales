// Cruces exactos de un polinomio trigonométrico con un nivel, sin muestrear.
//
// m(τ) + c = c + Σ_h α_h cos(hτ) + β_h sin(hτ). Con z = e^{iτ}, cos hτ = (z^h + z^-h)/2 y
// sin hτ = (z^h - z^-h)/(2i); multiplicando por z^K (K, el armónico más alto) queda un
// polinomio de grado 2K en z. Sus raíces sobre la circunferencia unidad son los τ reales donde
// m(τ) + c = 0: todas a la vez, sin poder perder ninguna por estrecha que sea (la interpolación
// en z es exacta porque m tiene banda limitada). Raíces por Aberth–Ehrlich (convergencia
// cúbica, simultánea) y pulido final con Newton sobre la función real.

/** Raíces complejas del polinomio Σ p_n z^n (pr, pi: partes real e imaginaria, de grado 0 a n). */
export function raicesPolinomio(pr, pi, inicio = null, maxit = 300) {
  // quitar coeficientes despreciables en los extremos (raíces en 0 o en el infinito)
  let escala = 0; for (let k = 0; k < pr.length; k++) escala = Math.max(escala, Math.hypot(pr[k], pi[k]));
  let lo = 0, hi = pr.length - 1;
  while (hi > lo && Math.hypot(pr[hi], pi[hi]) < 1e-14 * escala) hi--;
  while (lo < hi && Math.hypot(pr[lo], pi[lo]) < 1e-14 * escala) lo++;
  const n = hi - lo; if (n < 1) return { re: [], im: [], ok: true };
  const ar = pr.slice(lo, hi + 1), ai = pi.slice(lo, hi + 1);
  // arranque: en la circunferencia unidad (donde están las que interesan), con un giro
  const zr = new Float64Array(n), zi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    if (inicio && inicio.re.length === n) { zr[k] = inicio.re[k]; zi[k] = inicio.im[k]; }
    else { const t = (2 * Math.PI * (k + 0.25)) / n + 0.4; zr[k] = Math.cos(t); zi[k] = Math.sin(t); }
  }
  let convergio = false;
  for (let it = 0; it < maxit; it++) {
    let cambio = 0;
    for (let k = 0; k < n; k++) {
      // p(z) y p'(z) por Horner
      let vr = ar[n], vi = ai[n], dr = 0, di = 0;
      const xr = zr[k], xi = zi[k];
      for (let j = n - 1; j >= 0; j--) {
        const ndr = dr * xr - di * xi + vr, ndi = dr * xi + di * xr + vi; dr = ndr; di = ndi;
        const nvr = vr * xr - vi * xi + ar[j], nvi = vr * xi + vi * xr + ai[j]; vr = nvr; vi = nvi;
      }
      // cociente de Newton w = p/p'
      const dd = dr * dr + di * di || 1e-300;
      const wr = (vr * dr + vi * di) / dd, wi = (vi * dr - vr * di) / dd;
      // corrección de Aberth: Σ 1/(z_k - z_j)
      let sr = 0, si = 0;
      for (let j = 0; j < n; j++) {
        if (j === k) continue;
        const er = xr - zr[j], ei = xi - zi[j], ee = er * er + ei * ei || 1e-300;
        sr += er / ee; si -= ei / ee;
      }
      // paso = w / (1 - w·s)
      const denr = 1 - (wr * sr - wi * si), deni = -(wr * si + wi * sr), den = denr * denr + deni * deni || 1e-300;
      const pr_ = (wr * denr + wi * deni) / den, pi_ = (wi * denr - wr * deni) / den;
      zr[k] -= pr_; zi[k] -= pi_;
      cambio = Math.max(cambio, Math.hypot(pr_, pi_) / Math.max(1, Math.hypot(zr[k], zi[k])));
    }
    if (cambio < 1e-14) { convergio = true; break; }
  }
  let finitas = true; for (let k = 0; k < n; k++) if (!Number.isFinite(zr[k]) || !Number.isFinite(zi[k])) finitas = false;
  return { re: zr, im: zi, ok: convergio && finitas };
}

/**
 * Raíces en [0, π] de c + Σ_h α_h cos(hτ) + β_h sin(hτ). H: armónicos (enteros > 0);
 * alfa, beta: coeficientes. Devuelve los τ, ordenados.
 */
export function crucesTrig(H, alfa, beta, c, cache = null) {
  const K = Math.max(...H), pr = new Float64Array(2 * K + 1), pi = new Float64Array(2 * K + 1);
  pr[K] = c;
  H.forEach((h, i) => {
    pr[K + h] += alfa[i] / 2; pi[K + h] -= beta[i] / 2;      // z^h:  (α - iβ)/2
    pr[K - h] += alfa[i] / 2; pi[K - h] += beta[i] / 2;      // z^-h: (α + iβ)/2
  });
  // arranque en caliente desde las raíces de la llamada anterior; si no converge (o salen
  // NaN, p. ej. tras un paso de prueba con q enorme), en frío. Solo se guarda lo que convergió.
  let r = raicesPolinomio(pr, pi, cache && cache.raices);
  if (!r.ok && cache && cache.raices) r = raicesPolinomio(pr, pi, null);
  if (cache) cache.raices = r.ok ? r : null;
  const f = (t) => { let s = c; H.forEach((h, i) => { s += alfa[i] * Math.cos(h * t) + beta[i] * Math.sin(h * t); }); return s; };
  const df = (t) => { let s = 0; H.forEach((h, i) => { s += h * (-alfa[i] * Math.sin(h * t) + beta[i] * Math.cos(h * t)); }); return s; };
  const ts = [];
  // Candidatas: cerca de la circunferencia (con grado alto, Aberth no siempre las deja a
  // menos de 1e-6). Se decide sobre la función real: Newton desde el ángulo y se acepta si
  // converge a un cero de verdad dentro de [0, π]. Las repetidas se quitan.
  const escalaF = Math.abs(c) + alfa.reduce((s, v) => s + Math.abs(v), 0) + beta.reduce((s, v) => s + Math.abs(v), 0);
  for (let k = 0; k < r.re.length; k++) {
    const mod = Math.hypot(r.re[k], r.im[k]);
    if (Math.abs(Math.log(mod)) > 2e-2) continue;
    let t = Math.atan2(r.im[k], r.re[k]);
    if (t < -2e-2 || t > Math.PI + 2e-2) continue;
    for (let it = 0; it < 30; it++) { const d = df(t); if (Math.abs(d) < 1e-14) break; const dt = f(t) / d; t -= dt; if (Math.abs(dt) < 1e-15) break; }
    if (!(t >= -1e-12 && t <= Math.PI + 1e-12) || Math.abs(f(t)) > 1e-10 * escalaF) continue;
    t = Math.min(Math.PI, Math.max(0, t));
    if (ts.some((u) => Math.abs(u - t) < 1e-10)) continue;
    ts.push(t);
  }
  return ts.sort((a, b) => a - b);
}
