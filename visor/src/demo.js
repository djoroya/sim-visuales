import { montaVisor } from './nanohilo.js'

const opciones = { datos: '/nanohilo-cu.nw', poster: '/nanohilo-cu-poster.png' }

montaVisor(document.querySelector('#hilo'), opciones)
montaVisor(document.querySelector('#hilo2'), { ...opciones, giro: 0.05 })
