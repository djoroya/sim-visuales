// Web Worker: ejecuta el motor (planta + MPC en WebAssembly) fuera del hilo de la página.
//
// Calcula por delante hasta ADELANTO intervalos y manda sus fotogramas; la página los
// reproduce y avisa de cuáles ha consumido. Guarda el estado al final de cada intervalo:
// cuando llega un destino nuevo, vuelve al intervalo que se está viendo y recalcula desde
// ahí, de modo que una orden se nota al momento aunque haya trabajo calculado por delante.
import crear from "../mpc.js";
import { cargaCoste } from "./controlador.js";
import { Motor, corral } from "./motor.js";

const ADELANTO = 6;
const ESCENARIOS = {
  izquierda: { corral: corral(60, 30, 160, 100, "izq", 18), obj: [80, 30], ini: [170, -120] },
  arriba: { corral: corral(0, -40, 140, 90, "arr", 18), obj: [0, -50], ini: [-170, -130] },
  estrecha: { corral: corral(120, 0, 120, 120, "izq", 12), obj: [130, 0], ini: [-150, 110] },
};

let coste = null, motor = null, k = 0, consumido = -1, fotos = {}, corriendo = false, gen = 0;
// a velocidades altas se replanifica cada pocos intervalos y con menos iteraciones, para
// que el cálculo vaya por delante de la animación
let cadaDecision = 1, iters = 30;
const AJUSTES = { 1: [1, 30], 2: [1, 30], 4: [2, 30], 10: [3, 20], 20: [4, 20] };

function azar(semilla) {                       // mulberry32: reproducible por semilla
  let a = semilla >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const normal = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

function inicia({ escenario, n = 80, semilla = 1 }) {
  const esc = ESCENARIOS[escenario], r = azar(semilla);
  const ini = [esc.ini[0] + 15 * normal(r), esc.ini[1] + 15 * normal(r)];
  const X = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {                // disco con espiral de Fibonacci
    const kk = i + 0.5, rr = 20 * Math.sqrt(kk / n) * Math.sqrt(n / 80), th = kk * Math.PI * (3 - Math.sqrt(5));
    X[2 * i] = ini[0] + rr * Math.cos(th) + 0.8 * normal(r); X[2 * i + 1] = ini[1] + rr * Math.sin(th) + 0.8 * normal(r);
  }
  const ang = r() * 2 * Math.PI, Y = new Float64Array(6);
  // a 60 del rebaño, pero siempre dentro de la valla (desde fuera no podrían entrar)
  [0, 0.5, -0.5].forEach((d, j) => {
    Y[2 * j] = Math.max(-275, Math.min(275, ini[0] + 60 * Math.cos(ang + d)));
    Y[2 * j + 1] = Math.max(-195, Math.min(195, ini[1] + 60 * Math.sin(ang + d)));
  });
  const centros = new Float64Array(20);
  for (let j = 0; j < 10; j++) { const i = Math.floor(r() * n); centros[2 * j] = X[2 * i]; centros[2 * j + 1] = X[2 * i + 1]; }
  motor = new Motor(coste, esc, { X, V: new Float64Array(2 * n), Y, W: new Float64Array(6), centros }, 30);
  motor.destino(...esc.obj);
  k = 0; consumido = -1; fotos = { 0: guarda() }; gen++;
  postMessage({ tipo: "escena", corral: esc.corral, obj: esc.obj, n, X: Float32Array.from(X), Y: Float32Array.from(Y), gen });
}

function guarda() {
  const m = motor;
  return { X: m.X.slice(), V: m.V.slice(), Y: m.Y.slice(), W: m.W.slice(), centros: m.centros.slice(), u: m.u.slice(), previa: m.previa, t: m.t };
}
function restaura(f) { Object.assign(motor, { X: f.X.slice(), V: f.V.slice(), Y: f.Y.slice(), W: f.W.slice(), centros: f.centros.slice(), u: f.u.slice(), previa: f.previa, t: f.t }); }

async function bucle() {
  if (corriendo) return; corriendo = true;
  while (motor && k - consumido <= ADELANTO) {
    const g = gen;
    motor.iters = iters;
    const r = motor.paso(true, k % cadaDecision === 0);
    if (g !== gen) continue;                  // llegó un destino o una escena nueva a mitad
    k++; fotos[k] = guarda(); delete fotos[k - 12];
    const N = motor.X.length / 2;
    postMessage({
      tipo: "intervalo", k, gen, t: motor.t, ms: r.ms, dentro: motor.dentro(), enElCorral: motor.enElCorral(), n: N, enCorral: motor.enCorral,
      fotos: r.fotos.map((f) => ({ X: Float32Array.from(f.X), Y: Float32Array.from(f.Y) })),
      roles: r.roles, centros: Float32Array.from(r.centros), peso: Float32Array.from(r.peso),
      camino: r.camino, corte: r.corte, zan: r.zan,
    });
    await new Promise((res) => setTimeout(res, 0));   // deja pasar los mensajes de la página
  }
  corriendo = false;
}

onmessage = async ({ data }) => {
  if (!coste) coste = await cargaCoste(crear);
  if (data.tipo === "inicia") { inicia(data); bucle(); }
  else if (data.tipo === "velocidad") { [cadaDecision, iters] = AJUSTES[data.v] || [1, 30]; }
  else if (data.tipo === "consumido") { consumido = Math.max(consumido, data.k); bucle(); }
  else if (data.tipo === "destino" && motor) {
    // volver al final del intervalo que se está viendo y recalcular desde ahí
    const base = Math.max(0, Math.min(k, data.k));
    if (fotos[base]) { restaura(fotos[base]); k = base; }
    for (const kk of Object.keys(fotos)) if (+kk > k) delete fotos[kk];
    motor.destino(data.x, data.y); gen++;
    postMessage({ tipo: "descarta", desde: k + 1, gen, obj: [data.x, data.y], enCorral: motor.enCorral });
    bucle();
  }
};
postMessage({ tipo: "listo" });
