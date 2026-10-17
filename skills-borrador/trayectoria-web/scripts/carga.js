/**
 * Cargador diferido del visor.
 *
 * Es lo unico que necesita incluir la portada: pesa menos de 1 KB y solo
 * descarga three.js y la trayectoria cuando el hilo esta a punto de entrar
 * en pantalla, hay WebGL y el visitante no ha pedido menos movimiento.
 * En cualquier otro caso deja el poster, que ya esta en el HTML.
 *
 *   import { cargaVisor } from './carga.js'
 *   cargaVisor(document.querySelector('#hilo'), { datos: '/trayectoria.nw' })
 */

export function cargaVisor(contenedor, opciones = {}) {
  if (!contenedor) return
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (quieto && !opciones.animarSiempre) return

  let lanzado = false
  const observador = new IntersectionObserver(async (entradas) => {
    if (!entradas[0].isIntersecting || lanzado) return
    lanzado = true
    observador.disconnect()
    try {
      const { montaVisor } = await import('./visor.js')
      const visor = await montaVisor(contenedor, opciones)
      contenedor.dataset.visor = 'listo'
      if (opciones.alMontar) opciones.alMontar(visor)
    } catch (e) {
      // si algo falla, el poster del HTML se queda como esta
      contenedor.dataset.visor = 'error'
      if (opciones.alFallar) opciones.alFallar(e)
    }
  }, { rootMargin: '300px' })

  observador.observe(contenedor)
}
