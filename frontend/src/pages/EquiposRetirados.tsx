import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { EsqueletoTabla } from '../components/Esqueleto';
import { Cifras, ComoSeCalcula } from '../components/Patron';
import { useVolverALaPantalla } from '../useVolverALaPantalla';
import { fecha } from '../fechas';
import { plural } from '../formato';

/**
 * EQUIPOS RETIRADOS — bloque 107.
 *
 * =============================================================================
 *  POR QUÉ ESTA PANTALLA EXISTE EN LUGAR DE UN BOTÓN DE BORRADO
 * =============================================================================
 *  Palabras del usuario, descartando el borrado masivo: «nos puede eliminar
 *  toda la data... mejor hagamos un módulo de historial de equipos
 *  desfasados/retirados».
 *
 *  Un equipo dado de baja no estorba: es la mitad de dos informes que hacen
 *  falta —el de REEMPLAZO y el de MIGRACIÓN—. Borrarlo para «limpiar» tira
 *  meses de historial que costaron campo.
 *
 * =============================================================================
 *  AQUÍ NO SE BORRA NADA
 * =============================================================================
 *  Ni un botón que cambie estado. La purga definitiva sigue viviendo en
 *  Limpieza, con su permiso propio y escribiendo el código a mano. Esta
 *  pantalla sólo lee.
 */
export default function EquiposRetirados() {
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busca, setBusca] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const r = await api.get('/assets/retirados');
      setD(r.data);
    } catch (e: any) {
      if (!e?.response) setError('Sin conexión con el servidor. Vuelve a intentarlo.');
      else if (e.response.status === 403) setError('Tu usuario no tiene permiso para ver los equipos retirados.');
      else setError('No se pudo consultar. Vuelve a intentarlo.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  useVolverALaPantalla(cargar);

  const todos: any[] = d?.data ?? [];
  const t = busca.trim().toLowerCase();
  const filas = !t ? todos : todos.filter((a: any) => (
    (a.assetCode || '').toLowerCase().includes(t)
    || (a.model || '').toLowerCase().includes(t)
    || (a.serialNumber || '').toLowerCase().includes(t)
    || (a.location?.name || '').toLowerCase().includes(t)
  ));

  return (
    <div className="page">
      <h1 className="page-title">Equipos retirados</h1>

      {error && <div className="card peligro">{error}</div>}

      {cargando && !d ? <EsqueletoTabla /> : d && (
        <>
          <Cifras
            datos={[
              { n: d.total ?? 0, et: 'equipos fuera de planta' },
              { n: d.sinFirma ?? 0, et: 'sin firma de baja' },
            ]}
          />

          {(d.recortados ?? 0) > 0 && (
            <p className="nada-que-hacer">
              <b>Se enseñan {d.tope} de {d.total}.</b> Usa el buscador para encontrar uno concreto.
            </p>
          )}

          <div className="filters">
            <input
              aria-label="Buscar equipo retirado"
              placeholder="Buscar por código, modelo, serie o ubicación"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ minWidth: 280 }}
            />
          </div>

          {!todos.length ? (
            <div className="card vacio">
              <h3>No hay equipos retirados</h3>
              <p>Cuando se dé de baja un equipo, aparece aquí con su historial.</p>
            </div>
          ) : !filas.length ? (
            <div className="card vacio">
              <h3>Ningún equipo retirado coincide con «{busca}»</h3>
              <p>Prueba con el código del equipo o con parte del modelo.</p>
            </div>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Dónde estaba</th>
                  <th>Salió</th>
                  <th>Firmó la baja</th>
                  <th>Última orden</th>
                  <th>Historial</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.assetCode}</b>
                      <div className="muted">
                        {[a.brand, a.model].filter(Boolean).join(' ') || a.type}
                      </div>
                    </td>
                    <td>
                      {a.location?.name || '—'}
                      <div className="muted">{a.location?.code || ''}</div>
                    </td>
                    <td>
                      {fecha(a.salida)}
                      {/* UNA FECHA APROXIMADA SE DICE. Las bajas antiguas se
                          hicieron a mano y no dejaron marca: enseñar su
                          `updatedAt` como fecha de salida sería inventarla. */}
                      {a.salidaEsAproximada && <div className="muted">aproximada</div>}
                    </td>
                    <td>
                      {a.firmadaPor || <span className="muted">sin registro de firma</span>}
                    </td>
                    <td>
                      {a.ultimaOm ? (
                        <>
                          {a.ultimaOm.code}
                          <div className="muted">{a.ultimaOm.causa || 'sin causa registrada'}</div>
                        </>
                      ) : <span className="muted">ninguna</span>}
                    </td>
                    <td>
                      <Link className="btn-mini" to={`/assets?buscar=${encodeURIComponent(a.assetCode)}`}>
                        Ver ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {filas.length > 0 && (
            <p className="muted">{plural(filas.length, 'equipo')} en la lista.</p>
          )}
        </>
      )}

      <ComoSeCalcula>
        <p>
          Salen los equipos dados de baja: siguen en la base con todo su
          historial, pero ya no están en planta.
        </p>
        <p>
          <b>«Sin firma de baja»</b> son bajas antiguas hechas antes de que se
          registrara quién las hacía.
        </p>
        <p>
          <b>Aquí no se borra nada.</b> El borrado definitivo vive en Limpieza,
          con su permiso propio.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
