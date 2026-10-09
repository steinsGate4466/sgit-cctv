import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Icono from './Iconos';

/**
 * DE DÓNDE COME ESTE EQUIPO — bloque 171 (ficha única, plan 150).
 *
 * El endpoint `/electricidad/activo/:id` existía desde el bloque de
 * electricidad y NINGUNA pantalla lo usaba: para saber qué llave baja una
 * cámara había que ir a Electricidad y buscar tablero por tablero. Es la
 * pregunta que se hace delante del equipo antes de tocarlo: «¿qué tengo que
 * bajar y qué más se apaga?».
 */
export default function EnergiaDelActivo({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const [filas, setFilas] = useState<any[] | null>(null);
  const puede = can('infra.read');

  useEffect(() => {
    if (!puede) return;
    let vivo = true;
    api.get(`/electricidad/activo/${assetId}`)
      .then((r) => { if (vivo) setFilas(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setFilas([]); });
    return () => { vivo = false; };
  }, [assetId, puede]);

  if (!puede) {
    return <p className="muted">{'La alimentación eléctrica la ve quien tiene permiso de infraestructura.'}</p>;
  }
  if (filas === null) return <p className="muted">{'Buscando de dónde se alimenta…'}</p>;
  if (!filas.length) {
    return (
      <div className="ficha-vacia">
        <Icono n="electricidad" size={22} />
        <div>
          <b>{'No está declarado de dónde se alimenta.'}</b>
          <p className="muted">{'Sin esto no se sabe qué llave bajar ni qué más se apaga. Se declara en Electricidad, en el circuito que lo alimenta.'}</p>
          {can('asset.update') && <Link className="btn-mini" to="/electricidad">{'Ir a Electricidad'}</Link>}
        </div>
      </div>
    );
  }
  return (
    <div className="energia-lista">
      {filas.map((f) => (
        <div key={f.enlaceId} className="energia-fila">
          <div className="energia-cadena">
            <span className="energia-paso"><small>{'Tablero'}</small><b>{f.tablero?.codigo}</b>{f.tablero?.nombre && <em>{f.tablero.nombre}</em>}</span>
            <span className="energia-flecha" aria-hidden>→</span>
            <span className="energia-paso"><small>{'Circuito'}</small><b>{`N.º ${f.circuito?.numero ?? '—'}`}</b>{f.circuito?.designacion && <em>{f.circuito.designacion}</em>}</span>
            {f.viaPoe && <><span className="energia-flecha" aria-hidden>→</span><span className="energia-paso"><small>{'Por'}</small><b>{'PoE'}</b><em>{'desde el switch'}</em></span></>}
          </div>
          <div className="energia-datos">
            {f.circuito?.amperajeA != null && <span>{`${f.circuito.amperajeA} A`}</span>}
            {f.circuito?.proteccion && <span>{f.circuito.proteccion}</span>}
            {f.tablero?.requierePermiso && <span className="energia-permiso">{'Pide permiso para bajarlo'}</span>}
          </div>
          {f.tablero?.comoLlegar && <p className="muted energia-llegar"><b>{'Cómo llegar: '}</b>{f.tablero.comoLlegar}</p>}
          {f.tablero?.id && <Link className="btn-mini" to={`/t/${f.tablero.id}`}>{'Qué más se apaga con este tablero'}</Link>}
        </div>
      ))}
    </div>
  );
}
