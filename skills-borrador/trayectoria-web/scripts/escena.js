/**
 * La escena three.js: dibuja los átomos y lleva el reloj de la animación.
 *
 * No sabe nada de interfaz. Expone un reproductor (reproduce, pausa, irA) y
 * avisa a quien se suscriba del fotograma actual, que es lo que usan la barra
 * de tiempo y la gráfica para ir en sincronía.
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

// paleta por estructura local (CNA); el índice es el valor que da LAMMPS
export const ESTRUCTURAS = [
  { cna: 1, color: 0xccd6e0, nombre: 'FCC (cristal perfecto)' },
  { cna: 2, color: 0x14519b, nombre: 'HCP (falla de apilamiento / macla)' },
  { cna: 5, color: 0xaab8c6, nombre: 'Otros / superficie libre' },
]
const PALETA = [0xaab8c6, 0xccd6e0, 0x14519b, 0x4a7fbf, 0x4a7fbf, 0xaab8c6]

export function montaEscena(contenedor, datos, cfg) {
  const { nAtomos, nFrames, pos, tipos, tam } = datos

  // --- estado -----------------------------------------------------------
  // Va todo aquí arriba, antes de crear nada que pueda llamar de vuelta.
  // Un ResizeObserver dispara en cuanto observas, y si el callback toca una
  // variable declarada más abajo salta "Cannot access before initialization"
  // (zona muerta temporal) solo en el navegador, con la página en blanco.
  const oyentes = new Set()
  let avance = 0            // 0..1 dentro de la trayectoria
  let giro = 0              // radianes acumulados por el giro automático
  let giroManual = 0        // los que ha añadido el visitante arrastrando
  let corriendo = false
  let peticion = 0
  let ultimo = 0
  let arrastrando = false
  let xPrev = 0
  let anchoPx = 1
  let altoPx = 1
  let angstromPorPx = 1

  const escena = new Scene()
  // al girar sobre su eje, el hilo ocupa su diagonal: hay que reservarla
  const alto3D = Math.hypot(tam[1], tam[2]) * cfg.margen
  const ancho3D = tam[0] * cfg.margen
  const camara = new OrthographicCamera(-1, 1, 1, -1, -4000, 4000)
  camara.position.set(0, 0, 500)

  // cfg.Renderer existe para los tests: permite montar la escena entera con
  // un renderer de mentira, que es la única parte que necesita WebGL de verdad
  const Dibujante = cfg.Renderer || WebGLRenderer
  const render = new Dibujante({
    antialias: true, alpha: true, powerPreference: 'low-power',
  })
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

  const colores = new Float32Array(nAtomos * 3)
  malla.instanceColor = new InstancedBufferAttribute(colores, 3)
  malla.instanceColor.setUsage(DynamicDrawUsage)
  const rgb = PALETA.map((c) => new Color(c))

  const m = malla.instanceMatrix.array
  for (let i = 0; i < nAtomos; i++) m[i * 16 + 15] = 1

  function pinta(fa, fb, t, escala) {
    const ba = fa * nAtomos * 3
    const bb = fb * nAtomos * 3
    const ta = fa * nAtomos
    const tb = fb * nAtomos
    const s = 1 - t
    for (let i = 0; i < nAtomos; i++) {
      const a = ba + i * 3
      const b = bb + i * 3
      const o = i * 16
      m[o] = escala; m[o + 5] = escala; m[o + 10] = escala
      // si el átomo cruza el borde periódico, no se interpola: se salta
      m[o + 12] = Math.abs(pos[b] - pos[a]) > tam[0] * 0.5
        ? pos[b] : pos[a] * s + pos[b] * t
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
  function redimensiona() {
    const r = contenedor.getBoundingClientRect()
    anchoPx = Math.max(1, r.width)
    altoPx = Math.max(1, r.height)
    render.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.dprMax))
    render.setSize(anchoPx, altoPx, false)
    angstromPorPx = Math.max(ancho3D / anchoPx, alto3D / altoPx)
    camara.left = -anchoPx * angstromPorPx * 0.5
    camara.right = anchoPx * angstromPorPx * 0.5
    camara.top = altoPx * angstromPorPx * 0.5
    camara.bottom = -altoPx * angstromPorPx * 0.5
    camara.updateProjectionMatrix()
    avisa()
  }
  const observadorTam = new ResizeObserver(redimensiona)
  observadorTam.observe(contenedor)
  redimensiona()

  // --- arrastrar para girar -------------------------------------------------
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
    if (!corriendo) { dibujaUno(); avisa() }
  })
  const suelta = () => { arrastrando = false }
  lienzo.addEventListener('pointerup', suelta)
  lienzo.addEventListener('pointercancel', suelta)

  // --- reloj ----------------------------------------------------------------
  function avisa() {
    const u = avance * (nFrames - 1)
    for (const f of oyentes) f({ avance, indice: Math.round(u) })
  }

  function dibujaUno(escala = 1) {
    const u = avance * (nFrames - 1)
    const fa = Math.min(Math.floor(u), nFrames - 1)
    pinta(fa, Math.min(fa + 1, nFrames - 1), u - fa, escala)
    malla.rotation.x = giroManual + giro
    malla.rotation.z = cfg.inclinacion
    render.render(escena, camara)
  }

  function paso(ahora) {
    peticion = requestAnimationFrame(paso)
    const dt = ultimo ? Math.min((ahora - ultimo) / 1000, 0.1) : 0
    ultimo = ahora
    giro += dt * cfg.giro * Math.PI * 2

    const t = (avance * cfg.duracion + dt)
    let escala = 1
    if (t >= cfg.duracion) {
      // pausa al final y vuelta a empezar; los átomos encogen y crecen para
      // que el bucle cierre sin corte (nada de transparencias)
      const espera = t - cfg.duracion
      if (espera >= cfg.pausaFinal) {
        avance = 0
      } else {
        avance = 1
        escala = Math.min(1, Math.max(0, (cfg.pausaFinal - espera) / cfg.salida)) ** 2
      }
    } else {
      avance = t / cfg.duracion
      escala = Math.min(1, (avance * cfg.duracion) / cfg.entrada) ** 2
    }
    dibujaUno(escala)
    avisa()
  }

  const api = {
    nFrames,
    get corriendo() { return corriendo },
    reproduce() {
      if (corriendo) return
      corriendo = true
      ultimo = 0
      peticion = requestAnimationFrame(paso)
      api.alCambiarEstado?.(true)
    },
    pausa() {
      if (!corriendo) return
      corriendo = false
      cancelAnimationFrame(peticion)
      api.alCambiarEstado?.(false)
    },
    alterna() { corriendo ? api.pausa() : api.reproduce() },
    irA(fraccion) {
      avance = Math.min(1, Math.max(0, fraccion))
      dibujaUno()
      avisa()
    },
    suscribe(f) { oyentes.add(f); return () => oyentes.delete(f) },
    /** Å por píxel del lienzo: lo necesita la barra de escala. */
    get escalaVista() { return angstromPorPx },
    /** ángulo del giro, para que el triedro gire igual. */
    get angulo() { return giroManual + giro },
    get inclinacion() { return cfg.inclinacion },
    destruye() {
      api.pausa()
      observadorTam.disconnect()
      geometria.dispose()
      material.dispose()
      malla.dispose()
      render.dispose()
      render.domElement.remove()
    },
  }
  api.irA(0)
  return api
}
