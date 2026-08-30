import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import HistorialActivo from '../components/HistorialActivo';
import Icono from '../components/Iconos';
import { guardarPendiente } from '../cola-offline';
import CampoDelTurno from '../components/CampoDelTurno';
import ArranqueDiagnostico from '../components/ArranqueDiagnostico';
import ReportarCaida from '../components/ReportarCaida';
import AvisoDeIntervencion from '../components/AvisoDeIntervencion';
import TrabajoDesdeElQR from '../components/TrabajoDesdeElQR';
import ReportarAveria from '../components/ReportarAveria';
import { fecha, hoyParaInput } from '../fechas';

/**
 * Ficha rápida del activo — destino del código QR pegado en el equipo.
 * Pensada para el CELULAR en planta: el técnico escanea y ve de inmediato
 * qué equipo es, cómo está y qué puede hacer, sin buscarlo entre cientos.
 */
const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', CABINET: 'Gabinete',
  DECODER: 'Decodificador', PC: 'PC / iVMS-4200', OTHER: 'Otro',
};
const ESTADO_OM: Record<string, string> = {
  ABIERTA: 'abierta', EN_PROCESO: 'en proceso', EN_ESPERA: 'EN ESPERA',
};
const STATUS_ES: Record<string, string> = {
  OPERATIVO: 'Operativo', FUERA_SERVICIO: 'Fuera de servicio', MANTENIMIENTO: 'En mantenimiento',
  CON_INCIDENCIA: 'Con incidencia', BAJA: 'Baja', STOCK: 'En stock',
};

export default function AssetScan() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useAuth();
  const [a, setA] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  // 11.3 — abrir una OM parado frente al equipo, sin teclear su código.
  const [abriendoOm, setAbriendoOm] = useState(false);
  const [actividad, setActividad] = useState('');
  // Nace con HOY: abrir una orden desde el poste significa intervenir ahora.
  const [fechaOm, setFechaOm] = useState(hoyParaInput());
  const [creando, setCreando] = useState(false);
  const [omError, setOmError] = useState('');
  const [omCreada, setOmCreada] = useState<any>(null);

  async function crearOm() {
    setCreando(true);
    setOmError('');
    try {
      const r = await api.post('/work-orders', {
        type: 'CORRECTIVO',
        assetId: id,
        // El enlace con la falla. Ver el comentario de `incidenciaAbierta`.
        incidentId: incidenciaAbierta?.id,
        activity: actividad.trim() || undefined,
        // 08:00 hora local: el turno de mañana. Sin hora, el navegador la
        // pondría a medianoche UTC y en Perú (UTC-5) se iría al día anterior.
        scheduledDate: new Date(fechaOm + 'T08:00:00').toISOString(),
      });
      /* No se navega solo: se confirma con el código. En el celular, saltar
         de pantalla sin decir que salió bien deja la duda de si salió.

         Y NO se cierra el formulario si no hay confirmación: el aviso de
         error vive DENTRO de este bloque, así que cerrarlo lo haría
         invisible y el usuario vería «no pasa nada». */
      if (!r?.data) {
        setOmError('El servidor respondió, pero no confirmó la orden. '
          + 'Revisa en Órdenes (OM) si quedó creada antes de repetirla.');
        return;
      }
      setOmCreada(r.data);
      setAbriendoOm(false);
    } catch (e: any) {
      const estado = e?.response?.status;
      /* 12.6 — SIN SEÑAL NO SE PIERDE LO ESCRITO.
         Sólo cuando NO hubo respuesta del servidor (sin red) o el servidor
         falló (5xx). Un 4xx es un rechazo por contenido: guardarlo sería
         prometer que se subirá, y nunca se va a subir. */
      if (!estado || estado >= 500) {
        await guardarPendiente({
          url: '/work-orders',
          metodo: 'post',
          cuerpo: {
            type: 'CORRECTIVO', assetId: id,
            activity: actividad.trim() || undefined,
            scheduledDate: new Date(fechaOm + 'T08:00:00').toISOString(),
          },
          titulo: `Orden correctiva en ${a?.assetCode || 'equipo'}`,
        });
        setAbriendoOm(false);
        setOmCreada({ code: null, pendiente: true });
      } else {
        const delServidor = e?.response?.data?.message;
        setOmError(
          (Array.isArray(delServidor) ? delServidor.join('. ') : delServidor)
          || `No se pudo abrir la orden (error ${estado}). Revisa los datos.`,
        );
      }
    } finally {
      setCreando(false);
    }
  }

  /* Bloque 62-A: se recarga la ficha tras anotar avance, para que el estado
     de la orden que se ve sea el de verdad y no el de hace un minuto. */
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    api.get('/assets/' + id)
      .then((r) => setA(r.data))
      .catch(() => setErr('No se encontró el activo. Verifica la etiqueta o consulta al Jefe de Mantenimiento.'))
      .finally(() => setLoading(false));
  }, [id, recarga]);

  if (loading) return <div className="loading">Cargando equipo…</div>;
  if (err) return <div className="scan-wrap"><div className="error">{err}</div></div>;

  const estado = a.effectiveStatus || a.status;

  /* LA INCIDENCIA A LA QUE SE VA A ATAR LA ORDEN — bloque 72.
     ---------------------------------------------------------------------------
     Hasta ahora la orden abierta desde el QR nacía SUELTA: no guardaba de qué
     falla salía. Con eso, la incidencia y la orden viven separadas y **no hay
     MTTR**, porque el MTTR es restar la hora en que se reportó de la hora en
     que se cerró — y sin enlace no se sabe qué cierre corresponde a qué
     reporte.

     Se coge la MÁS RECIENTE de las vivas. Si hubiera varias, la última es la
     que el técnico acaba de poner o de leer; atarla a una de hace tres
     semanas sería atarla a la equivocada sin que nadie se entere. */
  const incidenciaAbierta = (a.incidents || [])[0] || null;
  // Órdenes vivas de ESTE equipo. Vienen con la ficha; sólo había que
  // mirarlas.
  const abiertas = (a.workOrders || []).filter((o: any) =>
    ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'].includes(o.status),
  );

  return (
    <div className="scan-wrap">
      <div className="scan-head">
        <div className="scan-code">{a.assetCode}</div>
        <span className={'badge ' + estado}>{STATUS_ES[estado] || estado}</span>
      </div>

      {/* BLOQUE 62-B — CÓMO SE INTERVIENE ESTA ZONA.
          Va por ENCIMA incluso de «ya hay trabajo abierto», y es la única cosa
          que se le adelanta. El orden aquí no es estético: si el técnico sólo
          lee una línea de esta pantalla antes de empezar a trabajar, tiene que
          ser ésta. Que la orden esté duplicada cuesta una hora; que suba a una
          zona que exige parada cuesta otra cosa.

          El dato ya se calculaba desde el bloque 28 y moría en el backend.
          Modelo + cálculo ≠ función: sin pantalla, no existe. */}
      <AvisoDeIntervencion planta={a.planta} zona={a.location?.name} />

      {/* LO PRIMERO DE TODO: ¿YA HAY ALGUIEN EN ESTO?
          Es la misma lección que el gabinete. Sin esto, el técnico escanea,
          ve "fuera de servicio", abre una orden nueva... y resulta que ya
          había una asignada a otro desde el martes. El equipo tiene el dato
          y no lo estaba enseñando. */}
      {abiertas.length > 0 && (
        <div className="error" style={{ display: 'block' }}>
          <b>Ya hay trabajo abierto en este equipo.</b>
          {abiertas.map((o: any) => (
            <div key={o.code} style={{ fontSize: 12.5, marginTop: 6 }}>
              {o.code} · {ESTADO_OM[o.status] || o.status}
              {o.activity ? ` — ${o.activity}` : ''}
              {o.technician?.fullName ? ` (${o.technician.fullName})` : ''}
            </div>
          ))}
        </div>
      )}

      {/* BLOQUE 62-A — TRABAJAR LA ORDEN AQUÍ MISMO.
          Va PEGADO al aviso de «ya hay trabajo abierto» porque son la misma
          conversación: enterarse de que hay una orden y no poder tocarla es
          justo lo que obligaba a bajar a la oficina. */}
      <TrabajoDesdeElQR ordenes={abiertas} alGuardar={() => setRecarga((n) => n + 1)} />

      {/* Bloque 29: lo que dejó el turno anterior y cómo se restaura este
          modelo. Va ARRIBA de la ficha técnica a propósito: el técnico está
          de pie delante del equipo y esto es lo que necesita antes de tocar
          nada. La marca y el número de serie pueden esperar. */}
      {/* BLOQUE 51-B — LA PUERTA DE PRODUCCIÓN.
          Va ARRIBA DEL TODO, antes incluso que el campo del turno, y sólo la
          ve quien tiene `incident.create`. Quien escanea desde el púlpito
          viene a decir UNA cosa: que no está viendo. Si para eso tiene que
          bajar por la ficha técnica, no lo hace: coge la radio. */}
      <ReportarCaida assetId={a.id} codigo={a.assetCode} />

      <CampoDelTurno assetId={a.id} />

      {/* BLOQUE 51 — POR DÓNDE EMPEZAR.
          Va ANTES de la ficha técnica por el mismo motivo que el campo del
          turno: el técnico está de pie delante del equipo, de noche, y lo que
          necesita es saber si el problema es de aquí o de la antena. La marca
          y el número de serie pueden esperar tres líneas más abajo. */}
      <ArranqueDiagnostico assetId={a.id} />

      <div className="card scan-card">
        <Row k="Tipo" v={TYPE_ES[a.type] || a.type} />
        {/* El tren y la etapa NO son columnas: se derivan del árbol. Aquí
            importan porque quien escanea suele estar orientándose. */}
        <Row k="Tren" v={a.planta?.tren} />
        <Row k="Etapa" v={a.planta?.etapa} />
        <Row k="Marca / Modelo" v={[a.brand, a.model].filter(Boolean).join(' ')} />
        <Row k="Ubicación" v={a.location?.name} />
        <Row k="Gabinete" v={a.cabinet ? `${a.cabinet.code} — ${a.cabinet.name}` : null} />
        <Row k="Referencia" v={a.referencePlace} />
        {/* La criticidad EFECTIVA: la mayor entre la del equipo y la mínima
            que impone su etapa del proceso. La columna a secas puede decir
            MEDIA en una cámara de colada, y eso es engañar a quien decide
            si esperar a la parada. */}
        <Row k="Criticidad" v={a.planta?.criticidadEfectiva || a.criticality} />
        {can('credential.read') && <Row k="IP" v={a.ipAddress} mono />}
      </div>

      {a.accessRequests?.length > 0 && (
        <div className="sign-note" style={{ marginTop: 12 }}>
          <Icono n="acceso" size={16} />
          <span>
            Este equipo tiene una solicitud de <b>acceso especial</b>{' '}
            ({a.accessRequests[0].status}). Revisa las condiciones antes de intervenir.
          </span>
        </div>
      )}

      {a.preventivePlan?.nextDueAt && (
        <div className="scan-note">
          <Icono n="preventivo" size={16} />
          <span>
            Próximo preventivo:{' '}
            <b>{fecha(a.preventivePlan.nextDueAt)}</b>
            {' '}(cada {a.preventivePlan.intervalDays} días)
          </span>
        </div>
      )}

      {/* Confirmacion de la orden recien abierta, con su codigo y su enlace. */}
      {omCreada && (
        <div className="scan-note" style={{ borderColor: '#7fbf8f', background: '#eef8f0' }}>
          <Icono n="ok" size={16} />
          <span>
            {omCreada.pendiente ? (
              <>
                <b>Guardado en este teléfono.</b> No había señal, así que la orden
                queda esperando y se sube sola en cuanto vuelva la conexión.
                Puedes seguir trabajando.
              </>
            ) : (
              <>
                Orden <b>{omCreada.code}</b> abierta sobre este equipo.{' '}
                <a onClick={() => nav(`/maintenance?q=${omCreada.code}`)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                  Ir a la orden
                </a>
              </>
            )}
          </span>
        </div>
      )}

      {/* Mini formulario de apertura: UNA caja de texto y un boton. Todo lo
          demas (equipo, tren, ubicacion) ya lo sabe el sistema porque se
          escaneo el QR; hacer pasar al tecnico por el formulario grande
          seria tirar esa informacion. */}
      {abriendoOm && (
        <div className="card scan-card" style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13.5 }}>Abrir orden correctiva en {a.assetCode}</b>
          {omError && <div className="error" style={{ display: 'block', marginTop: 8 }}>{omError}</div>}
          <textarea aria-label="Nota de campo"
            value={actividad}
            onChange={(e) => setActividad(e.target.value)}
            placeholder="¿Qué se va a hacer? (ej: cámara sin imagen, revisar alimentación PoE)"
            rows={3}
            style={{ width: '100%', marginTop: 10 }}
          />
          {/* FECHA — faltaba, y era el agujero por el que se colaban todas.
              Desde el QR se abrían órdenes SIN fecha programada, y una orden
              sin fecha no vence nunca, no entra en el backlog y no cuenta
              para el cumplimiento del preventivo. Viene con HOY puesto porque
              abrir una orden en campo significa intervenir ahora; si el
              técnico la deja para otro día, la cambia de un toque. */}
          <label className="qr-nota-lab">
            <span>¿Para cuándo?</span>
            <input
              type="date"
              value={fechaOm}
              onChange={(e) => setFechaOm(e.target.value)}
              style={{ width: '100%' }}
            />
          </label>
          {/* SE DICE A QUÉ FALLA SE ATA, ANTES DE PULSAR — bloque 72.
              -----------------------------------------------------------------
              El enlace se hace solo, pero callarlo sería un cambio invisible:
              el técnico no sabría que esta orden queda pegada a un parte
              concreto, y si es el equivocado no tendría cómo notarlo. Se dice
              por delante, igual que el aviso de auditoría del avance. */}
          {incidenciaAbierta && (
            <div className="scan-note" style={{ marginTop: 10 }}>
              Esta orden queda ligada a <b>{incidenciaAbierta.code}</b>
              {incidenciaAbierta.reportedBy?.fullName
                ? `, que reportó ${incidenciaAbierta.reportedBy.fullName}` : ''}.
              {' '}Así se puede medir cuánto se tardó desde el aviso.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-primary" disabled={creando} onClick={crearOm}>
              {creando ? 'Abriendo…' : 'Abrir la orden'}
            </button>
            <button className="btn-mini" disabled={creando} onClick={() => setAbriendoOm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="scan-actions">
        {/* 11.3 — la orden se abre AQUI, con el equipo ya puesto. Si ya hay
            trabajo abierto, el aviso rojo de arriba lo dijo primero. */}
        {can('wo.create') && !abriendoOm && !omCreada && (
          <button className="btn-primary" onClick={() => setAbriendoOm(true)}>
            <Icono n="orden" size={16} /> Abrir orden en este equipo
          </button>
        )}
        {/* LOS BOTONES LLEVAN EL EQUIPO CONSIGO.
            Antes iban a la pantalla general: el técnico escaneaba para no
            tener que buscar el equipo entre cientos... y al pulsar acababa
            en una lista donde tenía que buscarlo. Justo lo que el QR venía
            a evitar. */}
        {/* BLOQUE 62-A — el parte se rellena AQUÍ.
            Antes este botón navegaba a `/incidents?nuevo=1`, o sea que sacaba
            al técnico del QR justo después de haber escaneado para no tener
            que buscar el equipo. Ahora el equipo ya viene puesto y la avería
            se registra sin cambiar de pantalla. */}
        <ReportarAveria
          assetId={a.id}
          codigo={a.assetCode}
          zona={a.location?.name}
          alCrear={() => setRecarga((n) => n + 1)}
        />
        {can('wo.read') && (
          <button className="btn-mini" onClick={() => nav(`/maintenance?q=${a.assetCode}`)}>
            <Icono n="orden" size={14} /> Órdenes de este equipo
          </button>
        )}
        {/* SABER MÁS DEL EQUIPO — bloque 69.
            -----------------------------------------------------------------
            Este botón llevaba a `/assets?search=CODIGO`, o sea a la LISTA
            filtrada. Escanear un QR sirve precisamente para no tener que
            buscar el equipo entre cientos; acabar en una tabla y tener que
            pulsar la fila deshace el trabajo del escaneo.

            Ahora `?activo=<id>` abre la ficha de ESE equipo directamente.

            Y va con las DOS llaves: quien tiene `activos.mirar` —los dos
            cargos del tren y el púlpito— no puede entrar a Activos, así que a
            ése se le manda a «Mis activos», que es su pantalla equivalente.
            Enseñarle un botón que le va a dar 403 es peor que no enseñárselo. */}
        {can('asset.read') && (
          <button className="btn-primary" onClick={() => nav(`/assets?activo=${a.id}`)}>
            <Icono n="activos" size={16} /> Saber más de este equipo
          </button>
        )}
        {!can('asset.read') && can('activos.mirar') && (
          <button className="btn-primary" onClick={() => nav('/mis-activos')}>
            <Icono n="activos" size={16} /> Saber más de este equipo
          </button>
        )}

        {/* Y la salida a la lista general, que es una pregunta distinta:
            «¿qué más hay por aquí?». Sin esto el QR es un callejón sin
            salida y hay que volver con el botón del navegador. */}
        {can('asset.read') && (
          <button className="btn-mini" onClick={() => nav('/assets')}>
            Ver todos los activos
          </button>
        )}
        {!can('asset.read') && can('activos.mirar') && (
          <button className="btn-mini" onClick={() => nav('/mis-activos')}>
            Ver los activos de mi tren
          </button>
        )}
        {a.cabinet?.id && (
          <button className="btn-mini" onClick={() => nav(`/g/${a.cabinet.id}`)}>
            <Icono n="gabinete" size={14} /> Ver el gabinete {a.cabinet.code}
          </button>
        )}
      </div>

      {/* HISTORIAL — el técnico lo lee parado frente al equipo, ANTES de tocar
          nada. Sustituye a la lista simple de intervenciones: dice lo mismo y
          además explica el patrón (tramo largo, vecinos caídos, sin falla
          hallada), que es lo que evita volver a arreglar solo el síntoma. */}
      <div className="section-title" style={{ marginTop: 22 }}>Historial y reincidencia</div>
      <div className="card scan-card">
        <HistorialActivo assetId={a.id} compacto />
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="frow">
      <span className="k">{k}</span>
      <span className="v" style={mono ? { fontFamily: 'monospace', fontSize: 12 } : undefined}>
        {v === null || v === undefined || v === '' ? '—' : String(v)}
      </span>
    </div>
  );
}
