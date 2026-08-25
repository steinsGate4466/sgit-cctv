import { useState } from 'react';
import { api } from '../api/client';
import Icono from './Iconos';
import BotonConMotivo from './BotonConMotivo';
import { mensajeDeError, queFalta } from '../avisos';

/**
 * DECLARAR CÓMO SE LLEGA A UN EQUIPO — bloque 41.
 *
 * =============================================================================
 *  POR QUÉ ES UN FORMULARIO DE TRES CAMPOS Y NO LA FICHA COMPLETA
 * =============================================================================
 *  Esto se rellena en tandas: alguien abre el tren, mira la lista de lo que
 *  falta por declarar y va bajando. Obligarle a abrir la ficha entera de cada
 *  activo para poner un número convertiría una tarde en tres, y lo que no se
 *  puede hacer del tirón no se termina nunca.
 *
 * =============================================================================
 *  LA ALTURA ES OPCIONAL A PROPÓSITO
 * =============================================================================
 *  Exigirla tiene un efecto conocido: el que no la sabe pone un número
 *  cualquiera para poder guardar. Entonces el sistema tiene un dato falso donde
 *  antes tenía un hueco honesto — y un hueco se ve y se pregunta, un 3 inventado
 *  no.
 */

const MEDIOS: Array<{ v: string; et: string; ayuda: string }> = [
  { v: 'A_PIE', et: 'Se llega a pie', ayuda: 'Gabinete, púlpito, sala eléctrica, tablero a nivel de piso.' },
  { v: 'ESCALERA', et: 'Escalera', ayuda: 'Escalera portátil. Por debajo de 1,80 m no es trabajo en altura.' },
  { v: 'ANDAMIO', et: 'Andamio', ayuda: 'Hay que montar estructura antes de subir.' },
  { v: 'MANLIFT', et: 'Manlift', ayuda: 'Plataforma elevadora. Es la que costea Producción.' },
  { v: 'GRUA', et: 'Grúa', ayuda: 'Izaje. Suele exigir además parar la grúa de la nave.' },
  { v: 'LINEA_VIDA', et: 'Línea de vida', ayuda: 'Se sube por estructura con arnés anclado.' },
  { v: 'OTRO', et: 'Otro medio', ayuda: 'Explícalo abajo. No se contará como «se llega a pie».' },
];

export default function DeclararAcceso({ activo, alCerrar, alGuardar }: {
  activo: any;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [medio, setMedio] = useState<string>(activo?.acceso?.medio || '');
  const [altura, setAltura] = useState<string>(
    activo?.acceso?.alturaMetros != null ? String(activo.acceso.alturaMetros) : '',
  );
  const [nota, setNota] = useState<string>(activo?.acceso?.nota || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const elegido = MEDIOS.find((m) => m.v === medio);

  /* El aviso sale MIENTRAS se escribe, no al guardar. Si esperase al envío, la
     persona ya habría decidido y sólo estaría defendiendo lo que puso. */
  const alturaNum = altura.trim() === '' ? null : Number(altura);
  const alturaMala = alturaNum !== null && (Number.isNaN(alturaNum) || alturaNum < 0 || alturaNum > 120);
  const choque = !alturaMala && alturaNum !== null && medio === 'A_PIE' && alturaNum >= 1.8
    ? `A ${alturaNum} m es trabajo en altura y exige PETAR. Si de verdad se llega caminando, revisa la altura.`
    : null;

  async function guardar() {
    if (!medio) { setError('Elige cómo se llega antes de guardar.'); return; }
    if (alturaMala) { setError('La altura tiene que ser un número entre 0 y 120 metros.'); return; }
    setGuardando(true); setError('');
    try {
      const r = await api.patch(`/dashboard/tren/activo/${activo.id}/acceso`, {
        medioAcceso: medio,
        alturaMetros: alturaNum ?? undefined,
        accesoNota: nota.trim() || undefined,
      });
      /* El backend puede responder 200 diciendo que no guardó nada —activo dado
         de baja mientras la pantalla estaba abierta—. Cerrar sin mirarlo dejaría
         a la persona convencida de que quedó registrado. */
      if (r.data?.ok === false) { setError(r.data.mensaje); return; }
      alGuardar();
    } catch (e: any) {
      setError(e?.response?.data?.message?.[0]
        || mensajeDeError(e, 'guardar'));
    } finally { setGuardando(false); }
  }

  return (
    <div className="modal-overlay" onClick={alCerrar}>
      <div className="modal declarar" onClick={(e) => e.stopPropagation()}>
        <h3>
          <Icono n="acceso" size={17} /> Cómo se llega a {activo.codigo}
        </h3>
        <p className="declarar-sub">
          {activo.equipo || activo.tipo}
          {activo.ubicacion && ` · ${activo.ubicacion}`}
        </p>

        {error && <div className="error">{error}</div>}

        <label>Medio de acceso</label>
        <div className="medios">
          {MEDIOS.map((m) => (
            <button key={m.v} type="button"
              className={'medio' + (medio === m.v ? ' act' : '')}
              onClick={() => setMedio(m.v)}>
              {m.et}
            </button>
          ))}
        </div>
        {elegido && <small className="muted">{elegido.ayuda}</small>}

        <label>Altura del punto de montaje (metros) — opcional
          <input type="number" inputMode="decimal" step="0.1" min="0" max="120"
          value={altura} onChange={(e) => setAltura(e.target.value)}
          placeholder="8.5" />
        </label>
        <small className="muted">
          Si no la sabes, déjalo vacío. Un número inventado es peor que un hueco:
          el hueco se ve y se pregunta.
        </small>

        {choque && <div className="card peligro" style={{ marginTop: 10 }}>{choque}</div>}

        <label>Algo más que haya que saber — opcional
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500}
          placeholder="El manlift no entra con el tren en marcha; hay que posicionarlo desde el pasillo norte." />
        </label>

        <div className="card-acciones" style={{ marginTop: 14 }}>
          <button className="btn-mini" onClick={alCerrar} disabled={guardando}>Cancelar</button>
          <BotonConMotivo onClick={guardar} ocupado={guardando}
            falta={queFalta([!medio, 'Elige con qué se llega al equipo: escalera, andamio, manlift o a pie.'])}>
            {guardando ? 'Guardando…' : 'Declarar'}
          </BotonConMotivo>
        </div>

        <small className="muted" style={{ display: 'block', marginTop: 10 }}>
          Queda con tu nombre y la fecha.
        </small>
      </div>
    </div>
  );
}
