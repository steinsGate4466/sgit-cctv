import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * ENCUESTA DE HERRAMIENTAS AL ABRIR LA ORDEN.
 *
 * PARA QUÉ SIRVE
 * El técnico sale a campo, llega al equipo y descubre que le falta el
 * engrimpador. Viaje perdido — y en una parada de planta ese viaje no se
 * recupera.
 *
 * Aquí confirma qué lleva ANTES de salir. Y se guarda también el "no la llevo",
 * a propósito: es el dato que explica una orden que quedó sin resolver, y el que
 * permite al Jefe ver que faltan engrimpadores en el taller —no que el técnico
 * trabaje mal—.
 *
 * Las herramientas se SUGIEREN según el tipo de orden. Listar las treinta en
 * todas haría que nadie lea la lista.
 */

export interface HerramientaMarcada {
  toolId: string;
  carried: boolean;
  note?: string;
}

interface Props {
  workOrderId: string;
  /** Se avisa al padre para que las envíe junto con la apertura. */
  onChange: (items: HerramientaMarcada[]) => void;
  /** true = solo lectura, para que el Jefe vea qué declaró el técnico. */
  soloLectura?: boolean;
}

export default function OmHerramientas({ workOrderId, onChange, soloLectura }: Props) {
  const [d, setD] = useState<any>(null);
  const [marcas, setMarcas] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get('/work-orders/' + workOrderId + '/tools')
      .then((r) => {
        setD(r.data);
        // Se precarga lo ya declarado, si la orden se abrió antes.
        const inicial: Record<string, boolean> = {};
        for (const h of r.data?.herramientas || []) {
          if (h.carried !== null) inicial[h.id] = h.carried;
        }
        setMarcas(inicial);
      })
      .catch(() => setD(null))
      .finally(() => setCargando(false));
  }, [workOrderId]);

  function alternar(toolId: string, valor: boolean) {
    const nuevas = { ...marcas, [toolId]: valor };
    setMarcas(nuevas);
    onChange(Object.entries(nuevas).map(([id, carried]) => ({ toolId: id, carried })));
  }

  if (cargando) return <div className="muted" style={{ fontSize: 12 }}>Cargando herramientas…</div>;
  if (!d) return null;

  const lista = d.herramientas || [];
  if (!lista.length) {
    return (
      <div className="muted" style={{ fontSize: 12, margin: '10px 0' }}>
        No hay herramientas en el catálogo. El Jefe de Mantenimiento las registra
        en <strong>Inventario → Herramientas</strong>.
      </div>
    );
  }

  // Agrupadas por familia: con veinte herramientas en una lista plana, el
  // técnico marca las primeras y deja de leer.
  const porFamilia: Record<string, any[]> = {};
  for (const h of lista) {
    const f = h.category || 'Otras';
    (porFamilia[f] = porFamilia[f] || []).push(h);
  }

  const total = lista.length;
  const marcadas = Object.keys(marcas).length;
  const faltan = Object.values(marcas).filter((v) => !v).length;

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid #e5e7eb' }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        Herramientas que llevas
      </div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
        {soloLectura
          ? 'Lo que el técnico declaró al abrir la orden.'
          : 'Marca lo que tienes. Si algo falta, márcalo como no disponible: '
            + 'queda registrado y evita que se pierda el motivo del viaje.'}
      </div>

      {Object.entries(porFamilia).map(([familia, items]) => (
        <div key={familia} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
            {familia}
          </div>
          {items.map((h) => {
            const estado = marcas[h.id];
            return (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                fontSize: 13,
              }}>
                <span style={{ flex: 1 }}>
                  {h.name}
                  {h.notes && <div className="muted" style={{ fontSize: 10 }}>{h.notes}</div>}
                </span>
                {soloLectura ? (
                  <span className={'badge ' + (estado === true ? 'OPERATIVO' : estado === false ? 'FUERA_SERVICIO' : 'MEDIA')}
                    style={{ fontSize: 10 }}>
                    {estado === true ? 'la llevó' : estado === false ? 'NO la tenía' : 'sin declarar'}
                  </span>
                ) : (
                  <>
                    <button type="button" className="btn-mini"
                      style={estado === true
                        ? { background: '#16a34a', color: '#fff', borderColor: '#16a34a' } : undefined}
                      onClick={() => alternar(h.id, true)}>La llevo</button>
                    <button type="button" className="btn-mini"
                      style={estado === false
                        ? { background: '#dc2626', color: '#fff', borderColor: '#dc2626' } : undefined}
                      onClick={() => alternar(h.id, false)}>No la tengo</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {!soloLectura && (
        <div className="muted" style={{ fontSize: 11 }}>
          {marcadas} de {total} revisadas
          {faltan > 0 && (
            <span style={{ color: '#b91c1c', fontWeight: 600 }}> · {faltan} sin disponibilidad</span>
          )}
        </div>
      )}
    </div>
  );
}
