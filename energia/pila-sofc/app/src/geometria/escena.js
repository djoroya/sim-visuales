// La geometría de una pila SOFC plana en 3D: la instalación, un stack de 30 celdas con flujo cruzado y el
// despiece de una celda (interconector, ánodo, electrolito, cátodo) con el gas, los iones y los electrones.
// Unidades: centímetros. El stack tiene proporciones reales; el despiece exagera los grosores.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const COLORES = { H2: "#4f9be8", CO: "#a78bfa", CH4: "#3fb27f", H2O: "#9fb3c8", CO2: "#e07a5f", N2: "#5b6f89", O2: "#f2c14e" };
export const NOMBRE = { H2: "H₂", CO: "CO", CH4: "CH₄", H2O: "H₂O", CO2: "CO₂", N2: "N₂", O2: "O₂" };
// Composición del ánodo a la entrada (biogás reformado) y a la salida con 30 A (52 % de utilización), del modelo.
export const ENTRA = { H2: 0.45, H2O: 0.2, CO: 0.1, CO2: 0.2, CH4: 0.05 };
export const SALE = { H2: 0.203, H2O: 0.464, CO: 0.045, CO2: 0.265, CH4: 0.023 };
const O2_ENTRA = 0.2095, O2_SALE = 0.177;
const ORDEN = ["H2", "H2O", "CO", "CO2", "CH4"];   // así el H₂ se vuelve H₂O y el CO y el CH₄, CO₂

const C = { acero: "#9aa3ad", anodo: "#8a6a4a", electrolito: "#efe8d6", catodo: "#34506f", placa: "#6b7480",
  comb: "#7bd389", combSale: "#b5a86a", aire: "#6cb6ff", aireSale: "#a9c8e8", elec: "#f59e0b", ion: "#ff7b25", electron: "#7df9ff" };

/** Pasos del recorrido: cámara, objetivo, visibilidad de cada capa y separación del despiece. */
const DX = 26;                                     // el despiece, a la derecha del stack
export const PASOS = [
  { cam: [26, 30, 44], obj: [-8, 4, -8], v: { sistema: 1, fantasmas: 1, stack: 1, colectores: 1 }, explota: 1 },
  { cam: [22, 15, 28], obj: [0, 5.5, 0], v: { stack: 1, colectores: 1, flechasStack: 1, corriente: 1 }, explota: 1 },
  { cam: [44, 15, 25], obj: [DX, 5, 0], v: { stack: 0.3, resaltado: 1, conector: 1, detalle: 1, interDetalle: 1, pen: 1, sup: 1, capas: 1 }, explota: 1 },
  { cam: [DX + 3, 15, 17], obj: [DX, 3, 0], v: { stack: 0.06, resaltado: 0.35, detalle: 1, interDetalle: 0.3, pen: 0.3, sup: 0.15, combustible: 1, combEtq: 1 }, explota: 0.6 },
  { cam: [DX + 15, 9, 21], obj: [DX, 4.5, 0], v: { stack: 0.06, resaltado: 0.35, detalle: 1, interDetalle: 0.3, pen: 0.45, sup: 1, combustible: 0.5, aire: 1, iones: 1 }, explota: 0.6 },
  { cam: [17, 17, 40], obj: [12, 5, 0], v: { stack: 1, colectores: 0.6, corriente: 1, resaltado: 1, conector: 1, detalle: 1, interDetalle: 1, pen: 1, sup: 1 }, explota: 0 },
];

// ---------- geometría ----------
const caja = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
const NERVIOS = Array.from({ length: 11 }, (_, k) => -4.8 + k * 0.96), ANCHO_NERVIO = 0.4;
const CANALES = NERVIOS.slice(1).map((c, k) => (c + NERVIOS[k]) / 2);

/** Interconector con nervios: abajo a lo largo de z (canales de aire), arriba a lo largo de x (combustible). */
function interconector(geos, y0, nervio, placa, abajo = true, arriba = true) {
  let y = y0;
  if (abajo) { for (const c of NERVIOS) geos.push(caja(c - ANCHO_NERVIO / 2, c + ANCHO_NERVIO / 2, y, y + nervio, -5, 5)); y += nervio; }
  geos.push(caja(-5, 5, y, y + placa, -5, 5)); y += placa;
  if (arriba) { for (const c of NERVIOS) geos.push(caja(-5, 5, y, y + nervio, c - ANCHO_NERVIO / 2, c + ANCHO_NERVIO / 2)); y += nervio; }
  return y;
}

const material = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, transparent: true, ...o });

/** Stack de 30 celdas con proporciones reales: interconector 2 mm, ánodo 0,6, electrolito ~0,1 (exagerado), cátodo 0,3. */
function geometriaStack() {
  const g = { inter: [], anodo: [], elec: [], cat: [] }, n = 0.07, p = 0.06, RES = 14;
  let y = interconector(g.inter, 0, n, 0.8, false, true), yRes = 0;
  for (let k = 0; k < 30; k++) {
    if (k === RES) yRes = y;
    g.anodo.push(caja(-5, 5, y, y + 0.06, -5, 5)); y += 0.06;
    g.elec.push(caja(-5, 5, y, y + 0.012, -5, 5)); y += 0.012;
    g.cat.push(caja(-5, 5, y, y + 0.03, -5, 5)); y += 0.03;
    y = k < 29 ? interconector(g.inter, y, n, p) : interconector(g.inter, y, n, 0.8, true, false);
  }
  return { geos: Object.fromEntries(Object.entries(g).map(([k, v]) => [k, mergeGeometries(v)])), alto: y, yRes };
}

function stackMalla(geo, op = 1) {
  const s = new THREE.Group();
  s.add(new THREE.Mesh(geo.inter, material(C.acero, { metalness: 0.5, roughness: 0.4, opacity: op })));
  s.add(new THREE.Mesh(geo.anodo, material(C.anodo, { opacity: op })));
  s.add(new THREE.Mesh(geo.elec, material(C.electrolito, { opacity: op })));
  s.add(new THREE.Mesh(geo.cat, material(C.catodo, { opacity: op })));
  return s;
}

function flecha(desde, dir, largo, color, r = 0.18) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color, transparent: true });
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, largo - r * 4, 12), m);
  cuerpo.position.y = (largo - r * 4) / 2;
  const punta = new THREE.Mesh(new THREE.ConeGeometry(r * 2.4, r * 4, 16), m);
  punta.position.y = largo - r * 2;
  g.add(cuerpo, punta);
  g.position.copy(desde);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return g;
}

function etiqueta(html, pos, clase = "") {
  const el = document.createElement("div");
  el.className = `etq ${clase}`;                       // CSS2DRenderer usa el transform de fuera; el estilo va dentro
  el.innerHTML = `<div class="caja">${html}</div>`;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  return o;
}

const chips = (fr) => Object.entries(fr).map(([e, f]) => `<span class="chip"><i style="background:${COLORES[e]}"></i>${NOMBRE[e]} ${(f * 100).toLocaleString("es-ES", { maximumFractionDigits: 1 })} %</span>`).join(" ");
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- escena ----------
export function creaEscena(contenedor, { incrustado = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor("#0d1f36");
  contenedor.appendChild(renderer.domElement);
  const etiquetas = new CSS2DRenderer();
  etiquetas.domElement.className = "capa-etiquetas";
  contenedor.appendChild(etiquetas.domElement);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  camara.position.set(...PASOS[0].cam);
  const controles = new OrbitControls(camara, etiquetas.domElement);
  controles.target.set(...PASOS[0].obj);
  controles.enableDamping = true;
  if (incrustado) {
    // dentro del artículo, un dedo hace scroll en la página; con dos se gira y se acerca
    controles.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    etiquetas.domElement.style.touchAction = "pan-y";
    controles.enableZoom = false;                       // la rueda del ratón sigue moviendo la página
  }
  escena.add(new THREE.HemisphereLight("#dfe9ff", "#1a2a40", 1.6));
  const sol = new THREE.DirectionalLight("#ffffff", 2.2);
  sol.position.set(20, 40, 25);
  escena.add(sol);

  // Visibilidad por capas: cada objeto depende del producto de una o varias claves.
  const capas = {}, actual = {}, registros = [];
  function registra(claves, obj) {
    claves.forEach((k) => { capas[k] ??= 0; actual[k] ??= 0; });
    const mats = [], etqs = [];
    obj.traverse((o) => {
      if (o.isCSS2DObject) etqs.push(o);
      if (o.material) { o.material.userData.base ??= o.material.opacity; mats.push(o); }
    });
    registros.push({ claves, obj, mats, etqs });
    if (!obj.parent) escena.add(obj);
    return obj;
  }
  function aplicaVisibilidad() {
    for (const { claves, mats, etqs } of registros) {
      const a = claves.reduce((p, k) => p * actual[k], 1);
      for (const o of mats) {
        const base = o.material.userData.base;
        o.material.opacity = base * a;
        o.material.depthWrite = a * base > 0.6;
        o.visible = a > 0.01;
      }
      for (const e of etqs) { e.element.style.opacity = Math.min(1, a * 1.2); e.visible = a > 0.05; }
    }
  }

  // --- la instalación: caja caliente, reformador y cuatro stacks ---
  const st = geometriaStack(), H = st.alto;
  const sistema = new THREE.Group();
  const cajaCaliente = caja(-24.5, 7.5, -0.6, 12.2, -24.5, 7.5);
  sistema.add(new THREE.Mesh(cajaCaliente, material("#e07a5f", { opacity: 0.06, depthWrite: false })));
  sistema.add(new THREE.LineSegments(new THREE.EdgesGeometry(cajaCaliente), new THREE.LineBasicMaterial({ color: "#e0a07f", transparent: true, opacity: 0.7 })));
  const reformador = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 9, 32), material("#8d7462", { metalness: 0.4 }));
  reformador.position.set(-36, 4.5, -8);
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 11, 16), material("#8d97a3", { metalness: 0.5 }));
  tubo.rotation.z = Math.PI / 2; tubo.position.set(-28, 4.5, -8);
  sistema.add(reformador, tubo,
    flecha(v3(-47, 4.5, -8), v3(1, 0, 0), 8, C.comb, 0.3),
    flecha(v3(-8, 4.5, -36), v3(0, 0, 1), 9, C.aire, 0.3),
    flecha(v3(8, 8, -8), v3(1, 0, 0), 9, C.combSale, 0.3),
    flecha(v3(-8, 12.6, -8), v3(0, 1, 0), 6, C.elec, 0.3),
    etiqueta("Biogás", v3(-46, 6.5, -8)),
    etiqueta("<b>Reformador</b><br>con vapor y calor:<br>CH₄ + H₂O → CO + 3 H₂", v3(-36, 11.5, -8)),
    etiqueta("<b>Caja caliente</b> · aislada, ~750 °C", v3(-8.5, 13.8, 7.5)),
    etiqueta("Aire", v3(-8, 6.5, -33)),
    etiqueta("Escape: H₂O, CO₂ y el combustible<br>sin usar → postquemador → <b>calor</b>", v3(19, 10, -8)),
    etiqueta("<b>Electricidad</b> (continua)", v3(-8, 19.5, -8)),
    etiqueta("<b>un stack</b>", v3(0, H + 1.4, 3)));
  registra(["sistema"], sistema);
  const fantasmas = new THREE.Group();
  for (const [x, z] of [[-16, 0], [0, -16], [-16, -16]]) {
    const s = stackMalla(st.geos, 0.22);
    s.position.set(x, 0, z);
    fantasmas.add(s);
  }
  registra(["fantasmas"], fantasmas);

  // --- el stack principal ---
  registra(["stack"], stackMalla(st.geos));
  const colectores = new THREE.Group(), y0 = 0.8, y1 = H - 0.8;
  for (const [x0, x1, z0, z1, color] of [[-6.4, -5.05, -5, 5, C.comb], [5.05, 6.4, -5, 5, C.combSale], [-5, 5, -6.4, -5.05, C.aire], [-5, 5, 5.05, 6.4, C.aireSale]])
    colectores.add(new THREE.Mesh(caja(x0, x1, y0, y1, z0, z1), material(color, { opacity: 0.22 })));
  registra(["colectores"], colectores);
  registra(["flechasStack"], new THREE.Group().add(
    flecha(v3(-12, 5, 0), v3(1, 0, 0), 5, C.comb), flecha(v3(6.8, 5, 0), v3(1, 0, 0), 5, C.combSale),
    flecha(v3(0, 5, -12), v3(0, 0, 1), 5, C.aire), flecha(v3(0, 5, 6.8), v3(0, 0, 1), 5, C.aireSale),
    etiqueta("Combustible<br>(gas reformado)", v3(-11, 7, 0)), etiqueta("Sale el combustible<br>que no se usa", v3(10.5, 7, 0)),
    etiqueta("Aire", v3(0, 7, -11)), etiqueta("Aire con menos O₂", v3(0, 7, 10.5)),
    etiqueta("30 celdas · 10 × 10 cm<br>~3 mm cada una con su interconector", v3(-7, H + 1.2, 6))));
  registra(["corriente"], new THREE.Group().add(
    flecha(v3(0, H + 0.2, 0), v3(0, 1, 0), 3.5, C.elec, 0.22),
    etiqueta("<b>+</b> la corriente sale por arriba", v3(0, H + 4.5, 0), "elec"),
    etiqueta("<b>−</b> placa terminal", v3(0, -1.2, 5), "elec")));
  // la celda que se despieza, marcada dentro del stack
  const resaltado = new THREE.Mesh(caja(-5.06, 5.06, st.yRes - 0.01, st.yRes + 0.112, -5.06, 5.06), new THREE.MeshBasicMaterial({ color: C.ion, transparent: true }));
  registra(["resaltado"], resaltado);
  const conector = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(5.1, st.yRes + 0.05, 0), v3(DX - 6.5, 5, 0)]),
    new THREE.LineDashedMaterial({ color: C.ion, dashSize: 0.5, gapSize: 0.35, transparent: true }));
  conector.computeLineDistances();
  registra(["conector"], conector);

  // --- despiece de una celda (grosores exagerados) ---
  const detalle = new THREE.Group();
  detalle.position.x = DX;
  const N = 0.7, P = 0.45, HI = 2 * N + P;
  const capasDet = [
    { nombre: "inferior", h: HI, color: C.acero, inter: true },
    { nombre: "anodo", h: 0.55, color: C.anodo },
    { nombre: "elec", h: 0.14, color: C.electrolito },
    { nombre: "cat", h: 0.3, color: C.catodo },
    { nombre: "superior", h: HI, color: C.acero, inter: true },
  ];
  const textos = {
    inferior: "<b>Interconector</b> · acero, ~2 mm<br>arriba, canales de combustible",
    anodo: "<b>Ánodo</b> · níquel + YSZ, ~0,5 mm<br>H₂ + O²⁻ → H₂O + 2e⁻",
    elec: "<b>Electrolito</b> · YSZ, ~10 µm<br>solo deja pasar iones O²⁻",
    cat: "<b>Cátodo</b> · LSM, ~40 µm<br>½ O₂ + 2e⁻ → O²⁻",
    superior: "<b>Interconector</b> de la celda de arriba<br>abajo, canales de aire",
  };
  for (const c of capasDet) {
    c.g = new THREE.Group();
    let geo;
    if (c.inter) { const gs = []; interconector(gs, 0, N, P); geo = mergeGeometries(gs); }
    else geo = caja(-5, 5, 0, c.h, -5, 5);
    const malla = new THREE.Mesh(geo, material(c.color, c.inter ? { metalness: 0.5, roughness: 0.4 } : {}));
    c.g.add(malla);
    detalle.add(c.g);
    registra(["detalle", ...(c.inter ? ["interDetalle"] : ["pen"]), ...(c.nombre === "superior" ? ["sup"] : [])], malla);
    const e = etiqueta(textos[c.nombre], v3(5.2, c.h / 2, 0), "capa");
    c.g.add(e);
    registra(["detalle", "capas"], e);
  }
  escena.add(detalle);
  const nota = etiqueta("Grosores exagerados: la celda real es casi plana", v3(0, -1.4, 6), "suave");
  detalle.add(nota);
  registra(["detalle", "capas"], nota);
  const [inf, , , , sup] = capasDet;

  // flechas y composiciones del gas en el despiece
  const yComb = N + P + N / 2, yAire = N / 2;
  const gasComb = new THREE.Group(), gasAire = new THREE.Group();
  inf.g.add(gasComb); sup.g.add(gasAire);
  gasComb.add(flecha(v3(-9.5, yComb, 0), v3(1, 0, 0), 4, C.comb, 0.2), flecha(v3(5.5, yComb, 0), v3(1, 0, 0), 4, C.combSale, 0.2),
    etiqueta(`<b>Entra</b> del reformador<br>${chips(ENTRA)}`, v3(-10, yComb + 3, 2), "comp"),
    etiqueta(`<b>Sale</b> (a 30 A se usa el 52 %)<br>${chips(SALE)}`, v3(10, yComb + 3, -2), "comp"));
  gasAire.add(flecha(v3(0, yAire, -9.5), v3(0, 0, 1), 4, C.aire, 0.2), flecha(v3(0, yAire, 5.5), v3(0, 0, 1), 4, C.aireSale, 0.2));
  gasAire.add(etiqueta(`<b>Aire</b><br>${chips({ O2: O2_ENTRA, N2: 1 - O2_ENTRA })}`, v3(0, yAire + 2.6, -10), "comp"),
    etiqueta(`<b>Sale</b><br>${chips({ O2: O2_SALE, N2: 1 - O2_SALE })}`, v3(0, yAire + 2.6, 10), "comp"));
  registra(["detalle", "combEtq"], gasComb);
  registra(["detalle", "aire", "sup"], gasAire);

  // --- partículas: combustible, aire, iones O²⁻ y electrones ---
  const esfera = new THREE.SphereGeometry(1, 12, 8), tmp = new THREE.Object3D(), color = new THREE.Color();
  const instancias = (n, claves, padre) => {
    const m = new THREE.InstancedMesh(esfera, new THREE.MeshStandardMaterial({ roughness: 0.4, transparent: true }), n);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    for (let i = 0; i < n; i++) m.setColorAt(i, color.set("#ffffff"));
    padre.add(m); registra(claves, m);
    return m;
  };
  const azar = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  const comb = Array.from({ length: CANALES.length * 16 }, (_, i) => ({ z: CANALES[i % CANALES.length], fase: azar(), u: azar() }));
  const aire = Array.from({ length: CANALES.length * 14 }, (_, i) => ({ x: CANALES[i % CANALES.length], fase: azar(), u: azar() }));
  const iones = Array.from({ length: 60 }, () => ({ x: -4.5 + 9 * azar(), z: -4.5 + 9 * azar(), fase: azar() }));
  const electrones = Array.from({ length: 70 }, (_, i) => ({ arriba: i % 2, x: -4.6 + 9.2 * azar(), z: NERVIOS[Math.floor(azar() * 11)], fase: azar() }));
  const mComb = instancias(comb.length, ["detalle", "combustible"], inf.g);
  const mAire = instancias(aire.length, ["detalle", "aire"], sup.g);
  const mIon = instancias(iones.length, ["detalle", "iones"], detalle);
  const mElec = instancias(electrones.length, ["detalle", "iones"], detalle);
  mIon.material.emissive = new THREE.Color(C.ion); mIon.material.emissiveIntensity = 0.5;
  mElec.material.emissive = new THREE.Color(C.electron); mElec.material.emissiveIntensity = 0.6;
  iones.forEach((_, i) => mIon.setColorAt(i, color.set(C.ion)));
  electrones.forEach((_, i) => mElec.setColorAt(i, color.set(C.electron)));

  // vueltas por segundo de cada tipo de partícula (en la portada, múltiplos de 1/6: el bucle de 6 s cierra)
  const VEL = { comb: 0.06, aire: 0.09, ion: 0.35, elec: 0.3 };
  const especieComb = (u, s) => {
    let acum = 0;
    for (const e of ORDEN) { acum += ENTRA[e] + (SALE[e] - ENTRA[e]) * s; if (u < acum) return e; }
    return "CH4";
  };
  function particulas(t) {
    comb.forEach((p, i) => {
      const s = (p.fase + t * VEL.comb) % 1, e = especieComb(p.u, s);
      tmp.position.set(-5 + 10 * s, yComb, p.z); tmp.scale.setScalar(0.17); tmp.updateMatrix();
      mComb.setMatrixAt(i, tmp.matrix); mComb.setColorAt(i, color.set(COLORES[e]));
    });
    aire.forEach((p, i) => {
      const s = (p.fase + t * VEL.aire) % 1, o2 = O2_ENTRA + (O2_SALE - O2_ENTRA) * s;
      const e = p.u < o2 ? "O2" : p.u < O2_ENTRA ? null : "N2";   // el O₂ que falta se ha ido como iones
      tmp.position.set(p.x, yAire, -5 + 10 * s); tmp.scale.setScalar(e ? 0.17 : 0); tmp.updateMatrix();
      mAire.setMatrixAt(i, tmp.matrix); mAire.setColorAt(i, color.set(COLORES[e ?? "N2"]));
    });
    const [, an, , ca] = capasDet;
    const yTop = ca.g.position.y + ca.h * 0.6, yBot = an.g.position.y + an.h * 0.4;
    iones.forEach((p, i) => {
      const s = (p.fase + t * VEL.ion) % 1;
      tmp.position.set(p.x, yTop + (yBot - yTop) * s, p.z); tmp.scale.setScalar(0.11); tmp.updateMatrix();
      mIon.setMatrixAt(i, tmp.matrix);
    });
    electrones.forEach((p, i) => {
      // los del ánodo bajan por el interconector hacia la celda de abajo; al cátodo llegan desde la de arriba
      const s = (p.fase + t * VEL.elec) % 1;
      const [y0, y1] = p.arriba ? [sup.g.position.y + HI, ca.g.position.y + ca.h] : [an.g.position.y, inf.g.position.y];
      const y = y0 + (y1 - y0) * s;
      tmp.position.set(p.x, y, p.z); tmp.scale.setScalar(0.1); tmp.updateMatrix();
      mElec.setMatrixAt(i, tmp.matrix);
    });
    for (const m of [mComb, mAire, mIon, mElec]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }

  // --- animación ---
  let lejos = 1, paso = 0, explota = 1, camAnim = true, giro = false, t = 0, ultimo = performance.now(), id;
  const camObj = new THREE.Vector3(...PASOS[0].cam), tarObj = new THREE.Vector3(...PASOS[0].obj);
  controles.addEventListener("start", () => { camAnim = false; });
  function ponPaso(n) {
    paso = n;
    for (const k of Object.keys(capas)) capas[k] = PASOS[n].v[k] ?? 0;
    tarObj.set(...PASOS[n].obj);
    camObj.set(...PASOS[n].cam).sub(tarObj).multiplyScalar(lejos).add(tarObj);   // en vertical, más lejos
    camAnim = true;
  }
  ponPaso(0);
  for (const k of Object.keys(capas)) actual[k] = capas[k];

  function colocaCapas() {
    let y = 0;
    for (const c of capasDet) { c.g.position.y = y; y += c.h + 1.3 * explota; }
    detalle.position.y = 5 - y / 2;
  }

  function marco(ahora) {
    const dt = Math.min(0.05, (ahora - ultimo) / 1000); ultimo = ahora; t += dt;
    const k = 1 - Math.exp(-dt * 3);
    for (const c of Object.keys(capas)) actual[c] += (capas[c] - actual[c]) * k;
    explota += (PASOS[paso].explota - explota) * k;
    colocaCapas();
    if (camAnim) {
      camara.position.lerp(camObj, k); controles.target.lerp(tarObj, k);
      if (camara.position.distanceTo(camObj) < 0.05) camAnim = false;
    }
    controles.autoRotate = giro; controles.autoRotateSpeed = 0.6;
    controles.update();
    particulas(t);
    aplicaVisibilidad();
    renderer.render(escena, camara);
    etiquetas.render(escena, camara);
    id = requestAnimationFrame(marco);
  }
  const ajusta = () => {
    const { clientWidth: w, clientHeight: h } = contenedor;
    renderer.setSize(w, h); etiquetas.setSize(w, h);
    camara.aspect = w / h;
    const vertical = w / h < 1;
    lejos = vertical ? Math.min(2.4, h / w) : 1;
    // en vertical el panel tapa la parte de abajo: se sube la imagen
    if (vertical) camara.setViewOffset(w, h, 0, h * 0.14, w, h); else camara.clearViewOffset();
    camara.updateProjectionMatrix();
    ponPaso(paso);
  };
  const ro = new ResizeObserver(ajusta); ro.observe(contenedor); ajusta();
  id = requestAnimationFrame(marco);
  /**
   * Un fotograma exacto para el bucle de la portada (sin reloj ni suavizados): la vista del paso 5 con
   * la cámara oscilando alrededor del despiece. Periódico en `periodo` segundos.
   */
  function fotograma(tt, { periodo = 6, oscila = 0.35, desplaza = 0.27, lejos: l = 1.15, v, cam = [DX + 13, 8.5, 17], obj = [DX, 5.3, 0], explota: e = 0.6 } = {}) {
    cancelAnimationFrame(id);
    Object.assign(VEL, { comb: 1 / periodo, aire: 1 / periodo, ion: 3 / periodo, elec: 3 / periodo });
    const vis = v ?? { detalle: 1, interDetalle: 0.32, pen: 0.5, sup: 1, combustible: 1, aire: 1, iones: 1 };
    for (const k of Object.keys(capas)) actual[k] = capas[k] = vis[k] ?? 0;
    explota = e; colocaCapas();
    const o = new THREE.Vector3(...obj), rel = new THREE.Vector3(...cam).sub(o).multiplyScalar(l);
    rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), oscila * Math.sin((2 * Math.PI * tt) / periodo));
    camara.position.copy(o).add(rel); camara.lookAt(o);
    const { clientWidth: w, clientHeight: h } = contenedor;
    camara.aspect = w / h;
    camara.setViewOffset(w, h, -desplaza * w, 0, w, h);      // el objeto, a la derecha: a la izquierda va el texto
    camara.updateProjectionMatrix();
    particulas(tt);
    aplicaVisibilidad();
    gasComb.visible = gasAire.visible = false;               // sin flechas: apuntarían al titular
    renderer.render(escena, camara);
  }

  return {
    ponPaso,
    fotograma,
    ponGiro: (g) => { giro = g; },
    destruye: () => { cancelAnimationFrame(id); ro.disconnect(); controles.dispose(); renderer.dispose(); contenedor.innerHTML = ""; },
  };
}
