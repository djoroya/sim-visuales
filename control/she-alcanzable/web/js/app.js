// Visor del conjunto alcanzable: plano (b1, bh), onda que consigue el objetivo y su espectro.
import { problema, resuelve, espectro } from "./she.js";

const C = { fondo: "#13294a", rejilla: "#2d4466", texto: "#e8eef6", suave: "#8fa3bd", warm: "#f59e0b", azul: "#4f9be8", verde: "#3fb27f", rojo: "#e8604f" };
const lienzo = document.getElementById("lienzo"), ctx = lienzo.getContext("2d");
const $ = (id) => document.getElementById(id);
const LIM = 1.45;                                    // el plano va de -LIM a LIM en los dos ejes
const estado = { h: 5, nU: 5, obj: [0.8, 0], P: null, q: null, sol: null, frontera: null, ms: 0 };

let W = 1200, Hc = 640, G = null;                    // composición: ancha o estrecha
function ajusta() {
  const estrecho = lienzo.parentElement.clientWidth < 600;
  [W, Hc] = estrecho ? [760, 1200] : [1200, 640];
  if (lienzo.width !== W) { lienzo.width = W; lienzo.height = Hc; lienzo.parentElement.style.aspectRatio = `${W} / ${Hc}`; }
  G = estrecho
    ? { plano: [70, 120, 640, 640], onda: [60, 850, 660, 170], esp: [60, 1080, 660, 90], hud: [24, 36], ancho: false }
    : { plano: [70, 70, 520, 520], onda: [660, 90, 500, 230], esp: [660, 420, 500, 160], hud: [24, 34], ancho: true };
}

// ---- conjunto alcanzable (solo senos de 1 y h): frontera en la dirección w, ∫ D sign(w·D) ----
function frontera(h, n = 360, K = 3000) {
  const pts = [], dt = Math.PI / K;
  for (let i = 0; i < n; i++) {
    const th = (2 * Math.PI * i) / n, w1 = Math.cos(th), w2 = Math.sin(th);
    let x = 0, y = 0;
    for (let k = 0; k < K; k++) {
      const t = (k + 0.5) * dt, d1 = (2 / Math.PI) * Math.sin(t), d2 = (2 / Math.PI) * Math.sin(h * t);
      const s = w1 * d1 + w2 * d2 >= 0 ? 1 : -1; x += s * d1 * dt; y += s * d2 * dt;
    }
    pts.push([x, y]);
  }
  return pts;
}
const soporte = (w) => Math.max(...estado.frontera.map((p) => w[0] * p[0] + w[1] * p[1]));
function limiteEnEje() {                             // mayor b1 con bh = 0 (cruce de la frontera con y = 0)
  const F = estado.frontera; let mejor = 0;
  for (let i = 0; i < F.length; i++) {
    const [a, b] = [F[i], F[(i + 1) % F.length]];
    if ((a[1] <= 0 && b[1] >= 0) || (a[1] >= 0 && b[1] <= 0)) { const t = a[1] === b[1] ? 0 : a[1] / (a[1] - b[1]); mejor = Math.max(mejor, a[0] + t * (b[0] - a[0])); }
  }
  return mejor;
}

function configura() {
  const U = estado.nU === 2 ? [-1, 1] : Array.from({ length: estado.nU }, (_, k) => -1 + (2 * k) / (estado.nU - 1));
  // dos niveles: penalización lineal (la parábola a trozos sería plana entre -1 y 1)
  estado.P = problema([], [1, estado.h], U, estado.nU === 2 ? { pendientes: [1] } : {});
  estado.frontera = frontera(estado.h);
  estado.q = null;
  resuelveActual();
}

function resuelveActual() {
  const t0 = performance.now();
  let r = resuelve(estado.P, [...estado.obj], { q0: estado.q, eps: 1e-6 });
  if (!factible(r) && estado.q) { const r2 = resuelve(estado.P, [...estado.obj], { eps: 1e-6 }); if (factible(r2)) r = r2; }
  estado.ms = performance.now() - t0; estado.sol = r; estado.q = factible(r) ? r.q : null;
  dibuja();
}
const factible = (r) => Math.max(...r.residuo.map(Math.abs)) < 1e-4;

// ---- dibujo ----
function texto(s, x, y, { color = C.suave, size = 20, align = "left", bold = false } = {}) {
  ctx.fillStyle = color; ctx.font = `${bold ? "600 " : ""}${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText(s, x, y);
}
function aPlano(x, y) { const [x0, y0, w, h] = G.plano; return [x0 + ((x + LIM) / (2 * LIM)) * w, y0 + h - ((y + LIM) / (2 * LIM)) * h]; }
function dePlano(px, py) { const [x0, y0, w, h] = G.plano; return [((px - x0) / w) * 2 * LIM - LIM, ((y0 + h - py) / h) * 2 * LIM - LIM]; }

function panelPlano() {
  const [x0, y0, w, h] = G.plano, r = estado.sol, ok = factible(r);
  ctx.strokeStyle = C.rejilla; ctx.lineWidth = 1;
  for (const v of [-1, -0.5, 0, 0.5, 1]) {
    let [a, b] = aPlano(v, -LIM), [c, d] = aPlano(v, LIM); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    [a, b] = aPlano(-LIM, v); [c, d] = aPlano(LIM, v); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke();
    const [tx] = aPlano(v, 0); texto(String(v), tx, y0 + h + 22, { size: 16, align: "center" });
    const [, ty] = aPlano(0, v); texto(String(v), x0 - 8, ty + 5, { size: 16, align: "right" });
  }
  texto("b₁ (fundamental)", x0 + w, y0 + h + 46, { size: 18, align: "right" });
  texto(`b${estado.h === 3 ? "₃" : estado.h === 5 ? "₅" : "₇"}`, x0 - 40, y0 - 14, { size: 18 });
  // conjunto alcanzable
  ctx.beginPath(); estado.frontera.forEach((p, i) => { const [a, b] = aPlano(...p); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath();
  ctx.fillStyle = "rgba(79,155,232,0.28)"; ctx.fill(); ctx.strokeStyle = C.azul; ctx.lineWidth = 2.5; ctx.stroke();
  // fundamental pura (armónico a cero): el segmento verde y su límite
  const m = limiteEnEje(); { const [a, b] = aPlano(-m, 0), [c, d] = aPlano(m, 0); ctx.strokeStyle = C.verde; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
  texto(`armónico a cero: hasta ${m.toFixed(3)}`, x0 + 8, y0 + 24, { size: 16, color: C.verde });
  // objetivo
  const [px, py] = aPlano(...estado.obj);
  if (!ok && r.q) {
    // la recta que separa: w en la dirección en que crece q (con el signo que deja el objetivo fuera)
    let n = Math.hypot(...r.q), dir = [-r.q[0] / n, -r.q[1] / n];
    if (dir[0] * estado.obj[0] + dir[1] * estado.obj[1] < soporte(dir)) dir = [-dir[0], -dir[1]];
    const hs = soporte(dir), d = dir[0] * estado.obj[0] + dir[1] * estado.obj[1] - hs, base = [estado.obj[0] - d * dir[0], estado.obj[1] - d * dir[1]], t = [-dir[1], dir[0]];
    const [a, b] = aPlano(base[0] - 3 * t[0], base[1] - 3 * t[1]), [c, e] = aPlano(base[0] + 3 * t[0], base[1] + 3 * t[1]);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    ctx.strokeStyle = C.rojo; ctx.setLineDash([9, 7]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, e); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  }
  ctx.fillStyle = ok ? C.warm : C.rojo; ctx.beginPath(); ctx.arc(px, py, 9, 0, 2 * Math.PI); ctx.fill();
  ctx.strokeStyle = C.fondo; ctx.lineWidth = 2; ctx.stroke();
}

function panelOnda() {
  const [x0, y0, w, h] = G.onda, r = estado.sol, ok = factible(r);
  texto("La onda (un periodo)", x0, y0 - 14, { color: C.texto, bold: true });
  if (!ok) { texto("no existe: el objetivo está fuera del conjunto", x0, y0 + h / 2, { color: C.rojo, size: 19 }); return; }
  const X = (t) => x0 + (t / (2 * Math.PI)) * w, Y = (u) => y0 + h / 2 - (u * h) / 2.6;
  ctx.strokeStyle = C.rejilla; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, Y(0)); ctx.lineTo(x0 + w, Y(0)); ctx.stroke();
  const [b1, bh] = estado.obj;
  ctx.strokeStyle = C.warm; ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 400; i++) { const t = (2 * Math.PI * i) / 400, v = b1 * Math.sin(t) + bh * Math.sin(estado.h * t); i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v)); }
  ctx.stroke(); ctx.setLineDash([]);
  const bordes = [0, ...r.ts, Math.PI]; ctx.strokeStyle = C.texto; ctx.lineWidth = 2.5; ctx.beginPath();
  for (const s of [1, -1]) { const off = s === 1 ? 0 : Math.PI; r.niveles.forEach((u, k) => { const xa = X(off + bordes[k]), xb = X(off + bordes[k + 1]), y = Y(s * u); if (k === 0 && s === 1) ctx.moveTo(xa, y); else ctx.lineTo(xa, y); ctx.lineTo(xb, y); }); }
  ctx.stroke();
  texto(`${r.ts.length} conmutaciones por semiperiodo`, x0 + w, y0 - 14, { size: 17, align: "right" });
}

function panelEspectro() {
  const [x0, y0, w, h] = G.esp, r = estado.sol;
  if (!factible(r)) return;
  texto("Espectro", x0, y0 - 14, { color: C.texto, bold: true });
  const esp = espectro(r.ts, r.niveles, 25), bw = w / esp.length, Y = (a) => y0 + h - (Math.min(a, 1.35) / 1.35) * h;
  esp.forEach((e, i) => {
    const x = x0 + i * bw, ctrl = e.h === 1 || e.h === estado.h;
    ctx.fillStyle = ctrl ? C.warm : C.suave; const y = Y(e.amp); ctx.fillRect(x + bw * 0.2, y, bw * 0.6, y0 + h - y);
    texto(String(e.h), x + bw / 2, y0 + h + 20, { size: 15, align: "center", color: ctrl ? C.warm : C.suave });
  });
}

function dibuja() {
  if (!estado.sol) return;
  ajusta(); ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, W, Hc);
  const r = estado.sol, ok = factible(r), [b1, bh] = estado.obj;
  const linea = ok ? `b₁ = ${b1.toFixed(3)}, b${estado.h} = ${bh.toFixed(3)}: alcanzable · ${estado.ms.toFixed(0)} ms`
    : `b₁ = ${b1.toFixed(3)}, b${estado.h} = ${bh.toFixed(3)}: INALCANZABLE (la recta roja lo separa del conjunto)`;
  texto(linea, G.hud[0], G.hud[1], { size: G.ancho ? 20 : 22, color: ok ? C.suave : C.rojo });
  panelPlano(); panelOnda(); panelEspectro();
}

// ---- controles ----
function apunta(ev) {
  const r = lienzo.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W, py = ((ev.clientY - r.top) / r.height) * Hc;
  const [x0, y0, w, h] = G.plano; if (px < x0 || px > x0 + w || py < y0 || py > y0 + h) return false;
  estado.obj = dePlano(px, py).map((v) => +v.toFixed(3)); resuelveActual(); return true;
}
let arrastrando = false;
lienzo.addEventListener("pointerdown", (e) => { if (apunta(e)) { arrastrando = true; lienzo.setPointerCapture(e.pointerId); } });
lienzo.addEventListener("pointermove", (e) => { if (arrastrando) apunta(e); });
lienzo.addEventListener("pointerup", () => { arrastrando = false; });
$("armonico").onchange = (e) => { estado.h = +e.target.value; configura(); };
$("niveles").onchange = (e) => { estado.nU = +e.target.value; configura(); };
$("limite").onclick = () => { estado.obj = [+(limiteEnEje() - 0.002).toFixed(3), 0]; estado.q = null; resuelveActual(); };
addEventListener("resize", () => dibuja());
// enlace a un caso: ?b1=0.9&bh=0.5&h=5&n=3
{
  const par = new URLSearchParams(location.search), h = +par.get("h"), n = +par.get("n");
  if ([3, 5, 7].includes(h)) { estado.h = h; $("armonico").value = String(h); }
  if ([2, 3, 5].includes(n)) { estado.nU = n; $("niveles").value = String(n); }
  if (par.has("b1")) estado.obj = [+par.get("b1"), +(par.get("bh") || 0)];
}
ajusta(); configura();
