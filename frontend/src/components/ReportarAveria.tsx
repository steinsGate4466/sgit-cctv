/* =============================================================================
   BLOQUE 62-A · REPORTAR AVERÍA SIN SALIR DEL QR
   -----------------------------------------------------------------------------
   EL PROBLEMA QUE CIERRA

   El botón «Reportar incidencia de este equipo» existía y hacía esto:

       nav(`/incidents?assetId=${a.id}&nuevo=1`)

   Es decir, te SACABA del QR y te llevaba a otra pantalla. El técnico escanea
   precisamente para no tener que buscar el equipo entre cientos, y al pulsar
   acababa navegando. En planta, con una mano, eso es una avería que no se
   reporta: se dice por radio y se pierde.

   Ahora el parte se rellena y se envía AQUÍ, con el equipo ya puesto.

   -----------------------------------------------------------------------------
   POR QUÉ «AVERÍA» Y NO «INCIDENCIA»

   Decisión del usuario, y es la correcta de planta: en mantenimiento
   industrial lo que se reporta es una AVERÍA o una FALLA. «Incidencia» es
   palabra de mesa de ayuda informática. El modelo de datos sigue llamándose
   `Incident` —eso no se toca, es el nombre técnico— pero el botón habla el
   idioma del que lo pulsa.

   -----------------------------------------------------------------------------
   POR QUÉ CATÁLOGO Y NO TEXTO LIBRE

   Regla vieja del proyecto: «síntoma, causa y acción salen de catálogo, no de
   texto libre. Con texto libre no se puede contar después qué falla más».
   Aquí se aplica igual: se elige QUÉ PASA de una lista corta —cinco cosas, las
   que de verdad ocurren delante de una cámara— y el texto libre es sólo el
   detalle que añade contexto, nunca la clasificación.

   -----------------------------------------------------------------------------
   LA PRIORIDAD NO LA ELIGE EL QUE REPORTA

   A propósito. Quien está delante de la avería siempre la ve urgente, y si
   todo es crítico nada lo es. La prioridad se deja al servidor, que la deduce
   de la criticidad de la zona (bloque 51-B). Aquí sólo se ofrece marcar
   «la zona quedó sin vista», que es un HECHO comprobable, no una opinión.
============================================================================= */
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Icono from './Iconos';

interface Motivo {
  /** Valor del enum `IncidentCategory` del backend. */
  categoria: string;
  etiqueta: string;
  /** Título por defecto de la avería. Se puede afinar en el detalle. */
  titulo: string;
}

/* Cinco motivos. La lista es CORTA a propósito: con veinte opciones el técnico
   elige la primera que suena parecido y la estadística se vuelve basura.
   Estos cinco son lo que de verdad se encuentra uno delante de una cámara. */
const MOTIVOS: Motivo[] = [
  { categoria: 'CAMARA_SIN_IMAGEN', etiqueta: 'No da imagen', titulo: 'Equipo sin imagen' },
  { categoria: 'AMBIENTAL_SIDERURGICO', etiqueta: 'Sucia o empañada', titulo: 'Óptica sucia o empañada' },
  { categoria: 'SEGURIDAD_FISICA', etiqueta: 'Golpeada, movida o cable cortado', titulo: 'Daño físico en el equipo' },
  { categoria: 'PERDIDA_CONECTIVIDAD', etiqueta: 'No responde en red', titulo: 'Pérdida de conectividad' },
  { categoria: 'FALLA_FUENTE_POE', etiqueta: 'Sin alimentación', titulo: 'El equipo no energiza' },
];

export default function ReportarAveria({
  assetId,
  codigo,
  zona,
  alCrear,
}: {
  assetId: string;
  codigo: string;
  zona?: string | null;
  alCrear: () => void;
}) {
  const { can } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [detalle, setDetalle] = useState('');
  const [sinVista, setSinVista] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [creada, setCreada] = useState<any>(null);
  const [error, setError] = useState('');

  /* DOS FORMULARIOS, UNO POR OFICIO — decisión del usuario en el bloque 62-A.
     -------------------------------------------------------------------------
     «Lo más probable es que el incidente lo hagan en púlpito, así que el
      formulario para ellos es distinto: se autocompleta. Si es un técnico,
      ahí sí tiene que ser más complejo.»

     Y tiene razón, porque no saben lo mismo:

       · PRODUCCIÓN mira un monitor y ve un cuadro en negro. Sabe UNA cosa —
         «no estoy viendo»— y no tiene por qué saber si es la fuente PoE o el
         switch. Su formulario es `ReportarCaida` (bloque 51-B): un botón.
         Pedirle que elija categoría es pedirle que adivine, y una categoría
         adivinada ensucia la estadística de fallas para siempre.

       · EL TÉCNICO está delante del equipo, con la tapa abierta. Él SÍ
         distingue óptica sucia de cable cortado, y esa clasificación es la
         que después dice qué falla más en la planta.

     EL REPARTO SE HACE POR CAPACIDAD, NO POR NOMBRE DE ROL: quien puede
     TRABAJAR órdenes (`wo.update`) es personal de mantenimiento y ve este
     formulario; quien sólo puede reportar ve el de un botón. Producción tiene
     `incident.create` pero no `wo.update`, así que le sale el suyo y no los
     dos — que era el fallo: dos formularios para lo mismo en la misma
     pantalla es la forma más rápida de que no se use ninguno. */
  if (!can('incident.create') || !can('wo.update')) return null;

  async function enviar() {
    if (!motivo) {
      setError('Elige qué le pasa al equipo.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      const r = await api.post('/incidents', {
        title: `${motivo.titulo} — ${codigo}`,
        description: detalle.trim() || undefined,
        category: motivo.categoria,
        assetId,
        zone: zona || undefined,
        // Un hecho, no una opinión: se envía sólo si el técnico lo marcó.
        affectedCameras: sinVista ? 1 : undefined,
      });
      setCreada(r.data);
      setAbierto(false);
      setMotivo(null);
      setDetalle('');
      setSinVista(false);
      alCrear();
    } catch (e: any) {
      setError(e?.message || 'No se pudo registrar la avería. Vuelve a intentarlo.');
    } finally {
      setEnviando(false);
    }
  }

  if (creada) {
    return (
      <div className="scan-note qr-hecho">
        <Icono n="ok" size={16} />
        <span>
          <b>Avería registrada{creada.code ? ` — ${creada.code}` : ''}.</b>{' '}
          Queda con tu nombre y la hora. El Jefe de Mantenimiento la revisa y
          decide si abre orden; <b>cerrarla es cosa suya</b>, no tuya.{' '}
          <a
            onClick={() => setCreada(null)}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            Reportar otra
          </a>
        </span>
      </div>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className="btn-primary av-abrir" onClick={() => setAbierto(true)}>
        <Icono n="incidencia" size={16} /> Reportar avería de este equipo
      </button>
    );
  }

  return (
    <div className="card scan-card av-form">
      <div className="section-title" style={{ marginTop: 0 }}>Reportar avería · {codigo}</div>

      <fieldset className="av-motivos">
        <legend>¿Qué le pasa?</legend>
        {MOTIVOS.map((m) => (
          <button
            key={m.categoria}
            type="button"
            className={'btn-mini av-motivo' + (motivo?.categoria === m.categoria ? ' av-elegido' : '')}
            onClick={() => { setMotivo(m); setError(''); }}
          >
            {m.etiqueta}
          </button>
        ))}
      </fieldset>

      <label className="av-lab">
        <span>Detalle (opcional)</span>
        <textarea
          rows={2}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Lo que viste. Ej: cable colgando por detrás del poste"
        />
      </label>

      {/* Un HECHO comprobable, no una valoración de urgencia. La prioridad la
          deduce el servidor de la criticidad de la zona. */}
      <label className="av-check">
        <input type="checkbox" checked={sinVista} onChange={(e) => setSinVista(e.target.checked)} />
        <span>La zona se ha quedado sin vista</span>
      </label>

      {error && <div className="error" style={{ display: 'block' }}>{error}</div>}

      <div className="av-acciones">
        <button type="button" className="btn-primary" disabled={enviando} onClick={enviar}>
          {enviando ? 'Registrando…' : 'Registrar avería'}
        </button>
        <button type="button" className="btn-mini" onClick={() => { setAbierto(false); setError(''); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
