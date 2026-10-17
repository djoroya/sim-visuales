import { montaVisor } from './nanohilo.js'

const opciones = {
  datos: '/nanohilo-cu.nw',
  meta: '/nanohilo-cu-meta.json',
  poster: '/nanohilo-cu-poster.png',
  descripcion: 'Nanohilo de cobre estirado hasta romperse, simulado con dinámica molecular',
}

montaVisor(document.querySelector('#hilo'), opciones)
montaVisor(document.querySelector('#hilo2'), { ...opciones, grafica: false, giro: 0.05 })
