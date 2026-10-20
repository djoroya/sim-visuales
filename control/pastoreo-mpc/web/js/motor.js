// El bucle completo: escenario + destino -> decisión (MPC) -> planta, un intervalo cada vez.
// Lo usan el Web Worker del visor y las pruebas en Node.
import { NP, NSEG, NSEGP, NU, A_MAX, VALLA, PASO_G } from "./constantes.js";
import { geodesica, gradiente, muestrea } from "./mapa.js";
import { preparaRejilla, mapaHacia } from "./rutas.js";
import { avanza } from "./planta.js";
import { reduce, asigna, empaqueta, paredesParametro, spg } from "./controlador.js";

/** Rectángulo con una puerta de `ancho` en el lado ('izq', 'der', 'arr', 'abj'). */
export function corral(cx, cy, lx, ly, lado, ancho) {
  const x0 = cx - lx / 2, x1 = cx + lx / 2, y0 = cy - ly / 2, y1 = cy + ly / 2, m = ancho / 2;
  const lados = { abj: [x0, y0, x1, y0], der: [x1, y0, x1, y1], arr: [x1, y1, x0, y1], izq: [x0, y1, x0, y0] };
  const seg = []; let puerta = null;
  for (const [k, [xa, ya, xb, yb]] of Object.entries(lados)) {
    if (k !== lado) { seg.push([xa, ya, xb, yb]); continue; }
    const mx = (xa + xb) / 2, my = (ya + yb) / 2, ux = Math.sign(xb - xa), uy = Math.sign(yb - ya);
    seg.push([xa, ya, mx - ux * m, my - uy * m]); seg.push([mx + ux * m, my + uy * m, xb, yb]);
    puerta = [mx - ux * m, my - uy * m, mx + ux * m, my + uy * m];
  }
  return { seg, puerta, caja: [x0, x1, y0, y1] };
}

const ZANAHORIA = 80;      // distancia de la zanahoria por delante del centro del rebaño
const WDU_DEF = 1.0;      // peso de la suavidad del control
const WREU_DEF = 1.0;     // peso de reunir el rebaño (12/12 al meterlo y rebaño un 25 % más junto)

export class Motor {
  /**
   * coste: el de cargaCoste(); esc: { corral: corral(...) }; estado: { X, V, Y, W, centros }.
   * Las paredes del coste son la valla y el corral; la verja del perro, su puerta.
   */
  constructor(coste, esc, estado, iters = 30) {
    this.coste = coste; this.iters = iters;
    this.corral = { ...esc.corral };
    this.seg = [...esc.corral.seg, ...VALLA];
    // rejillas del planificador de rutas de los perros: sin y con la verja de la puerta
    this.rejilla = preparaRejilla(this.seg);
    this.rejillaVerja = preparaRejilla([...this.seg, esc.corral.puerta]);
    this.rejillaOvejas = preparaRejilla(this.seg, PASO_G * 0.45);   // mismo margen que geodesica()
    this.segPerro = [...this.seg, esc.corral.puerta];
    [this.segv, this.actv] = paredesParametro(this.seg, NSEG);
    [this.segpv, this.actpv] = paredesParametro([esc.corral.puerta], NSEGP);
    Object.assign(this, estado);
    this.u = estado.u ? Float64Array.from(estado.u) : new Float64Array(NU);
    this.previa = null; this.t = 0; this.ultimaDecision = null; this.subobjetivos = true;
    // suavidad: peso de los cambios de control (parámetro del coste) y filtro de los puntos
    this.uAplicado = new Float64Array(2 * NP); this.wdu = WDU_DEF; this.wreu = WREU_DEF; this.suavizar = true; this.suaves = [null, null, null];
  }

  /** Cambia el destino: rehace el mapa de distancias (unos milisegundos). */
  destino(x, y) {
    this.obj = [x, y];
    this.D = geodesica(this.seg, this.obj);
    const [gx, gy] = gradiente(this.D); this.mapa = { D: this.D, gx, gy };
    this.previa = null;
    this.ultimaDecision = null;               // tras una orden, se decide en el siguiente intervalo
    this.compromiso = null; this.zan = null;
    const [x0, x1, y0, y1] = this.corral.caja;
    this.enCorral = x > x0 && x < x1 && y > y0 && y < y1;
    // La verja (los perros no cruzan la puerta) solo cuando el destino es el corral: si
    // hay que sacar al rebaño de él, los perros tienen que poder entrar.
    const verjas = this.enCorral ? [this.corral.puerta] : [];
    this.segPerro = [...this.seg, ...verjas];
    [this.segpv, this.actpv] = paredesParametro(verjas, NSEGP);
  }

  /** ¿Oveja «hecha»? Si el destino está en el corral, las que están dentro. */
  hecha(x, y) {
    if (!this.enCorral) return false;
    const [x0, x1, y0, y1] = this.corral.caja;
    return x > x0 + 2 && x < x1 - 2 && y > y0 + 2 && y < y1 - 2;
  }

  /** Ovejas dentro del corral, sea o no el destino. */
  enElCorral() {
    const [x0, x1, y0, y1] = this.corral.caja; let n = 0;
    for (let i = 0; i < this.X.length / 2; i++) { const x = this.X[2 * i], y = this.X[2 * i + 1]; if (x > x0 + 2 && x < x1 - 2 && y > y0 + 2 && y < y1 - 2) n++; }
    return n;
  }

  dentro() { let n = 0; for (let i = 0; i < this.X.length / 2; i++) if (this.hecha(this.X[2 * i], this.X[2 * i + 1])) n++; return n; }

  /** Una decisión y un intervalo de planta. Devuelve fotos intermedias para animar. */
  paso(conFotos = false, resolver = true) {
    if (!resolver && this.ultimaDecision) return this.pasoSinResolver(conFotos);
    const N = this.X.length / 2;
    const idx = []; for (let i = 0; i < N; i++) if (!this.hecha(this.X[2 * i], this.X[2 * i + 1])) idx.push(i);
    const sel = (A) => { const out = new Float64Array(2 * idx.length); idx.forEach((i, k) => { out[2 * k] = A[2 * i]; out[2 * k + 1] = A[2 * i + 1]; }); return out; };
    const red = reduce(idx.length ? sel(this.X) : this.X, idx.length ? sel(this.V) : this.V, this.centros);
    this.centros = red.centros;
    // ¿sacando? el destino está fuera y la mayoría de las que faltan siguen en el corral
    const [x0, x1, y0, y1] = this.corral.caja;
    let enCaja = 0; for (const i of idx) { const x = this.X[2 * i], y = this.X[2 * i + 1]; if (x > x0 && x < x1 && y > y0 && y < y1) enCaja++; }
    // la maniobra de sacar sigue mientras queden ovejas dentro; la zanahoria se apaga solo
    // mientras la mayoría siga dentro
    const sacando = !this.enCorral && enCaja >= 3;
    this.mayoriaDentro = !this.enCorral && enCaja > idx.length / 2;
    const as = asigna(red.centros, red.peso, this.Y, this.previa, this.mapa, this.seg, this.corral, this.compromiso, this.obj,
      this.enCorral ? this.rejillaVerja : this.rejilla, sacando, this.suavizar ? this.suaves : null);
    this.compromiso = as.compromiso;
    this.previa = as.previa;
    // Zanahoria: el MPC no ve el destino final sino un punto ZANAHORIA más adelante por el
    // camino del rebaño (como si alguien fuera haciendo clic en objetivos cercanos), con su
    // propio mapa de distancias. Así el rebaño converge hacia cada etapa (la puerta, el
    // otro lado, el destino) en vez de fluir todo de golpe hacia el final.
    const cam = this.camino(idx);
    let zan = this.obj;
    // solo con el rebaño fuera del corral: mientras se saca, el MPC ve el destino final
    if (this.subobjetivos && !this.mayoriaDentro && cam.length > ZANAHORIA / 6 + 3) zan = cam[Math.round(ZANAHORIA / 6)];
    if (!this.zan || Math.hypot(zan[0] - this.zan[0], zan[1] - this.zan[1]) > 15) {
      this.zan = zan;
      this.Dzan = zan === this.obj ? this.D : mapaHacia(this.rejillaOvejas, zan[0], zan[1]);
    }
    const Dsub = this.Dzan;
    const corte = zan === this.obj ? 0 : 1;
    const p = empaqueta(this.coste.NPAR, red, this.Y, this.W, as, this.segv, this.actv, this.segpv, this.actpv, Dsub, this.uAplicado, this.wdu, this.wreu);
    this.coste.fijaParametros(p);
    const t0 = performance.now();
    const [u] = spg(this.coste, this.u, this.iters);
    const ms = performance.now() - t0;
    const acc = u.slice(0, 2 * NP).map((v) => v * A_MAX);
    this.uAplicado = u.slice(0, 2 * NP);
    const fotos = conFotos ? [] : null;
    avanza(this.X, this.V, this.Y, this.W, acc, this.seg, this.segPerro, fotos, 4);   // 10 fotogramas por intervalo
    this.u = Float64Array.from([...u.slice(2 * NP), ...u.slice(u.length - 2 * NP)]);
    this.t += 2.5;
    this.ultimaDecision = { camino: cam, zan: this.zan, corte, centrosGrupo: as.roles.map((ro) => [ro.cx, ro.cy, ro.rg]), roles: as.roles, nGrupos: as.nGrupos, centros: red.centros.slice(), peso: red.peso.slice() };
    return { ms, fotos, ...this.ultimaDecision };
  }

  /**
   * Un intervalo aplicando el siguiente tramo del último plan, sin resolver. El plan del
   * MPC cubre N_H intervalos; a velocidades altas se replanifica cada pocos intervalos.
   */
  camino(idx) {
    // camino del rebaño (para dibujarlo): bajar por el mapa desde el centro de lo que falta
    if (!idx.length) return [];
    let x = 0, y = 0; for (const i of idx) { x += this.X[2 * i]; y += this.X[2 * i + 1]; } x /= idx.length; y /= idx.length;
    const pts = [[x, y]];
    for (let k = 0; k < 120; k++) {
      const gx = muestrea(this.mapa.gx, x, y), gy = muestrea(this.mapa.gy, x, y), n = Math.hypot(gx, gy);
      if (n < 1e-6 || muestrea(this.D, x, y) < 8) break;
      x -= 6 * gx / n; y -= 6 * gy / n; pts.push([x, y]);
    }
    return pts;
  }

  pasoSinResolver(conFotos) {
    const acc = this.u.slice(0, 2 * NP).map((v) => v * A_MAX);
    this.uAplicado = this.u.slice(0, 2 * NP);
    const fotos = conFotos ? [] : null;
    avanza(this.X, this.V, this.Y, this.W, acc, this.seg, this.segPerro, fotos, 4);
    this.u = Float64Array.from([...this.u.slice(2 * NP), ...this.u.slice(this.u.length - 2 * NP)]);
    this.t += 2.5;
    return { ms: 0, fotos, ...this.ultimaDecision };
  }
}
