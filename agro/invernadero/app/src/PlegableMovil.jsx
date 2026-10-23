import { useEffect, useState } from 'react';

// En escritorio permanece abierto. En móvil se abre solo bajo demanda y
// desmonta los lienzos ocultos para no medir React Flow dentro de display:none.
export function PlegableMovil({ titulo, children, className = '' }) {
  const [movil, setMovil] = useState(() => matchMedia('(max-width: 760px)').matches);
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    const media = matchMedia('(max-width: 760px)');
    const cambia = () => setMovil(media.matches);
    media.addEventListener('change', cambia);
    return () => media.removeEventListener('change', cambia);
  }, []);
  return <details className={`plegable-movil ${className}`} open={!movil || abierto}
    onToggle={(e) => { if (movil) setAbierto(e.currentTarget.open); }}>
    <summary>{titulo}</summary>
    {(!movil || abierto) && children}
  </details>;
}
