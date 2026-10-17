/**
 * Cargador diferido del visor de pastoreo: lo unico que necesita la pagina.
 * No pide nada hasta que el corral esta a punto de entrar en pantalla, y no
 * pide nada en absoluto si el visitante ha pedido menos movimiento.
 */

export function cargaPastoreo(contenedor, opciones = {}) {
  if (!contenedor) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && !opciones.animarSiempre) return

  let lanzado = false
  const observador = new IntersectionObserver(async (entradas) => {
    if (!entradas[0].isIntersecting || lanzado) return
    lanzado = true
    observador.disconnect()
    try {
      const { montaPastoreo } = await import('./pastoreo.js')
      const visor = await montaPastoreo(contenedor, opciones)
      contenedor.querySelector('img')?.remove()
      opciones.alMontar?.(visor)
    } catch (e) {
      opciones.alFallar?.(e)
    }
  }, { rootMargin: '300px' })
  observador.observe(contenedor)
}
