// De CalculiX al tejado: la hoja de termobimetal con su malla, curvándose de 0 a 30 K (desplazamientos de
// CalculiX, tmp/anim-hoja.json), y luego la cámara se aleja y la hoja es una de las que cubren las
// ventilaciones del tejado de un invernadero durante un día de julio (tmp/anim-dia.json).
// window.__portada.fotograma(t) dibuja el instante t (s); el bucle dura DURACION y cierra en sí mismo.
import * as THREE from "three";

const hoja = await (await fetch("../tmp/anim-hoja.json")).json();
const dia = await (await fetch("../tmp/anim-dia.json")).json();
export const DURACION = 19;

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camara = new THREE.PerspectiveCamera(35, W / H, 5, 60000);

// ---------- la hoja: superficie media de la malla real, deformada por ΔT
const { nx, ny, L, b } = hoja, NV = (nx + 1) * (ny + 1);
const base = new Float32Array(NV * 3), pos = new Float32Array(NV * 3), col = new Float32Array(NV * 3);
hoja.xy.forEach(([x, y], k) => { base[3 * k] = x; base[3 * k + 1] = 0; base[3 * k + 2] = y; });
const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
const tri = [], lin = [];
const id = (i, j) => j * (nx + 1) + i;
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tri.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) lin.push(id(i, j), id(i + 1, j));
for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) lin.push(id(i, j), id(i, j + 1));
geo.setIndex(tri);
const geoLineas = new THREE.BufferGeometry();
geoLineas.setAttribute("position", geo.getAttribute("position"));
geoLineas.setIndex(lin);

// mapa de color tipo viridis para la subida (0–80 mm)
const PARADAS = [[0.267, 0.005, 0.329], [0.283, 0.141, 0.458], [0.254, 0.265, 0.53], [0.207, 0.372, 0.553], [0.164, 0.471, 0.558],
  [0.128, 0.567, 0.551], [0.135, 0.659, 0.518], [0.267, 0.749, 0.441], [0.478, 0.821, 0.318], [0.741, 0.873, 0.15], [0.993, 0.906, 0.144]];
function viridis(u) {
  u = Math.min(1, Math.max(0, u)) * (PARADAS.length - 1);
  const i = Math.min(PARADAS.length - 2, Math.floor(u)), f = u - i, a = PARADAS[i], c = PARADAS[i + 1];
  return [a[0] + f * (c[0] - a[0]), a[1] + f * (c[1] - a[1]), a[2] + f * (c[2] - a[2])];
}
{ // la barra de color del HUD
  const g = PARADAS.map((c, k) => `rgb(${c.map((v) => Math.round(255 * v)).join(",")}) ${100 - (100 * k) / (PARADAS.length - 1)}%`).reverse();
  document.getElementById("barra").style.background = `linear-gradient(to top, ${PARADAS.map((c, k) => `rgb(${c.map((v) => Math.round(255 * v)).join(",")}) ${(100 * k) / (PARADAS.length - 1)}%`).join(",")})`;
}

/** Deforma la hoja a ΔT (interpola entre los pasos de un grado de CalculiX). Devuelve la subida de la punta. */
function deforma(dT) {
  const d = Math.min(30, Math.max(0, dT)), i0 = Math.min(29, Math.floor(d)), f = d - i0, A = hoja.U[i0], B = hoja.U[i0 + 1];
  for (let k = 0; k < NV; k++) {
    const ux = A[3 * k] + f * (B[3 * k] - A[3 * k]), uy = A[3 * k + 1] + f * (B[3 * k + 1] - A[3 * k + 1]), uz = A[3 * k + 2] + f * (B[3 * k + 2] - A[3 * k + 2]);
    pos[3 * k] = base[3 * k] + ux; pos[3 * k + 1] = uz; pos[3 * k + 2] = base[3 * k + 2] + uy;   // z de CalculiX → y de three
    const c = viridis(uz / 80); col[3 * k] = c[0]; col[3 * k + 1] = c[1]; col[3 * k + 2] = c[2];
  }
  geo.getAttribute("position").needsUpdate = true; geo.getAttribute("color").needsUpdate = true;
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  return hoja.punta[i0] + f * (hoja.punta[i0 + 1] - hoja.punta[i0]);
}

const matHojaFE = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.15, transparent: true });
const matLineas = new THREE.LineBasicMaterial({ color: 0x08111d, transparent: true, opacity: 0.85 });
const matHojaMetal = new THREE.MeshStandardMaterial({ color: 0xe9edf1, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.55 });

// ---------- el invernadero (mm): nave a dos aguas de 6 m × 8 m, aleros a 3 m, tejado a 25°
const RAD = Math.PI / 180, PEND = 25 * RAD, ANCHO = 6000, LARGO = 8000, ALERO = 3000;
const CUMBRE = ALERO + (ANCHO / 2) * Math.tan(PEND), FALDON = ANCHO / 2 / Math.cos(PEND);
const inv = new THREE.Group(); scene.add(inv);
const fundibles = [];                                     // materiales que aparecen al alejarse
const mat = (o) => { const m = new THREE.MeshStandardMaterial({ transparent: true, ...o }); m.userData.opacidad = o.opacity ?? 1; fundibles.push(m); return m; };
const vidrio = mat({ color: 0xbfe0f2, roughness: 0.1, metalness: 0, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
const perfil = mat({ color: 0xc9d2dc, roughness: 0.5, metalness: 0.6 });
const suelo = mat({ color: 0x6f8f4e, roughness: 1 });
const tierra = mat({ color: 0x5a4632, roughness: 1 });
const hueco = mat({ color: 0x1b2a1f, roughness: 1, opacity: 0.85 });

const sueloM = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), suelo);
sueloM.rotation.x = -Math.PI / 2; sueloM.receiveShadow = true; inv.add(sueloM);
const banco = new THREE.Mesh(new THREE.BoxGeometry(ANCHO - 600, 40, LARGO - 600), tierra);
banco.position.set(0, 20, 0); inv.add(banco);
// tomateras: columnas verdes
const matPlanta = mat({ color: 0x3f7d3a, roughness: 0.9 });
for (let fx = -2; fx <= 2; fx++) for (let fz = -6; fz <= 6; fz++) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(180, 220, 1700, 7), matPlanta);
  p.position.set(fx * 1100, 850, fz * 560); p.castShadow = true; inv.add(p);
}
// paredes de vidrio y frontones
const pared = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vidrio); m.position.set(x, y, z); m.rotation.y = ry; inv.add(m); };
pared(LARGO, ALERO, -ANCHO / 2, ALERO / 2, 0, Math.PI / 2); pared(LARGO, ALERO, ANCHO / 2, ALERO / 2, 0, Math.PI / 2);
pared(ANCHO, ALERO, 0, ALERO / 2, -LARGO / 2, 0); pared(ANCHO, ALERO, 0, ALERO / 2, LARGO / 2, 0);
for (const z of [-LARGO / 2, LARGO / 2]) {
  const s = new THREE.Shape([new THREE.Vector2(-ANCHO / 2, ALERO), new THREE.Vector2(ANCHO / 2, ALERO), new THREE.Vector2(0, CUMBRE)]);
  const m = new THREE.Mesh(new THREE.ShapeGeometry(s), vidrio); m.position.z = z; inv.add(m);
}
// perfiles: montantes, aleros, cumbrera
const barra = (a, b2, g = 45) => {
  const d = new THREE.Vector3().subVectors(b2, a), m = new THREE.Mesh(new THREE.BoxGeometry(g, g, d.length()), perfil);
  m.position.copy(a).addScaledVector(d, 0.5); m.lookAt(b2); inv.add(m);
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
for (let z = -LARGO / 2; z <= LARGO / 2 + 1; z += 1000) {
  barra(V(-ANCHO / 2, 0, z), V(-ANCHO / 2, ALERO, z)); barra(V(ANCHO / 2, 0, z), V(ANCHO / 2, ALERO, z));
  barra(V(-ANCHO / 2, ALERO, z), V(0, CUMBRE, z)); barra(V(ANCHO / 2, ALERO, z), V(0, CUMBRE, z));
}
for (const x of [-ANCHO / 2, ANCHO / 2]) barra(V(x, ALERO, -LARGO / 2), V(x, ALERO, LARGO / 2));
barra(V(0, CUMBRE, -LARGO / 2), V(0, CUMBRE, LARGO / 2), 70);

// faldón con ventilaciones: sistema local del faldón derecho (u: a lo largo de la nave, v: pendiente abajo)
const faldon = new THREE.Group(); inv.add(faldon);
faldon.position.set(0, CUMBRE, 0); faldon.rotation.z = -PEND;          // el eje x local baja por el faldón
for (const lado of [-1, 1]) {                                                  // los dos faldones de vidrio
  const m = new THREE.Mesh(new THREE.PlaneGeometry(FALDON, LARGO), vidrio);
  m.rotation.x = -Math.PI / 2; m.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -lado * PEND);
  m.position.set((lado * ANCHO) / 4, (ALERO + CUMBRE) / 2, 0); inv.add(m);
}

// hojas: filas a lo largo de la pendiente, columnas a lo largo de la nave; bisagra arriba, la punta baja
const FILAS = 5, COLS = 16, PASO_L = 165, PASO_B = 56, PARCHES = [-2800, -1000, 800, 2600], X0 = 250;
const nHojas = FILAS * COLS * PARCHES.length;
const hojasRoof = new THREE.InstancedMesh(geo, matHojaMetal, nHojas);
hojasRoof.castShadow = true;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
let k = 0, kFoco = 0;
for (const zc of PARCHES) {
  const marco = new THREE.Mesh(new THREE.PlaneGeometry(FILAS * PASO_L + 60, COLS * PASO_B + 60), hueco);
  marco.rotation.x = -Math.PI / 2; marco.position.set(X0 + (FILAS * PASO_L) / 2, -8, zc + (COLS * PASO_B) / 2 - PASO_B / 2); faldon.add(marco);
  for (let r = 0; r < FILAS; r++) for (let c = 0; c < COLS; c++) {
    if (zc === 800 && r === 2 && c === 8) kFoco = k;
    m4.compose(new THREE.Vector3(X0 + r * PASO_L, 0, zc + c * PASO_B - PASO_B / 2), q, s1);
    hojasRoof.setMatrixAt(k++, m4);
  }
}
faldon.add(hojasRoof);
// la hoja de CalculiX (con malla) ocupa el sitio de una de ellas
const foco = new THREE.Group();
const mFE = new THREE.Mesh(geo, matHojaFE), mLin = new THREE.LineSegments(geoLineas, matLineas);
mLin.position.y = 0.02; foco.add(mFE, mLin);
const empotre = new THREE.Mesh(new THREE.BoxGeometry(14, 8, b + 16), new THREE.MeshStandardMaterial({ color: 0x8a96a6, roughness: 0.6, metalness: 0.4 }));
empotre.position.set(-7, 0, b / 2); foco.add(empotre);
{ const t = new THREE.Matrix4(); hojasRoof.getMatrixAt(kFoco, t); foco.applyMatrix4(t);
  hojasRoof.setMatrixAt(kFoco, new THREE.Matrix4().makeScale(0, 0, 0)); }   // su sitio lo ocupa la hoja de CalculiX
faldon.add(foco);

// ---------- luz y cielo
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x3b4a2a, 0.9); scene.add(hemi);
const sol = new THREE.DirectionalLight(0xfff1d6, 2.2); scene.add(sol, sol.target);
sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -9000, right: 9000, top: 9000, bottom: -9000, near: 100, far: 40000 });
const relleno = new THREE.DirectionalLight(0x9fb8d8, 0.7); relleno.position.set(-3000, 4000, 6000); scene.add(relleno);
const BLANCO = new THREE.Color(0xe9edf1), AMBAR = new THREE.Color(0xf2a33a);
const NAVY = new THREE.Color(0x0d1f36), CIELO = new THREE.Color(0x6e9cc7), ALBA = new THREE.Color(0x3a4f78);

// ---------- guion
const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const tramo = (t, a, b2) => suave((t - a) / (b2 - a));
function diaEn(hora) {
  const F = dia.filas, x = Math.min(F.length - 1.0001, Math.max(0, (hora / 24) * (F.length - 1))), i = Math.floor(x), f = x - i;
  const a = F[i], c = F[i + 1], m = (p) => a[p] + f * (c[p] - a[p]);
  return { dT: m("dT"), Te: m("Te"), hoja: m("hoja"), el: m("sol_el"), az: m("sol_az") };
}
const pFoco = new THREE.Vector3();
const normal = new THREE.Vector3();
function camaraEn(u) {
  // u = 0: de cerca a la hoja de CalculiX; u = 1: el faldón con las hojas. La cámara sale por encima del
  // tejado (curva de Bézier con el punto de control alto) para no atravesar la estructura.
  foco.getWorldPosition(pFoco); pFoco.add(new THREE.Vector3(70, 10, 25).applyQuaternion(faldon.quaternion));
  normal.set(0, 1, 0).applyQuaternion(faldon.quaternion);
  const cerca = pFoco.clone().add(new THREE.Vector3(95, 125, 175));
  // al final, a lo largo de la cumbrera y un poco por encima del faldón: se ve el perfil de las hojas al curvarse
  const lejos = new THREE.Vector3(1060, 4420, 3600), mira = new THREE.Vector3(620, 4090, 1150);
  const control = pFoco.clone().addScaledVector(normal, 1500).add(new THREE.Vector3(800, 0, 1200));
  const e = suave(u), a1 = 1 - e;
  camara.position.set(0, 0, 0).addScaledVector(cerca, a1 * a1).addScaledVector(control, 2 * a1 * e).addScaledVector(lejos, e * e);
  camara.lookAt(new THREE.Vector3().lerpVectors(pFoco, mira, Math.pow(e, 0.8)));
}

const $ = (i) => document.getElementById(i);
const fmt = (v, d = 0) => v.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
function fotograma(t) {
  t = ((t % DURACION) + DURACION) % DURACION;
  // 0–4 s calienta a 30 K; 4–5,5 enfría; 5,5–8 se aleja; 8–15,5 pasa el día; 15,5–19 vuelve a la hoja
  const calor = t < 4 ? 30 * tramo(t, 0.4, 4) : t < 5.5 ? 30 * (1 - tramo(t, 4, 5.5)) : 0;
  const lejos = t < 5.5 ? 0 : t < 8 ? tramo(t, 5.5, 8) : t < 15.5 ? 1 : 1 - tramo(t, 15.5, 19);
  const hora = 4.5 + 17 * Math.min(1, Math.max(0, (t - 7.2) / (15.8 - 7.2)));
  const d = diaEn(hora);
  const dT = t < 5.5 ? calor : d.dT * tramo(t, 6.5, 8.2) * (1 - tramo(t, 15.8, 16.6));
  const punta = deforma(dT);
  matHojaMetal.color.copy(BLANCO).lerp(AMBAR, Math.min(1, dT / 12));          // las hojas calientes, en ámbar
  // aparece el invernadero y se va la malla
  for (const m of fundibles) m.opacity = m.userData.opacidad * tramo(lejos, 0.05, 0.45);
  hojasRoof.visible = lejos > 0.02;
  matLineas.opacity = 0.85 * (1 - tramo(lejos, 0.1, 0.5)); matHojaFE.opacity = 1;
  const color = lejos > 0.5 ? 1 - tramo(lejos, 0.5, 0.8) : 1;               // la hoja del foco pasa a ser de metal
  matHojaFE.vertexColors = true; mFE.material = color > 0.02 ? matHojaFE : matHojaMetal; empotre.visible = lejos < 0.4;
  camaraEn(lejos);
  // sol y cielo (de noche en los extremos del bucle)
  const de = tramo(lejos, 0.3, 1);
  const el = d.el * RAD, az = d.az * RAD;                                     // az: 0 al sur, + al oeste
  // el faldón de las hojas (+x) mira al sur: sur = +x, oeste = +z
  sol.position.set(Math.cos(az) * Math.cos(el) * 20000, Math.max(0.05, Math.sin(el)) * 20000, Math.sin(az) * Math.cos(el) * 20000);
  const luzDia = tramo(d.el, -6, 12);
  sol.intensity = 2.4 * luzDia * de + 0.9 * (1 - de); if (de < 0.5) sol.position.set(4000, 9000, 6000);
  hemi.intensity = 0.35 + 0.65 * (de * luzDia + (1 - de));
  scene.background = NAVY.clone().lerp(luzDia > 0.5 ? CIELO : ALBA, de * (0.25 + 0.75 * luzDia));
  // HUD
  $("calculix").style.opacity = 1 - tramo(lejos, 0, 0.12);
  $("barra").style.opacity = 1 - tramo(lejos, 0, 0.12);
  $("dia").style.opacity = tramo(lejos, 0.6, 0.95);
  $("dT").textContent = `+${fmt(dT, 1)} K`; $("punta").textContent = `${fmt(punta)} mm`;
  const hh = Math.floor(hora), mm = Math.floor((hora - hh) * 60 / 10) * 10;
  $("reloj").textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  $("Te").textContent = `${fmt(d.Te)} °C`; $("Th").textContent = `${fmt(d.hoja)} °C`;
  renderer.render(scene, camara);
}
window.__portada = { fotograma, DURACION };
if (!new URLSearchParams(location.search).has("grabar")) {
  const t0 = performance.now();
  const bucle = () => { fotograma((performance.now() - t0) / 1000); requestAnimationFrame(bucle); };
  bucle();
}
