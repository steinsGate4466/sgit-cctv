import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { EsqueletoTabla } from '../components/Esqueleto';
import { Titular } from '../components/Patron';
import Icono from '../components/Iconos';
import { useDialogos } from '../components/Dialogos';
import { mensajeDeError } from '../avisos';
import { fechaTabla } from '../fechas';

/* =============================================================================
   QUIÉN ESTÁ DENTRO — bloque 82
   =============================================================================

   PETICIÓN DEL USUARIO, textual: «cómo quitar accesos de inmediato o
   identificar usuarios que están ahí».

   Son las dos mitades de lo mismo, y ninguna sirve sin la otra: cortar sin ver
   es disparar a ciegas, y ver sin poder cortar es mirar cómo pasa.

   -----------------------------------------------------------------------------
   LO QUE ESTABA ROTO Y ESTA PANTALLA CIERRA

   Los permisos viajan DENTRO del token de sesión, que dura 15 minutos, y la
   validación no consultaba la base. Desactivar a una persona NO le cortaba el
   acceso: seguía entrando. Quince minutos, en un incidente, es una eternidad.

   Ahora cada token lleva un contador. Cortar el acceso lo sube, y todos sus
   tokens dejan de valer en la siguiente petición.

   -----------------------------------------------------------------------------
   LAS DOS ACCIONES SON DISTINTAS, Y SE SEPARAN A PROPÓSITO

     CERRAR UNA SESIÓN   → esa sesión y sólo ésa. Para «me dejé el móvil».
     CORTAR EL ACCESO    → todas las suyas, de golpe. Para «me lo robaron».

   Juntarlas obligaría a elegir entre no cortar nada o cortarlo todo, y la
   diferencia entre las dos es exactamente lo que se decide mirando esta lista.
============================================================================= */

export default function Sesiones() {
  const { confirmar, pedirTexto, avisar } = useDialogos();
  const [filas, setFilas] = useState<any[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/users/sesiones');
      setFilas(data || []);
      setError('');
    } catch (e: any) {
      /* El motivo real, no «no hay datos». En una pantalla de seguridad, un
         listado vacío y un fallo de permiso son indistinguibles — y confundir
         «nadie está dentro» con «no pude preguntarlo» es lo peor que puede
         pasar aquí. */
      setError(mensajeDeError(e, 'leer las sesiones abiertas'));
      setFilas([]);
    }
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  /* Se refresca sola cada 30 segundos. Es la única pantalla del sistema que lo
     hace, y con motivo: se abre justo cuando algo está pasando, y una lista de
     quién está dentro que se queda congelada no vale para nada. */
  useEffect(() => {
    const t = setInterval(() => { cargar(); }, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  async function cerrarUna(f: any) {
    if (!(await confirmar(
      `¿Cerrar esta sesión de ${f.persona}?\n\n`
      + 'Sólo se cierra ÉSTA. Sus otras sesiones siguen abiertas.',
    ))) return;
    try {
      await api.delete(`/users/sesiones/${f.id}`);
      await cargar();
    } catch (e: any) {
      await avisar(mensajeDeError(e, 'cerrar la sesión'));
    }
  }

  async function cortarTodo(f: any) {
    /* Se pide el MOTIVO por escrito, y no es burocracia: queda en la auditoría
       y es lo que se mira al reconstruir un incidente tres semanas después.
       «Se le cortó el acceso» sin motivo no explica nada. */
    const motivo = await pedirTexto(
      `Cortar TODOS los accesos de ${f.persona}.\n\n`
      + 'Sus sesiones se cierran y sus permisos dejan de valer al instante.\n'
      + '¿Por qué? (queda registrado)',
    );
    if (motivo === null) return;
    try {
      const { data } = await api.post(`/users/${f.userId}/cortar-acceso`, { motivo });
      await avisar(`Acceso cortado. ${data.sesionesCerradas} sesión(es) cerradas.`);
      await cargar();
    } catch (e: any) {
      await avisar(mensajeDeError(e, 'cortar el acceso'));
    }
  }

  const texto = q.trim().toLowerCase();
  const visibles = texto
    ? filas.filter((f) => `${f.persona} ${f.email} ${f.rol} ${f.ip} ${f.equipo}`
      .toLowerCase().includes(texto))
    : filas;

  const dentroAhora = filas.filter((f) => f.activaAhora).length;
  const zombis = filas.filter((f) => !f.usuarioActivo).length;

  if (cargando) return <EsqueletoTabla filas={6} />;

  return (
    <div>
      <h2><Icono n="candado" size={20} /> Quién está dentro</h2>

      {/* UNA SESIÓN VIVA DE UN USUARIO DESACTIVADO ES LA ALARMA.
          Significa que se dio de baja a alguien y su sesión sigue en pie — que
          es exactamente el agujero que este bloque vino a cerrar. Va arriba del
          todo porque si hay una, es lo único que importa de esta pantalla. */}
      {zombis > 0 ? (
        <Titular
          tono="grave"
          texto={`${zombis} sesión(es) de usuarios desactivados`}
          apoyo="Alguien dado de baja sigue con la sesión abierta. Córtale el acceso."
        />
      ) : (
        <Titular
          tono="bien"
          texto={`${dentroAhora} persona(s) trabajando ahora`}
          apoyo={`${filas.length} sesión(es) abiertas en total. La lista se actualiza sola.`}
        />
      )}

      {error && <div className="crit-error">{error}</div>}

      <div className="ses-barra">
        <input
          type="search"
          aria-label="Buscar por persona, correo, rol, IP o equipo"
          placeholder="Buscar por persona, IP o equipo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-mini" onClick={() => cargar()}>
          <Icono n="refrescar" size={14} /> Actualizar
        </button>
      </div>

      {!visibles.length ? (
        <p className="nada-que-hacer">
          {texto ? 'Nadie cuadra con lo que buscas.' : 'No hay ninguna sesión abierta.'}
        </p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>Persona</th><th>Rol</th><th>Desde dónde</th>
              <th>Entró</th><th>Última actividad</th><th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id} className={!f.usuarioActivo ? 'ses-zombi' : undefined}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.persona}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{f.email}</div>
                  {!f.usuarioActivo && (
                    <div className="ses-alerta">Usuario desactivado, sesión viva</div>
                  )}
                </td>
                <td className="muted">{f.rol || '—'}</td>
                <td>
                  <div className="dato-fijo" style={{ fontSize: 12 }}>{f.ip || '—'}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {f.equipo || f.dispositivo || 'aparato sin identificar'}
                  </div>
                </td>
                <td className="muted dato-fijo" style={{ fontSize: 12 }}>
                  {fechaTabla(f.desde)}
                </td>
                <td className="dato-fijo" style={{ fontSize: 12 }}>
                  {/* El punto verde separa «está trabajando» de «se dejó la
                      pestaña abierta», que es lo que decide a quién cortar. */}
                  {f.activaAhora && <span className="ses-punto" title="Activa ahora" />}
                  {f.ultimoUso ? fechaTabla(f.ultimoUso) : <span className="muted">sin usar</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => cerrarUna(f)}>
                    Cerrar ésta
                  </button>
                  <button
                    className="btn-mini btn-danger"
                    style={{ marginLeft: 4 }}
                    title="Cierra TODAS sus sesiones y anula sus permisos al instante"
                    onClick={() => cortarTodo(f)}
                  >
                    Cortar acceso
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ fontSize: 12 }}>
        <b>Cerrar ésta</b>: sólo esa sesión. <b>Cortar acceso</b>: todas las
        suyas, al instante.
      </p>
    </div>
  );
}
