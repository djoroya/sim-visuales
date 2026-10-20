// Visor: onda escalonada, su espectro y el mapa de soluciones según la amplitud.
import { problema, resuelve, espectro } from "./she.js";

const C = { fondo: "#13294a", rejilla: "#2d4466", texto: "#e8eef6", suave: "#8fa3bd", warm: "#f59e0b", azul: "#4f9be8", verde: "#3fb27f", rojo: "#e8604f" };
const lienzo = document.getElementById("lienzo"), ctx = lienzo.getContext("2d");
// Dos composiciones del lienzo: ancha (1200 x 900) y estrecha (760 x 1080, para móvil: la
// letra del lienzo, a escala, sigue siendo legible).
let W = 1200, Hc = 900;
function ajusta() {
  const estrecho = lienzo.parentElement.clientWidth < 600;
  [W, Hc] = estrecho ? [760, 1080] : [1200, 900];
  if (lienzo.width !== W) { lienzo.width = W; lienzo.height = Hc; lienzo.parentElement.style.aspectRatio = `${W} / ${Hc}`; }
}
const $ = (id) => document.getElementById(id);
const CANDIDATOS = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25];
const M_MAX = 1.25, FILAS = 101;

const estado = { elim: new Set([5, 7, 11, 13]), nU: 5, m: 0.8, P: null, q: null, sol: null, ms: 0, mapa: null, barrido: null };

function configura() {
  const H = [...estado.elim].sort((a, b) => a - b);
  const E = [1, ...H];
  const U = Array.from({ length: estado.nU }, (_, k) => -1 + (2 * k) / (estado.nU - 1));
  estado.P = problema(E, E, U);
  estado.q = null;
  calculaMapa();
  resuelveActual();
}

function objetivo(m) {
  const x0 = new Array(estado.P.n).fill(0);
  x0[estado.P.na] = m;                      // b1 = m (un seno puro); a1 y el resto, 0
  return x0;
}

const factible = (r) => Math.max(...r.residuo.map(Math.abs)) < 1e-4;

function resuelveActual() {
  const t0 = performance.now();
  let r = resuelve(estado.P, objetivo(estado.m), { q0: estado.q });
  // si el arranque en caliente venía de una solución inalcanzable (q enorme), se repite en frío
  if (!factible(r) && estado.q) { const r2 = resuelve(estado.P, objetivo(estado.m)); if (factible(r2)) r = r2; }
  estado.ms = performance.now() - t0;
  estado.sol = r;
  estado.q = factible(r) ? r.q : null;
  dibuja();
}

// Mapa: la onda (en medio periodo) para cada amplitud, calculado por trozos para no bloquear.
function calculaMapa() {
  const id = Symbol(); estado.mapaId = id;
  const filas = []; let q = null, i = 0;
  const paso = () => {
    if (estado.mapaId !== id) return;
    const t0 = performance.now();
    while (i < FILAS && performance.now() - t0 < 12) {
      const m = (M_MAX * i) / (FILAS - 1);
      let r = resuelve(estado.P, objetivo(m), { q0: q });
      if (!factible(r) && q) { const r2 = resuelve(estado.P, objetivo(m)); if (factible(r2)) r = r2; }
      filas.push({ m, ts: r.ts, niveles: r.niveles, ok: factible(r) });
      q = factible(r) ? r.q : null; i++;
    }
    estado.mapa = { filas, completo: i >= FILAS };
    dibuja();
    if (i < FILAS) requestAnimationFrame(paso);
  };
  paso();
}

// ---- dibujo ----
const colorNivel = (u) => {
  // divergente: azul (negativo) - fondo (0) - ámbar (positivo)
  const a = Math.min(1, Math.abs(u)), [r0, g0, b0] = [26, 52, 90];
  const [r1, g1, b1] = u >= 0 ? [245, 158, 11] : [79, 155, 232];
  return `rgb(${Math.round(r0 + a * (r1 - r0))},${Math.round(g0 + a * (g1 - g0))},${Math.round(b0 + a * (b1 - b0))})`;
};

function texto(s, x, y, { color = C.suave, size = 22, align = "left", bold = false } = {}) {
  ctx.fillStyle = color; ctx.font = `${bold ? "600 " : ""}${size}px system-ui, sans-serif`; ctx.textAlign = align; ctx.fillText(s, x, y);
}

function panelOnda(x0, y0, w, h) {
  const r = estado.sol, ok = factible(r), m = estado.m;
  texto("Onda en un periodo", x0, y0 - 12, { color: C.texto, bold: true });
  const X = (t) => x0 + (t / (2 * Math.PI)) * w, Y = (u) => y0 + h / 2 - (u * h) / 2.6;
  ctx.strokeStyle = C.rejilla; ctx.lineWidth = 1;
  for (const u of estado.P.U) { ctx.beginPath(); ctx.moveTo(x0, Y(u)); ctx.lineTo(x0 + w, Y(u)); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(X(Math.PI), y0); ctx.lineTo(X(Math.PI), y0 + h); ctx.stroke();
  // objetivo: m sin τ
  ctx.strokeStyle = C.warm; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i <= 400; i++) { const t = (2 * Math.PI * i) / 400; i ? ctx.lineTo(X(t), Y(m * Math.sin(t))) : ctx.moveTo(X(t), Y(m * Math.sin(t))); }
  ctx.stroke(); ctx.setLineDash([]);
  // escalera: [0, π] y su antisimétrica en [π, 2π]
  const bordes = [0, ...r.ts, Math.PI];
  ctx.strokeStyle = ok ? C.texto : C.rojo; ctx.lineWidth = 3; ctx.beginPath();
  for (const s of [1, -1]) {
    const off = s === 1 ? 0 : Math.PI;
    r.niveles.forEach((u, k) => {
      const xa = X(off + bordes[k]), xb = X(off + bordes[k + 1]), y = Y(s * u);
      if (k === 0 && s === 1) ctx.moveTo(xa, y); else ctx.lineTo(xa, y);
      ctx.lineTo(xb, y);
    });
  }
  ctx.stroke();
  texto("0", x0 - 8, Y(0) + 7, { align: "right", size: 18 }); texto("π", X(Math.PI), y0 + h + 22, { align: "center", size: 18 });
  texto("2π", X(2 * Math.PI), y0 + h + 22, { align: "right", size: 18 });
  texto("— — objetivo: la fundamental", x0 + w, y0 - 12, { color: C.warm, size: 18, align: "right" });
}

function panelEspectro(x0, y0, w, h) {
  const r = estado.sol, esp = espectro(r.ts, r.niveles, 49);
  const thd = Math.sqrt(esp.slice(1).reduce((s, e) => s + e.amp ** 2, 0)) / Math.max(esp[0].amp, 1e-12);
  texto(W >= 1000 ? "Espectro: amplitud de cada armónico impar" : "Espectro", x0, y0 - 12, { color: C.texto, bold: true });
  texto(`distorsión (hasta el 49.º): ${(100 * thd).toFixed(1)} %`, x0 + w, y0 - 12, { size: 18, align: "right" });
  const amax = 1.3, bw = w / esp.length;
  const Y = (a) => y0 + h - (Math.min(a, amax) / amax) * h;
  ctx.strokeStyle = C.rejilla; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0 + w, y0 + h); ctx.stroke();
  esp.forEach((e, i) => {
    const x = x0 + i * bw, elim = estado.elim.has(e.h);
    ctx.fillStyle = e.h === 1 ? C.warm : elim ? C.verde : C.suave;
    const y = Y(e.amp); ctx.fillRect(x + bw * 0.18, y, bw * 0.64, y0 + h - y);
    if (elim) { ctx.strokeStyle = C.verde; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + bw / 2, y0 + h - 9, 7, 0, 2 * Math.PI); ctx.stroke(); }
    if (W >= 1000 ? e.h <= 25 || e.h === 37 || e.h === 49 : e.h <= 13 || e.h === 25 || e.h === 49) texto(String(e.h), x + bw / 2, y0 + h + 22, { size: 16, align: "center", color: elim ? C.verde : C.suave });
  });
}

function panelMapa(x0, y0, w, h) {
  texto(W >= 1000 ? "Todas las soluciones: la onda en medio periodo para cada amplitud" : "Todas las soluciones (medio periodo)", x0, y0 - 12, { color: C.texto, bold: true });
  const mp = estado.mapa; if (!mp) return;
  const fh = h / FILAS;
  mp.filas.forEach((f, i) => {
    const y = y0 + h - (i + 1) * fh, bordes = [0, ...f.ts, Math.PI];
    if (!f.ok) { ctx.fillStyle = "#1c2a40"; ctx.fillRect(x0, y, w, fh + 0.5); return; }
    f.niveles.forEach((u, k) => {
      ctx.fillStyle = colorNivel(u);
      ctx.fillRect(x0 + (bordes[k] / Math.PI) * w, y, ((bordes[k + 1] - bordes[k]) / Math.PI) * w + 0.5, fh + 0.5);
    });
  });
  // primera amplitud inalcanzable
  const lim = mp.filas.find((f) => !f.ok);
  if (lim && mp.completo) {
    const y = y0 + h - (mp.filas.indexOf(lim) / FILAS) * h;          // borde inferior de la zona sin solución
    ctx.strokeStyle = C.rojo; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
    texto(`sin solución por encima de ${lim.m.toFixed(2)}` + (W >= 1000 ? " (franja oscura)" : ""), x0 + w / 2, y0 + h + 22, { size: 18, align: "center", color: C.rojo });
  }
  // amplitud actual
  const ym = y0 + h - (estado.m / M_MAX) * h;
  ctx.strokeStyle = C.texto; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(x0, ym); ctx.lineTo(x0 + w, ym); ctx.stroke(); ctx.setLineDash([]);
  texto("0", x0, y0 + h + 22, { size: 18 }); texto("π", x0 + w, y0 + h + 22, { size: 18, align: "right" });
  texto("amplitud", x0 - 12, y0 + 18, { size: 18, align: "right" });
  for (const m of [0, 0.5, 1]) texto(m.toFixed(1), x0 - 12, y0 + h - (m / M_MAX) * h + 6, { size: 16, align: "right" });
  // leyenda de niveles
  const U = estado.P.U, lw = 34;
  U.forEach((u, k) => { ctx.fillStyle = colorNivel(u); ctx.fillRect(x0 + w - (U.length - k) * lw, y0 - 34, lw - 3, 14); });
}

function dibuja() {
  if (!estado.sol) return;
  ajusta();
  ctx.fillStyle = C.fondo; ctx.fillRect(0, 0, W, Hc);
  const r = estado.sol, ok = factible(r);
  const resMax = Math.max(...r.residuo.map(Math.abs));
  const linea = ok
    ? `amplitud ${estado.m.toFixed(3)} · ${r.ts.length} conmutaciones por semiperiodo · armónicos elegidos: |error| < ${resMax < 1e-6 ? "10⁻⁶" : resMax.toExponential(0)} · ${estado.ms.toFixed(1)} ms (${r.iter} it.)`
    : `amplitud ${estado.m.toFixed(3)}: INALCANZABLE con ${estado.nU} niveles y estos armónicos (error ${resMax.toFixed(3)})`;
  if (W >= 1000) {
    texto(linea, 30, 34, { size: 19, color: ok ? C.suave : C.rojo });
    panelOnda(70, 90, 1100, 250); panelEspectro(70, 420, 1100, 160); panelMapa(120, 680, 1050, 190);
  } else {
    // en dos líneas: la amplitud y el veredicto, y el resto
    const [a, ...b] = linea.split(" · ");
    texto(a, 24, 34, { size: 21, color: ok ? C.texto : C.rojo }); texto(b.join(" · ").replace("armónicos elegidos: |error|", "error"), 24, 62, { size: 18, color: ok ? C.suave : C.rojo });
    panelOnda(50, 125, 690, 250); panelEspectro(50, 460, 690, 170); panelMapa(90, 745, 650, 270);
  }
}

// ---- controles ----
const cont = $("armonicos");
for (const h of CANDIDATOS) {
  const b = document.createElement("button"); b.textContent = h; b.classList.toggle("activo", estado.elim.has(h));
  b.onclick = () => {
    if (estado.elim.has(h)) estado.elim.delete(h); else estado.elim.add(h);
    b.classList.toggle("activo", estado.elim.has(h)); configura();
  };
  cont.appendChild(b);
}
$("m").oninput = (e) => { estado.m = +e.target.value; $("mval").textContent = estado.m.toFixed(2); paraBarrido(); resuelveActual(); };
$("niveles").onchange = (e) => { estado.nU = +e.target.value; configura(); };
function paraBarrido() { if (estado.barrido) { cancelAnimationFrame(estado.barrido); estado.barrido = null; $("barre").classList.remove("activo"); } }
$("barre").onclick = () => {
  if (estado.barrido) return paraBarrido();
  $("barre").classList.add("activo");
  let t = 0;
  const paso = () => {
    t += 1 / 60;
    estado.m = (M_MAX * (1 - Math.cos((2 * Math.PI * t) / 12))) / 2;      // ida y vuelta en 12 s
    $("m").value = estado.m; $("mval").textContent = estado.m.toFixed(2);
    resuelveActual();
    estado.barrido = requestAnimationFrame(paso);
  };
  estado.barrido = requestAnimationFrame(paso);
};
addEventListener("resize", () => dibuja());
configura();
