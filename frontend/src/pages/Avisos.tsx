import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTablero } from '../components/Esqueleto';

/**
 * AVISOS POR TELEGRAM (4F) — montado y apagado.
 *
 * Dos partes en una pantalla, y a propósito:
 *
 *  · ARRIBA, "mi Telegram". Lo ve cualquiera y sólo se gestiona a sí mismo.
 *    Es lo único que la mayoría necesita: vincularse una vez y olvidarse.
 *
 *  · ABAJO, la bandeja de salida. Sólo con permiso. Es donde se ve si algo
 *    no llegó — que es la parte que nadie mira hasta que hace falta, y
 *    entonces tiene que estar.
 *
 * Cuando no hay bot configurado la pantalla lo DICE, en vez de enseñar ceros
 * que parecerían "todo enviado".
 */
export default function Avisos() {
  const { can } = useAuth();
  const [mio, setMio] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');

  const cargar = useCallback(async () => {
    const [m, e, l] = await Promise.all([
      api.get('/avisos/mi-telegram').then((r) => r.data).catch(() => null),
      can('notify.read') ? api.get('/avisos/estado').then((r) => r.data).catch(() => null) : null,
      can('notify.read')
        ? api.get('/avisos', { params: { estado: 'FALLIDA' } }).then((r) => r.data).catch(() => [])
        : [],
    ]);
    setMio(m); setEstado(e); setLista(l || []);
  }, [can]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  async function probar() {
    const { data } = await api.post('/avisos/probar', {});
    setMsg(data.ok ? 'Mensaje enviado. Míralo en tu Telegram.' : `No se pudo: ${data.motivo || 'sin detalle'}`);
  }

  async function reintentar(id: string) {
    await api.post(`/avisos/${id}/reintentar`, {});
    await cargar();
  }

  if (cargando) return <EsqueletoTablero kpis={4} paneles={1} />;

  const apagado = mio && mio.activo === false;

  return (
    <div>
      <h1 className="page-title">Avisos</h1>
      <p className="page-sub">
        Qué te llega al teléfono, y si algo no llegó.
      </p>

      {apagado && (
        <div className="card vacio">
          <Icono n="alerta" size={38} />
          <h3>El bot todavía no está configurado</h3>
          <p>
            Todo está montado: las plantillas, la cola de envío y los
            reintentos. Falta una cosa — <b>crear el bot con @BotFather y
            poner su token en Railway</b> como <code>TELEGRAM_BOT_TOKEN</code>.
          </p>
          <p style={{ marginTop: 12 }}>
            El bot <b>no abre ningún puerto</b>: es el sistema el que se
            conecta hacia fuera. Mientras tanto, el sistema funciona igual y
            no se acumula nada.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------- MI TELEGRAM */}
      <div className="section-title">Mi Telegram</div>
      <div className="card" style={{ padding: 18 }}>
        {mio?.vinculado ? (
          <>
            <div className="sign-note">
              <Icono n="ok" size={16} />
              <span>Vinculado. Los avisos te llegan a tu Telegram.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn-mini" onClick={probar}>Mandarme una prueba</button>
              <button
                className="btn-mini btn-danger"
                onClick={async () => {
                  if (!window.confirm('¿Dejar de recibir avisos en Telegram?')) return;
                  await api.post('/avisos/mi-telegram/desvincular', {});
                  await cargar();
                }}
              >
                Desvincular
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
              {/* Se explica el porqué: si no, el paso parece un capricho del
                  sistema y la gente no lo hace. */}
              Telegram <b>no permite que un bot te escriba primero</b> — es una
              regla suya, para que nadie reciba mensajes de bots que no ha
              buscado. Así que tienes que escribirle tú una vez:
            </p>
            <div style={{
              fontFamily: 'monospace', fontSize: 15, background: '#f4f6fa',
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '12px 14px', letterSpacing: '.5px',
            }}>
              /start {mio?.codigo || '——————'}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              {mio?.instrucciones}
            </p>
          </>
        )}
        {msg && <div className="sign-note" style={{ marginTop: 12 }}>{msg}</div>}
      </div>

      {/* ------------------------------------------------ BANDEJA DE SALIDA */}
      {can('notify.read') && estado && (
        <>
          <div className="section-title">Estado del canal</div>
          <div className="kpi-grid">
            <Kpi label="Personas vinculadas" v={estado.vinculados} hint="Reciben avisos en su Telegram" />
            <Kpi label="Por enviar" v={estado.pendientes} hint="En cola; se mandan en el próximo minuto" />
            <Kpi label="Enviados" v={estado.enviadas} cls="ok" hint="Llegaron correctamente" />
            <Kpi
              label="No llegaron" v={estado.fallidas} cls={estado.fallidas ? 'crit' : undefined}
              hint="Tras cuatro intentos. Se pueden reintentar a mano"
            />
          </div>

          {lista.length > 0 && (
            <>
              <div className="section-title">Avisos que no llegaron</div>
              <div className="card">
                <table>
                  <thead>
                    <tr><th>Cuándo</th><th>Qué era</th><th>Por qué falló</th><th></th></tr>
                  </thead>
                  <tbody>
                    {lista.map((n) => (
                      <tr key={n.id}>
                        <td>{new Date(n.creadaEn).toLocaleString('es-PE')}</td>
                        <td>{n.asunto}</td>
                        {/* El motivo se enseña tal cual lo devolvió Telegram.
                            Traducirlo perdería la única pista útil: casi
                            siempre dice "bot was blocked by the user". */}
                        <td className="muted" style={{ fontSize: 12 }}>{n.ultimoError || '—'}</td>
                        <td>
                          {can('notify.manage') && (
                            <button className="btn-mini" onClick={() => reintentar(n.id)}>
                              Reintentar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, v, cls, hint }: { label: string; v: number; cls?: string; hint: string }) {
  return (
    <div className={'kpi ' + (cls || '')}>
      <div className="label">{label}</div>
      <div className="value">{v ?? 0}</div>
      <div className="hint">{hint}</div>
    </div>
  );
}
