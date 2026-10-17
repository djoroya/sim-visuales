/**
 * Visor de la simulacion de pastoreo. Canvas 2D y nada mas: aqui el problema
 * es plano y unas decenas de circulos por fotograma no justifican WebGL ni
 * ninguna dependencia (el visor entero son ~6 KiB).
 *
 *   import { montaPastoreo } from './pastoreo.js'
 *   await montaPastoreo(document.querySelector('#corral'), {
 *     datos: 'pastoreo.herd', meta: 'pastoreo-meta.json', poster: 'poster.png',
 *   })
 */

const AZUL = '#14519b'
const OVEJA = '#9aa8b8'
const OVEJA_BORDE = '#7d8c9e'
const SUAVE = '#5b6b7b'
const LINEA = '#d8e0e9'

const POR_DEFECTO = {
  datos: 'pastoreo.herd',
  meta: null,
  poster: null,
  duracion: 14,           // segundos de una pasada completa
  pausaFinal: 1.0,
  radioOveja: 7,          // unidades del modelo
  radioPerro: 9,
  estela: 90,             // fotogramas de rastro del perro
  dprMax: 2,
  controles: true,
  descripcion: 'Un perro conduce un rebaño de ovejas hacia el objetivo',
}

/** Lee el binario .herd. Va aparte para poder probarlo sin navegador. */
export function parsea(buffer) {
  const vista = new DataView(buffer)
  const magia = new TextDecoder().decode(new Uint8Array(buffer, 0, 5))
  if (magia !== 'HERD1') throw new Error('fichero de trayectoria no valido')

  const nPart = vista.getUint32(8, true)
  const nFrames = vista.getUint16(12, true)
  const origen = [vista.getFloat32(16, true), vista.getFloat32(20, true)]
  const tam = [vista.getFloat32(24, true), vista.getFloat32(28, true)]
  const objetivo = [vista.getFloat32(32, true), vista.getFloat32(36, true)]

  let p = 40
  const tipos = new Uint8Array(buffer.slice(p, p + nPart))
  p += nPart

  const bytes = new Uint8Array(buffer)
  const pos = new Float32Array(nFrames * nPart * 2)
  for (let f = 0; f < nFrames; f++) {
    for (let c = 0; c < 2; c++) {
      const alto = p
      const bajo = p + nPart
      p += 2 * nPart
      const escala = tam[c] / 65535
      const base = f * nPart * 2 + c
      for (let i = 0; i < nPart; i++) {
        pos[base + i * 2] = origen[c] + (bytes[alto + i] * 256 + bytes[bajo + i]) * escala
      }
    }
  }
  return { nPart, nFrames, origen, tam, objetivo, tipos, pos }
}

function ponPoster(padre, poster, alt) {
  if (!poster) return null
  const img = document.createElement('img')
  img.src = poster
  img.alt = alt
  img.decoding = 'async'
  Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'contain' })
  padre.appendChild(img)
  return img
}

export async function montaPastoreo(contenedor, opciones = {}) {
  const cfg = { ...POR_DEFECTO, ...opciones }

  // --- estado: todo arriba, antes de crear nada que pueda llamar de vuelta --
  let avance = 0
  let corriendo = false
  let peticion = 0
  let ultimo = 0
  let anchoPx = 1
  let altoPx = 1
  let escala = 1
  let desX = 0
  let desY = 0
  let arrastrando = false

  const [datos, meta] = await Promise.all([
    fetch(cfg.datos).then((r) => {
      if (!r.ok) throw new Error(`no se pudo cargar ${cfg.datos}`)
      return r.arrayBuffer()
    }).then(parsea),
    cfg.meta ? fetch(cfg.meta).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null,
  ])
  const { nPart, nFrames, origen, tam, objetivo, tipos, pos } = datos

  const lienzo = document.createElement('canvas')
  Object.assign(lienzo.style, { width: '100%', height: '100%', display: 'block' })
  contenedor.appendChild(lienzo)
  const ctx = lienzo.getContext('2d')
  if (!ctx) {
    lienzo.remove()
    ponPoster(contenedor, cfg.poster, cfg.descripcion)
    return { destruye() {} }
  }

  // --- encuadre: el modelo cabe entero, centrado ---------------------------
  function redimensiona() {
    const r = contenedor.getBoundingClientRect()
    anchoPx = Math.max(1, r.width)
    altoPx = Math.max(1, r.height)
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.dprMax)
    lienzo.width = Math.round(anchoPx * dpr)
    lienzo.height = Math.round(altoPx * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    escala = Math.min(anchoPx / tam[0], altoPx / tam[1])
    desX = (anchoPx - tam[0] * escala) / 2
    desY = (altoPx - tam[1] * escala) / 2
    dibuja()
  }
  const aX = (x) => desX + (x - origen[0]) * escala
  // el eje y del modelo va hacia arriba y el del lienzo hacia abajo
  const aY = (y) => altoPx - desY - (y - origen[1]) * escala

  function circulo(x, y, r, relleno, borde, ancho = 1) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    if (relleno) { ctx.fillStyle = relleno; ctx.fill() }
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = ancho; ctx.stroke() }
  }

  function dibuja() {
    const u = avance * (nFrames - 1)
    const fa = Math.min(Math.floor(u), nFrames - 1)
    const fb = Math.min(fa + 1, nFrames - 1)
    const t = u - fa
    ctx.clearRect(0, 0, anchoPx, altoPx)

    // objetivo
    const ox = aX(objetivo[0])
    const oy = aY(objetivo[1])
    ctx.setLineDash([5, 5])
    circulo(ox, oy, 26 * escala, null, LINEA, 1.5)
    ctx.setLineDash([])
    circulo(ox, oy, 3, SUAVE, null)

    // estela del perro
    const perro = tipos.indexOf(1)
    if (perro >= 0 && cfg.estela > 0) {
      ctx.beginPath()
      const desde = Math.max(0, fa - cfg.estela)
      for (let f = desde; f <= fa; f++) {
        const k = (f * nPart + perro) * 2
        const x = aX(pos[k])
        const y = aY(pos[k + 1])
        if (f === desde) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(20, 81, 155, 0.22)'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    // individuos
    for (let i = 0; i < nPart; i++) {
      const ka = (fa * nPart + i) * 2
      const kb = (fb * nPart + i) * 2
      const x = aX(pos[ka] * (1 - t) + pos[kb] * t)
      const y = aY(pos[ka + 1] * (1 - t) + pos[kb + 1] * t)
      if (tipos[i] === 1) {
        circulo(x, y, cfg.radioPerro * escala, AZUL, '#ffffff', 2)
      } else {
        circulo(x, y, cfg.radioOveja * escala, OVEJA, OVEJA_BORDE, 1)
      }
    }
  }

  const observadorTam = new ResizeObserver(redimensiona)
  observadorTam.observe(contenedor)
  redimensiona()

  // --- interfaz -------------------------------------------------------------
  let pinta = () => {}
  let caja = null
  if (cfg.controles && meta) {
    caja = document.createElement('div')
    caja.style.cssText = 'display:flex;align-items:center;gap:.7rem;margin-top:.6rem;'
      + 'font:400 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:' + SUAVE
    const barra = document.createElement('input')
    barra.type = 'range'
    barra.min = '0'
    barra.max = '1000'
    barra.value = '0'
    barra.setAttribute('aria-label', 'instante de la simulación')
    barra.style.cssText = 'flex:1 1 auto;min-width:0;accent-color:' + AZUL
    const lectura = document.createElement('span')
    lectura.style.cssText = 'font-variant-numeric:tabular-nums;white-space:nowrap'
    caja.append(barra, lectura)
    contenedor.after(caja)

    barra.addEventListener('pointerdown', () => { arrastrando = true; para() })
    const soltar = () => { arrastrando = false }
    barra.addEventListener('pointerup', soltar)
    barra.addEventListener('pointercancel', soltar)
    barra.addEventListener('input', () => {
      avance = Number(barra.value) / 1000
      dibuja()
      pinta()
    })

    pinta = () => {
      const i = Math.round(avance * (meta.fotogramas - 1))
      lectura.textContent = `t = ${(meta.t[i] ?? 0).toFixed(0)}`
        + `  ·  distancia al objetivo ${(meta.distancia[i] ?? 0).toFixed(0)}`
      if (!arrastrando) barra.value = String(Math.round(avance * 1000))
    }
    pinta()
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
    dibuja()
    pinta()
  }
  function arranca() {
    if (corriendo) return
    corriendo = true
    ultimo = 0
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

  if (quieto.matches) {
    avance = 0.55      // un instante representativo: el rebano ya en camino
    dibuja()
    pinta()
  }

  return {
    get avance() { return avance },
    irA(f) { avance = Math.min(1, Math.max(0, f)); dibuja(); pinta() },
    arranca,
    para,
    destruye() {
      para()
      mirilla.disconnect()
      observadorTam.disconnect()
      caja?.remove()
      lienzo.remove()
    },
  }
}
