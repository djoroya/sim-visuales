/**
 * Prueba de humo de la interfaz con jsdom: adornos y controles se montan,
 * reaccionan y se destruyen sin WebGL de por medio. No dibuja la escena
 * (eso necesita un navegador), pero caza los errores de ejecución.
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><body><div id="c" style="width:900px"></div></body>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.ResizeObserver = class { observe() {} disconnect() {} }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

const { montaEjes, montaEscala, montaLeyenda } = await import('../src/adornos.js')
const { montaControles } = await import('../src/controles.js')
const { ponEstilos } = await import('../src/estilos.js')

let fallos = 0
const ok = (cond, nombre, extra = '') => {
  if (!cond) fallos++
  console.log(`${cond ? 'ok   ' : 'FALLA'} ${nombre}${extra ? '  ' + extra : ''}`)
}

// escena de mentira con la misma interfaz que usa la UI
const oyentes = new Set()
let avance = 0
const escena = {
  nFrames: 80, corriendo: false, angulo: 0, inclinacion: 0.05, escalaVista: 0.2,
  reproduce() { this.corriendo = true; this.alCambiarEstado?.(true) },
  pausa() { this.corriendo = false; this.alCambiarEstado?.(false) },
  alterna() { this.corriendo ? this.pausa() : this.reproduce() },
  irA(f) { avance = f; this.emite() },
  suscribe(fn) { oyentes.add(fn); return () => oyentes.delete(fn) },
  emite() {
    const indice = Math.round(avance * (this.nFrames - 1))
    for (const f of oyentes) f({ avance, indice })
  },
}

const meta = {
  fotogramas: 80,
  t_ps: Array.from({ length: 80 }, (_, i) => i * 2.5),
  eps: Array.from({ length: 80 }, (_, i) => i / 79 * 1.087),
}

ponEstilos()
ok(!!document.querySelector('style[data-nw]'), 'los estilos se inyectan una vez')

const caja = document.getElementById('c')

// --- ejes -------------------------------------------------------------------
const ejes = montaEjes(caja, escena)
const svg = caja.querySelector('.nw-ejes')
ok(svg && svg.querySelectorAll('line').length === 3, 'el triedro tiene tres ejes')
const antes = [...svg.querySelectorAll('line')].map((l) => l.getAttribute('x2'))
escena.angulo = 1.1
ejes.actualiza()
const despues = [...svg.querySelectorAll('line')].map((l) => l.getAttribute('x2'))
ok(antes.join() !== despues.join(), 'el triedro se mueve al girar la escena')
const etiquetas = [...svg.querySelectorAll('text')].map((t) => t.textContent).join('')
ok(etiquetas === 'xyz', 'los ejes se llaman x, y, z', etiquetas)

// --- barra de escala --------------------------------------------------------
Object.defineProperty(caja, 'clientWidth', { value: 900, configurable: true })
const escala = montaEscala(caja, escena)
const texto = caja.querySelector('.nw-escala span').textContent
const anchoBarra = caja.querySelector('.nw-escala-barra').style.width
// 900 px * 0.18 * 0.2 A/px = 32,4 A = 3,24 nm -> el redondo que cabe es 2 nm
ok(texto === '2 nm', 'la barra elige una longitud redonda', texto)
ok(anchoBarra === `${(2 * 10) / 0.2}px`, 'y su anchura corresponde a la escala', anchoBarra)

// --- leyenda ----------------------------------------------------------------
const leyenda = montaLeyenda(caja)
const filas = [...caja.querySelectorAll('.nw-leyenda li')]
ok(filas.length === 3, 'la leyenda tiene tres entradas')
ok(/FCC/.test(filas[0].textContent) && /HCP/.test(filas[1].textContent),
  'con nombres de estructura legibles')
ok(filas[1].querySelector('.nw-punto').style.background.replace(/\s/g, '') === 'rgb(20,81,155)',
  'y el azul de la marca en la falla de apilamiento',
  filas[1].querySelector('.nw-punto').style.background)

// --- controles --------------------------------------------------------------
const controles = montaControles(caja, escena, meta)
const barra = caja.querySelector('.nw-barra')
const boton = caja.querySelector('.nw-boton')
escena.irA(0)
// con tiempos de tres cifras la lectura va sin decimales
ok(caja.querySelector('.nw-lectura').textContent.includes('0 ps'),
  'la lectura arranca en 0 ps')
escena.irA(0.5)
const lectura = caja.querySelector('.nw-lectura').textContent
// a mitad de la barra toca el fotograma 40 de 0..79: 100 ps y ε = 55,0 %
ok(/100 ps/.test(lectura) && /ε = 55\.0 %/.test(lectura),
  'y sigue al fotograma', lectura)
ok(barra.value === '500', 'la barra se coloca sola', barra.value)
ok(barra.style.getPropertyValue('--avance') === '50%', 'con el relleno al día')

barra.value = '250'
barra.dispatchEvent(new dom.window.Event('input'))
ok(Math.abs(avance - 0.25) < 1e-9, 'arrastrar la barra mueve la animación', String(avance))

boton.dispatchEvent(new dom.window.Event('click'))
ok(escena.corriendo, 'el botón reproduce')
ok(boton.querySelector('path').getAttribute('d').startsWith('M6 5h4'),
  'y cambia a icono de pausa')
boton.dispatchEvent(new dom.window.Event('click'))
ok(!escena.corriendo, 'y vuelve a pausar')

// --- limpieza ---------------------------------------------------------------
for (const p of [ejes, escala, leyenda, controles]) p.destruye()
ok(!caja.querySelector('.nw-ejes') && !caja.querySelector('.nw-controles'),
  'todo se desmonta sin dejar restos')
ok(oyentes.size === 0, 'y sin dejar oyentes colgando', String(oyentes.size))

console.log(fallos === 0 ? '\ntodo correcto' : `\n${fallos} comprobaciones fallidas`)
process.exit(fallos ? 1 : 0)
