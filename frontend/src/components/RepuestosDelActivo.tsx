import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * QUÉ REPUESTOS SIRVEN PARA ESTE EQUIPO — y si hay en almacén.
 *
 * ESTO YA EXISTÍA POR DETRÁS Y NO TENÍA PANTALLA.
 * El endpoint `GET /inventory/for-asset/:id` estaba escrito y probado, y
 * ninguna vista lo llamaba. Cruza los repuestos asociados al activo con los
 * que coinciden por modelo.
 *
 * POR QUÉ VA EN LA FICHA DEL ACTIVO Y NO EN ALMACÉN
 * Porque la pregunta se hace **con el equipo delante**: el técnico está en el
 * manlift mirando una cámara que no enciende y necesita saber si hay fuente
 * PoE en almacén antes de bajar. Buscarlo en el inventario obliga a saber
 * cómo se llama el repuesto, que es justo lo que no sabe.
 */
export default function RepuestosDelActivo({ assetId }: { assetId: string }) {
  const { can } = useAuth();
  const [lista, setLista] = useState<any[] | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!can('inventory.read')) { setLista([]); return; }
    api.get(`/inventory/for-asset/${assetId}`)
      .then((r) => { if (vivo) setLista(r.data || []); })
      // Si falla, se enseña vacío y ya: es información de apoyo, no puede
      // tumbar la ficha del activo.
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  if (!can('inventory.read')) return null;
  if (lista === null) return <p className="muted" style={{ fontSize: 13 }}>Buscando repuestos…</p>;

  if (lista.length === 0) {
    return (
      <>
        <div className="section-title">Repuestos para este equipo</div>
        <p className="muted" style={{ fontSize: 13 }}>
          Sin repuestos asociados. Se vinculan desde Inventario o por coincidencia de modelo.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="section-title">Repuestos para este equipo</div>
      <table className="tabla">
        <thead><tr><th>Repuesto</th><th>SAP</th><th className="num">En almacén</th><th></th></tr></thead>
        <tbody>
          {lista.map((r: any) => {
            const sinStock = (r.currentStock ?? 0) <= 0;
            const bajo = !sinStock && r.minStock != null && r.currentStock <= r.minStock;
            return (
              <tr key={r.id}>
                <td><strong>{r.name}</strong>
                  {r.category && <div className="muted" style={{ fontSize: 11.5 }}>{r.category}</div>}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.sapCode || '—'}</td>
                <td className="num">
                  <b style={{ color: sinStock ? 'var(--crit)' : bajo ? 'var(--warn)' : 'var(--ok)' }}>
                    {r.currentStock ?? 0} {r.unit || ''}
                  </b>
                </td>
                <td style={{ textAlign: 'right' }}>
                  {/* El aviso que evita el viaje en balde: enterarse de que no
                      hay repuesto ANTES de subir, no después. */}
                  {sinStock && <span className="chip crit">sin stock</span>}
                  {bajo && <span className="chip warn">bajo mínimo</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
