import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import HistorialActivo from '../components/HistorialActivo';
import Icono from '../components/Iconos';
import { guardarPendiente } from '../cola-offline';

/**
 * Ficha rápida del activo — destino del código QR pegado en el equipo.
 * Pensada para el CELULAR en planta: el técnico escanea y ve de inmediato
 * qué equipo es, cómo está y qué puede hacer, sin buscarlo entre cientos.
 */
const TYPE_ES: Record<string, string> = {
  CAMERA: 'Cámara', NVR: 'NVR', SWITCH: 'Switch', WIRELESS: 'Enlace inalámbrico', ROUTER: 'Router',
  FIREWALL: 'Firewall', SERVER: 'Servidor', UPS: 'UPS', FIBER: 'Fibra', CABINET: 'Gabinete',
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
  // 11.3 — abrir una OM parado frente al equipo, sin teclear su codigo.
  const [abriendoOm, setAbriendoOm] = useState(false);
  const [actividad, setActividad] = useState('');
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
        activity: actividad.trim() || undefined,
      });
      // No se navega solo: se confirma con el codigo. En el celular, saltar
      // de pantalla sin decir que salio bien deja la duda de si salio.
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
          cuerpo: { type: 'CORRECTIVO', assetId: id, activity: actividad.trim() || undefined },
          titulo: `Orden correctiva en ${a?.assetCode || 'equipo'}`,
        });
        setAbriendoOm(false);
        setOmCreada({ code: null, pendiente: true });
      } else {
        setOmError(e?.response?.data?.message || 'No se pudo abrir la orden. Revisa los datos.');
      }
    } finally {
      setCreando(false);
    }
  }

  useEffect(() => {
    api.get('/assets/' + id)
      .then((r) => setA(r.data))
      .catch(() => setErr('No se encontró el activo. Verifica la etiqueta o consulta al Jefe de Mantenimiento.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading">Cargando equipo…</div>;
  if (err) return <div className="scan-wrap"><div className="error">{err}</div></div>;

  const estado = a.effectiveStatus || a.status;
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
            <b>{new Date(a.preventivePlan.nextDueAt).toLocaleDateString('es-PE')}</b>
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
          <textarea
            value={actividad}
            onChange={(e) => setActividad(e.target.value)}
            placeholder="¿Qué se va a hacer? (ej: cámara sin imagen, revisar alimentación PoE)"
            rows={3}
            style={{ width: '100%', marginTop: 10 }}
          />
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
        {can('incident.create') && (
          <button className="btn-primary"
                  onClick={() => nav(`/incidents?assetId=${a.id}&nuevo=1`)}>
            <Icono n="incidencia" size={16} /> Reportar incidencia de este equipo
          </button>
        )}
        {can('wo.read') && (
          <button className="btn-mini" onClick={() => nav(`/maintenance?q=${a.assetCode}`)}>
            <Icono n="orden" size={14} /> Órdenes de este equipo
          </button>
        )}
        {can('asset.read') && (
          <button className="btn-mini" onClick={() => nav(`/assets?search=${a.assetCode}`)}>
            Ver ficha completa
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
