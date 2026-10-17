/**
 * Sin WebGL el visor tiene que dejar el póster y no lanzar. Se prueba con
 * jsdom, cuyo canvas no da contexto WebGL: justo el caso que interesa.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

const { montaVisor } = await import('../src/nanohilo.js')

const caja = document.getElementById('c')
const visor = await montaVisor(caja, {
  poster: '/poster.png',
  descripcion: 'imagen de respaldo',
})

const img = caja.querySelector('img')
let fallos = 0
const ok = (cond, nombre) => {
  if (!cond) fallos++
  console.log(`${cond ? 'ok   ' : 'FALLA'} ${nombre}`)
}

ok(!!img, 'sin WebGL se pone el póster')
ok(img?.getAttribute('src') === '/poster.png', 'con la ruta indicada')
ok(img?.getAttribute('alt') === 'imagen de respaldo', 'y con texto alternativo')
ok(!caja.querySelector('canvas'), 'y no se crea ningún lienzo')
ok(typeof visor.destruye === 'function', 'devuelve algo que se puede destruir')
visor.destruye()
ok(!caja.querySelector('img'), 'y al destruirlo no deja restos')

console.log(fallos === 0 ? '\ntodo correcto' : `\n${fallos} comprobaciones fallidas`)
process.exit(fallos ? 1 : 0)
