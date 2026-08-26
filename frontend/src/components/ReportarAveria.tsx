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
import { mensajeDeError, queFalta } from '../avisos';
import BotonConMotivo from './BotonConMotivo';
import { hoyParaInput } from '../fechas';

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
  { categoria: 'SEGURIDAD_FISICA', etiqueta: 'Daño físico o cable cortado', titulo: 'Daño físico en el equipo' },
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
  /* VARIOS MOTIVOS, no uno — bloque 70.
     -------------------------------------------------------------------------
     Petición del usuario: «que se pueda seleccionar más de una opción, así ya
     no se acumula tanto». Y el motivo es de planta: una cámara con el cable
     cortado está ADEMÁS sin alimentación. Son dos hechos de la MISMA avería.

     Antes había que abrir dos incidencias para decirlo, y eso hace que el
     recuento del mes diga dos donde hubo una, y que alguien cierre dos veces
     el mismo trabajo.

     Se guarda el ORDEN en que se marcan: el PRIMERO es el motivo principal,
     porque es lo primero que vio el técnico y es lo que más pesa. Un `Set` no
     valdría: no conserva el orden de forma fiable ni se puede leer «cuál fue
     el primero». */
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const principal = motivos[0] ?? null;

  const alternarMotivo = (m: Motivo) => {
    setError('');
    setMotivos((antes) => (antes.some((x) => x.categoria === m.categoria)
      ? antes.filter((x) => x.categoria !== m.categoria)
      : [...antes, m]));
  };
  const [detalle, setDetalle] = useState('');
  const [sinVista, setSinVista] = useState(false);
  /* Vacío por defecto: «no lo sé» es la respuesta honesta la mayoría de las
     veces, y un valor puesto de oficio se envía sin mirar. */
  const [ocurrio, setOcurrio] = useState('');
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
    if (!principal) {
      setError('Marca al menos un motivo.');
      return;
    }
    setError('');
    setEnviando(true);
    try {
      const r = await api.post('/incidents', {
        /* El título lleva el motivo PRINCIPAL, y si hay más lo dice en corto.
           Es lo que se lee en la lista de incidencias sin abrir nada, así que
           tiene que caber: «Equipo sin imagen (+2) — AA-CAM-T1-001». */
        title: motivos.length > 1
          ? `${principal.titulo} (+${motivos.length - 1}) — ${codigo}`
          : `${principal.titulo} — ${codigo}`,
        description: detalle.trim() || undefined,
        category: principal.categoria,
        categoriasExtra: motivos.slice(1).map((m) => m.categoria),
        assetId,
        zone: zona || undefined,
        // Un hecho, no una opinión: se envía sólo si el técnico lo marcó.
        affectedCameras: sinVista ? 1 : undefined,
        // Si no se sabe, no va: el servidor usará la hora de reporte.
        occurredAt: ocurrio ? new Date(ocurrio).toISOString() : undefined,
      });
      /* NO SE CIERRA EL FORMULARIO HASTA TENER CONFIRMACIÓN.
         -------------------------------------------------------------------
         BUG REAL, y el que hizo que el usuario dijera «no pasa nada».

         Antes esto era `setCreada(r.data); setAbierto(false);` sin más. Si la
         respuesta no traía lo esperado, `creada` quedaba vacío, el formulario
         se cerraba igual y NO SE PINTABA NADA. Ni confirmación ni error: el
         botón se pulsaba y la pantalla volvía atrás en silencio.

         Peor todavía: el aviso de error se dibuja DENTRO del formulario, así
         que al cerrarlo el error se volvía invisible aunque existiera.

         Ahora sólo se cierra si de verdad hay algo que enseñar. */
      if (!r?.data) {
        setError('El servidor no confirmó el registro. Comprueba en Incidencias antes de repetir.');
        return;
      }
      setCreada(r.data);
      setAbierto(false);
      setMotivos([]);
      setDetalle('');
      setSinVista(false);
      setOcurrio('');
      alCrear();
    } catch (e: any) {
      /* El mensaje del servidor primero: dice QUÉ campo está mal. `e.message`
         a secas suele ser «Request failed with status code 400», que no ayuda
         a nadie que esté en un poste con guantes. */
      setError(mensajeDeError(e, 'registrar la incidencia'));
    } finally {
      setEnviando(false);
    }
  }

  if (creada) {
    return (
      <div className="scan-note qr-hecho">
        <Icono n="ok" size={16} />
        <span>
          <b>Incidencia registrada{creada.code ? ` · ${creada.code}` : ''}.</b>{' '}
          Pendiente de revisión por el Jefe de Mantenimiento.{' '}
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
        <Icono n="incidencia" size={16} /> Reportar incidencia de este equipo
      </button>
    );
  }

  return (
    <div className="card scan-card av-form">
      {/* «Incidencia», no «avería» — bloque 70. El usuario lo pidió así y
          tiene razón: el módulo se llama Incidencias, la lista se llama
          Incidencias y el permiso es `incident.create`. Que la pantalla de
          campo lo llamara «avería» obligaba a traducir mentalmente entre lo
          que se rellena y dónde aparece después. */}
      <div className="section-title" style={{ marginTop: 0 }}>Reportar incidencia · {codigo}</div>

      {/* LOS MOTIVOS — bloque 70
          ===================================================================
          TRES COSAS CAMBIAN AQUÍ, Y CADA UNA ARREGLA ALGO DISTINTO.

          1) SE PUEDEN MARCAR VARIOS. Lo pidió el usuario y es correcto: una
             cámara con el cable cortado está además sin alimentación. Antes
             eso obligaba a abrir dos incidencias por una sola avería.

          2) LAS PASTILLAS SALEN DEL `<fieldset>`. Es el sospechoso del
             desmarcado que el usuario ve en el iPhone: `display: flex` sobre
             un `<fieldset>` es un caso que los navegadores han tratado mal
             durante años —el fieldset tiene un modo de dibujado propio— y
             Safari en iOS es donde peor se porta. El `<fieldset>` se queda
             porque agrupa semánticamente, pero el reparto en filas lo hace un
             `<div>` normal de dentro, que es el arreglo estándar.

             NO ESTÁ CONFIRMADO que sea la causa: el estado no se pierde —el
             texto sobrevive y sólo dos sitios del código tocan la selección—,
             así que lo que falla es cómo se pinta. Esto quita el único
             elemento raro que hay en ese dibujado.

          3) HAY UN RESUMEN DE LO MARCADO, justo encima del botón. Y esto es
             lo que de verdad cierra el problema: con cinco pastillas y el
             teclado abierto, las de arriba se van detrás de la barra del
             navegador y no se ve qué hay marcado. El resumen se lee siempre,
             sin subir.

             Además convierte un fallo imposible de reproducir en uno que se
             puede diagnosticar: si las pastillas se apagan pero el resumen
             sigue diciendo «Daño físico», es un problema de pintado; si el
             resumen también se vacía, es de estado. */}
      <fieldset className="av-motivos">
        <legend>
          Motivos <span className="av-uno">marca todos los que veas</span>
        </legend>
        <div className="av-rejilla">
          {MOTIVOS.map((m) => {
            const puesto = motivos.findIndex((x) => x.categoria === m.categoria);
            return (
              <label
                key={m.categoria}
                className={'av-motivo' + (puesto >= 0 ? ' av-elegido' : '')}
              >
                <input
                  type="checkbox"
                  checked={puesto >= 0}
                  onChange={() => alternarMotivo(m)}
                />
                <span>{m.etiqueta}</span>
                {/* El número dice el ORDEN, y el orden importa: el 1 es el
                    motivo principal, el que cuenta en «qué falla más». Sin
                    enseñarlo, el técnico no sabe que el primero que marcó es
                    el que manda. Sólo aparece cuando hay más de uno: con uno
                    solo, un «1» es ruido. */}
                {motivos.length > 1 && puesto >= 0 && (
                  <b className="av-orden">{puesto + 1}</b>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* El resumen. Ver el punto 3 de arriba. */}
      {principal && (
        <div className="av-resumen" role="status">
          <b>{motivos.length === 1 ? 'Motivo:' : `${motivos.length} motivos:`}</b>{' '}
          {motivos.map((m) => m.etiqueta).join(' · ')}
          {motivos.length > 1 && (
            <div className="av-resumen-nota">
              Principal: {principal.etiqueta}. Es el que cuenta en el reparto de fallas.
            </div>
          )}
        </div>
      )}

      <label className="av-lab">
        <span>Detalle (opcional)</span>
        <textarea
          rows={2}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Ej: cable suelto en la parte trasera"
        />
      </label>

      {/* CUÁNDO SE CAYÓ, que no es cuándo se reporta — bloque 68.
          -------------------------------------------------------------------
          Si el técnico llega a las 8 y la cámara lleva apagada desde la
          madrugada, sin este campo esas horas se cargan al tiempo de
          reparación y el MTTR del mes miente.

          Va DESPUÉS del motivo y del detalle a propósito: es lo que menos se
          sabe, y ponerlo arriba haría que la gente se parase a pensarlo antes
          de contar lo importante. */}
      <label className="av-lab">
        <span>¿Desde cuándo está así? (si lo sabes)</span>
        <input
          type="datetime-local"
          value={ocurrio}
          max={hoyParaInput() + 'T23:59'}
          onChange={(e) => setOcurrio(e.target.value)}
        />
        <small className="muted">
          Déjalo vacío si no lo sabes: se usará la hora de ahora.
        </small>
      </label>

      {/* Un HECHO comprobable, no una valoración de urgencia. La prioridad la
          deduce el servidor de la criticidad de la zona. */}
      <label className="av-check">
        <input type="checkbox" checked={sinVista} onChange={(e) => setSinVista(e.target.checked)} />
        <span>La zona quedó sin vista</span>
      </label>

      {error && <div className="error" style={{ display: 'block' }}>{error}</div>}

      <div className="av-acciones">
        <BotonConMotivo
          ocupado={enviando}
          onClick={enviar}
          falta={queFalta([!principal,
            'Marca al menos un motivo: es lo que después dice qué falla más en la planta.'])}
        >
          {enviando ? 'Registrando…' : 'Registrar incidencia'}
        </BotonConMotivo>
        <button type="button" className="btn-mini" onClick={() => { setAbierto(false); setError(''); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
