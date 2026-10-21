// El invernadero en 3D (three.js): la geometría es la del modelo y el estado, el de la simulación.
//
// Medidas: 25 × 10 m de planta, paredes de 3 m y cumbrera a 5 m. Con ellas salen exactamente las
// áreas de GES (paredes largas de 75 m², testeros de 40 m², faldones de 135 m², suelo de 250 m²) y
// su volumen de 1000 m³. Las paredes largas miran al SE y al NO, como en el modelo.
//
// El sol se coloca con la fecha, la hora (solar) y la latitud de la simulación. El cielo es un
// modelo físico de dispersión atmosférica (Preetham, el `Sky` de three.js): el color, el disco del
// sol y el halo salen de la altura del sol, y la turbidez, de lo nublado que esté según los datos.
// Ese mismo cielo ilumina la escena (mapa de entorno). Las ventanas cenitales, la condensación, la
// calefacción y el tamaño de las plantas siguen al modelo.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RACIMOS } from "./simulacion.js";

const L = 25, W = 10, H = 3, CUMBRERA = 5, T_K = 273.15;
const rad = Math.PI / 180;

// posición del sol: acimut desde el norte (hacia el este) y elevación, en radianes
export function posicionSol(t, latitud) {
  const dia = Math.ceil(t / 86400) || 1, hora = (t / 3600) % 24;
  const decl = 23.45 * rad * Math.sin((2 * Math.PI * (284 + dia)) / 365);
  const w = (hora - 12) * 15 * rad, la = latitud * rad;
  const elev = Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(w));
  let az = Math.acos(Math.min(1, Math.max(-1, (Math.sin(decl) - Math.sin(elev) * Math.sin(la)) / (Math.cos(elev) * Math.cos(la)))));
  if (w > 0) az = 2 * Math.PI - az;
  return { az, elev };
}
// x = este, z = sur, y = arriba
const direccion = (az, elev) => new THREE.Vector3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev));

const mezcla = (a, b, f) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(Math.max(f, 0), 1));
function colorHorizonte(elev, nubes) {           // para la niebla: el color del cielo junto al horizonte
  const e = elev / rad;
  let c;
  if (e < -8) c = new THREE.Color("#05080f");
  else if (e < 0) c = mezcla("#05080f", "#3b3a4d", (e + 8) / 8);
  else if (e < 10) c = mezcla("#3b3a4d", "#d9a27a", e / 5).lerp(new THREE.Color("#b9cbe0"), Math.max(0, (e - 4) / 6));
  else c = new THREE.Color("#b9cbe0");
  return e > 0 ? c.lerp(new THREE.Color("#a7aeb6"), 0.6 * nubes) : c;
}
// una hoja compuesta de tomate: raquis con foliolos, aplanada (unos 35 cm), que sale del tallo en +x
const HOJAS_MAX = 18;
function hojaCompuesta() {
  const partes = [];
  const foliolo = (x, z, esc, giro) => {
    const g = new THREE.CircleGeometry(1, 8); g.scale(0.06 * esc, 0.032 * esc, 1); g.rotateX(-Math.PI / 2); g.rotateY(giro); g.translate(x, -0.02 * x * x * 8, z);
    partes.push(g);
  };
  for (let i = 0; i < 4; i++) { const x = 0.08 + i * 0.075; foliolo(x, 0.045, 1 - i * 0.08, 0.5); foliolo(x, -0.045, 1 - i * 0.08, -0.5); }
  foliolo(0.38, 0, 1, 0);
  // fusiona los foliolos en una sola geometría
  const pos = [], idx = [];
  for (const g of partes) {
    const b = pos.length / 3, a = g.attributes.position.array; pos.push(...a);
    for (const i of g.index.array) idx.push(b + i);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function texturaHierba() {                          // ruido de hierba que se repite por el suelo
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); g.fillStyle = "#5f7d3a"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = Math.random(); g.fillStyle = `rgba(${70 + 60 * v | 0},${100 + 60 * v | 0},${40 + 30 * v | 0},0.5)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 3);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(600, 600);
  t.anisotropy = 8; return t;
}
const colorTemperatura = (T) => mezcla("#3b82f6", "#f97316", (T - 5) / 25);   // 5 °C azul … 30 °C naranja

function etiqueta(texto, { tam = 48, color = "#1f2937", fondo = null } = {}) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = `600 ${tam}px system-ui, sans-serif`;
  const w = Math.ceil(g.measureText(texto).width) + 24; c.width = w; c.height = tam + 20;
  g.font = `600 ${tam}px system-ui, sans-serif`;
  if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = color; g.textBaseline = "middle"; g.fillText(texto, 12, c.height / 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(w / 60, c.height / 60, 1);
  return s;
}

function construye(escena) {
  const o = {};

  // cielo físico y suelo de hierba hasta el horizonte (la niebla los une)
  o.cieloFisico = new Sky(); o.cieloFisico.scale.setScalar(5000); escena.add(o.cieloFisico);
  Object.assign(o.cieloFisico.material.uniforms.mieCoefficient, { value: 0.005 });
  Object.assign(o.cieloFisico.material.uniforms.mieDirectionalG, { value: 0.8 });
  o.suelo = new THREE.Mesh(new THREE.CircleGeometry(2500, 64), new THREE.MeshStandardMaterial({ map: texturaHierba(), roughness: 1 }));
  o.suelo.rotation.x = -Math.PI / 2; o.suelo.receiveShadow = true; escena.add(o.suelo);

  // puntos cardinales
  for (const [txt, x, z] of [["N", 0, -34], ["S", 0, 34], ["E", 34, 0], ["O", -34, 0]]) {
    const s = etiqueta(txt, { tam: 64, color: "#334155" }); s.position.set(x, 0.6, z); s.scale.multiplyScalar(1.4); escena.add(s);
  }

  // el invernadero: eje largo en x local, girado 45° para que las paredes largas miren al SE y al NO
  const inv = new THREE.Group(); inv.rotation.y = Math.PI / 4; escena.add(inv); o.inv = inv;

  // interior: pasillo de hormigón y suelo
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ color: "#8a7a66", roughness: 1 }));
  piso.rotation.x = -Math.PI / 2; piso.position.y = 0.01; piso.receiveShadow = true; inv.add(piso);
  const pasillo = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.4), new THREE.MeshStandardMaterial({ color: "#b8b4ab", roughness: 0.9 }));
  pasillo.rotation.x = -Math.PI / 2; pasillo.position.y = 0.02; pasillo.receiveShadow = true; inv.add(pasillo);

  // vidrio: paredes, testeros y faldones
  o.vidrio = new THREE.MeshPhysicalMaterial({ color: "#d6ecff", transparent: true, opacity: 0.24, roughness: 0.08, metalness: 0.15, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const panel = (geo, x, y, z, ry = 0, rx = 0) => { const m = new THREE.Mesh(geo, o.vidrio); m.position.set(x, y, z); m.rotation.set(rx, ry, 0, "YXZ"); inv.add(m); return m; };
  panel(new THREE.PlaneGeometry(L, H), 0, H / 2, W / 2);
  panel(new THREE.PlaneGeometry(L, H), 0, H / 2, -W / 2);
  const testero = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(W / 2, H), new THREE.Vector2(0, CUMBRERA), new THREE.Vector2(-W / 2, H)]);
  panel(new THREE.ShapeGeometry(testero), L / 2, 0, 0, Math.PI / 2);
  panel(new THREE.ShapeGeometry(testero), -L / 2, 0, 0, -Math.PI / 2);
  const faldon = Math.hypot(W / 2, CUMBRERA - H), pendiente = Math.atan2(CUMBRERA - H, W / 2);
  // cada faldón: la parte fija y cuatro ventanas cenitales abatibles junto a la cumbrera, con marco
  // de aluminio que se tiñe de ámbar al abrirse, para que se note
  const VENT = 3.4, fijo = faldon - VENT, N_VENT = 4, LARGO_VENT = (L - 2) / N_VENT - 0.25;
  o.marcoVentana = new THREE.MeshStandardMaterial({ color: "#5b6b7d", metalness: 0.5, roughness: 0.4, emissive: "#f59e0b", emissiveIntensity: 0 });
  o.vidrioVentana = new THREE.MeshPhysicalMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.38, roughness: 0.08, metalness: 0.15, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  o.ventanas = [];
  for (const lado of [1, -1]) {
    // parte fija del faldón: del alero hacia la cumbrera
    const p = new THREE.Mesh(new THREE.PlaneGeometry(L, fijo), o.vidrio);
    const f = new THREE.Group(); f.position.set(0, H, (lado * W) / 2); f.rotation.x = lado * pendiente; inv.add(f);
    p.position.set(0, 0, (-lado * fijo) / 2); p.rotation.x = -Math.PI / 2; f.add(p);
    // tramos fijos de la franja de ventanas: los extremos y los huecos entre ventanas
    const franja = new THREE.Group(); franja.position.set(0, CUMBRERA, 0); franja.rotation.x = lado * pendiente; inv.add(franja);
    const fijoFranja = (x0, x1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, VENT), o.vidrio); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (lado * VENT) / 2); franja.add(m); };
    const paso = (L - 2) / N_VENT;
    fijoFranja(-L / 2, -L / 2 + 1); fijoFranja(L / 2 - 1, L / 2);
    for (let k = 1; k < N_VENT; k++) fijoFranja(-L / 2 + 1 + k * paso - 0.125, -L / 2 + 1 + k * paso + 0.125);
    // ventanas: bisagra en la cumbrera; al abrir, el borde de abajo sube
    for (let k = 0; k < N_VENT; k++) {
      const xc = -L / 2 + 1 + (k + 0.5) * paso;
      const bisagra = new THREE.Group(); bisagra.position.set(xc, CUMBRERA, 0); inv.add(bisagra);
      const marco = new THREE.Group(); marco.rotation.x = lado * pendiente; bisagra.add(marco);
      const hoja = new THREE.Mesh(new THREE.PlaneGeometry(LARGO_VENT, VENT), o.vidrioVentana);
      hoja.rotation.x = -Math.PI / 2; hoja.position.z = (lado * VENT) / 2; marco.add(hoja);
      // marco: dos largueros y dos travesaños
      const g = 0.13, larguero = new THREE.BoxGeometry(LARGO_VENT, g, g), traves = new THREE.BoxGeometry(g, g, VENT);
      for (const z of [0, lado * VENT]) { const b = new THREE.Mesh(larguero, o.marcoVentana); b.position.z = z; b.castShadow = true; marco.add(b); }
      for (const x of [-LARGO_VENT / 2, LARGO_VENT / 2]) { const b = new THREE.Mesh(traves, o.marcoVentana); b.position.set(x, 0, (lado * VENT) / 2); b.castShadow = true; marco.add(b); }
      o.ventanas.push({ marco, lado, base: lado * pendiente });
    }
  }

  // estructura: pilares, cerchas, cumbrera y aleros de aluminio
  const metal = new THREE.MeshStandardMaterial({ color: "#3f4a57", metalness: 0.6, roughness: 0.4 });
  const barra = (a, b, grosor = 0.07) => {
    const v = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.BoxGeometry(grosor, v.length(), grosor), metal);
    m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    m.castShadow = true; inv.add(m);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (let x = -L / 2; x <= L / 2 + 1e-6; x += 2.5) {
    barra(V(x, 0, W / 2), V(x, H, W / 2)); barra(V(x, 0, -W / 2), V(x, H, -W / 2));
    barra(V(x, H, W / 2), V(x, CUMBRERA, 0)); barra(V(x, H, -W / 2), V(x, CUMBRERA, 0));
  }
  barra(V(-L / 2, CUMBRERA, 0), V(L / 2, CUMBRERA, 0), 0.1);
  for (const z of [W / 2, -W / 2]) { barra(V(-L / 2, H, z), V(L / 2, H, z), 0.1); barra(V(-L / 2, 0.05, z), V(L / 2, 0.05, z), 0.1); }
  for (const x of [L / 2, -L / 2]) { barra(V(x, 0, -W / 4), V(x, H + (CUMBRERA - H) / 2, -W / 4)); barra(V(x, 0, W / 4), V(x, H + (CUMBRERA - H) / 2, W / 4)); }

  // tubos de calefacción a ras de suelo
  o.tubos = new THREE.MeshStandardMaterial({ color: "#6b7280", emissive: "#ff3b1f", emissiveIntensity: 0, metalness: 0.5, roughness: 0.5 });
  for (const z of [-3.6, -1.6, 1.6, 3.6]) {
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L - 1, 10), o.tubos);
    tubo.rotation.z = Math.PI / 2; tubo.position.set(0, 0.12, z); inv.add(tubo);
  }

  // cultivo: cuatro líneas de tomate sobre sacos de sustrato; altura y follaje según el IAF
  const filas = [-3.6, -1.6, 1.6, 3.6], porFila = 40;
  const saco = new THREE.MeshStandardMaterial({ color: "#e5e1d6", roughness: 0.9 });
  for (const z of filas) { const m = new THREE.Mesh(new THREE.BoxGeometry(L - 2, 0.12, 0.3), saco); m.position.set(0, 0.32, z); m.castShadow = m.receiveShadow = true; inv.add(m); }
  // cada planta: tallo entutorado (con su hilo hasta el alambre) y hojas compuestas alternas
  o.hojas = new THREE.InstancedMesh(hojaCompuesta(), new THREE.MeshStandardMaterial({ color: "#3d8a37", roughness: 0.75, side: THREE.DoubleSide }), filas.length * porFila * HOJAS_MAX);
  o.hojas.castShadow = true; o.hojas.receiveShadow = true; o.hojas.count = 0; inv.add(o.hojas);
  o.tallos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#5d7a34", roughness: 0.9 }), filas.length * porFila);
  o.tallos.castShadow = true; inv.add(o.tallos);
  const hilos = [];
  for (const z of filas) for (let i = 0; i < porFila; i++) { const x = -L / 2 + 1.3 + (i * (L - 2.6)) / (porFila - 1); hilos.push(x, 0.38, z, x, H - 0.1, z); }
  inv.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(hilos, 3)), new THREE.LineBasicMaterial({ color: "#d9d2bf", transparent: true, opacity: 0.35 })));
  for (const z of filas) barra(V(-L / 2 + 1, H - 0.1, z), V(L / 2 - 1, H - 0.1, z), 0.02);
  o.plantas = [];
  for (const z of filas) for (let i = 0; i < porFila; i++) o.plantas.push([-L / 2 + 1.3 + (i * (L - 2.6)) / (porFila - 1), z, (Math.sin(i * 12.9898 + z * 78.233) * 43758.5453) % 1]);

  // tomates: hasta 14 racimos visibles por planta y 5 frutos por racimo
  o.tomates = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 }), o.plantas.length * 14 * 5);
  o.tomates.castShadow = true; o.tomates.count = 0; inv.add(o.tomates);

  // aire interior: un volumen apenas teñido por su temperatura; y la condensación en el vidrio
  o.aire = new THREE.MeshBasicMaterial({ color: "#f97316", transparent: true, opacity: 0.05, depthWrite: false });
  const aire = new THREE.Mesh(new THREE.BoxGeometry(L - 0.1, H - 0.1, W - 0.1), o.aire); aire.position.y = H / 2; inv.add(aire);

  // cotas, como en un plano
  const cota = (a, b, txt, off) => {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: "#334155" })); inv.add(l);
    const s = etiqueta(txt, { tam: 40, color: "#334155" }); s.position.copy(a).add(b).multiplyScalar(0.5).add(off); inv.add(s); (o.cotas ||= []).push(s, l);
  };
  cota(V(-L / 2, 0.03, W / 2 + 1.2), V(L / 2, 0.03, W / 2 + 1.2), "25 m", V(0, 0.5, 0.6));
  cota(V(L / 2 + 1.2, 0.03, -W / 2), V(L / 2 + 1.2, 0.03, W / 2), "10 m", V(0.8, 0.5, 0));

  // estrellas y luces
  const p = []; for (let i = 0; i < 1500; i++) { const a = Math.random() * 2 * Math.PI, e = Math.asin(0.03 + 0.97 * Math.random()); p.push(...direccion(a, e).multiplyScalar(2000).toArray()); }
  o.estrellas = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(p, 3)),
    new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  escena.add(o.estrellas);
  o.luzSol = new THREE.DirectionalLight("#fff4dc", 2.5); o.luzSol.castShadow = true;
  o.luzSol.shadow.mapSize.set(2048, 2048); Object.assign(o.luzSol.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  o.luzSol.shadow.bias = -0.0005; escena.add(o.luzSol, o.luzSol.target);
  o.cielo = new THREE.HemisphereLight("#bcd7f2", "#4b5d32", 0.3); escena.add(o.cielo);
  o.calor = new THREE.PointLight("#ff6a3d", 0, 30); o.calor.position.set(0, 0.8, 0); inv.add(o.calor);
  return o;
}

export function Vista3D({ vista, latitud }) {
  const caja = useRef(null), estado = useRef(null);
  const [dentro, setDentro] = useState(() => new URLSearchParams(location.search).get("camara") === "dentro");
  const cambiaCamara = () => { const k = dentro ? "fuera" : "dentro"; estado.current?.encuadra(k); setDentro(!dentro); };

  useEffect(() => {
    const el = caja.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
    el.appendChild(renderer.domElement);
    const escena = new THREE.Scene(); escena.fog = new THREE.FogExp2("#b9cbe0", 0.0035);
    const camara = new THREE.PerspectiveCamera(50, 1, 0.5, 10000); camara.position.set(-22, 4.5, 30);
    const controles = new OrbitControls(camara, renderer.domElement);
    controles.target.set(0, 4, 2); controles.enableDamping = true; controles.maxPolarAngle = Math.PI / 2 - 0.05; controles.minDistance = 10; controles.maxDistance = 90;
    controles.enableZoom = true;
    const o = construye(escena);
    // el cielo también ilumina: un mapa de entorno con solo el cielo, que se rehace cuando cambia
    const pmrem = new THREE.PMREMGenerator(renderer), escenaCielo = new THREE.Scene(), cieloEntorno = new Sky();
    cieloEntorno.scale.setScalar(5000); escenaCielo.add(cieloEntorno);
    let entorno = null, clave = "";
    const rehaceEntorno = (u) => {
      const k = `${u.sunPosition.value.toArray().map((v) => v.toFixed(2))}|${u.turbidity.value.toFixed(0)}`;
      if (k === clave) return; clave = k;
      for (const n of ["sunPosition", "turbidity", "rayleigh"]) cieloEntorno.material.uniforms[n].value = u[n].value.clone?.() ?? u[n].value;
      if (entorno) entorno.dispose();
      entorno = pmrem.fromScene(escenaCielo); escena.environment = entorno.texture;
    };
    // dos encuadres: el invernadero entero, o dentro, en el pasillo entre las plantas
    const encuadres = {
      fuera: { pos: new THREE.Vector3(-15, 8, 21), obj: new THREE.Vector3(0, 3, 0), min: 8 },
      dentro: { pos: o.inv.localToWorld(new THREE.Vector3(-11.5, 1.7, -0.2)), obj: o.inv.localToWorld(new THREE.Vector3(-4, 0.9, -2.6)), min: 0.5 },
    };
    const encuadra = (k) => { const e = encuadres[k]; for (const c of o.cotas) c.visible = k === "fuera"; camara.position.copy(e.pos); controles.target.copy(e.obj); controles.minDistance = e.min; controles.update(); };
    encuadra(new URLSearchParams(location.search).get("camara") === "dentro" ? "dentro" : "fuera");
    estado.current = { o, escena, renderer, rehaceEntorno, encuadra };
    const tam = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camara.aspect = w / h; camara.fov = w / h < 0.8 ? 62 : 50; camara.updateProjectionMatrix(); };   // en vertical, más ángulo
    tam(); const ro = new ResizeObserver(tam); ro.observe(el);
    let raf; const bucle = () => { controles.update(); renderer.render(escena, camara); raf = requestAnimationFrame(bucle); }; bucle();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controles.dispose(); entorno?.dispose(); pmrem.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  // cada vez que avanza la simulación
  useEffect(() => {
    if (!vista || !estado.current) return;
    const { o, escena, renderer, rehaceEntorno } = estado.current, f = vista.flujos, y = vista.y;
    const { az, elev } = posicionSol(vista.t, latitud);
    const d = direccion(az, elev);
    o.luzSol.position.copy(d).multiplyScalar(50);
    // nubes: la radiación de los datos frente a la de un cielo despejado con el sol a esa altura
    // (la «que ve» la cubierta en GES es ~0,4 de la global)
    const sol = Math.max(f.sol_exterior / 500, 0), despejado = 0.4 * 1000 * Math.max(Math.sin(elev), 0) ** 1.15;
    const nubes = elev > 3 * rad ? 1 - Math.min(Math.max(sol / Math.max(despejado, 1), 0), 1) : 0;
    const u = o.cieloFisico.material.uniforms;
    u.sunPosition.value.copy(d); u.turbidity.value = 2 + 9 * nubes; u.rayleigh.value = 2 - 1.2 * nubes;
    // ya de noche cerrada, el modelo de cielo deja una franja parda: mejor un fondo oscuro liso
    o.cieloFisico.visible = elev > -9 * rad; escena.background = o.cieloFisico.visible ? null : new THREE.Color("#04070d");
    rehaceEntorno(u);
    renderer.toneMappingExposure = elev > 0 ? 0.55 - 0.15 * nubes : 0.55;
    o.luzSol.intensity = elev > 0 ? 3.2 * (1 - 0.85 * nubes) * Math.min(elev / (6 * rad), 1) : 0;
    o.luzSol.color = mezcla("#ff9a55", "#fff4dc", elev / (15 * rad));
    escena.fog.color = colorHorizonte(elev, nubes);
    // de noche, una luz de luna tenue para que se vea el invernadero
    o.cielo.color.set(elev > 0 ? "#bcd7f2" : "#5a6f9e"); o.cielo.intensity = elev > 0 ? 0.25 : 0.55;
    o.estrellas.material.opacity = Math.min(Math.max(-elev / (8 * rad), 0), 1) * 0.9;

    // ventanas cenitales: la apertura del modelo (0 a 1), hasta 45°
    const apertura = f.apertura * 45 * rad;
    for (const v of o.ventanas) v.marco.rotation.x = v.base - v.lado * apertura;
    o.marcoVentana.emissiveIntensity = 0.9 * Math.min(f.apertura * 3, 1);

    // aire y vidrio
    const Ti = y[1] - T_K;
    o.aire.color = colorTemperatura(Ti); o.aire.opacity = 0.04 + 0.05 * Math.min(Math.abs(Ti - 18) / 12, 1);
    o.vidrio.opacity = 0.14 + 0.3 * Math.min(Math.max((f.HR_int - 85) / 15, 0), 1);       // vaho con humedad alta

    // calefacción
    const calor = Math.min(f.calefaccion / 40000, 1);
    o.tubos.emissiveIntensity = 1.5 * calor; o.calor.intensity = 25 * calor;

    // plantas: la altura y el número de hojas siguen al índice de área foliar (hojas = C_leaf)
    const lai = f.LAI, alto = Math.min(0.3 + 0.55 * lai, H - 0.5), nh = Math.min(Math.max(Math.round(4.5 * lai), 2), HOJAS_MAX);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    let k = 0;
    o.plantas.forEach(([x, z, r], ip) => {
      o.tallos.setMatrixAt(ip, m.compose(p.set(x, 0.38, z), q.identity(), s.set(1, alto, 1)));
      for (let i = 0; i < nh; i++) {
        const h = 0.38 + ((i + 0.6) / nh) * alto, giro = i * 2.4 + r * 6;      // hojas alternas en espiral
        const tam = 1.25 + 0.6 * (1 - i / nh);                                  // las de abajo, más grandes
        e.set(0, giro, -0.35 + 0.15 * Math.sin(i + r), "YXZ");
        o.hojas.setMatrixAt(k++, m.compose(p.set(x, h, z), q.setFromEuler(e), s.set(tam, tam, tam)));
      }
    });
    o.hojas.count = k; o.tallos.instanceMatrix.needsUpdate = true; o.hojas.instanceMatrix.needsUpdate = true;

    // tomates: tamaño con la masa del racimo (6 % de materia seca, ~12 frutos por m² y racimo),
    // color con su madurez; los racimos más nuevos, más arriba
    const visibles = (vista.racimos || []).slice(-14), col = new THREE.Color(), verde = new THREE.Color("#5f9e3a"), naranja = new THREE.Color("#e8862e"), rojo = new THREE.Color("#d42a1e");
    let n = 0;
    for (const rc of visibles) {
      const gramos = (rc.masa * 1000) / 0.06 / 12.5, radio = Math.cbrt((3 * Math.max(gramos, 1)) / (4 * Math.PI)) / 100 * 1.3;   // m, algo exagerado para que se vean
      const mad = Math.min(Math.max((rc.gd - RACIMOS.maduraDesde) / (RACIMOS.maduroEn - RACIMOS.maduraDesde), 0), 1);
      if (mad < 0.5) col.copy(verde).lerp(naranja, mad * 2); else col.copy(naranja).lerp(rojo, (mad - 0.5) * 2);
      const altura = Math.min(0.25 + 0.14 * rc.n, alto - 0.15);            // cada racimo, más arriba que el anterior
      o.plantas.forEach(([x, z, r], ip) => {
        const lado = (ip + rc.n) % 2 ? 1 : -1;                  // racimos alternos a cada lado de la fila
        for (let j = 0; j < 5; j++) {
          p.set(x + 0.045 * (j - 2) + 0.01 * Math.sin(r * 7 + j), 0.38 + altura - 0.035 * Math.abs(j - 2) - 0.03 * (j % 2), z + lado * (0.09 + 0.025 * (j % 2)));
          s.setScalar(radio * (0.85 + 0.15 * Math.cos(j + rc.n)));
          o.tomates.setMatrixAt(n, m.compose(p, q.identity(), s)); o.tomates.setColorAt(n, col); n++;
        }
      });
    }
    o.tomates.count = n; o.tomates.instanceMatrix.needsUpdate = true; if (o.tomates.instanceColor) o.tomates.instanceColor.needsUpdate = true;
  }, [vista, latitud]);

  const f = vista?.flujos, sp = vista ? posicionSol(vista.t, latitud) : null;
  return (
    <div className="vista3d" ref={caja}>
      <button className="boton-camara" onClick={cambiaCamara}>{dentro ? "Ver el invernadero" : "Entre las plantas"}</button>
      {f && (
        <div className="rotulo3d">
          <span>☀ {sp.elev > 0 ? `${(sp.elev / rad).toFixed(0)}° · ${(f.sol_exterior / 500).toFixed(0)} W/m²` : "noche"}</span>
          <span>fuera {f.T_ext.toFixed(1)} °C</span>
          <span>dentro {(vista.y[1] - T_K).toFixed(1)} °C · {f.HR_int.toFixed(0)} %</span>
          <span>ventanas {(f.apertura * 100).toFixed(0)} % abiertas · {f.renovaciones_h.toFixed(1)} renov./h</span>
          {vista.racimos?.length > 0 && <span>🍅 {vista.racimos.length} racimos, {vista.racimos.filter((r) => r.gd >= RACIMOS.maduroEn).length} maduros · {(vista.y[15] * 1000).toFixed(0)} g/m² de fruto</span>}
          {f.calefaccion > 0 && <span>calefacción {(f.calefaccion / 1000).toFixed(1)} kW</span>}
        </div>
      )}
    </div>
  );
}
