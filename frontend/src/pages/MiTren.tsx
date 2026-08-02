import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { EsqueletoTablero } from '../components/Esqueleto';
import { NadaPendiente } from '../components/Ilustraciones';

/**
 * MI TREN — la pantalla de Producción.
 *
 * La pidió el ingeniero para el jefe de línea: que vea el estado de SU tren
 * y las órdenes en curso, que pueda descargarse el informe, y **que no pueda
 * intervenir**.
 *
 * POR QUÉ ES UNA PANTALLA APARTE Y NO EL TABLERO CON MENOS BOTONES
 *
 * Quien la usa no mantiene nada: produce. Su pregunta es una sola —
 * *"¿cuándo vuelve mi cámara?"*— y el tablero del ingeniero no la responde:
 * la entierra entre MTTR, avance del mapeo y repuestos bajo mínimo.
 *
 * Así que aquí no hay indicadores de gestión. Hay tres cosas:
 *   1. Si su tren está viendo o no, y cuánto.
 *   2. Qué está caído AHORA MISMO y qué se está haciendo al respecto.
 *   3. El informe, para llevárselo a su reunión.
 *
 * LA SEGURIDAD NO ESTÁ AQUÍ. Esta pantalla no filtra nada: el servidor ya
 * le devuelve únicamente su tren (bloque 4C). Si escribe otro tren en la
 * dirección, no lo ve. Un filtro de pantalla nunca es un permiso.
 */
export default function MiTren() {
  const [datos, setDatos] = useState<any>(null);
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');
  const [bajando, setBajando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // No se traga el error en silencio: si el servidor falla, "no hay datos"
    // y "no pude preguntar" son cosas distintas y el usuario merece saber
    // cuál de las dos es.
    try {
      const [infra, oms] = await Promise.all([
        api.get('/dashboard/infra/trenes').then((r) => r.data),
        api.get('/maintenance', { params: { status: 'ABIERTA', pageSize: 50 } })
          .then((r) => r.data),
      ]);
      setDatos(infra);
      setOrdenes(oms?.items || oms?.data || []);
      setFallo('');
    } catch (e: any) {
      setFallo(
        e?.response?.status === 403
          ? 'Tu usuario no tiene permiso para ver esta pantalla.'
          : 'No se pudo consultar el estado. Vuelve a intentarlo en un momento.',
      );
    }
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  /**
   * EL INFORME NO SE ABRE CON UN ENLACE.
   *
   * Un <a href> normal no lleva la cabecera de autorización —el token vive
   * en el navegador, no en una cookie— así que el servidor respondería 401 y
   * el jefe de línea vería una pestaña con un error en vez de su PDF.
   * Se pide con el mismo cliente que el resto, y el archivo se guarda desde
   * la memoria.
   */
  async function descargarInforme(o: any) {
    setBajando(o.id);
    try {
      const { data } = await api.get(`/maintenance/${o.id}/report`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${o.code || 'informe'}.pdf`;
      a.click();
      // Sin esto, cada descarga deja el archivo entero retenido en memoria
      // hasta recargar la página. Con diez informes seguidos se nota.
      URL.revokeObjectURL(url);
    } catch {
      window.alert('No se pudo descargar el informe. Vuelve a intentarlo.');
    } finally {
      setBajando(null);
    }
  }

  if (cargando) return <EsqueletoTablero kpis={3} paneles={1} />;

  if (fallo) {
    return (
      <div className="card vacio">
        <h3>No se pudo cargar</h3>
        <p>{fallo}</p>
        <button className="btn-primary" style={{ marginTop: 16 }}
          onClick={() => { setCargando(true); cargar().finally(() => setCargando(false)); }}>
          Reintentar
        </button>
      </div>
    );
  }

  const trenes: any[] = datos?.trenes || [];

  if (trenes.length === 0) {
    return (
      <div className="card vacio">
        <h3>Todavía no tienes un tren asignado</h3>
        <p>
          Pídele al ingeniero que te asigne tu tren en Usuarios. Hasta
          entonces esta pantalla no tiene nada que enseñarte.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Mi tren</h1>
      <p className="page-sub">
        Estado de la vigilancia en tu línea y qué se está haciendo con lo que está caído.
      </p>

      {trenes.map((t) => {
        const a = t.activos || {};
        const total = a.total ?? 0;
        const caidos = (a.fueraServicio ?? 0) + (a.conIncidencia ?? 0) + (a.mantenimiento ?? 0);
        const viendo = Math.max(total - caidos, 0);
        const pct = total > 0 ? Math.round((viendo / total) * 100) : 100;
        const estado = pct >= 95 ? 'ok' : pct >= 85 ? 'warn' : 'crit';
        const suyas = ordenes.filter((o) => (o.tren || o.trenCode) === t.code);

        return (
          <div key={t.code || t.id} style={{ marginBottom: 26 }}>
            <div className={'status-hero ' + estado}>
              <div className="sh-left">
                <span className="sh-dot">●</span>
                <div>
                  <div className="sh-title">{t.nombre || t.code}</div>
                  <div className="sh-sub">
                    {caidos === 0
                      ? 'Todas las cámaras de tu línea están operativas.'
                      : `${caidos} de ${total} cámaras no están viendo ahora mismo.`}
                  </div>
                </div>
              </div>
              <div className="sh-right">
                <div className="sh-pct">{pct}%</div>
                <div className="sh-label">con visión</div>
              </div>
            </div>

            <div className="section-title">Qué está caído y qué se está haciendo</div>

            {suyas.length === 0 ? (
              <div className="card vacio">
                <NadaPendiente size={110} />
                <h3>Nada pendiente en tu línea</h3>
                <p>
                  No hay ninguna orden de trabajo abierta sobre los equipos de
                  este tren. Si ves una cámara mal, avisa al ingeniero para que
                  la registre.
                </p>
              </div>
            ) : (
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th>Orden</th><th>Equipo</th><th>Qué pasa</th>
                      <th>Estado</th><th>Prevista</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {suyas.map((o) => (
                      <tr key={o.id}>
                        <td>{o.code}</td>
                        <td>{o.asset?.assetCode || o.asset?.referencePlace || '—'}</td>
                        <td>{o.activity || o.description || '—'}</td>
                        <td><span className={'badge ' + (o.status || '')}>{etiqueta(o.status)}</span></td>
                        <td>{fecha(o.scheduledDate)}</td>
                        <td>
                          {/* Sólo aparece si la orden está cerrada: un informe
                              de algo sin terminar no es un informe. */}
                          {o.status === 'CERRADA' && (
                            <button className="btn-mini" onClick={() => descargarInforme(o)}
                                    disabled={bajando === o.id}>
                              <Icono n="mapeo" size={14} />
                              {bajando === o.id ? ' Bajando…' : ' Informe'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="hint-link">
        <Icono n="candado" size={14} />
        <span>
          Esta pantalla es de <b>sólo consulta</b>. Para reportar una cámara
          caída, avisa al ingeniero de mantenimiento: él abre la orden y aquí
          la verás aparecer.
        </span>
      </div>
    </div>
  );
}

function etiqueta(s?: string) {
  const m: Record<string, string> = {
    ABIERTA: 'Abierta', EN_PROCESO: 'En proceso', EN_ESPERA: 'En espera',
    CERRADA: 'Cerrada', ANULADA: 'Anulada',
  };
  return m[s || ''] || s || '—';
}

function fecha(v?: string) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-PE');
}
