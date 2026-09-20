import { useMemo } from 'react';
import { NOMBRE_DE_TIPO, TIPOS_ACTIVO } from '../tipos-de-equipo';

/**
 * ELEGIR UN EQUIPO — bloque 121.
 *
 * =============================================================================
 *  EL FALLO QUE VIO EL USUARIO
 * =============================================================================
 *  Palabras suyas: «he visto un formulario que sale switch, switch, pantalla,
 *  no sé qué, cuando el formulario es de otra cosa».
 *
 *  El barrido lo confirmó: **diez formularios** pintaban `opciones.map(...)`
 *  plano. Cuatrocientos equipos de catorce tipos, en una sola lista ordenada
 *  por código. Una cámara, un switch, una pantalla y un teléfono IP seguidos,
 *  sin nada que los separe.
 *
 *  Eso no es un problema de estética: es un equipo mal elegido. El técnico
 *  busca la cámara 1262AT04, ve 1262AP02 dos líneas más arriba y la pulsa. La
 *  orden queda apuntada al equipo equivocado, y a partir de ahí el historial de
 *  los dos está mal — el del que no se tocó y el del que sí.
 *
 * =============================================================================
 *  LA REGLA: AGRUPAR, NO FILTRAR
 * =============================================================================
 *  La tentación era filtrar por tipo. Sería peor: una incidencia puede ser de
 *  CUALQUIER equipo, y una lista filtrada dejaría fuera justo el que falló.
 *
 *  Por eso se AGRUPA con `<optgroup>`. El técnico ve «Cámaras» y dentro las
 *  cámaras; sigue pudiendo elegir cualquier cosa, pero ya no se equivoca de
 *  familia. Filtrar sólo se hace cuando de verdad no cabe otro tipo —el
 *  grabador de una cámara es un NVR y no puede ser otra cosa—, y entonces se
 *  pasa `tipos`.
 *
 * =============================================================================
 *  Y SE ENSEÑA DÓNDE ESTÁ
 * =============================================================================
 *  Dos cámaras del mismo modelo en dos trenes distintos tienen códigos casi
 *  iguales. Lo que las distingue para quien está en campo no es el código: es
 *  «lecho de enfriamiento» o «púlpito». Va detrás del código, en la misma
 *  línea, porque un desplegable no admite dos.
 */
type Opcion = {
  id: string;
  assetCode: string;
  type?: string | null;
  locationName?: string | null;
  referencePlace?: string | null;
  status?: string | null;
};

type Props = {
  opciones: Opcion[];
  valor: string;
  onChange: (id: string) => void;
  /** Qué se lee cuando no hay nada elegido. */
  vacio?: string;
  /** Restringe a estos tipos. Sólo cuando NO cabe otro (ej. el NVR de una cámara). */
  tipos?: string[];
  etiqueta: string;
  desactivado?: boolean;
};

export default function SelectorDeActivo({
  opciones, valor, onChange, vacio, tipos, etiqueta, desactivado,
}: Props) {
  const grupos = useMemo(() => {
    const util = (opciones || []).filter((o) => o && o.id
      && (!tipos || !o.type || tipos.includes(o.type)));

    /* EL ORDEN DE LOS GRUPOS ES EL DE `TIPOS_ACTIVO`, no alfabético: esa lista
       ya está ordenada por lo que más se toca en planta —cámara, antena,
       switch, grabador— y repetir ese orden aquí hace que el técnico encuentre
       lo suyo en el mismo sitio en todos los formularios. */
    const orden = TIPOS_ACTIVO.map((t) => t.valor);
    const por = new Map<string, Opcion[]>();
    for (const o of util) {
      const t = o.type || 'OTHER';
      if (!por.has(t)) por.set(t, []);
      por.get(t)!.push(o);
    }
    return [...por.entries()]
      .sort((a, b) => {
        const ia = orden.indexOf(a[0]); const ib = orden.indexOf(b[0]);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
      .map(([tipo, lista]) => ({
        tipo,
        nombre: NOMBRE_DE_TIPO[tipo] || tipo,
        lista: lista.sort((x, y) => (x.assetCode || '').localeCompare(y.assetCode || '')),
      }));
  }, [opciones, tipos]);

  const dondeEsta = (o: Opcion) => o.referencePlace || o.locationName || '';

  return (
    <label>
      {etiqueta}
      <select
        value={valor}
        disabled={desactivado}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{vacio || '— elegir equipo —'}</option>
        {grupos.map((g) => (
          <optgroup key={g.tipo} label={g.nombre}>
            {g.lista.map((o) => (
              <option key={o.id} value={o.id}>
                {o.assetCode}
                {dondeEsta(o) ? ` · ${dondeEsta(o)}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
