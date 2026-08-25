import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Icono from '../components/Iconos';
import { useAuth } from '../auth/AuthContext';
import { EsqueletoTablero } from '../components/Esqueleto';
import { useDialogos } from '../components/Dialogos';
import { fechaHora } from '../fechas';

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
  const { confirmar } = useDialogos();
  const { can } = useAuth();
  const [mio, setMio] = useState<any>(null);
  const [estado, setEstado] = useState<any>(null);
  const [lista, setLista] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [config, setConfig] = useState<any>(null);
  const [token, setToken] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const [m, e, l] = await Promise.all([
      api.get('/avisos/mi-telegram').then((r) => r.data).catch(() => null),
      can('notify.read') ? api.get('/avisos/estado').then((r) => r.data).catch(() => null) : null,
      can('notify.read')
        ? api.get('/avisos', { params: { estado: 'FALLIDA' } }).then((r) => r.data).catch(() => [])
        : [],
    ]);
    setMio(m); setEstado(e); setLista(l || []);
    if (can('notify.manage')) {
      setConfig(await api.get('/avisos/configuracion').then((r) => r.data).catch(() => null));
    }
  }, [can]);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  /**
   * Guardar el token. Se COMPRUEBA en el servidor contra Telegram antes de
   * guardarlo: si el token está mal, se dice ahora y no cuando alguien eche
   * en falta un aviso que nunca llegó.
   */
  async function guardarToken() {
    setGuardando(true);
    setMsg('');
    try {
      const { data } = await api.post('/avisos/configuracion/token', { token });
      setMsg(data.ok
        ? (data.apagado ? 'Avisos apagados.' : `Conectado como ${data.bot}. Ya puedes vincularte.`)
        : `Telegram rechazó ese token: ${data.motivo}`);
      if (data.ok) { setToken(''); await cargar(); }
    } finally {
      setGuardando(false);
    }
  }

  /* BLOQUE 40 — LOS BOTONES QUE FALLABAN EN SILENCIO.
     -------------------------------------------------------------------------
     Estas acciones no tenían `try/catch`. El `ErrorBoundary` NO atrapa errores
     asíncronos, así que un 403 o un corte de red dejaba la promesa rechazada y
     la pantalla exactamente igual: el usuario pulsa, no pasa nada, y vuelve a
     pulsar. Sin mensaje y sin pista.

     `ocupado` es lo otro que faltaba: mientras la petición viaja, el botón
     queda bloqueado. Sin eso, un doble clic manda dos peticiones. */
  const [ocupado, setOcupado] = useState('');

  async function conAviso(id: string, fn: () => Promise<void>) {
    setOcupado(id); setMsg('');
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'No se pudo completar. Vuelve a intentarlo.');
    } finally { setOcupado(''); }
  }

  async function probar() {
    await conAviso('probar', async () => {
      const { data } = await api.post('/avisos/probar', {});
      setMsg(data.ok ? 'Mensaje enviado. Míralo en tu Telegram.' : `No se pudo: ${data.motivo || 'sin detalle'}`);
    });
  }

  async function reintentar(id: string) {
    await conAviso(id, async () => {
      await api.post(`/avisos/${id}/reintentar`, {});
      await cargar();
    });
  }

  if (cargando) return <EsqueletoTablero kpis={4} paneles={1} />;

  const apagado = mio && mio.activo === false;

  return (
    <div>
      <h1 className="page-title">Avisos</h1>
      <p className="page-sub">
        Qué te llega al teléfono, y si algo no llegó.
      </p>

      {/* ----------------------------------------- CONFIGURAR EL BOT ----
          El token lo emite @BotFather y NO se puede generar por programa:
          Telegram no lo permite, y no hay forma de rodearlo. Lo que sí se
          quita de en medio es todo lo demás — ya no hace falta entrar al
          panel de despliegue, ni reiniciar el backend, ni adivinar si el
          token es el bueno. */}
      {can('notify.manage') && (apagado || config) && (
        <div className="card" style={{ padding: 18, marginBottom: 18 }}>
          <div className="section-title" style={{ margin: '0 0 10px' }}>
            Conexión con Telegram
          </div>

          {config?.token?.puesto ? (
            <div className="sign-note">
              <Icono n="ok" size={16} />
              <span>
                Token configurado ({config.token.pista})
                {config.token.desdeEntorno && ' · puesto como variable en Railway'}.
              </span>
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.6 }}>
              El token lo crea <b>@BotFather</b> en Telegram y no se puede
              generar desde aquí — es una regla de Telegram. Pero sólo hay que
              pegarlo una vez:
              <br /><br />
              1. En Telegram, busca <b>@BotFather</b> y escribe <code>/newbot</code>.
              <br />
              2. Te pide un nombre y un usuario terminado en <code>bot</code>.
              <br />
              3. Copia el token que te devuelve y pégalo aquí abajo.
            </p>
          )}

          <label>Token del bot
            <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={config?.token?.puesto ? 'Pega uno nuevo para reemplazarlo' : '1234567890:AAF...'}
            autoComplete="off"
          />
          </label>
          <span className="campo-msg">
            Se comprueba contra Telegram y queda cifrado en la base.
          </span>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={guardarToken}
                    disabled={guardando || !token.trim()}>
              {guardando ? 'Comprobando…' : 'Comprobar y guardar'}
            </button>
            {config?.token?.puesto && !config.token.desdeEntorno && (
              <button
                className="btn-mini btn-danger"
                disabled={ocupado === 'apagar'}
                onClick={async () => {
                  if (!(await confirmar('¿Apagar los avisos por Telegram?'))) return;
                  await conAviso('apagar', async () => {
                    await api.post('/avisos/configuracion/token', { token: '' });
                    await cargar();
                  });
                }}
              >
                Apagar avisos
              </button>
            )}
          </div>
        </div>
      )}

      {apagado && !can('notify.manage') && (
        <div className="card vacio">
          <Icono n="alerta" size={38} />
          <h3>El bot todavía no está configurado</h3>
          <p>
            Pídeselo a quien administra el sistema. Mientras tanto todo
            funciona igual y no se acumula nada.
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
              <button className="btn-mini" onClick={probar} disabled={ocupado === 'probar'}>
                {ocupado === 'probar' ? 'Enviando…' : 'Mandarme una prueba'}
              </button>
              <button
                className="btn-mini btn-danger"
                disabled={ocupado === 'desvincular'}
                onClick={async () => {
                  if (!(await confirmar('¿Dejar de recibir avisos en Telegram?'))) return;
                  await conAviso('desvincular', async () => {
                    await api.post('/avisos/mi-telegram/desvincular', {});
                    await cargar();
                  });
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
                        <td>{fechaHora(n.creadaEn)}</td>
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
