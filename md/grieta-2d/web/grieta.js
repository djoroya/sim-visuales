/**
 * Visor de la propagacion de la grieta. Canvas 2D, sin dependencias.
 *
 * Con diez mil atomos por fotograma, dibujar cada uno con arc()+fill() no da
 * 60 fps. En su lugar se precalculan 32 "sellos" (un disco ya pintado en cada
 * nivel de color) y cada atomo es un drawImage, que el navegador resuelve con
 * una copia de pixeles.
 *
 *   import { montaGrieta } from './grieta.js'
 *   await montaGrieta(document.querySelector('#grieta'), {
 *     datos: 'grieta.crack', meta: 'grieta-meta.json',
 *   })
 */

// paleta azul profundo -> ambar, la misma que python/paleta.py
const PALETA = [
  '#0b1f3a', '#0e2a4c', '#11355f', '#134071', '#164b83', '#1a5693',
  '#24639e', '#2e70a9', '#3a7db3', '#4a8abb', '#5c96bf', '#70a1c2',
  '#85abc0', '#9ab3b8', '#afbaa9', '#c2bf96', '#d2c183', '#dfbf6f',
  '#e9ba5b', '#f1b347', '#f6ab33', '#f9a21f', '#fa9e14', '#fba520',
  '#fcac35', '#fcb54c', '#fdbf63', '#fdc87a', '#fdd291', '#fedca8',
  '#fee3bf', '#fde68a',
]

const POR_DEFECTO = {
  datos: 'grieta.crack',
  meta: null,
  poster: null,
  duracion: 11,
  pausaFinal: 0.8,
  radio: 1.05,          // radio del atomo dibujado, en unidades LJ
  fondo: '#081627',
  dprMax: 2,
  controles: true,
  barraColor: true,
  margen: 0.01,
  descripcion: 'Una grieta propagandose por un cristal, coloreada por tension',
}

/** Lee el binario .crack. Va aparte para poder probarlo sin navegador. */
export function parsea(buffer) {
  const v = new DataView(buffer)
  if (new TextDecoder().decode(new Uint8Array(buffer, 0, 6)) !== 'CRACK1') {
    throw new Error('fichero de trayectoria no valido')
  }
  const nAtomos = v.getUint32(8, true)
  const nFrames = v.getUint16(12, true)
  const origen = [v.getFloat32(16, true), v.getFloat32(20, true)]
  const tam = [v.getFloat32(24, true), v.getFloat32(28, true)]
  const smin = v.getFloat32(32, true)
  const smax = v.getFloat32(36, true)
  const paso = v.getFloat32(40, true)

  let p = 44
  const t = new Float32Array(buffer.slice(p, p + 4 * nFrames))
  p += 4 * nFrames

  const bytes = new Uint8Array(buffer)
  const pos = new Float32Array(nFrames * nAtomos * 2)
  const q = new Int32Array(nAtomos * 2)
  for (let c = 0; c < 2; c++) {
    const alto = p
    const bajo = p + nAtomos
    p += 2 * nAtomos
    for (let i = 0; i < nAtomos; i++) {
      const u = bytes[alto + i] * 256 + bytes[bajo + i]
      q[i * 2 + c] = u
      pos[i * 2 + c] = origen[c] + u * paso
    }
  }
  const deltas = new Int8Array(buffer, p, (nFrames - 1) * nAtomos * 2)
  let d = 0
  for (let f = 1; f < nFrames; f++) {
    const base = f * nAtomos * 2
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < nAtomos; i++) {
        const k = i * 2 + c
        q[k] += deltas[d++]
        pos[base + k] = origen[c] + q[k] * paso
      }
    }
  }
  p += deltas.length
  const color = new Uint8Array(buffer, p, nFrames * nAtomos)
  return { nAtomos, nFrames, origen, tam, smin, smax, t, pos, color }
}

function sellos(radioPx, dpr) {
  const r = Math.max(1, radioPx * dpr)
  const lado = Math.ceil(r * 2) + 2
  return PALETA.map((c) => {
    const s = document.createElement('canvas')
    s.width = s.height = lado
    const g = s.getContext('2d')
    g.fillStyle = c
    g.beginPath()
    g.arc(lado / 2, lado / 2, r, 0, Math.PI * 2)
    g.fill()
    return s
  })
}

const CSS = `
.gr-controles { display:flex; align-items:center; gap:.7rem; margin-top:.6rem;
  font:400 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; color:#5b6b7b }
.gr-controles input[type=range] { flex:1 1 auto; min-width:0; accent-color:#14519b }
.gr-lectura { font-variant-numeric:tabular-nums; white-space:nowrap }
.gr-escala-color { display:flex; align-items:center; gap:.5rem; margin-top:.5rem;
  font:400 12px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; color:#5b6b7b }
.gr-titulo-color { margin-right:.2rem }
.gr-degradado { flex:0 1 180px; height:9px; border-radius:2px }
`
let puesto = false
function ponEstilos() {
  if (puesto || typeof document === 'undefined') return
  puesto = true
  const h = document.createElement('style')
  h.dataset.gr = 'visor'
  h.textContent = CSS
  document.head.appendChild(h)
}

export async function montaGrieta(contenedor, opciones = {}) {
  const cfg = { ...POR_DEFECTO, ...opciones }
  ponEstilos()

  // --- estado, todo antes de cualquier callback ---------------------------
  let avance = 0
  let corriendo = false
  let peticion = 0
  let ultimo = 0
  let anchoPx = 1
  let altoPx = 1
  let escala = 1
  let desX = 0
  let desY = 0
  let marcas = null
  let dpr = 1
  let arrastrando = false

  const [datos, meta] = await Promise.all([
    fetch(cfg.datos).then((r) => {
      if (!r.ok) throw new Error(`no se pudo cargar ${cfg.datos}`)
      return r.arrayBuffer()
    }).then(parsea),
    cfg.meta ? fetch(cfg.meta).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
  ])
  const { nAtomos, nFrames, origen, tam, smax, pos, color } = datos

  const lienzo = document.createElement('canvas')
  Object.assign(lienzo.style, { width: '100%', height: '100%', display: 'block' })
  contenedor.appendChild(lienzo)
  const ctx = lienzo.getContext('2d', { alpha: false })
  if (!ctx) { lienzo.remove(); return { destruye() {} } }

  function redimensiona() {
    const r = contenedor.getBoundingClientRect()
    anchoPx = Math.max(1, r.width)
    altoPx = Math.max(1, r.height)
    dpr = Math.min(window.devicePixelRatio || 1, cfg.dprMax)
    lienzo.width = Math.round(anchoPx * dpr)
    lienzo.height = Math.round(altoPx * dpr)
    // el encuadre llena el lienzo: se recorta lo que sobre, no se deforma
    escala = Math.max(anchoPx / (tam[0] * (1 + cfg.margen)),
                      altoPx / (tam[1] * (1 + cfg.margen)))
    desX = (anchoPx - tam[0] * escala) / 2
    desY = (altoPx - tam[1] * escala) / 2
    marcas = sellos(cfg.radio * escala, dpr)
    dibuja()
  }

  function dibuja() {
    const u = avance * (nFrames - 1)
    const f = Math.min(Math.round(u), nFrames - 1)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = cfg.fondo
    ctx.fillRect(0, 0, lienzo.width, lienzo.height)

    const base = f * nAtomos * 2
    const cbase = f * nAtomos
    const lado = marcas[0].width
    const mitad = lado / 2
    const sx = escala * dpr
    const ox = desX * dpr
    const oy = altoPx * dpr - desY * dpr
    for (let i = 0; i < nAtomos; i++) {
      const x = ox + (pos[base + i * 2] - origen[0]) * sx - mitad
      const y = oy - (pos[base + i * 2 + 1] - origen[1]) * sx - mitad
      if (x < -lado || y < -lado || x > lienzo.width || y > lienzo.height) continue
      ctx.drawImage(marcas[color[cbase + i] >> 3], x, y)
    }
  }

  const observadorTam = new ResizeObserver(redimensiona)
  observadorTam.observe(contenedor)
  redimensiona()

  // --- interfaz -------------------------------------------------------------
  let pinta = () => {}
  const extras = []
  if (cfg.controles) {
    const caja = document.createElement('div')
    caja.className = 'gr-controles'
    const barra = document.createElement('input')
    barra.type = 'range'
    barra.min = '0'
    barra.max = '1000'
    barra.value = '0'
    barra.setAttribute('aria-label', 'instante de la simulación')
    const lectura = document.createElement('span')
    lectura.className = 'gr-lectura'
    caja.append(barra, lectura)
    contenedor.after(caja)
    extras.push(caja)

    barra.addEventListener('pointerdown', () => { arrastrando = true; para() })
    const soltar = () => { arrastrando = false }
    barra.addEventListener('pointerup', soltar)
    barra.addEventListener('pointercancel', soltar)
    barra.addEventListener('input', () => {
      avance = Number(barra.value) / 1000
      dibuja(); pinta()
    })
    pinta = () => {
      const i = Math.round(avance * (nFrames - 1))
      lectura.textContent = `t = ${(datos.t[i] ?? 0).toFixed(0)}`
      if (!arrastrando) barra.value = String(Math.round(avance * 1000))
    }
    pinta()
  }

  if (cfg.barraColor) {
    const caja = document.createElement('div')
    caja.className = 'gr-escala-color'
    const grad = document.createElement('div')
    grad.className = 'gr-degradado'
    grad.style.background = `linear-gradient(to right, ${PALETA.join(', ')})`
    const izq = document.createElement('span')
    izq.textContent = '0'
    const der = document.createElement('span')
    der.textContent = `${smax.toFixed(1)}`
    const tit = document.createElement('span')
    tit.className = 'gr-titulo-color'
    tit.textContent = 'tensión σyy (ε/σ²)'
    caja.append(tit, izq, grad, der)
    contenedor.after(caja)
    extras.push(caja)
  }

  // --- bucle ----------------------------------------------------------------
  const ciclo = cfg.duracion + cfg.pausaFinal
  function paso(ahora) {
    peticion = requestAnimationFrame(paso)
    const dt = ultimo ? Math.min((ahora - ultimo) / 1000, 0.1) : 0
    ultimo = ahora
    const t = avance * cfg.duracion + dt
    avance = t >= cfg.duracion
      ? (t - cfg.duracion >= cfg.pausaFinal ? 0 : 1)
      : t / cfg.duracion
    dibuja(); pinta()
  }
  function arranca() {
    if (corriendo) return
    corriendo = true; ultimo = 0
    peticion = requestAnimationFrame(paso)
  }
  function para() {
    corriendo = false
    cancelAnimationFrame(peticion)
  }

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mirilla = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !quieto.matches) arranca()
    else para()
  }, { threshold: 0.05 })
  mirilla.observe(contenedor)
  if (quieto.matches) { avance = 0.6; dibuja(); pinta() }

  return {
    irA(f) { avance = Math.min(1, Math.max(0, f)); dibuja(); pinta() },
    arranca,
    para,
    destruye() {
      para()
      mirilla.disconnect()
      observadorTam.disconnect()
      for (const e of extras) e.remove()
      lienzo.remove()
    },
  }
}
