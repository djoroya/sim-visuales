/**
 * Visor de una trayectoria de dinamica molecular (o de cualquier animacion
 * de muchas particulas) empaquetada en un fichero .nw.
 *
 * Dibuja los atomos con un InstancedMesh y va interpolando entre los
 * fotogramas del fichero .nw que produce exporta_nw.py.
 *
 *   import { montaVisor } from './visor.js'
 *   const visor = await montaVisor(document.querySelector('#hilo'), {
 *     datos: '/trayectoria.nw',
 *     poster: '/poster.png',
 *   })
 *
 * Solo importa de three lo que usa, para que el paquete salga pequeno.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshLambertMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three'

import { parsea } from './formato.js'

// --- paleta: la misma que el resto de la marca ------------------------------
const COLOR_FCC = 0xccd6e0        // cristal perfecto, gris muy claro
const COLOR_HCP = 0x14519b        // falla de apilamiento: el azul de la marca
const COLOR_OTRO = 0x4a7fbf       // bcc, icosaedrico
const COLOR_SUP = 0xaab8c6        // superficie libre y desorden

const PALETA = [COLOR_SUP, COLOR_FCC, COLOR_HCP, COLOR_OTRO, COLOR_OTRO, COLOR_SUP]

const POR_DEFECTO = {
  datos: 'trayectoria.nw',
  poster: null,
  duracion: 9,            // segundos que dura una pasada completa
  pausaFinal: 0.9,        // segundos parado al final, antes de volver a empezar
  entrada: 0.45,          // segundos que tardan los atomos en aparecer
  salida: 0.55,           // segundos que tardan en desaparecer
  radio: 1.28,            // radio del atomo de Cu en A
  giro: 0.08,             // vueltas por segundo alrededor del eje del hilo
  inclinacion: 0.05,      // ligera inclinacion del eje del hilo, radianes
  margen: 1.06,           // holgura del encuadre
  dprMax: 1.75,
}

function hayWebGL() {
  try {
    const lienzo = document.createElement('canvas')
    return !!(window.WebGLRenderingContext &&
      (lienzo.getContext('webgl2') || lienzo.getContext('webgl')))
  } catch (e) {
    return false
  }
}

function ponPoster(contenedor, poster) {
  if (!poster) return null
  const img = document.createElement('img')
  img.src = poster
  img.alt = 'Nanohilo de cobre roto por traccion, simulado con dinamica molecular'
  img.decoding = 'async'
  img.loading = 'lazy'
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' })
  contenedor.appendChild(img)
  return img
}

export async function montaVisor(contenedor, opciones = {}) {
  const cfg = { ...POR_DEFECTO, ...opciones }
  if (!hayWebGL()) {
    ponPoster(contenedor, cfg.poster)
    return { destruye() {} }
  }

  const respuesta = await fetch(cfg.datos)
  if (!respuesta.ok) throw new Error(`no se pudo cargar ${cfg.datos}`)
  const datos = parsea(await respuesta.arrayBuffer())
  const { nAtomos, nFrames, pos, tipos, tam } = datos

  // --- escena ---------------------------------------------------------------
  const escena = new Scene()
  // al girar sobre su eje el hilo ocupa su diagonal: hay que reservarla
  const semiAlto = Math.hypot(tam[1], tam[2]) * cfg.margen
  const camara = new OrthographicCamera(-1, 1, 1, -1, -4000, 4000)
  camara.position.set(0, 0, 500)

  const render = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  render.setClearAlpha(0)
  contenedor.appendChild(render.domElement)
  Object.assign(render.domElement.style,
    { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' })

  escena.add(new AmbientLight(0xffffff, 1.65))
  const sol = new DirectionalLight(0xffffff, 1.5)
  sol.position.set(-0.4, 0.8, 1)
  escena.add(sol)
  const relleno = new DirectionalLight(0xdce6f2, 0.7)
  relleno.position.set(0.6, -0.5, -0.8)
  escena.add(relleno)

  const geometria = new IcosahedronGeometry(cfg.radio, 0)
  const material = new MeshLambertMaterial({ flatShading: true })
  const malla = new InstancedMesh(geometria, material, nAtomos)
  malla.instanceMatrix.setUsage(DynamicDrawUsage)
  malla.frustumCulled = false
  escena.add(malla)

  // colores: tabla fija, se escriben directamente en el atributo
  const colores = new Float32Array(nAtomos * 3)
  malla.instanceColor = new InstancedBufferAttribute(colores, 3)
  malla.instanceColor.setUsage(DynamicDrawUsage)
  const rgb = PALETA.map((c) => new Color(c))

  // --- matrices de instancia: solo traslacion, se escriben a mano -----------
  const m = malla.instanceMatrix.array
  for (let i = 0; i < nAtomos; i++) {
    const o = i * 16
    m[o] = 1; m[o + 5] = 1; m[o + 10] = 1; m[o + 15] = 1
  }

  function pinta(fa, fb, t, escala = 1) {
    const base_a = fa * nAtomos * 3
    const base_b = fb * nAtomos * 3
    const ta = fa * nAtomos
    const tb = fb * nAtomos
    const s = 1 - t
    for (let i = 0; i < nAtomos; i++) {
      const a = base_a + i * 3
      const b = base_b + i * 3
      const o = i * 16
      m[o] = escala; m[o + 5] = escala; m[o + 10] = escala
      // si el atomo cruza el borde periodico, no se interpola: se salta
      const dx = pos[b] - pos[a]
      m[o + 12] = Math.abs(dx) > tam[0] * 0.5 ? pos[b] : pos[a] * s + pos[b] * t
      m[o + 13] = pos[a + 1] * s + pos[b + 1] * t
      m[o + 14] = pos[a + 2] * s + pos[b + 2] * t

      const ca = rgb[tipos[ta + i]] || rgb[0]
      const cb = rgb[tipos[tb + i]] || rgb[0]
      const c = i * 3
      colores[c] = ca.r * s + cb.r * t
      colores[c + 1] = ca.g * s + cb.g * t
      colores[c + 2] = ca.b * s + cb.b * t
    }
    malla.instanceMatrix.needsUpdate = true
    malla.instanceColor.needsUpdate = true
  }

  // --- encuadre -------------------------------------------------------------
  let ancho = 1
  let alto = 1
  function redimensiona() {
    const r = contenedor.getBoundingClientRect()
    ancho = Math.max(1, r.width)
    alto = Math.max(1, r.height)
    render.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dprMax))
    render.setSize(ancho, alto, false)
    // el encuadre se fija a la longitud final del hilo: se ve como se estira
    const necesarioX = tam[0] * cfg.margen
    const necesarioY = semiAlto
    const escala = Math.max(necesarioX / ancho, necesarioY / alto)
    camara.left = -ancho * escala * 0.5
    camara.right = ancho * escala * 0.5
    camara.top = alto * escala * 0.5
    camara.bottom = -alto * escala * 0.5
    camara.updateProjectionMatrix()
  }
  redimensiona()
  const observadorTam = new ResizeObserver(redimensiona)
  observadorTam.observe(contenedor)

  // --- interaccion: arrastrar para girar ------------------------------------
  let giroManual = 0
  let arrastrando = false
  let xPrev = 0
  const lienzo = render.domElement
  lienzo.addEventListener('pointerdown', (e) => {
    arrastrando = true
    xPrev = e.clientX
    lienzo.setPointerCapture(e.pointerId)
  })
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastrando) return
    giroManual += (e.clientX - xPrev) * 0.01
    xPrev = e.clientX
  })
  const suelta = () => { arrastrando = false }
  lienzo.addEventListener('pointerup', suelta)
  lienzo.addEventListener('pointercancel', suelta)

  // --- bucle ----------------------------------------------------------------
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)')
  let visible = true
  let corriendo = false
  let t0 = 0
  let peticion = 0

  const ciclo = cfg.duracion + cfg.pausaFinal

  function dibuja(ahora) {
    peticion = requestAnimationFrame(dibuja)
    if (!t0) t0 = ahora
    const t = ((ahora - t0) / 1000) % ciclo
    const avance = Math.min(t / cfg.duracion, 1)
    const u = avance * (nFrames - 1)
    const fa = Math.floor(u)
    // los atomos encogen al final y crecen al principio: el bucle cierra
    // sin corte y sin tener que recurrir a transparencias
    const entra = Math.min(t / cfg.entrada, 1)
    const sale = Math.min((ciclo - t) / cfg.salida, 1)
    const escala = Math.min(entra, sale) ** 2
    pinta(fa, Math.min(fa + 1, nFrames - 1), u - fa, escala)
    malla.rotation.x = giroManual + ((ahora - t0) / 1000) * cfg.giro * Math.PI * 2
    malla.rotation.z = cfg.inclinacion
    render.render(escena, camara)
  }

  function arranca() {
    if (corriendo) return
    corriendo = true
    t0 = 0
    peticion = requestAnimationFrame(dibuja)
  }
  function para() {
    corriendo = false
    cancelAnimationFrame(peticion)
  }

  function fijo() {
    // con prefers-reduced-motion: el fotograma mas vistoso, sin animacion
    const f = Math.round((nFrames - 1) * 0.72)
    pinta(f, f, 0, 1)
    malla.rotation.x = 0.42
    malla.rotation.z = cfg.inclinacion
    render.render(escena, camara)
  }

  const observador = new IntersectionObserver((entradas) => {
    visible = entradas[0].isIntersecting
    if (visible && !quieto.matches) arranca()
    else para()
  }, { threshold: 0.05 })
  observador.observe(contenedor)

  if (quieto.matches) fijo()

  return {
    destruye() {
      para()
      observador.disconnect()
      observadorTam.disconnect()
      geometria.dispose()
      material.dispose()
      malla.dispose()
      render.dispose()
      render.domElement.remove()
    },
  }
}
