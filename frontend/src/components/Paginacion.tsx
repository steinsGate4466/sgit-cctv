/**
 * PAGINACIÓN — un solo control para todas las listas.
 *
 * POR QUÉ EXISTE COMO COMPONENTE Y NO COPIADO EN CADA PANTALLA
 * Porque lo importante no es el botón: es que TODAS las listas cuenten lo
 * mismo de la misma forma. Si cada pantalla escribe su propio paginador,
 * una dice "página 2 de 5", otra "51-100" y una tercera se olvida de decir
 * el total — y entonces nadie sabe si está viendo todo o una parte.
 *
 * SIEMPRE DICE EL TOTAL. Es el dato que evita el error de creer que hay 50
 * repuestos porque son los que caben en la pantalla.
 */
export default function Paginacion({
  page, pages, total, pageSize, onChange, etiqueta = 'registro',
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
  /** Singular. "repuesto", "tramo", "activo". */
  etiqueta?: string;
}) {
  // Con una sola página no se pinta el control, pero SÍ el total: saber que
  // son 12 y no "los que se ven" es información, no decoración.
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);

  return (
    <div className="paginacion">
      <span className="paginacion-cuenta">
        {total === 0
          ? `Sin ${etiqueta}s`
          : pages === 1
            ? `${total} ${etiqueta}${total === 1 ? '' : 's'}`
            : `${desde}–${hasta} de ${total} ${etiqueta}${total === 1 ? '' : 's'}`}
      </span>

      {pages > 1 && (
        <div className="paginacion-botones">
          <button className="btn-mini" disabled={page <= 1} onClick={() => onChange(page - 1)}>
            ‹ Anterior
          </button>
          <span className="paginacion-pag">{page} / {pages}</span>
          <button className="btn-mini" disabled={page >= pages} onClick={() => onChange(page + 1)}>
            Siguiente ›
          </button>
        </div>
      )}
    </div>
  );
}
