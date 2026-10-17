/**
 * Visor de la comparacion heuristica / control optimo. Canvas 2D y sin
 * dependencias, como el de `particulas/pastoreo/`: son 203 circulos por
 * fotograma y dos escenas, nada que justifique WebGL.
 *
 *   import { montaComparacion } from './visor.js'
 *   await montaComparacion(document.querySelector('#corral'), {
 *     datos: 'pastoreo-optimo.herd2', meta: 'pastoreo-optimo-meta.json',
 *   })
 *
 * Las dos escenas comparten reloj, encuadre y barra de tiempo: lo unico que
 * cambia entre paneles es la politica que mueve a los perros, que es
 * justamente lo que se quiere comparar.
 */

const AZUL = '#14519b'
const OVEJA = '#9aa8b8'
const OVEJA_BORDE = '#7d8c9e'
const SUAVE = '#5b6b7b'
const LINEA = '#d8e0e9'
const PERROS = ['#14519b', '#c8791a', '#2f7d62']

const POR_DEFECTO = {
  datos: 'pastoreo-optimo.herd2',
  meta: 'pastoreo-optimo-meta.json',
  poster: null,
  duracion: 16,            // segundos de una pasada completa
  pausaFinal: 1.2,
  radioOveja: 6,           // unidades del modelo
  radioPerro: 10,
  estela: 60,              // fotogramas de rastro de cada perro
  dprMax: 2,
  controles: true,
  modo: 'lado',            // 'lado' | 'conmuta'
  descripcion: 'Tres perros conducen un rebaño de 200 ovejas hacia el objetivo',
}

/** Lee el binario .herd2. Va aparte para poder probarlo sin navegador. */
export function parsea(buffer) {
  const vista = new DataView(buffer)
  const magia = new TextDecoder().decode(new Uint8Array(buffer, 0, 5))
  if (magia !== 'HERD2') throw new Error('fichero de trayectoria no valido')

  const nPart = vista.getUint32(8, true)
  const nFrames = vista.getUint16(12, true)
  const nEsc = vista.getUint8(14)
  const origen = [vista.getFloat32(16, true), vista.getFloat32(20, true)]
  const tam = [vista.getFloat32(24, true), vista.getFloat32(28, true)]
  const objetivo = [vista.getFloat32(32, true), vista.getFloat32(36, true)]

  let p = 40
  const tipos = new Uint8Array(buffer.slice(p, p + nPart))
  p += nPart

  const bytes = new Uint8Array(buffer)
  const escenas = []
  for (let e = 0; e < nEsc; e++) {
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
    escenas.push(pos)
  }
  return { nPart, nFrames, nEsc, origen, tam, objetivo, tipos, escenas }
}

function elemento(etiqueta, estilo, texto) {
  const e = document.createElement(etiqueta)
  if (estilo) e.style.cssText = estilo
  if (texto) e.textContent = texto
  return e
}

const FUENTE = '400 13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif'

export async function montaComparacion(contenedor, opciones = {}) {
  const cfg = { ...POR_DEFECTO, ...opciones }

  let avance = 0
  let corriendo = false
  let peticion = 0
  let ultimo = 0
  let arrastrando = false
  let visible = 0            // panel visible en modo 'conmuta'

  const [datos, meta] = await Promise.all([
    fetch(cfg.datos).then((r) => {
      if (!r.ok) throw new Error(`no se pudo cargar ${cfg.datos}`)
      return r.arrayBuffer()
    }).then(parsea),
    fetch(cfg.meta).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  const { nPart, nFrames, origen, tam, objetivo, tipos, escenas } = datos
  const perros = []
  for (let i = 0; i < nPart; i++) if (tipos[i] === 1) perros.push(i)

  // --- un panel por escena ---------------------------------------------------
  const rejilla = elemento('div',
    `display:grid;grid-template-columns:repeat(${escenas.length},minmax(0,1fr));gap:1rem`)
  contenedor.appendChild(rejilla)

  const paneles = escenas.map((pos, e) => {
    const caja = elemento('div', 'min-width:0')
    const titulo = elemento('div',
      `font:600 13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;` +
      `color:${SUAVE};margin:0 0 .35rem;letter-spacing:.01em`,
      meta?.escenas?.[e]?.titulo ?? (e === 0 ? 'heurística' : 'óptimo'))
    const marco = elemento('div',
      'position:relative;aspect-ratio:1/1;background:#fbfcfd;'
      + 'border:1px solid #e7ecf1;border-radius:6px;overflow:hidden')
    const lienzo = elemento('canvas', 'width:100%;height:100%;display:block')
    const lectura = elemento('div',
      `font:${FUENTE};color:${SUAVE};margin-top:.35rem;`
      + 'font-variant-numeric:tabular-nums')
    marco.appendChild(lienzo)
    caja.append(titulo, marco, lectura)
    rejilla.appendChild(caja)
    return { pos, caja, marco, lienzo, lectura, ctx: lienzo.getContext('2d'),
             ancho: 1, alto: 1, escala: 1, desX: 0, desY: 0 }
  })

  function redimensiona() {
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.dprMax)
    for (const q of paneles) {
      const r = q.marco.getBoundingClientRect()
      q.ancho = Math.max(1, r.width)
      q.alto = Math.max(1, r.height)
      q.lienzo.width = Math.round(q.ancho * dpr)
      q.lienzo.height = Math.round(q.alto * dpr)
      q.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      q.escala = Math.min(q.ancho / tam[0], q.alto / tam[1])
      q.desX = (q.ancho - tam[0] * q.escala) / 2
      q.desY = (q.alto - tam[1] * q.escala) / 2
    }
    dibuja()
  }

  function circulo(ctx, x, y, r, relleno, borde, ancho = 1) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    if (relleno) { ctx.fillStyle = relleno; ctx.fill() }
    if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = ancho; ctx.stroke() }
  }

  function dibujaPanel(q) {
    const { ctx, pos } = q
    const aX = (x) => q.desX + (x - origen[0]) * q.escala
    const aY = (y) => q.alto - q.desY - (y - origen[1]) * q.escala
    const u = avance * (nFrames - 1)
    const fa = Math.min(Math.floor(u), nFrames - 1)
    const fb = Math.min(fa + 1, nFrames - 1)
    const t = u - fa

    ctx.clearRect(0, 0, q.ancho, q.alto)

    const ox = aX(objetivo[0])
    const oy = aY(objetivo[1])
    ctx.setLineDash([5, 5])
    circulo(ctx, ox, oy, 25 * q.escala, null, LINEA, 1.5)
    ctx.setLineDash([])
    circulo(ctx, ox, oy, 3, SUAVE, null)

    perros.forEach((ip, k) => {
      if (cfg.estela <= 0) return
      ctx.beginPath()
      const desde = Math.max(0, fa - cfg.estela)
      for (let f = desde; f <= fa; f++) {
        const j = (f * nPart + ip) * 2
        const x = aX(pos[j])
        const y = aY(pos[j + 1])
        if (f === desde) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = PERROS[k % PERROS.length] + '44'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.stroke()
    })

    for (let i = 0; i < nPart; i++) {
      const ka = (fa * nPart + i) * 2
      const kb = (fb * nPart + i) * 2
      const x = aX(pos[ka] * (1 - t) + pos[kb] * t)
      const y = aY(pos[ka + 1] * (1 - t) + pos[kb + 1] * t)
      if (tipos[i] === 1) continue
      circulo(ctx, x, y, Math.max(1.2, cfg.radioOveja * q.escala), OVEJA, OVEJA_BORDE, 1)
    }
    perros.forEach((ip, k) => {
      const ka = (fa * nPart + ip) * 2
      const kb = (fb * nPart + ip) * 2
      const x = aX(pos[ka] * (1 - t) + pos[kb] * t)
      const y = aY(pos[ka + 1] * (1 - t) + pos[kb + 1] * t)
      circulo(ctx, x, y, Math.max(2.5, cfg.radioPerro * q.escala),
              PERROS[k % PERROS.length], '#ffffff', 2)
    })
  }

  function dibuja() {
    for (const q of paneles) dibujaPanel(q)
    pintaLecturas()
  }

  function pintaLecturas() {
    if (!meta) return
    const i = Math.round(avance * (meta.fotogramas - 1))
    paneles.forEach((q, e) => {
      const s = meta.escenas?.[e]
      if (!s) return
      q.lectura.textContent =
        `distancia ${(s.distancia[i] ?? 0).toFixed(0)}`
        + `  ·  dispersión ${(s.dispersion[i] ?? 0).toFixed(0)}`
        + `  ·  esfuerzo ${(s.esfuerzo[i] ?? 0).toFixed(0)}`
    })
    if (reloj) reloj.textContent = `t = ${(meta.t[i] ?? 0).toFixed(0)}`
  }

  // observar cada marco, no solo el contenedor: el alto de los paneles lo fija
  // el aspect-ratio del CSS y no esta disponible en el primer layout
  const observador = new ResizeObserver(redimensiona)
  observador.observe(contenedor)
  for (const q of paneles) observador.observe(q.marco)

  // --- controles -------------------------------------------------------------
  let reloj = null
  let caja = null
  if (cfg.controles) {
    caja = elemento('div',
      `display:flex;align-items:center;gap:.7rem;margin-top:.8rem;font:${FUENTE};color:${SUAVE}`)
    const boton = elemento('button',
      `font:${FUENTE};color:${SUAVE};background:#fff;border:1px solid #d8e0e9;`
      + 'border-radius:4px;padding:.2rem .6rem;cursor:pointer', 'pausa')
    const barra = elemento('input',
      `flex:1 1 auto;min-width:0;accent-color:${AZUL}`)
    barra.type = 'range'
    barra.min = '0'
    barra.max = '1000'
    barra.value = '0'
    barra.setAttribute('aria-label', 'instante de la simulación')
    reloj = elemento('span', 'font-variant-numeric:tabular-nums;white-space:nowrap')
    caja.append(boton, barra, reloj)
    contenedor.after(caja)

    boton.addEventListener('click', () => {
      if (corriendo) { para(); boton.textContent = 'sigue' }
      else { arranca(); boton.textContent = 'pausa' }
    })
    barra.addEventListener('pointerdown', () => {
      arrastrando = true
      para()
      boton.textContent = 'sigue'
    })
    const soltar = () => { arrastrando = false }
    barra.addEventListener('pointerup', soltar)
    barra.addEventListener('pointercancel', soltar)
    barra.addEventListener('input', () => {
      avance = Number(barra.value) / 1000
      dibuja()
    })
    const anterior = pintaLecturas
    pintaLecturas = () => {
      anterior()
      if (!arrastrando) barra.value = String(Math.round(avance * 1000))
    }
  }

  if (cfg.modo === 'conmuta') {
    rejilla.style.gridTemplateColumns = 'minmax(0,1fr)'
    paneles.forEach((q, e) => { q.caja.style.display = e === visible ? '' : 'none' })
    contenedor.addEventListener('click', () => {
      visible = (visible + 1) % paneles.length
      paneles.forEach((q, e) => { q.caja.style.display = e === visible ? '' : 'none' })
      redimensiona()
    })
    contenedor.style.cursor = 'pointer'
  }

  redimensiona()

  // --- bucle -----------------------------------------------------------------
  function paso(ahora) {
    peticion = requestAnimationFrame(paso)
    const dt = ultimo ? Math.min((ahora - ultimo) / 1000, 0.1) : 0
    ultimo = ahora
    const t = avance * cfg.duracion + dt
    avance = t >= cfg.duracion
      ? (t - cfg.duracion >= cfg.pausaFinal ? 0 : 1)
      : t / cfg.duracion
    dibuja()
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
    avance = 0.6
    dibuja()
  }

  return {
    get avance() { return avance },
    irA(f) { avance = Math.min(1, Math.max(0, f)); dibuja() },
    arranca,
    para,
    destruye() {
      para()
      mirilla.disconnect()
      observador.disconnect()
      caja?.remove()
      rejilla.remove()
    },
  }
}
