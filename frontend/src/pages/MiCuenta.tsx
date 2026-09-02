import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useAuth } from '../auth/AuthContext';
import { useDialogos } from '../components/Dialogos';
import { fechaCorta } from '../fechas';
import { mensajeDeError } from '../avisos';

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
  const { user, logout, refrescarPerfil } = useAuth();
  const [sesiones, setSesiones] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

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
      setError(mensajeDeError(e, 'cerrar'));
      setOcupado(false);
    }
  }

  const fmt = (v: any) => fechaCorta(v, '—');

  return (
    <div className="page">
      <div className="card">
        <div className="section-title" style={{ marginTop: 0 }}>Mi cuenta</div>
        <div className="form-grid">
          <div><b style={{ fontSize: 12 }}>Nombre</b><div>{user?.fullName}</div></div>
          <div><b style={{ fontSize: 12 }}>Correo</b><div>{user?.email}</div></div>
          <div><b style={{ fontSize: 12 }}>Rol</b><div>{user?.role}</div></div>
        </div>

        {/* ACTUALIZAR MIS PERMISOS — bloque 86.
            ---------------------------------------------------------------
            Petición del usuario, textual: «en caso de que se deban actualizar
            ciertos permisos que exista un botón actualizar».

            El cambio de rol YA se aplica solo desde este bloque. El botón
            sigue haciendo falta por dos motivos que no son teóricos:

              · si hay un corte de red justo cuando el ingeniero guarda el
                rol, la recarga automática falla EN SILENCIO —y así está
                escrito a propósito: dejar tirado a alguien en planta por un
                corte sería peor que el desfase—;

              · y porque cuando algo no se ve, **poder pulsar algo es la
                diferencia entre esperar y resolver**. Sin el botón, la única
                salida era cerrar sesión y volver a entrar.

            DICE SIEMPRE QUÉ PASÓ, y ésa es la mitad que importa: un botón que
            refresca sin confirmar nada es indistinguible de uno roto (es el
            bug 3 del bloque 64, y las 13 escrituras mudas de la auditoría). */}
        <div className="mc-refrescar">
          <button
            className="btn-mini"
            disabled={refrescando}
            onClick={async () => {
              setRefrescando(true);
              setMsg(''); setError('');
              const ok = await refrescarPerfil();
              setRefrescando(false);
              if (ok) setMsg('Permisos actualizados. Si algo cambió, ya está en tu menú.');
              else setError('No se pudo contactar con el servidor. Vuelve a intentarlo.');
            }}
          >
            {refrescando ? 'Actualizando…' : 'Actualizar mis permisos'}
          </button>
          <span className="mc-nota">
            Si el ingeniero acaba de cambiar tu rol y no lo ves reflejado, pulsa aquí.
          </span>
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
          el acceso en el servidor, no sólo en el dispositivo. El cierre es inmediato.
        </div>
      </div>

      {cargando && !sesiones.length ? <EsqueletoTabla filas={3} /> : sesiones.length === 0 ? (
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
                  <td className="muted">{fmt(s.creadaEn)}</td>
                  <td className="muted">{fmt(s.ultimoUsoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="card peligro">
            <b>¿Ves una sesión que no reconoces?</b>
            <div style={{ margin: '6px 0 10px', fontSize: 13.5 }}>
              Ciérralas todas y cambia la contraseña.
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
