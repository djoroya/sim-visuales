/**
 * Monta el visor completo —datos reales, adornos, controles, observadores—
 * con un DOM falso y un renderer de mentira. Es lo más parecido a abrirlo en
 * el navegador que se puede hacer sin navegador: cubre el ensamblado, que es
 * donde se juntan las piezas y donde un orden equivocado deja la página en
 * blanco.
 *
 * La gráfica se deja fuera a propósito: Plotly necesita un DOM de verdad.
 */
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

const NW = '../salida/trayectoria.nw'
const META = '../salida/trayectoria-meta.json'

const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>')
globalThis.window = dom.window
globalThis.document = dom.window.document

// jsdom no trae matchMedia; aquí interesa el caso "sin reduced-motion"
dom.window.matchMedia = (consulta) => ({ matches: false, media: consulta })

globalThis.ResizeObserver = class {
  constructor(fn) { this.fn = fn }
  observe() { this.fn([{ contentRect: { width: 900, height: 400 } }], this) }
  disconnect() {}
}
globalThis.IntersectionObserver = class {
  constructor(fn) { this.fn = fn }
  observe() { this.fn([{ isIntersecting: true }], this) }
  disconnect() {}
}
globalThis.requestAnimationFrame = (fn) => dom.window.setTimeout(() => fn(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id)

// fetch que sirve los ficheros del disco
globalThis.fetch = async (ruta) => {
  const fichero = ruta.endsWith('.json') ? META : NW
  const buf = readFileSync(new URL(fichero, import.meta.url))
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    json: async () => JSON.parse(buf.toString('utf8')),
  }
}

class RendererFalso {
  constructor() {
    this.domElement = document.createElement('canvas')
    this.domElement.setPointerCapture = () => {}
  }
  setClearAlpha() {} setPixelRatio() {} setSize() {} render() {} dispose() {}
}

const { montaVisor } = await import('./visor.js')

let fallos = 0
const ok = (cond, nombre, extra = '') => {
  if (!cond) fallos++
  console.log(`${cond ? 'ok   ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`)
}

const caja = document.getElementById('c')
caja.getBoundingClientRect = () => ({ width: 900, height: 400 })
Object.defineProperty(caja, 'clientWidth', { value: 900, configurable: true })

let visor = null
try {
  visor = await montaVisor(caja, {
    datos: '/trayectoria.nw',
    meta: '/meta.json',
    grafica: false,          // Plotly necesita un DOM de verdad
    Renderer: RendererFalso,
  })
  ok(true, 'el visor se monta entero sin lanzar')
} catch (e) {
  ok(false, 'el visor se monta entero sin lanzar', e.message)
  console.log('\n1 comprobación fallida')
  process.exit(1)
}

ok(caja.classList.contains('nw'), 'marca el contenedor')
ok(!!caja.querySelector('.nw-vista canvas'), 'con el lienzo dentro de la vista')
ok(!!caja.querySelector('.nw-ejes'), 'el triedro está puesto')
ok(!!caja.querySelector('.nw-escala'), 'la barra de escala también')
ok(caja.querySelectorAll('.nw-leyenda li').length === 3, 'y la leyenda')
ok(!!caja.querySelector('.nw-barra'), 'la barra de tiempo está puesta')
ok(visor.meta.fotogramas === 80, 'ha leído el meta', String(visor.meta?.fotogramas))
ok(visor.datos.nAtomos === 5780, 'y el binario', String(visor.datos?.nAtomos))

// al estar en pantalla y sin reduced-motion, arranca sola
ok(visor.escena.corriendo, 'arranca al entrar en pantalla')

// la barra de tiempo sigue a la escena
visor.escena.pausa()
visor.escena.irA(0.5)
const lectura = caja.querySelector('.nw-lectura').textContent
ok(/ps/.test(lectura) && /ε =/.test(lectura), 'la lectura se actualiza', lectura)

// y los adornos también
const x2 = caja.querySelector('.nw-ejes line').getAttribute('x2')
ok(x2 !== null && !Number.isNaN(Number(x2)), 'el triedro tiene coordenadas', String(x2))

visor.destruye()
ok(!caja.querySelector('canvas') && !caja.querySelector('.nw-controles'),
  'y al destruirlo no queda nada')

console.log(fallos === 0 ? '\ntodo correcto' : `\n${fallos} comprobaciones fallidas`)
process.exit(fallos ? 1 : 0)
