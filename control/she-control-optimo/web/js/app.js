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
const M_MIN = 0.01, M_MAX = 1.25, FILAS = 101;

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
// Mapa: la onda (en medio periodo) para cada amplitud. Primero una rejilla gruesa y luego se
// refina donde cambia la estructura (nace o muere un pulso, o se acaba la solución) hasta
// localizar el cambio a 2·10⁻⁴; entre dos filas con la misma estructura los ángulos varían
// de forma suave y se dibujan como trapecios (interpolación lineal), no como píxeles.
// Se calcula por trozos para no bloquear la página.
const estructura = (f) => (f.ok ? f.niveles.join(",") : "x");
// Sin rescates salvo que se pidan: detectar «sin solución» no los necesita y son lo caro.
function fila(m, q0, rescate = false) {
  let r = resuelve(estado.P, objetivo(m), { q0, sinRescate: !rescate });
  if (!factible(r) && q0) { const r2 = resuelve(estado.P, objetivo(m), { sinRescate: !rescate }); if (factible(r2)) r = r2; }
  return { m, ts: r.ts, niveles: r.niveles, ok: factible(r), q: factible(r) ? r.q : null };
}
function calculaMapa() {
  const id = Symbol(); estado.mapaId = id;
  const filas = []; let i = 0, refinando = 0, terminado = false;
  const paso = () => {
    if (estado.mapaId !== id) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 12) {
      if (i < FILAS) {                                       // rejilla gruesa
        // desde 0,01: al tender a 0 los pulsos se estrechan sin fin y el problema degenera
        const m = M_MIN + ((M_MAX - M_MIN) * i) / (FILAS - 1);
        filas.push(fila(m, filas.length ? filas[filas.length - 1].q : null)); i++;
        if (i === FILAS) {                                   // huecos sueltos: con rescate
          const ultimoOk = filas.map((f) => f.ok).lastIndexOf(true);
          for (let j = 0; j < ultimoOk; j++) if (!filas[j].ok) filas[j] = fila(filas[j].m, j ? filas[j - 1].q : null, true);
        }
        continue;
      }
      // refinamiento: el primer par contiguo con estructura distinta y aún separado
      let k = refinando;
      while (k < filas.length - 1 && (estructura(filas[k]) === estructura(filas[k + 1]) || filas[k + 1].m - filas[k].m < 2e-4)) k++;
      if (k >= filas.length - 1) { terminado = true; break; }
      refinando = k;
      const A = filas[k], B = filas[k + 1], mm = (A.m + B.m) / 2;
      let nf = fila(mm, A.q || B.q);
      if (!nf.ok && filas.slice(k + 1).some((f) => f.ok)) nf = fila(mm, A.q || B.q, true);
      filas.splice(k + 1, 0, nf);
    }
    const completo = terminado;
    estado.mapa = { filas, completo };
    dibuja();
    if (!completo) requestAnimationFrame(paso);
  };
  paso();
}

// ---- dibujo ----
// Color de cada nivel: escalones bien separados. Positivos: azul verdoso -> verde -> amarillo
// -> ámbar (el máximo); negativos: azules; el 0, casi el fondo. Así 7 y 9 niveles se distinguen.
const RAMPA_POS = [[47, 111, 143], [63, 178, 127], [201, 194, 58], [245, 158, 11]];
const RAMPA_NEG = [[38, 74, 120], [79, 155, 232], [169, 208, 255]];
function rampa(stops, a) {                       // a en (0, 1]: el último tope es a = 1
  const x = Math.max(0, Math.min(1, a)) * (stops.length - 1) - 0, i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
  return stops[i].map((v, j) => Math.round(v + f * (stops[i + 1][j] - v)));
}
const colorNivel = (u) => {
  if (Math.abs(u) < 1e-9) return "rgb(26,52,90)";
  // los niveles positivos 1/k ... 1 se reparten por toda la rampa
  const npos = (estado.P.U.length - 1) / 2, k = Math.round(Math.abs(u) * npos), a = npos > 1 ? (k - 1) / (npos - 1) : 1;
  const [r, g, b] = rampa(u > 0 ? RAMPA_POS : RAMPA_NEG, a);
  return `rgb(${r},${g},${b})`;
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
  const X = (t) => x0 + (t / Math.PI) * w, Y = (m) => y0 + h - (m / M_MAX) * h;
  ctx.fillStyle = "#1c2a40"; ctx.fillRect(x0, y0, w, h);                 // sin solución: el fondo
  // Cada tramo de filas seguidas con la misma estructura se dibuja como un polígono por nivel
  // (borde izquierdo subiendo, derecho bajando): sin costuras entre filas. El tramo se alarga
  // hasta la fila siguiente, que está a menos de 2·10⁻⁴ (el cambio ya está localizado).
  const F = mp.filas;
  for (let i0 = 0; i0 < F.length; ) {
    let i1 = i0; while (i1 + 1 < F.length && estructura(F[i1 + 1]) === estructura(F[i0])) i1++;
    if (F[i0].ok) {
      const filas = F.slice(i0, i1 + 1), techo = i1 + 1 < F.length ? F[i1 + 1].m : F[i1].m;
      const bordes = filas.map((f) => [0, ...f.ts, Math.PI]);
      filas[0].niveles.forEach((u, k) => {
        ctx.fillStyle = colorNivel(u); ctx.beginPath();
        filas.forEach((f, j) => { const x = X(bordes[j][k]) - 0.3, y = Y(f.m); j ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        // un píxel de solape con el tramo de encima: sin raya de suavizado en el borde común
        ctx.lineTo(X(bordes[bordes.length - 1][k]) - 0.3, Y(techo) - 1); ctx.lineTo(X(bordes[bordes.length - 1][k + 1]) + 0.3, Y(techo) - 1);
        for (let j = filas.length - 1; j >= 0; j--) ctx.lineTo(X(bordes[j][k + 1]) + 0.3, Y(filas[j].m));
        ctx.closePath(); ctx.fill();
      });
    }
    i0 = i1 + 1;
  }
  const iu = mp.filas.findIndex((f, k) => !f.ok && mp.filas.slice(k).every((g) => !g.ok)), lim = iu >= 0 ? mp.filas[iu] : null;
  if (lim && mp.completo) {
    const y = Y((lim.m + mp.filas[iu - 1].m) / 2);                      // borde inferior de la zona sin solución
    ctx.strokeStyle = C.rojo; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke();
    texto(`sin solución por encima de ${((lim.m + mp.filas[iu - 1].m) / 2).toFixed(3)}` + (W >= 1000 ? " (franja oscura)" : ""), x0 + w / 2, y0 + h + 22, { size: 18, align: "center", color: C.rojo });
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
// enlace a un caso: ?niveles=7&m=0.6
{
  const par = new URLSearchParams(location.search), n = +par.get("niveles"), m = parseFloat(par.get("m"));
  if ([3, 5, 7, 9].includes(n)) { estado.nU = n; $("niveles").value = String(n); }
  if (m >= 0 && m <= M_MAX) { estado.m = m; $("m").value = m; $("mval").textContent = m.toFixed(2); }
}
configura();
