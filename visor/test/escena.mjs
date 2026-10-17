/**
 * Monta la escena entera con un DOM falso y un renderer de mentira, que es
 * la única parte que necesita WebGL de verdad. Los observadores disparan al
 * observar, como los de verdad: así se reproduce el orden real de llamadas.
 *
 * Este test existe porque una variable de estado declarada después de un
 * callback que se dispara al montar (zona muerta temporal) dejaba la página
 * en blanco con "Cannot access 'avance' before initialization", y ningún
 * test de los que había lo veía.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>')
globalThis.window = dom.window
globalThis.document = dom.window.document

// los observadores de verdad llaman al callback en cuanto observas algo
globalThis.ResizeObserver = class {
  constructor(fn) { this.fn = fn }
  observe() { this.fn([{ contentRect: { width: 800, height: 350 } }], this) }
  disconnect() {}
}
globalThis.requestAnimationFrame = (fn) => dom.window.setTimeout(() => fn(performance.now()), 16)
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id)

// renderer de mentira con la superficie que usa la escena
let dibujos = 0
class RendererFalso {
  constructor() {
    this.domElement = document.createElement('canvas')
    this.domElement.setPointerCapture = () => {}
  }
  setClearAlpha() {}
  setPixelRatio() {}
  setSize() {}
  render() { dibujos++ }
  dispose() {}
}

const { montaEscena } = await import('../src/escena.js')

let fallos = 0
const ok = (cond, nombre, extra = '') => {
  if (!cond) fallos++
  console.log(`${cond ? 'ok   ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`)
}

// trayectoria mínima: 4 átomos, 3 fotogramas
const nAtomos = 4
const nFrames = 3
const datos = {
  nAtomos,
  nFrames,
  pos: new Float32Array(nFrames * nAtomos * 3).map((_, i) => (i % 7) - 3),
  tipos: new Uint8Array(nFrames * nAtomos).fill(1),
  tam: [40, 12, 12],
  eps: new Float32Array([0, 0.5, 1]),
}
const cfg = {
  duracion: 9, pausaFinal: 0.9, entrada: 0.45, salida: 0.55,
  radio: 1.28, giro: 0.08, inclinacion: 0.05, margen: 1.06, dprMax: 1.75,
  Renderer: RendererFalso,
}

const caja = document.getElementById('c')
caja.getBoundingClientRect = () => ({ width: 800, height: 350 })

// --- lo que fallaba: montar, sin más ---------------------------------------
let escena = null
try {
  escena = montaEscena(caja, datos, cfg)
  ok(true, 'la escena se monta sin lanzar')
} catch (e) {
  ok(false, 'la escena se monta sin lanzar', e.message)
  console.log(`\n1 comprobación fallida`)
  process.exit(1)
}

ok(dibujos > 0, 'y ha dibujado al menos una vez', String(dibujos))
ok(caja.querySelector('canvas') !== null, 'el lienzo queda en el contenedor')
ok(escena.escalaVista > 0, 'publica la escala de la vista', escena.escalaVista.toFixed(3))

// --- suscripción ------------------------------------------------------------
const vistos = []
const corta = escena.suscribe((e) => vistos.push(e))
escena.irA(0.5)
ok(vistos.length === 1, 'avisa al suscriptor al saltar de instante')
ok(vistos[0].indice === 1, 'con el índice del fotograma', String(vistos[0]?.indice))
ok(Math.abs(vistos[0].avance - 0.5) < 1e-9, 'y el avance')

escena.irA(2)
ok(vistos[1].avance === 1, 'el avance se limita a 1', String(vistos[1]?.avance))
escena.irA(-1)
ok(vistos[2].avance === 0, 'y a 0 por abajo', String(vistos[2]?.avance))

// --- reproducción -----------------------------------------------------------
const estados = []
escena.alCambiarEstado = (c) => estados.push(c)
escena.reproduce()
ok(escena.corriendo, 'reproduce')
escena.reproduce()
ok(estados.length === 1, 'y no avisa dos veces si ya estaba en marcha')
await new Promise((r) => dom.window.setTimeout(r, 60))
ok(vistos.length > 3, 'el bucle va avisando mientras corre', String(vistos.length))
escena.pausa()
ok(!escena.corriendo && estados.at(-1) === false, 'pausa')
const tras = vistos.length
await new Promise((r) => dom.window.setTimeout(r, 60))
ok(vistos.length === tras, 'y al pausar deja de avisar')

// --- limpieza ---------------------------------------------------------------
corta()
escena.irA(0.3)
ok(vistos.length === tras, 'cortar la suscripción deja de avisar')
escena.destruye()
ok(!caja.querySelector('canvas'), 'destruir quita el lienzo')

console.log(fallos === 0 ? '\ntodo correcto' : `\n${fallos} comprobaciones fallidas`)
process.exit(fallos ? 1 : 0)
