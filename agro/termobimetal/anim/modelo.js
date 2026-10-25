// Animaciones de la sección «El modelo en CalculiX» (modelo.html?modo=...):
//   bilamina   por qué se dobla: dos láminas que se dilatan distinto, pegadas (esquema, exagerado)
//   malla      el elemento C3D8I, las dos capas, la malla de 75 × 24 × 2, el empotramiento y la carga (3D)
//   elementos  C3D8 se bloquea y C3D8I no (CalculiX, tmp/anim-modelo.json)
//   giros      cálculo lineal frente a giros grandes (CalculiX, tmp/anim-modelo.json)
// window.__portada.fotograma(t) dibuja el instante t; cada modo cierra su bucle en DURACION.
import * as THREE from "three";

const modo = new URLSearchParams(location.search).get("modo") || "bilamina";
const W = innerWidth, H = innerHeight;
const C = { fondo: "#0d1f36", panel: "#13294a", borde: "#2d4466", texto: "#e8eef6", suave: "#c4d2e3", tenue: "#8fa3bd",
  activa: "#e07a5f", pasiva: "#9fb3c8", ambar: "#f2c14e", rojo: "#ef4444", azul: "#4f9be8", verde: "#5bc08a" };
const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const tramo = (t, a, b) => suave((t - a) / (b - a));
const fmt = (v, d = 0) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

const lienzo = document.createElement("canvas");
lienzo.width = W; lienzo.height = H;
Object.assign(lienzo.style, { position: "absolute", inset: "0" });
const cx = lienzo.getContext("2d");
const U = W / 100;                                                     // unidad de tipografía: 1 % del ancho
function texto(s, x, y, { t = 1.6, color = C.texto, peso = 400, alinea = "left", base = "alphabetic" } = {}) {
  cx.font = `${peso} ${t * U}px "Noto Sans", system-ui, sans-serif`; cx.fillStyle = color; cx.textAlign = alinea; cx.textBaseline = base;
  cx.fillText(s, x, y);
}
function titulo(a, b) { texto(a, 4.5 * U, 6 * U, { t: 2.4, peso: 700 }); if (b) texto(b, 4.5 * U, 9.2 * U, { t: 1.55, color: C.suave }); }
function flecha(x0, y0, x1, y1, color, g = 0.35 * U) {
  const a = Math.atan2(y1 - y0, x1 - x0), p = 1.6 * g + 0.6 * U;
  cx.strokeStyle = color; cx.fillStyle = color; cx.lineWidth = g; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x1 - p * Math.cos(a), y1 - p * Math.sin(a)); cx.stroke();
  cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - p * Math.cos(a - 0.45), y1 - p * Math.sin(a - 0.45)); cx.lineTo(x1 - p * Math.cos(a + 0.45), y1 - p * Math.sin(a + 0.45)); cx.closePath(); cx.fill();
}
function empotre(x, y, alto) {
  cx.fillStyle = "#8a96a6"; cx.fillRect(x - 1.2 * U, y - alto / 2, 1.2 * U, alto);
  cx.strokeStyle = "#5b6676"; cx.lineWidth = 1.5;
  for (let k = -alto / 2; k < alto / 2; k += 0.8 * U) { cx.beginPath(); cx.moveTo(x - 1.2 * U, y + k + 0.8 * U); cx.lineTo(x - 0.4 * U, y + k); cx.stroke(); }
}
function fondo() { cx.fillStyle = C.fondo; cx.fillRect(0, 0, W, H); }
const largo = (P) => P.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);

// ---------------------------------------------------------------- por qué se dobla
function bilamina(t) {
  fondo();
  titulo("Por qué se dobla una bilámina", "dos metales que se dilatan distinto, pegados (esquema: dilatación y curvatura exageradas)");
  const x0 = 14 * U, L0 = 56 * U, h = 2.0 * U;                         // largo y espesor de cada lámina en el dibujo
  const calor = tramo(t, 0.6, 2.6) * (1 - tramo(t, 10, 11.4));
  const pega = tramo(t, 3.6, 4.8) * (1 - tramo(t, 10, 11.4));
  const curva = tramo(t, 5.6, 7.6) * (1 - tramo(t, 10, 11.4));
  const eA = 0.13, eP = 0.015;                                         // alargamientos (exagerados)
  const yP0 = 31 * U, yA0 = 40 * U, yM = 35.5 * U;
  // termómetro
  const tx = 91 * U, ty0 = 20 * U, ty1 = 44 * U;
  cx.fillStyle = C.panel; cx.fillRect(tx - 0.9 * U, ty0, 1.8 * U, ty1 - ty0);
  cx.fillStyle = C.rojo; const tc = ty1 - (ty1 - ty0) * (0.15 + 0.8 * calor); cx.fillRect(tx - 0.6 * U, tc, 1.2 * U, ty1 - tc);
  cx.beginPath(); cx.arc(tx, ty1 + 1.2 * U, 1.6 * U, 0, 2 * Math.PI); cx.fill();
  texto(`ΔT = +${fmt(30 * calor)} K`, tx, ty0 - 1.4 * U, { t: 1.5, alinea: "center", color: C.ambar, peso: 700 });
  if (curva < 0.02) {
    // las dos láminas rectas: sueltas (separadas) o pegadas (juntas, con el mismo largo)
    const LA = L0 * (1 + eA * calor), LP = L0 * (1 + eP * calor), Lc = L0 * (1 + 0.5 * (eA + eP) * calor);
    const la = LA + (Lc - LA) * pega, lp = LP + (Lc - LP) * pega;
    const yP = yP0 + (yM - h - yP0) * pega, yA = yA0 + (yM - yA0) * pega;
    cx.fillStyle = C.pasiva; cx.fillRect(x0, yP, lp, h);
    cx.fillStyle = C.activa; cx.fillRect(x0, yA, la, h);
    if (pega < 0.5) {
      texto("tipo Invar: casi no se dilata", x0, yP - 1 * U, { t: 1.4, color: C.pasiva });
      texto("aleación de níquel y manganeso: se dilata mucho", x0, yA + h + 2.4 * U, { t: 1.4, color: C.activa });
    }
    if (calor > 0.5 && pega < 0.05) {
      // dónde acaba la de arriba, y lo que se alarga de más la de abajo
      cx.strokeStyle = C.ambar; cx.lineWidth = 1.5; cx.setLineDash([0.6 * U, 0.5 * U]);
      cx.beginPath(); cx.moveTo(x0 + LP, yP); cx.lineTo(x0 + LP, yA + h + 0.6 * U); cx.stroke(); cx.setLineDash([]);
      flecha(x0 + LP, yA + h + 0.6 * U, x0 + LA, yA + h + 0.6 * U, C.ambar, 0.2 * U);
      texto("sueltas, la de abajo se alarga más", x0 + LA, yA + h + 3.2 * U, { t: 1.4, color: C.ambar, alinea: "right" });
    }
    if (pega > 0.9) {                                                // pegadas: una tira de la otra
      for (let k = 0.2; k <= 0.9; k += 0.35) {
        const x = x0 + k * Lc;
        flecha(x - 3.5 * U, yM + h + 1.6 * U, x - 7 * U, yM + h + 1.6 * U, C.activa, 0.25 * U);
        flecha(x + 0.5 * U, yM - h - 1.4 * U, x + 4 * U, yM - h - 1.4 * U, C.pasiva, 0.25 * U);
      }
      texto("pegadas: la de abajo queda comprimida y la de arriba estirada", x0, yM + 8 * U, { t: 1.5, color: C.ambar });
      texto("las dos fuerzas no están a la misma altura: forman un par que dobla la lámina", x0, yM + 10.6 * U, { t: 1.4, color: C.suave });
    }
  } else {
    // curvada: arco de radio R con la unión en el medio; la de abajo, por fuera (más larga)
    const Lc = L0 * (1 + 0.5 * (eA + eP));
    const ang = 0.75 * curva, R = Lc / Math.max(ang, 1e-6);
    // centro del arco por encima del empotramiento: punto (x0 + r sin a, yM - R + r cos a) con r desde el centro
    const capa = (r0, r1, color) => {
      cx.beginPath();
      for (let i = 0; i <= 60; i++) { const a = (ang * i) / 60; const x = x0 + r1 * Math.sin(a), y = yM - R + r1 * Math.cos(a); i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
      for (let i = 60; i >= 0; i--) { const a = (ang * i) / 60; cx.lineTo(x0 + r0 * Math.sin(a), yM - R + r0 * Math.cos(a)); }
      cx.closePath(); cx.fillStyle = color; cx.fill();
    };
    capa(R - h, R, C.pasiva); capa(R, R + h, C.activa);
    texto("κ = k ΔT / s", x0, yM + 7 * U, { t: 2.4, color: C.ambar, peso: 700 });
    texto("k = ³⁄₂ (α de abajo − α de arriba), si las dos capas son iguales (Timoshenko, 1925)", x0, yM + 10.6 * U, { t: 1.45, color: C.suave });
    texto("el fabricante da k: Kanthal 230, 43·10⁻⁶ K⁻¹  →  con 0,2 mm y +30 K, un radio de 15 cm", x0, yM + 13.2 * U, { t: 1.45, color: C.suave });
  }
}

// ---------------------------------------------------------------- elementos y giros (datos de CalculiX)
let MOD = null;
const lineaEn = (caso, dT) => {
  const dts = MOD.dT, paso = dts[1] - dts[0], i = Math.min(dts.length - 2, Math.max(0, Math.floor(dT / paso)));
  const a = MOD.lineas[caso][i], b = MOD.lineas[caso][i + 1], f = Math.min(1, Math.max(0, (dT - dts[i]) / (dts[i + 1] - dts[i])));
  return a.map((p, k) => [p[0] + f * (b[k][0] - p[0]), p[1] + f * (b[k][1] - p[1])]);
};
function vista(P, ox, oy, esc) { return P.map(([x, z]) => [ox + x * esc, oy - z * esc]); }
function polilinea(P, color, g, discontinua = false) {
  cx.strokeStyle = color; cx.lineWidth = g; cx.lineJoin = "round"; cx.setLineDash(discontinua ? [1.2 * U, 0.8 * U] : []);
  cx.beginPath(); P.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke(); cx.setLineDash([]);
}
function nodos(P, color, cada = 5, r = 0.32 * U) { cx.fillStyle = color; P.forEach(([x, y], i) => { if (i % cada === 0 || i === P.length - 1) { cx.beginPath(); cx.arc(x, y, r, 0, 2 * Math.PI); cx.fill(); } }); }
const rampa = (t) => 30 * tramo(t, 0.6, 4.6) * (1 - tramo(t, 6.6, 8.6));

function elementos(t) {
  fondo();
  titulo("Elegir el elemento", "la misma malla (75 × 24 elementos, uno por capa en el espesor) con dos hexaedros distintos · vista de perfil");
  const dT = rampa(t), esc = (44 * U) / MOD.L, ox = 14 * U, oy = 42 * U;
  const k = MOD.k, kap = (k * dT) / MOD.s, fP = [];
  for (let i = 0; i <= 60; i++) { const s = (MOD.L * i) / 60; fP.push(kap > 1e-9 ? [Math.sin(kap * s) / kap, (1 - Math.cos(kap * s)) / kap] : [s, 0]); }
  empotre(ox, oy, 6 * U);
  polilinea(vista(fP, ox, oy, esc), C.texto, 0.18 * U, true);
  const bueno = vista(lineaEn("C3D8I", dT), ox, oy, esc), malo = vista(lineaEn("C3D8", dT), ox, oy, esc);
  polilinea(malo, C.rojo, 0.55 * U); nodos(malo, C.rojo);
  polilinea(bueno, C.verde, 0.55 * U); nodos(bueno, C.verde);
  const zb = lineaEn("C3D8I", dT).at(-1)[1], zm = lineaEn("C3D8", dT).at(-1)[1];
  texto(`ΔT = +${fmt(dT)} K`, 95 * U, 14 * U, { t: 1.9, color: C.ambar, peso: 700, alinea: "right" });
  const ly = 20 * U;
  cx.fillStyle = C.verde; cx.fillRect(60 * U, ly - 1.1 * U, 2.2 * U, 0.5 * U);
  texto(`C3D8I (modos incompatibles): la punta sube ${fmt(zb)} mm`, 63.5 * U, ly, { t: 1.45, color: C.texto });
  cx.fillStyle = C.rojo; cx.fillRect(60 * U, ly + 2.3 * U, 2.2 * U, 0.5 * U);
  texto(`C3D8 (hexaedro lineal): ${fmt(zm, 1)} mm, se bloquea`, 63.5 * U, ly + 3.4 * U, { t: 1.45, color: C.texto });
  cx.strokeStyle = C.texto; cx.lineWidth = 0.18 * U; cx.setLineDash([1.2 * U, 0.8 * U]); cx.beginPath(); cx.moveTo(60 * U, ly + 5.9 * U); cx.lineTo(62.2 * U, ly + 5.9 * U); cx.stroke(); cx.setLineDash([]);
  texto("fórmula del fabricante (κ = k ΔT / s)", 63.5 * U, ly + 6.4 * U, { t: 1.45, color: C.suave });
  texto("(lo que sube de más la verde es el efecto de la anchura)", 63.5 * U, ly + 9 * U, { t: 1.25, color: C.tenue });
  texto("Con un solo elemento en el espesor, el hexaedro lineal no sabe curvarse: para doblarse se deforma", 4.5 * U, 48 * U, { t: 1.45, color: C.suave });
  texto("a cortante, que cuesta muchísima energía, y casi no se mueve (bloqueo por cortante). Los modos incompatibles", 4.5 * U, 50.6 * U, { t: 1.45, color: C.suave });
  texto("le añaden por dentro la forma de flexión que le falta, sin más nodos.", 4.5 * U, 53.2 * U, { t: 1.45, color: C.suave });
}

function giros(t) {
  fondo();
  titulo("Giros grandes", "el mismo elemento C3D8I, con el cálculo lineal y con no linealidad geométrica · vista de perfil");
  const dT = rampa(t), esc = (44 * U) / MOD.L, ox = 14 * U, oy = 42 * U;
  empotre(ox, oy, 6 * U);
  const lin = lineaEn("lineal", dT), nl = lineaEn("C3D8I", dT), base = MOD.lineas.lineal[0];
  const Vl = vista(lin, ox, oy, esc), Vn = vista(nl, ox, oy, esc), Vb = vista(base, ox, oy, esc);
  // en el lineal, cada nodo sube en vertical desde su sitio
  cx.strokeStyle = "rgba(239,68,68,0.35)"; cx.lineWidth = 1;
  Vb.forEach(([x, y], i) => { if (i % 5 === 0) { cx.beginPath(); cx.moveTo(x, y); cx.lineTo(Vl[i][0], Vl[i][1]); cx.stroke(); } });
  polilinea(Vb, C.borde, 0.3 * U);
  polilinea(Vl, C.rojo, 0.5 * U); nodos(Vl, C.rojo);
  polilinea(Vn, C.verde, 0.5 * U); nodos(Vn, C.verde);
  texto(`ΔT = +${fmt(dT)} K`, 95 * U, 14 * U, { t: 1.9, color: C.ambar, peso: 700, alinea: "right" });
  const ly = 20 * U;
  cx.fillStyle = C.verde; cx.fillRect(60 * U, ly - 1.1 * U, 2.2 * U, 0.5 * U);
  texto(`giros grandes (NLGEOM): largo ${fmt(largo(nl), 1)} mm`, 63.5 * U, ly, { t: 1.45 });
  cx.fillStyle = C.rojo; cx.fillRect(60 * U, ly + 2.3 * U, 2.2 * U, 0.5 * U);
  texto(`lineal: largo ${fmt(largo(lin), 1)} mm`, 63.5 * U, ly + 3.4 * U, { t: 1.45 });
  texto("El cálculo lineal supone giros pequeños: mueve cada nodo en vertical y la hoja «se estira» al subir.", 4.5 * U, 49 * U, { t: 1.45, color: C.suave });
  texto("Con no linealidad geométrica, el equilibrio se plantea sobre la forma deformada y la hoja se recoge en arco.", 4.5 * U, 51.6 * U, { t: 1.45, color: C.suave });
}

// ---------------------------------------------------------------- la malla (3D)
let malla = null;
async function montaMalla() {
  const hoja = await (await fetch("../tmp/anim-hoja.json")).json();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setSize(W, H); renderer.setPixelRatio(1); document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, W / H, 0.05, 5000);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x223344, 1.1));
  const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(-40, 120, 80); scene.add(dl);
  const EX = 10, dx = 150 / 75, dz = 50 / 24, dy = 0.1 * EX;           // espesor exagerado ×10
  const geo = new THREE.BoxGeometry(dx * 0.9, dy * 0.92, dz * 0.9);
  const matA = new THREE.MeshStandardMaterial({ color: C.activa, roughness: 0.6 }), matP = new THREE.MeshStandardMaterial({ color: C.pasiva, roughness: 0.6 });
  const capaA = new THREE.InstancedMesh(geo, matA, 75 * 24), capaP = new THREE.InstancedMesh(geo, matP, 75 * 24);
  scene.add(capaA, capaP);
  const esfera = new THREE.SphereGeometry(0.28, 12, 8), esferaEmp = new THREE.SphereGeometry(0.7, 10, 8);
  const matNodo = new THREE.MeshStandardMaterial({ color: 0x08111d }), matUnion = new THREE.MeshStandardMaterial({ color: C.ambar, emissive: 0x6b4b00 });
  const matEmp = new THREE.MeshStandardMaterial({ color: C.rojo, emissive: 0x551111 });
  const nodosUno = [];
  for (const [ix, iy, iz] of [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1], [0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1], [0, 2, 0], [1, 2, 0], [0, 2, 1], [1, 2, 1]]) {
    const m = new THREE.Mesh(esfera, iy === 1 ? matUnion : matNodo); m.position.set(ix * dx, iy * dy, iz * dz); m.userData.iy = iy; scene.add(m); nodosUno.push(m);
  }
  const emp = new THREE.InstancedMesh(esferaEmp, matEmp, 25 * 3); let k = 0;
  for (let j = 0; j <= 24; j++) for (let l = 0; l <= 2; l++) emp.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(0, l * dy, j * dz));
  scene.add(emp);
  const bloque = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 54), new THREE.MeshStandardMaterial({ color: 0x8a96a6, roughness: 0.6, metalness: 0.3 }));
  bloque.position.set(-2.05, dy, 25); scene.add(bloque);
  // superficie deformada para el final (la de CalculiX)
  const { nx, ny } = hoja, NV = (nx + 1) * (ny + 1), pos = new Float32Array(NV * 3);
  const gs = new THREE.BufferGeometry(); gs.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const tri = [], lin = [], id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tri.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) lin.push(id(i, j), id(i + 1, j));
  for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) lin.push(id(i, j), id(i, j + 1));
  gs.setIndex(tri);
  const gl = new THREE.BufferGeometry(); gl.setAttribute("position", gs.getAttribute("position")); gl.setIndex(lin);
  const sup = new THREE.Mesh(gs, new THREE.MeshStandardMaterial({ color: 0xe9a06a, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2 }));
  const supL = new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: 0x08111d, transparent: true, opacity: 0.6 }));
  scene.add(sup, supL);
  const deforma = (dT) => {
    const d = Math.min(30, Math.max(0, dT)), i0 = Math.min(29, Math.floor(d)), f = d - i0, A = hoja.U[i0], B = hoja.U[i0 + 1];
    hoja.xy.forEach(([x, y], q) => {
      pos[3 * q] = x + A[3 * q] + f * (B[3 * q] - A[3 * q]);
      pos[3 * q + 1] = dy + A[3 * q + 2] + f * (B[3 * q + 2] - A[3 * q + 2]);
      pos[3 * q + 2] = y + A[3 * q + 1] + f * (B[3 * q + 1] - A[3 * q + 1]);
    });
    gs.getAttribute("position").needsUpdate = true; gs.computeVertexNormals(); gs.computeBoundingSphere();
  };
  const m4 = new THREE.Matrix4(), cero = new THREE.Matrix4().makeScale(0, 0, 0);
  const coloca = (ncol, nfil, sube) => {
    let q = 0;
    for (let j = 0; j < 24; j++) for (let i = 0; i < 75; i++, q++) {
      const ve = i < ncol && j < nfil;
      capaA.setMatrixAt(q, ve ? m4.makeTranslation((i + 0.5) * dx, dy / 2, (j + 0.5) * dz) : cero);
      capaP.setMatrixAt(q, ve && (i > 0 || j > 0 || sube > 0.01) ? m4.makeTranslation((i + 0.5) * dx, dy * 1.5 + (1 - sube) * 6, (j + 0.5) * dz) : cero);
    }
    capaA.instanceMatrix.needsUpdate = true; capaP.instanceMatrix.needsUpdate = true;
  };
  malla = { renderer, scene, cam, capaA, capaP, nodosUno, emp, bloque, sup, supL, deforma, coloca, dy, dx, dz, matUnion, matNodo };
}

function mallaEn(t) {
  const m = malla;
  // 0–2,5 un elemento; 2,5–4,5 la segunda capa baja y comparte nodos; 4,5–8 crece la malla; 8–9,5 empotramiento;
  // 9,5–12,5 se calienta y se curva; 12,5–14 vuelve al principio
  const sube = tramo(t, 2.6, 3.8), crece = tramo(t, 4.5, 8), curva = tramo(t, 9.6, 11.2) * (1 - tramo(t, 12.4, 13.6));
  const ncol = Math.max(1, Math.round(1 + 74 * Math.pow(crece, 1.4))), nfil = Math.max(1, Math.round(1 + 23 * Math.pow(crece, 1.4)));
  const vuelta = t > 13.3 ? 1 : 0;                                     // tras el fundido, vuelve al primer elemento
  m.coloca(vuelta ? 1 : ncol, vuelta ? 1 : nfil, vuelta ? 0 : sube);
  const enCurva = curva > 0.01;
  m.capaA.visible = m.capaP.visible = !enCurva;
  m.sup.visible = m.supL.visible = enCurva; if (enCurva) m.deforma(30 * curva);
  const verNodos = t < 4.9 || vuelta;
  m.nodosUno.forEach((n) => {
    n.visible = verNodos && (n.userData.iy < 2 || (sube > 0.98 && !vuelta));
    n.position.y = n.userData.iy === 2 ? 2 * m.dy + (1 - sube) * 6 : n.userData.iy * m.dy;
    if (n.userData.iy === 1) n.material = sube > 0.3 && !vuelta ? m.matUnion : m.matNodo;     // los de la unión, en ámbar al pegarse
  });
  m.emp.visible = t > 8 && t < 9.7;
  m.bloque.visible = t > 8.3 && t < 13.3;
  // cámara: de cerca al primer elemento, luego toda la hoja
  const e = vuelta ? 0 : Math.pow(crece, 0.8), aleja = tramo(t, 9.6, 11);   // al curvarse, un poco más lejos
  const cerca = new THREE.Vector3(9, 6.5, 10), lejos = new THREE.Vector3(150, 135, 185).add(new THREE.Vector3(50, 90, 80).multiplyScalar(aleja));
  const miraC = new THREE.Vector3(1, 0.8, 1), miraL = new THREE.Vector3(70, -8 + 30 * aleja, 30);
  m.cam.position.lerpVectors(cerca, lejos, e); m.cam.lookAt(new THREE.Vector3().lerpVectors(miraC, miraL, e));
  m.renderer.render(m.scene, m.cam);
  // texto
  cx.clearRect(0, 0, W, H);
  titulo("La malla", "espesor exagerado ×10 para que se vea");
  const tx = 4.5 * U, ty = 47.5 * U;
  const linea = t < 2.5 || vuelta ? ["Un elemento C3D8I: un hexaedro de 8 nodos (los puntos), con modos incompatibles por dentro.", "Cada nodo tiene tres desplazamientos, las incógnitas del cálculo."]
    : t < 4.6 ? ["Dos capas, una de cada metal, de 0,1 mm cada una.", "Comparten los 4 nodos de la unión (en ámbar): por eso están pegadas."]
    : t < 8.1 ? ["La hoja entera: 75 × 24 elementos por capa, 3600 en total.", "Elementos de 2 × 2,1 mm en planta: 37 veces más anchos que gruesos."]
    : t < 9.6 ? ["Condiciones de contorno: el borde corto está empotrado (sus nodos, en rojo, no se mueven).", "La carga: la misma temperatura en todos los nodos. No hay ninguna fuerza."]
    : ["Al calentarla, la hoja se curva sola. Se resuelve en 30 pasos de 1 K,", "cada uno con iteraciones de Newton sobre la forma deformada."];
  texto(linea[0], tx, ty, { t: 1.6 }); texto(linea[1], tx, ty + 3 * U, { t: 1.6, color: C.suave });
  if (enCurva) texto(`ΔT = +${fmt(30 * curva)} K`, 95 * U, 6 * U, { t: 1.9, color: C.ambar, peso: 700, alinea: "right" });
  // fundido para cerrar el bucle
  const fundido = tramo(t, 12.7, 13.3) * (1 - tramo(t, 13.3, 13.9));
  if (fundido > 0) { cx.fillStyle = `rgba(13,31,54,${fundido})`; cx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- arranque
const DUR = { bilamina: 12, malla: 14, elementos: 9.4, giros: 9.4 }[modo];
if (modo === "malla") await montaMalla(); else MOD = await (await fetch("../tmp/anim-modelo.json")).json();
document.body.appendChild(lienzo);
function fotograma(t) {
  t = ((t % DUR) + DUR) % DUR;
  if (modo === "bilamina") bilamina(t);
  else if (modo === "elementos") elementos(t);
  else if (modo === "giros") giros(t);
  else mallaEn(t);
}
window.__portada = { fotograma, DURACION: DUR };
if (!new URLSearchParams(location.search).has("grabar")) {
  const t0 = performance.now(); const b = () => { fotograma((performance.now() - t0) / 1000); requestAnimationFrame(b); }; b();
}
