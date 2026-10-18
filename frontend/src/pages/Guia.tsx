import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { puedeAbrir } from '../modulos';
import Icono from '../components/Iconos';

/* =============================================================================
   CÓMO SE TRABAJA — bloque 174
   -----------------------------------------------------------------------------
   El usuario: «las OM dependen de que Producción las cree, y cuando
   Mantenimiento las atiende recién se abre la OM. Esa lógica es interna: se
   puede manejar hablando o con una guía del software».

   Esto es esa guía. No es un manual: es el recorrido de cada trabajo en pasos
   cortos, con QUIÉN hace cada paso y un botón que lleva a la pantalla donde se
   hace (sólo si esa persona puede abrirla). La explicación larga de cada paso
   va al pasar el ratón: lo que se lee de un vistazo es el orden.
============================================================================= */

interface Paso { quien: 'Producción' | 'Mantenimiento' | 'Técnico' | 'Jefe' | 'Sistema'; que: string; detalle: string; ruta?: string; boton?: string }
interface Flujo { id: string; titulo: string; pasos: Paso[] }

const FLUJOS: Flujo[] = [
  {
    id: 'om',
    titulo: 'Una orden de trabajo (OM), de principio a fin',
    pasos: [
      { quien: 'Producción', que: 'Ve el problema y lo reporta, o pide la OM.',
        detalle: 'Desde el QR o el mapa: «No estoy viendo» crea la incidencia. Quien supervisa el tren puede además crear la OM rápida: qué pasa y en qué equipo. Nada más.',
        ruta: '/incidents', boton: 'Incidencias' },
      { quien: 'Sistema', que: 'La OM nace SIN DETALLAR y entra en la bandeja de Mantenimiento.',
        detalle: 'Con fecha de hoy, el equipo y la incidencia enlazados. Aún no es trabajo en curso: es un pedido.',
        ruta: '/bandeja', boton: 'Mi bandeja' },
      { quien: 'Jefe', que: 'Mantenimiento la recibe y la asigna a un técnico.',
        detalle: 'Sólo aparecen técnicos que pueden ejecutar órdenes. Si no puede esperar al día, se mueve la fecha pidiendo prórroga.',
        ruta: '/maintenance', boton: 'Órdenes' },
      { quien: 'Técnico', que: 'La detalla: equipo exacto y trabajo del catálogo.',
        detalle: 'El trabajo se elige de la lista y la actividad se llena sola. Si el problema era otro equipo (la antena, el switch), se cambia aquí con su motivo.',
        ruta: '/maintenance?asignadas=1', boton: 'Mis trabajos' },
      { quien: 'Técnico', que: 'Al llegar al equipo, ABRE la OM: recién ahí empieza.',
        detalle: 'La seguridad sale de lo declarado: ATS, PETAR, LOTO, EPP, parada, acompañante. Sin marcar lo exigido no se abre.' },
      { quien: 'Técnico', que: 'Anota el avance; si paró el tren, la hora real de la parada.',
        detalle: 'Motivos con clics. Si no llega en plazo, pide prórroga con motivo: la aprueba el supervisor.' },
      { quien: 'Técnico', que: 'Cierra con síntoma, causa, acción y foto.',
        detalle: 'Sin foto no cierra, salvo motivo firmado. Lo retirado del almacén queda en la orden.' },
      { quien: 'Jefe', que: 'Aprueba el cierre. La incidencia pasa a resuelta.',
        detalle: 'Sólo el Jefe de Mantenimiento cierra: un cierre afirma que el trabajo se hizo.' },
    ],
  },
  {
    id: 'instalacion',
    titulo: 'Un equipo nuevo',
    pasos: [
      { quien: 'Producción', que: 'Pide qué, cuántos y dónde.', detalle: 'Cinco datos. El resto lo mide el técnico en campo.', ruta: '/pedir-instalacion', boton: 'Pedir instalación' },
      { quien: 'Técnico', que: 'Visita el sitio desde el teléfono y mide.', detalle: 'Cable, canalización, manlift, alimentación: el formulario cambia según el sitio.', ruta: '/instalaciones', boton: 'Instalaciones' },
      { quien: 'Jefe', que: 'Aprueba con la visita hecha y genera la OM.', detalle: 'No se aprueba sin visita: aprobar sin medir es firmar sin saber.' },
      { quien: 'Sistema', que: 'Al cerrar, nace el activo con su ficha.', detalle: 'Lo medido en la visita viaja a la ficha del equipo.' },
    ],
  },
  {
    id: 'preventivo',
    titulo: 'El preventivo',
    pasos: [
      { quien: 'Sistema', que: 'Cada noche genera las OM que tocan.', detalle: 'Según la criticidad A/B/C, el ambiente y la hoja de ruta del tipo de equipo. Se apaga y enciende en Órdenes › Preventivo.', ruta: '/hojas-de-ruta', boton: 'Hojas de ruta' },
      { quien: 'Técnico', que: 'La atiende como cualquier OM, con los pasos de su hoja.', detalle: 'Los pasos vienen copiados de la hoja de ruta: si la hoja cambia mañana, la orden emitida no cambia.' },
    ],
  },
];

const COLOR: Record<Paso['quien'], string> = {
  'Producción': 'guia-prod', Mantenimiento: 'guia-mant', 'Técnico': 'guia-tec', Jefe: 'guia-jefe', Sistema: 'guia-sis',
};

export default function Guia() {
  const { can, user } = useAuth();
  return (
    <div className="page">
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Quién hace cada paso y dónde. Pasa el ratón por un paso para ver el detalle.
      </p>
      {FLUJOS.map((f) => (
        <section key={f.id} className="card guia-flujo" aria-labelledby={'g-' + f.id}>
          <h3 id={'g-' + f.id}>{f.titulo}</h3>
          <ol className="guia-pasos">
            {f.pasos.map((p, i) => (
              <li key={i} title={p.detalle}>
                <span className={'guia-quien ' + COLOR[p.quien]}>{p.quien}</span>
                <span className="guia-que">{p.que}</span>
                {p.ruta && puedeAbrir(p.ruta.split('?')[0], can, user) && (
                  <Link className="btn-mini" to={p.ruta}><Icono n="flecha" size={13} /> {p.boton}</Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
