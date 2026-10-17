/**
 * Adornos sobre el lienzo: triedro de ejes, barra de escala y leyenda de
 * colores. Todo en SVG y HTML, sin tocar three: son cuatro líneas y pesan
 * mucho menos que una segunda escena, y además salen nítidos en cualquier
 * densidad de pantalla.
 */

import { ESTRUCTURAS } from './escena.js'

const NS = 'http://www.w3.org/2000/svg'
const el = (tipo, atributos = {}) => {
  const n = document.createElementNS(NS, tipo)
  for (const [k, v] of Object.entries(atributos)) n.setAttribute(k, v)
  return n
}

/**
 * Triedro que gira con el modelo. Usa la misma proyección que la escena:
 * ortográfica, giro alrededor de x (el eje del hilo) e inclinación en z.
 */
export function montaEjes(padre, escena, { lado = 68, margen = 12 } = {}) {
  const svg = el('svg', {
    class: 'nw-ejes', width: lado, height: lado,
    viewBox: `0 0 ${lado} ${lado}`, 'aria-hidden': 'true',
  })
  svg.style.left = `${margen}px`
  svg.style.bottom = `${margen}px`

  const c = lado / 2
  const r = lado / 2 - 13
  const ejes = [
    { nombre: 'x', v: [1, 0, 0] },
    { nombre: 'y', v: [0, 1, 0] },
    { nombre: 'z', v: [0, 0, 1] },
  ].map((eje) => {
    const linea = el('line', { x1: c, y1: c, 'stroke-width': 1.6,
      'stroke-linecap': 'round', stroke: '#8c9aab' })
    const texto = el('text', { 'font-size': 10, fill: '#5b6b7b',
      'text-anchor': 'middle', 'dominant-baseline': 'middle' })
    texto.textContent = eje.nombre
    svg.append(linea, texto)
    return { ...eje, linea, texto }
  })
  padre.appendChild(svg)

  function proyecta([x, y, z], th, inc) {
    // giro alrededor de x
    const y1 = y * Math.cos(th) - z * Math.sin(th)
    const z1 = y * Math.sin(th) + z * Math.cos(th)
    // inclinación en el plano de la pantalla
    const u = x * Math.cos(inc) - z1 * Math.sin(inc)
    const v = x * Math.sin(inc) + z1 * Math.cos(inc)
    return [u, v, y1]   // la tercera componente es la profundidad
  }

  function actualiza() {
    const th = escena.angulo
    const inc = escena.inclinacion
    for (const eje of ejes) {
      const [u, v, prof] = proyecta(eje.v, th, inc)
      const x = c + u * r
      const y = c - v * r
      eje.linea.setAttribute('x2', x)
      eje.linea.setAttribute('y2', y)
      eje.texto.setAttribute('x', c + u * (r + 8))
      eje.texto.setAttribute('y', c - v * (r + 8))
      // los ejes que apuntan hacia atrás se atenúan: da sensación de volumen
      const frente = 0.45 + 0.55 * (prof + 1) / 2
      eje.linea.setAttribute('opacity', frente.toFixed(2))
      eje.texto.setAttribute('opacity', frente.toFixed(2))
    }
  }
  actualiza()
  return { actualiza, destruye: () => svg.remove() }
}

/** Barra de escala en nm: elige una longitud redonda que ocupe ~18 % del ancho. */
export function montaEscala(padre, escena, { fraccion = 0.18 } = {}) {
  const caja = document.createElement('div')
  caja.className = 'nw-escala'
  const barra = document.createElement('div')
  barra.className = 'nw-escala-barra'
  const texto = document.createElement('span')
  caja.append(barra, texto)
  padre.appendChild(caja)

  const REDONDOS = [0.5, 1, 2, 5, 10, 20, 50]
  function actualiza() {
    const anchoPx = padre.clientWidth || 1
    const nmDeseados = (anchoPx * fraccion * escena.escalaVista) / 10  // Å -> nm
    let nm = REDONDOS[0]
    for (const v of REDONDOS) if (v <= nmDeseados) nm = v
    const px = (nm * 10) / escena.escalaVista
    barra.style.width = `${px}px`
    texto.textContent = `${nm} nm`
  }
  actualiza()
  return { actualiza, destruye: () => caja.remove() }
}

/** Leyenda de colores por estructura local. */
export function montaLeyenda(padre) {
  const caja = document.createElement('ul')
  caja.className = 'nw-leyenda'
  for (const e of ESTRUCTURAS) {
    const li = document.createElement('li')
    const punto = document.createElement('span')
    punto.className = 'nw-punto'
    punto.style.background = `#${e.color.toString(16).padStart(6, '0')}`
    const t = document.createElement('span')
    t.textContent = e.nombre
    li.append(punto, t)
    caja.appendChild(li)
  }
  padre.appendChild(caja)
  return { destruye: () => caja.remove() }
}
