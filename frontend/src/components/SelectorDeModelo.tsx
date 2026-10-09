import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * MARCA Y MODELO CON CLICS — bloque 169.
 *
 * «Que los técnicos no coloquen nada a su criterio, que todo se ordene con
 * clics.» Marca y modelo se escribían a mano y la planta acababa con
 * «Hikvision», «hikvision» y «HIK» como tres marcas distintas: el análisis de
 * obsolescencia y de repuestos contaba mal. Aquí se ELIGE de lo que ya hay en
 * planta para ese tipo de equipo (lo más usado arriba). Sólo si es un modelo
 * nuevo de verdad se escribe, y queda disponible para el siguiente.
 */
const OTRO = '__otro__';

export default function SelectorDeModelo({ tipo, marca, modelo, onChange, etiqueta = 'Marca y modelo' }: {
  tipo: string;
  marca: string;
  modelo: string;
  onChange: (marca: string, modelo: string) => void;
  etiqueta?: string;
}) {
  const [opciones, setOpciones] = useState<{ marca: string; modelo: string; usos: number }[] | null>(null);
  const [aMano, setAMano] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.get('/assets/marcas-modelos', { params: { tipo } })
      .then((r) => { if (vivo) setOpciones(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (vivo) setOpciones([]); });
    return () => { vivo = false; };
  }, [tipo]);

  const clave = (m: string, o: string) => `${m}|${o}`;
  const actual = marca ? clave(marca, modelo || '') : '';
  const conocido = !!opciones?.some((o) => clave(o.marca, o.modelo) === actual);
  const escribiendo = aMano || (!!marca && opciones !== null && !conocido) || (opciones !== null && opciones.length === 0);

  return (
    <div className="selector-modelo">
      {opciones !== null && opciones.length > 0 && (
        <label>{etiqueta}
          <select value={escribiendo ? OTRO : actual} onChange={(e) => {
            if (e.target.value === OTRO) { setAMano(true); onChange('', ''); return; }
            setAMano(false);
            const o = opciones.find((x) => clave(x.marca, x.modelo) === e.target.value);
            onChange(o?.marca || '', o?.modelo || '');
          }}>
            <option value="">{'— elige —'}</option>
            {opciones.map((o) => (
              <option key={clave(o.marca, o.modelo)} value={clave(o.marca, o.modelo)}>
                {o.modelo ? `${o.marca} · ${o.modelo}` : o.marca}{o.usos ? ` (${o.usos} en planta)` : ''}
              </option>
            ))}
            <option value={OTRO}>{'Otro modelo (escribirlo)'}</option>
          </select>
        </label>
      )}
      {escribiendo && (
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ flex: 1 }}>Marca
            <input value={marca} onChange={(e) => onChange(e.target.value, modelo)} />
          </label>
          <label style={{ flex: 1 }}>Modelo
            <input value={modelo} onChange={(e) => onChange(marca, e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
