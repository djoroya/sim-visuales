/**
 * Comprueba, con un DOM de mentira y sin WebGL, que el visor no revienta y
 * deja puesto el poster. Es la rama que veran los navegadores sin WebGL.
 */
import { montaVisor } from '../src/nanohilo.js'

const hijos = []
const elemento = () => ({
  style: {}, dataset: {}, appendChild(h) { hijos.push(h) },
  getContext: () => null, getBoundingClientRect: () => ({ width: 800, height: 350 }),
  addEventListener() {}, remove() {},
})

globalThis.document = { createElement: elemento }
globalThis.window = {
  WebGLRenderingContext: undefined,
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 1,
}

const contenedor = elemento()
const visor = await montaVisor(contenedor, { poster: '/poster.png' })

const ok = hijos.length === 1 && hijos[0].src === '/poster.png' &&
  typeof visor.destruye === 'function'
console.log(ok ? 'ok   sin WebGL se queda el poster' : 'FALLA el respaldo sin WebGL')
process.exit(ok ? 0 : 1)
