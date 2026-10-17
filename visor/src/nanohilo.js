/**
 * Visor de una trayectoria de dinámica molecular empaquetada en un .nw.
 *
 *   import { montaVisor } from './nanohilo.js'
 *   const visor = await montaVisor(document.querySelector('#hilo'), {
 *     datos: '/nanohilo-cu.nw',
 *     meta: '/nanohilo-cu-meta.json',
 *     poster: '/nanohilo-cu-poster.png',
 *   })
 *
 * Monta la escena, los adornos (ejes, escala, leyenda), la barra de tiempo y
 * —si hay curva en el meta— la gráfica tensión-deformación sincronizada.
 * Sin WebGL deja el póster; con prefers-reduced-motion dibuja un fotograma
 * fijo y no arranca la animación, pero deja los controles para mirarla a mano.
 */

import { parsea } from './formato.js'
import { montaEscena } from './escena.js'
import { montaEjes, montaEscala, montaLeyenda } from './adornos.js'
import { montaControles } from './controles.js'
import { ponEstilos } from './estilos.js'

const POR_DEFECTO = {
  datos: 'trayectoria.nw',
  meta: null,
  poster: null,
  duracion: 9,            // segundos de una pasada completa
  pausaFinal: 0.9,
  entrada: 0.45,
  salida: 0.55,
  radio: 1.28,            // radio del átomo, en Å
  giro: 0.08,             // vueltas por segundo alrededor del eje
  inclinacion: 0.05,
  margen: 1.06,
  dprMax: 1.75,
  anchoDosColumnas: 860,  // px a partir de los cuales la gráfica va al lado
  adornos: true,
  controles: true,
  grafica: true,
  descripcion: 'Trayectoria de dinámica molecular',
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

function ponPoster(padre, poster, alt) {
  if (!poster) return null
  const img = document.createElement('img')
  img.src = poster
  img.alt = alt
  img.decoding = 'async'
  img.loading = 'lazy'
  padre.appendChild(img)
  return img
}

export async function montaVisor(contenedor, opciones = {}) {
  const cfg = { ...POR_DEFECTO, ...opciones }
  ponEstilos()
  contenedor.classList.add('nw')

  const vista = document.createElement('div')
  vista.className = 'nw-vista'
  contenedor.appendChild(vista)

  // cfg.Renderer es el gancho de pruebas: si alguien trae su propio
  // dibujante, la detección de WebGL no pinta nada
  if (!cfg.Renderer && !hayWebGL()) {
    ponPoster(vista, cfg.poster, cfg.descripcion)
    return { destruye() { vista.remove() } }
  }

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)')

  const [datos, meta] = await Promise.all([
    fetch(cfg.datos).then((r) => {
      if (!r.ok) throw new Error(`no se pudo cargar ${cfg.datos}`)
      return r.arrayBuffer()
    }).then(parsea),
    cfg.meta
      ? fetch(cfg.meta).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : null,
  ])

  // si el .nw trae deformación por fotograma y no hay meta, al menos eso
  const info = meta || { fotogramas: datos.nFrames, eps: Array.from(datos.eps) }

  const escena = montaEscena(vista, datos, cfg)

  const piezas = []
  if (cfg.adornos) {
    const ejes = montaEjes(vista, escena)
    const escala = montaEscala(vista, escena)
    piezas.push(ejes, escala, montaLeyenda(vista))
    const corta = escena.suscribe(() => { ejes.actualiza(); escala.actualiza() })
    piezas.push({ destruye: corta })
  }
  if (cfg.controles) piezas.push(montaControles(contenedor, escena, info))

  // dos columnas cuando hay sitio y hay algo que poner al lado; en móvil, la
  // gráfica cae debajo
  const habraGrafica = cfg.grafica && !!info.curva
  const mide = new ResizeObserver(() => {
    contenedor.classList.toggle('nw--ancho',
      habraGrafica && contenedor.clientWidth >= cfg.anchoDosColumnas)
  })
  mide.observe(contenedor)

  // se pausa fuera de pantalla; con reduced-motion no arranca sola
  let visible = false
  const mirilla = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (visible && !quieto.matches) escena.reproduce()
    else escena.pausa()
  }, { threshold: 0.05 })
  mirilla.observe(contenedor)

  if (quieto.matches) escena.irA(0.72)   // un fotograma representativo

  // la gráfica es lo más pesado: se carga la última y sin bloquear
  let grafica = null
  if (habraGrafica) {
    import('./grafica.js')
      .then(({ montaGrafica }) => montaGrafica(contenedor, escena, info))
      .then((g) => { grafica = g })
      .catch(() => {})
  }

  return {
    escena,
    datos,
    meta: info,
    destruye() {
      mirilla.disconnect()
      mide.disconnect()
      grafica?.destruye()
      for (const p of piezas) p.destruye()
      escena.destruye()
      vista.remove()
      contenedor.classList.remove('nw', 'nw--ancho')
    },
  }
}
