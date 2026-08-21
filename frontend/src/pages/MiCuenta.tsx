import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';

/**
 * MI CUENTA — sesiones abiertas y el botón de «me robaron el teléfono».
 *
 * ESTO YA EXISTÍA POR DETRÁS Y NO TENÍA PANTALLA.
 * El backend sabía listar las sesiones activas y revocarlas todas desde el
 * bloque de sesiones. Nunca se enchufó a ninguna vista, así que el usuario no
 * podía usarlo — que es la definición de una función que no existe.
 *
 * POR QUÉ IMPORTA, Y NO ES UN DETALLE
 * Cerrar sesión en este sistema **revoca de verdad**: invalida el token en la
 * base, no sólo lo borra del navegador. Eso significa que si alguien pierde
 * el celular en planta, puede cortar el acceso desde otro equipo en diez
 * segundos, sin llamar a nadie y sin esperar a que caduque el token.
 *
 * Sin esta pantalla, esa capacidad estaba construida y apagada.
 */
export default function MiCuenta() {
  const { confirmar } = useDialogos();
  const { user, logout } = useAuth();
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setSesiones(await api.get('/auth/sesiones').then((r) => r.data) || []);
      setError('');
    } catch {
      setError('No se pudieron cargar las sesiones.');
    }
  }, []);

  useEffect(() => { setCargando(true); cargar().finally(() => setCargando(false)); }, [cargar]);

  async function cerrarTodas() {
    if (!(await confirmar(
      'Se cerrarán TODAS tus sesiones, incluida ésta.\n\n' +
      'Tendrás que volver a iniciar sesión en todos tus equipos.',
    ))) return;
    setOcupado(true);
    try {
      const r = await api.post('/auth/sesiones/cerrar-todas', {});
      setMsg(`Cerradas ${r.data.cerradas} sesión(es). Vas a tener que entrar de nuevo.`);
      // Se espera un momento para que se lea el mensaje antes de salir.
      setTimeout(() => logout(), 1800);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'No se pudo cerrar.');
      setOcupado(false);
    }
  }

  const fecha = (v: any) => v
    ? new Date(v).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="page">
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Mi cuenta</div>
        <div className="form-grid">
          <div><b style={{ fontSize: 12 }}>Nombre</b><div>{user?.fullName}</div></div>
          <div><b style={{ fontSize: 12 }}>Correo</b><div>{user?.email}</div></div>
          <div><b style={{ fontSize: 12 }}>Rol</b><div>{user?.role}</div></div>
        </div>
      </div>

      {msg && <div role="status" className="aviso-ok">{msg}</div>}
      {error && <div role="alert" className="aviso-error aviso-cerrable" onClick={() => setError('')} title="Toca para cerrar este aviso">{error}</div>}

      <div className="card explica">
        <b>Aquí ves desde dónde está abierta tu cuenta.</b> Cada vez que entras
        desde un equipo se abre una sesión, y se queda abierta aunque cierres el
        navegador.
        <div style={{ marginTop: 8 }}>
          <b>Si pierdes el celular en planta</b>, entra desde cualquier otro equipo y
          pulsa «Cerrar todas». En este sistema eso <b>revoca de verdad</b>: invalida
          el acceso en el servidor, no sólo borra el token del teléfono. El que lo
          tenga en la mano se queda fuera al instante, sin esperar a que caduque nada.
        </div>
      </div>

      {cargando ? <EsqueletoTabla filas={3} /> : sesiones.length === 0 ? (
        <div className="card vacio">
          <h3>No hay otras sesiones abiertas</h3>
          <p>Sólo estás dentro desde aquí.</p>
        </div>
      ) : (
        <>
          <table className="tabla">
            <thead><tr><th>Equipo</th><th>Desde dónde</th><th>Abierta</th><th>Último uso</th></tr></thead>
            <tbody>
              {sesiones.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.dispositivo || 'Navegador desconocido'}</strong>
                    {s.equipo && <div className="muted" style={{ fontSize: 11.5 }}>{s.equipo}</div>}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.ip || '—'}</td>
                  <td className="muted">{fecha(s.creadaEn)}</td>
                  <td className="muted">{fecha(s.ultimoUsoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="card peligro">
            <b>¿Ves una sesión que no reconoces?</b>
            <div style={{ margin: '6px 0 10px', fontSize: 13.5 }}>
              Ciérralas todas y cambia tu contraseña. Es mejor volver a entrar en tus
              equipos que dejar una abierta que no es tuya.
            </div>
            <button className="btn-peligro" onClick={cerrarTodas} disabled={ocupado}>
              {ocupado ? 'Cerrando…' : 'Cerrar todas mis sesiones'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
