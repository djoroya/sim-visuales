// La página: reproduce los fotogramas que manda el Worker y convierte los clics en órdenes.
const lienzo = document.getElementById("lienzo"), ctx = lienzo.getContext("2d");
const hud = document.getElementById("hud");
const W0 = -300, W1 = 300, H0 = -220, H1 = 220;
const COL = { campo: "#13294a", valla: "#2d4466", pared: "#e8eef6", oveja: "#aebfd4", borde: "#5b6f8a", obj: "#f59e0b", plan: "#f59e0b" };
const PERROS = ["#f59e0b", "#4f9be8", "#3fb27f"];

const trabajador = new Worker(new URL("./trabajador.js", import.meta.url), { type: "module" });
let escena = null, cola = [], gen = 0, reloj = 0, vel = 10, verPlan = false, rastro = [[], [], []];
let ultimo = null, msMedio = 0, kVisto = 0;

const aMundo = (px, py) => [W0 + (px / lienzo.clientWidth) * (W1 - W0), H1 - (py / lienzo.clientHeight) * (H1 - H0)];
const aLienzo = (x, y) => [((x - W0) / (W1 - W0)) * lienzo.width, ((H1 - y) / (H1 - H0)) * lienzo.height];
const escala = lienzo.width / (W1 - W0);

trabajador.onmessage = ({ data }) => {
  if (data.tipo === "listo") { fijaVel(vel); inicia(); }
  else if (data.tipo === "escena") {
    escena = data; escena.enCorral = true; gen = data.gen; cola = []; reloj = 0; kVisto = 0; rastro = [[], [], []];
    ultimo = { X: data.X, Y: data.Y };
  } else if (data.tipo === "intervalo" && data.gen === gen) {
    cola.push(data);
    msMedio = msMedio ? 0.9 * msMedio + 0.1 * data.ms : data.ms;
  } else if (data.tipo === "descarta") {
    gen = data.gen; escena.obj = data.obj; escena.enCorral = data.enCorral;
    cola = cola.filter((iv) => iv.k < data.desde);
  }
};

function inicia() {
  trabajador.postMessage({ tipo: "inicia", escenario: document.getElementById("escenario").value, n: 80, semilla: (Math.random() * 1e9) | 0 });
}
document.getElementById("escenario").onchange = inicia;
document.getElementById("reinicia").onclick = inicia;
const fijaVel = (v) => { vel = v; trabajador.postMessage({ tipo: "velocidad", v }); };
document.getElementById("velocidad").onchange = (e) => fijaVel(+e.target.value);
const bPlan = document.getElementById("plan");
bPlan.onclick = () => { verPlan = !verPlan; bPlan.classList.toggle("activo", verPlan); };

lienzo.addEventListener("click", (e) => {
  if (!escena) return;
  const r = lienzo.getBoundingClientRect();
  let [x, y] = aMundo(e.clientX - r.left, e.clientY - r.top);
  x = Math.max(-270, Math.min(270, x)); y = Math.max(-190, Math.min(190, y));
  // el Worker vuelve al final del intervalo que se está viendo y recalcula desde ahí
  const k = cola.length ? cola[0].k : kVisto;
  trabajador.postMessage({ tipo: "destino", x, y, k });
});

// --- reproducción ----------------------------------------------------------------------
let tPrev = null;
function cuadro(t) {
  const dt = tPrev === null ? 0 : Math.min(0.1, (t - tPrev) / 1000); tPrev = t;
  if (cola.length) {
    reloj += dt * vel * 2;                                  // 1× = 2 unidades de tiempo por segundo
    const iv = cola[0], F = iv.fotos.length, durac = 2.5;
    const s = Math.min(1, reloj / durac) * F;               // posición dentro del intervalo
    const i = Math.min(F - 1, Math.floor(s)), a = s - i;
    const A = i === 0 ? ultimo : iv.fotos[i - 1], B = iv.fotos[i];
    const X = mezcla(A.X, B.X, a), Y = mezcla(A.Y, B.Y, a);
    pinta(X, Y, iv);
    if (reloj >= durac) {
      reloj -= durac; ultimo = iv.fotos[F - 1]; cola.shift();
      for (let j = 0; j < 3; j++) { rastro[j].push([ultimo.Y[2 * j], ultimo.Y[2 * j + 1]]); if (rastro[j].length > 24) rastro[j].shift(); }
      kVisto = iv.k; trabajador.postMessage({ tipo: "consumido", k: iv.k });
    }
  } else if (ultimo && escena) pinta(ultimo.X, ultimo.Y, null);
  requestAnimationFrame(cuadro);
}
const mezcla = (A, B, a) => { const o = new Float32Array(A.length); for (let i = 0; i < A.length; i++) o[i] = A[i] + a * (B[i] - A[i]); return o; };

function pinta(X, Y, iv) {
  const c = ctx; c.fillStyle = COL.campo; c.fillRect(0, 0, lienzo.width, lienzo.height);
  const linea = ([xa, ya, xb, yb], col, ancho, guion = []) => {
    const [a, b] = aLienzo(xa, ya), [d, e] = aLienzo(xb, yb);
    c.strokeStyle = col; c.lineWidth = ancho; c.setLineDash(guion); c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); c.setLineDash([]);
  };
  [[-290, -210, 290, -210], [290, -210, 290, 210], [290, 210, -290, 210], [-290, 210, -290, -210]].forEach((s) => linea(s, COL.valla, 4));
  for (const s of escena.corral.seg) linea(s, COL.pared, 5);
  linea(escena.corral.puerta, COL.obj, 2, [6, 6]);
  // destino
  const [ox, oy] = aLienzo(...escena.obj);
  c.strokeStyle = COL.obj; c.lineWidth = 2.5; c.beginPath(); c.arc(ox, oy, 14, 0, 2 * Math.PI); c.stroke();
  c.beginPath(); c.moveTo(ox - 6, oy); c.lineTo(ox + 6, oy); c.moveTo(ox, oy - 6); c.lineTo(ox, oy + 6); c.stroke();
  // lo que planean: camino del rebaño con su subobjetivo, superovejas y destino de cada perro
  if (verPlan && iv && iv.camino && iv.camino.length > 1) {
    c.strokeStyle = "rgba(245,158,11,.45)"; c.lineWidth = 2; c.setLineDash([2, 6]); c.beginPath();
    iv.camino.forEach(([x, y], i) => { const [a, b] = aLienzo(x, y); i ? c.lineTo(a, b) : c.moveTo(a, b); });
    c.stroke(); c.setLineDash([]);
    // la zanahoria: el objetivo intermedio que ve el MPC
    if (iv.corte > 0 && iv.zan) { const [a, b] = aLienzo(iv.zan[0], iv.zan[1]); c.fillStyle = "rgba(245,158,11,.85)"; c.beginPath(); c.arc(a, b, 7, 0, 2 * Math.PI); c.fill(); }
  }
  if (verPlan && iv) {
    for (let j = 0; j < 10; j++) {
      if (iv.peso[j] < 0.5) continue;
      const [a, b] = aLienzo(iv.centros[2 * j], iv.centros[2 * j + 1]);
      c.strokeStyle = "rgba(232,238,246,.35)"; c.lineWidth = 1.5; c.beginPath(); c.arc(a, b, 4 + 2.2 * Math.sqrt(iv.peso[j]) * 2, 0, 2 * Math.PI); c.stroke();
    }
    iv.roles.forEach((r, j) => {
      const [a, b] = aLienzo(Y[2 * j], Y[2 * j + 1]), [d, e] = aLienzo(...r.destino);
      c.strokeStyle = PERROS[j]; c.lineWidth = 1.5; c.setLineDash(r.arco ? [3, 5] : [8, 4]);
      c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.arc(d, e, 5, 0, 2 * Math.PI); c.stroke();
    });
  }
  // rastros de los perros
  rastro.forEach((r, j) => {
    if (r.length < 2) return;
    c.strokeStyle = PERROS[j]; c.globalAlpha = 0.35; c.lineWidth = 2; c.beginPath();
    r.forEach(([x, y], i) => { const [a, b] = aLienzo(x, y); i ? c.lineTo(a, b) : c.moveTo(a, b); });
    const [a, b] = aLienzo(Y[2 * j], Y[2 * j + 1]); c.lineTo(a, b); c.stroke(); c.globalAlpha = 1;
  });
  // ovejas y perros
  const ro = Math.max(2.5, 2.4 * escala);
  c.fillStyle = COL.oveja; c.strokeStyle = COL.borde; c.lineWidth = 1;
  for (let i = 0; i < X.length / 2; i++) { const [a, b] = aLienzo(X[2 * i], X[2 * i + 1]); c.beginPath(); c.arc(a, b, ro, 0, 2 * Math.PI); c.fill(); c.stroke(); }
  for (let j = 0; j < 3; j++) {
    const [a, b] = aLienzo(Y[2 * j], Y[2 * j + 1]);
    c.fillStyle = PERROS[j]; c.strokeStyle = COL.campo; c.lineWidth = 2.5; c.beginPath(); c.arc(a, b, ro * 2.3, 0, 2 * Math.PI); c.fill(); c.stroke();
  }
  const dentro = iv ? `${iv.dentro}/${iv.n} dentro · ` : "";
  const estado = escena.enCorral === false ? `${iv ? iv.enElCorral : 0} aún en el corral · ` : dentro;
  hud.textContent = iv ? `t = ${iv.t.toFixed(0)} · ${estado}decisión ${msMedio.toFixed(0)} ms · adelanto ${cola.length}` : "calculando…";
}
requestAnimationFrame(cuadro);
