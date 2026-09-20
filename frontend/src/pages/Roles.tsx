import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Modal from '../components/Modal';
import Icono from '../components/Iconos';
import { EsqueletoTabla } from '../components/Esqueleto';
import { useDialogos } from '../components/Dialogos';
import BotonConMotivo from '../components/BotonConMotivo';
import { queFalta, mensajeDeError } from '../avisos';

/**
 * ROLES QUE CREA EL INGENIERO.
 *
 * Hasta ahora los roles venían fijos y cada rol nuevo era código y despliegue.
 *
 * LO DIFÍCIL DE ESTA PANTALLA NO ES GUARDAR: ES QUE ELIJA BIEN.
 * Una lista de 31 códigos sueltos (`wo.approve`, `credential.read`) termina
 * siempre igual: se marca todo por si acaso, que es justo el agujero que
 * esto venía a cerrar. Por eso cada permiso lleva nombre en castellano, una
 * frase de qué deja hacer, y un aviso cuando es delicado.
 *
 * Y por eso lo primero que se ofrece no es una lista vacía, sino PLANTILLAS:
 * "Jefe de línea", "Técnico de red", "Contratista". Se parte de algo que ya
 * tiene sentido y se ajusta.
 */
export default function Roles() {
  const { confirmar, avisar } = useDialogos();
  const [roles, setRoles] = useState<any[]>([]);
  const [catalogo, setCatalogo] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [edita, setEdita] = useState<any>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  /* BLOQUE 96 · el informe de roles desviados de su plantilla. */
  const [desfase, setDesfase] = useState<any>(null);
  const [poniendo, setPoniendo] = useState('');

  const cargar = useCallback(async () => {
    const [rs, cat, des] = await Promise.all([
      api.get('/roles-admin').then((r) => r.data).catch(() => []),
      api.get('/roles-admin/catalogo').then((r) => r.data).catch(() => null),
      api.get('/roles-admin/desfase').then((r) => r.data).catch(() => null),
    ]);
    setRoles(rs || []);
    setCatalogo(cat);
    setDesfase(des);
  }, []);

  useEffect(() => { cargar().finally(() => setCargando(false)); }, [cargar]);

  function abrir(rol: any | null) {
    setError('');
    setEdita(rol || { nuevo: true });
    setNombre(rol?.nombre || '');
    setDescripcion(rol?.descripcion || '');
    setMarcados(new Set(rol?.permisos || []));
  }

  function alternar(code: string) {
    setMarcados((prev) => {
      const s = new Set(prev);
      if (s.has(code)) s.delete(code); else s.add(code);
      return s;
    });
  }

  function usarPlantilla(p: any) {
    setMarcados(new Set(p.permisos));
    if (!nombre) setNombre(p.nombre);
    if (!descripcion) setDescripcion(p.descripcion);
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    try {
      /* CADA ENDPOINT RECIBE LO SUYO — bloque 90.
         ---------------------------------------------------------------------
         AQUÍ HABÍA UN CUERPO COMPARTIDO para el alta y la edición, y eso
         rompió la pantalla entera con un mensaje que no lo explicaba:

             property nombre should not exist

         El alta SÍ lleva nombre; la edición NO. Y el formulario ya lo sabía
         —el campo del nombre sólo se pinta con `edita.nuevo`—: quien edita no
         puede renombrar nada. Lo que se enviaba era el nombre que ya tenía.

         Antes del bloque 85 ese campo de más se ignoraba en silencio: el
         servicio sólo lee `descripcion` y `permisos`. Al escribir el DTO, el
         `ValidationPipe` corre con `forbidNonWhitelisted` —que es lo
         correcto— y ese campo pasó de sobrar a **rechazar la petición
         entera**. El DTO no creó el desajuste: lo destapó. Pero dejó sin
         guardar la pantalla que reparte el poder de la planta.

         ES EL RIESGO QUE YO MISMO ESCRIBÍ en el bloque 85 —«un DTO al que se
         le olvide un campo rechaza peticiones válidas con un 400 y el
         formulario deja de guardar sin decir por qué»— y me pasó igual. */
      const permisos = [...marcados];
      if (edita?.nuevo) await api.post('/roles-admin', { nombre, descripcion, permisos });
      else await api.patch('/roles-admin/' + edita.id, { descripcion, permisos });
      setEdita(null);
      await cargar();
    } catch (e: any) {
      // El servidor manda el motivo en castellano a propósito: aquí se
      // muestra tal cual. Un "400 Bad Request" no le dice nada a nadie.
      const m = e?.response?.data?.message;
      setError(Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(rol: any) {
    if (!(await confirmar(`¿Borrar el rol "${rol.nombre}"?`))) return;
    try {
      await api.delete('/roles-admin/' + rol.id);
      await cargar();
    } catch (e: any) {
      const m = e?.response?.data?.message;
      await avisar(Array.isArray(m) ? m.join(', ') : m || 'No se pudo borrar.');
    }
  }

  if (cargando) return <EsqueletoTabla filas={5} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Roles y permisos</h1>
          <p className="page-sub">
            Qué puede hacer cada tipo de usuario. Los roles del sistema no se borran.
          </p>
        </div>
        <button className="btn-primary" onClick={() => abrir(null)}>+ Nuevo rol</button>
      </div>


      {desfase && desfase.desviados?.length > 0 && (
        <PanelDesfase
          info={desfase}
          poniendo={poniendo}
          onPonerAlDia={async (rol: any) => {
            /* SE ENSEÑA EL CAMBIO ANTES DE HACERLO. Aquí se reparte el poder
               de la planta: un botón que reescribe permisos sin decir cuáles
               es un cambio que nadie decidió. */
            const ok = await confirmar({
              titulo: `Poner al día «${rol.nombre}»`,
              mensaje:
                (rol.faltan.length ? `SE AÑADEN ${rol.faltan.length}: ${rol.faltan.map((c: string) => desfase.nombres[c] || c).join(', ')}. ` : '')
                + (rol.sobran.length ? `SE QUITAN ${rol.sobran.length}: ${rol.sobran.map((c: string) => desfase.nombres[c] || c).join(', ')}. ` : '')
                + `Afecta a ${rol.usuarios} persona(s) y se aplica en el acto.`,
              aceptar: 'Poner al día',
            });
            if (!ok) return;
            if (poniendo) return;                       // dos pulsaciones = dos peticiones
            setPoniendo(rol.rolId);
            try {
              await api.post(`/roles-admin/${rol.rolId}/poner-al-dia`);
              await cargar();
              await avisar({ titulo: 'Rol al día', mensaje: `«${rol.nombre}» ya coincide con su plantilla.` });
            } catch (e: any) {
              await avisar({ titulo: 'No se pudo', mensaje: mensajeDeError(e, 'poner el rol al día') });
            } finally { setPoniendo(''); }
          }}
        />
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Rol</th><th>Para qué es</th><th>Permisos</th><th>Usuarios</th><th></th>
            </tr>
          </thead>
          <tbody>
            {/* Bloque 115: una tabla con cabecera y cero filas no dice «no hay
                nada» — parece que la pantalla se rompió al cargar. */}
            {!roles.length && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: 22 }}>
                Todavía no hay roles creados.
              </td></tr>
            )}
            {roles.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.nombre}
                  {r.sistema && <span className="badge MEDIA" style={{ marginLeft: 8 }}>del sistema</span>}
                  {r.soloConsulta && <span className="badge STOCK" style={{ marginLeft: 8 }}>sólo mira</span>}
                </td>
                <td className="muted">{r.descripcion || '—'}</td>
                <td>{r.permisos.length}</td>
                <td>{r.usuarios}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn-mini" onClick={() => abrir(r)}>
                    <Icono n="orden" size={14} /> Editar
                  </button>{' '}
                  {!r.sistema && r.usuarios === 0 && (
                    <button className="btn-mini btn-danger" onClick={() => borrar(r)}>Borrar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edita && (
        <Modal title={edita.nuevo ? 'Nuevo rol' : `Editar: ${edita.nombre}`} onClose={() => setEdita(null)}>
          {edita.nuevo && (
            <>
              <label>Nombre del rol
                <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Jefe de línea Tren 2" />
              </label>
            </>
          )}
          <label>Para qué es
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Una frase: quién lo usa y para qué" />
          </label>

          {/* PLANTILLAS. Antes eran diez botones con sólo el nombre, y elegir
              entre «Técnico de red» y «Técnico de campo (CCTV)» a ciegas es
              exactamente la duda que hace que alguien marque el más amplio
              «por si acaso». Ahora cada una dice a QUÉ PUESTO corresponde y
              cuántos permisos trae, y las delicadas llevan su aviso. */}
          {edita.nuevo && catalogo?.plantillas?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <b style={{ fontSize: 13 }}>Empieza por una plantilla</b>
              <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>
                Son un punto de partida, no una jaula: después se ajusta casilla
                por casilla. El tren que ve cada persona se configura aparte, en
                su ficha de usuario.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
                {catalogo.plantillas.map((p: any) => (
                  <button key={p.nombre} type="button"
                    className="card"
                    onClick={() => usarPlantilla(p)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                      display: 'block', font: 'inherit',
                      borderLeft: p.advertencia ? '3px solid var(--warn,#d97706)' : undefined,
                    }}>
                    <b style={{ fontSize: 13 }}>{p.nombre}</b>
                    {p.paraQuien && (
                      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{p.paraQuien}</div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>{p.descripcion}</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                      {p.permisos.length} permisos
                      {p.necesitaAmbito && ' · exige ámbito de tren'}
                    </div>
                    {p.advertencia && (
                      <div style={{ fontSize: 11.5, marginTop: 6, color: 'var(--crit-texto)', lineHeight: 1.4 }}>
                        <Icono n="alerta" size={12} /> {p.advertencia}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            {(catalogo?.grupos || []).map((g: any) => (
              <div key={g.grupo} className="detail-sec">
                <h4>{g.grupo}</h4>
                {g.nota && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{g.nota}</div>}
                {g.permisos.map((p: any) => (
                  <label key={p.code} className="permiso">
                    <input type="checkbox" checked={marcados.has(p.code)}
                      onChange={() => alternar(p.code)} />
                    <span>
                      <b>{p.nombre}</b>
                      <span className="permiso-explica">{p.explica}</span>
                      {p.cuidado && (
                        <span className="permiso-cuidado">
                          <Icono n="alerta" size={13} /> {p.cuidado}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            {marcados.size} permiso(s) marcado(s).
          </div>
          {error && <div className="error">{error}</div>}
          <BotonConMotivo className="btn" onClick={guardar} ocupado={guardando}
            falta={queFalta([!nombre.trim(), 'Ponle nombre al rol. Es lo que verá quien asigne usuarios.'])}>
            {guardando ? 'Guardando…' : edita.nuevo ? 'Crear rol' : 'Guardar cambios'}
          </BotonConMotivo>
        </Modal>
      )}
    </div>
  );
}

/* =============================================================================
   BLOQUE 96 · «ESTOS ROLES NO COINCIDEN CON SU PLANTILLA»
   -----------------------------------------------------------------------------
   POR QUÉ EXISTE. El usuario entró con «Jefe de línea (Producción)» y le salía
   media gestión del mantenimiento — y a la vez NO podía abrir una orden. Su rol
   llevaba bloques desviado de la plantilla y nadie se enteró, porque **las
   plantillas sólo se aplican AL CREAR un rol** (bloque 90).

   Nada se rompe, nada sale en rojo. Es la misma familia que el selector de CSS
   muerto del bloque 89, sólo que aquí falla ABRIENDO: el rol se queda con
   permisos de más.

   -----------------------------------------------------------------------------
   TRES DECISIONES, Y NINGUNA ES DE ADORNO

   1. **SE ENSEÑA LO QUE VA A CAMBIAR, permiso por permiso, ANTES de tocar
      nada.** Un botón «sincronizar» que reescribe en silencio es un cambio que
      nadie decidió, y lo que se reparte aquí es el poder de la planta.

   2. **NO HAY BOTÓN DE «PONER AL DÍA TODOS».** Cada rol se mira y se decide.
      Un botón que reescribe once roles de golpe se pulsa sin leer, y el día
      que una plantilla esté mal se lleva la planta entera por delante.

   3. **Sólo aparece cuando hay desviados.** Un panel que dice «0 problemas»
      todos los días se deja de leer, y entonces no sirve el día que hay uno.
      Es la regla de los verificadores desde el bloque 9.
============================================================================= */
function PanelDesfase({ info, poniendo, onPonerAlDia }: any) {
  const nombre = (c: string) => info.nombres[c] || c;
  return (
    <div className="card" style={{ borderLeft: '4px solid var(--warn)', marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, margin: '0 0 4px', color: 'var(--warn)' }}>
        {info.desviados.length} rol(es) no coinciden con su plantilla
      </h2>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        Las plantillas sólo se aplican al crear un rol. Un rol viejo se desvía sin avisar.
      </p>

      {info.desviados.map((d: any) => (
        <div key={d.rolId} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <b>{d.nombre}</b>
              <span className="muted" style={{ fontSize: 11.5 }}> · {d.usuarios} persona(s)</span>
            </div>
            <button className="btn-mini" disabled={!!poniendo}
              onClick={() => onPonerAlDia(d)}
              title="Deja este rol exactamente como dice su plantilla">
              {poniendo === d.rolId ? 'Aplicando…' : 'Poner al día'}
            </button>
          </div>
          {d.faltan.length > 0 && (
            <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--ok)' }}>
              <b>Le faltan:</b> {d.faltan.map(nombre).join(' · ')}
            </div>
          )}
          {d.sobran.length > 0 && (
            <div style={{ fontSize: 11.5, marginTop: 2, color: 'var(--warn)' }}>
              <b>Le sobran:</b> {d.sobran.map(nombre).join(' · ')}
            </div>
          )}
        </div>
      ))}

      {info.sinPlantilla?.length > 0 && (
        /* SE DICEN, no se esconden. Puede ser un rol hecho a medida —y entonces
           está bien— o uno renombrado que se quedó huérfano. Callarlos haría
           que el panel dijera «todo en orden» sobre roles que nadie ha mirado. */
        <p className="muted" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
          Sin plantilla con la que comparar, se revisan a mano:{' '}
          {info.sinPlantilla.map((d: any) => d.nombre).join(' · ')}
        </p>
      )}
    </div>
  );
}
