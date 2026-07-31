import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * FILTRO DE ÁMBITO DE PLANTA — tren y etapa del proceso.
 *
 * POR QUÉ ES UN COMPONENTE COMPARTIDO Y NO SEIS COPIAS
 * Aparece en Activos, Cableado, Órdenes, Incidencias, Mapeo y Gabinetes. Si
 * cada pantalla lo escribiera por su cuenta, en tres meses habría seis
 * comportamientos distintos para la misma pregunta. Aquí el control es uno, se
 * ve igual en todas partes y significa lo mismo en todas partes.
 *
 * LOS TRENES Y LAS ETAPAS NO ESTÁN EN EL CÓDIGO
 * Se piden al servidor, que los saca del árbol de ubicaciones y del catálogo de
 * etapas. Los dos son editables desde Ubicaciones. Si mañana hay un Tren 4 o
 * una etapa nueva, aparece aquí sin tocar nada.
 *
 * ELEGIR UN TREN NO BORRA LA ETAPA
 * Se conservan las dos, porque cruzarlas es justamente lo útil: "Desbaste del
 * Tren 2" es una pregunta distinta de "todo el Desbaste".
 */

export interface Ambito {
  tren: string;
  etapa: string;
}

export const AMBITO_VACIO: Ambito = { tren: '', etapa: '' };

/** Añade el ámbito a los parámetros de una consulta, si hay algo que añadir. */
export function conAmbito(params: any, a: Ambito) {
  const p = { ...params };
  if (a.tren) p.tren = a.tren;
  if (a.etapa) p.etapa = a.etapa;
  return p;
}

export default function FiltroAmbito({ valor, onChange }: {
  valor: Ambito;
  onChange: (a: Ambito) => void;
}) {
  const [trenes, setTrenes] = useState<any[]>([]);
  const [etapas, setEtapas] = useState<any[]>([]);

  // Catálogos: se piden una vez. El árbol no cambia mientras filtras.
  useEffect(() => {
    Promise.all([
      api.get('/locations/stages/trenes').then((r) => r.data).catch(() => []),
      api.get('/locations/stages').then((r) => r.data).catch(() => []),
    ]).then(([t, e]) => {
      setTrenes(t || []);
      setEtapas((e || []).filter((x: any) => x.active !== false));
    });
  }, []);

  const hayFiltro = !!valor.tren || !!valor.etapa;

  return (
    <>
      <div>
        <label>Tren</label>
        <select
          value={valor.tren}
          onChange={(e) => onChange({ ...valor, tren: e.target.value })}
        >
          <option value="">Todos</option>
          {trenes.map((t) => (
            <option key={t.id} value={t.code}>{t.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label>Etapa del proceso</label>
        <select
          value={valor.etapa}
          onChange={(e) => onChange({ ...valor, etapa: e.target.value })}
        >
          <option value="">Todas</option>
          {/* En orden de proceso, no alfabético: así se lee de la entrada del
              horno a la salida del producto, como está el tren de verdad. */}
          {etapas.map((s) => (
            <option key={s.id} value={s.code}>{s.name}</option>
          ))}
        </select>
      </div>

      {hayFiltro && (
        <div>
          <label>&nbsp;</label>
          <button
            className="btn-mini"
            onClick={() => onChange({ ...AMBITO_VACIO })}
            title="Volver a ver toda la planta"
          >
            Quitar filtro
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Aviso de que lo que se ve está acotado.
 *
 * Sin esto, alguien mira "4 activos", no recuerda que dejó puesto el Tren 3 y
 * concluye que la planta tiene 4 activos. El filtro tiene que ser visible en el
 * resultado, no solo en el control.
 */
export function AvisoAmbito({ valor, total }: { valor: Ambito; total?: number }) {
  if (!valor.tren && !valor.etapa) return null;
  return (
    <div className="sign-note" style={{ marginBottom: 10 }}>
      Estás viendo <b>solo una parte de la planta</b>
      {valor.tren && <> · tren <b>{valor.tren}</b></>}
      {valor.etapa && <> · etapa <b>{valor.etapa}</b></>}
      {typeof total === 'number' && <> · {total} resultado(s)</>}
    </div>
  );
}
