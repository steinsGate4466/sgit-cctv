/* =============================================================================
   AVISO DE RECORTE — bloque 174
   -----------------------------------------------------------------------------
   Tres listas (permisos de acceso, campañas, mejoras por decidir) tienen techo
   en el servidor. El total viaja en la cabecera X-Total. Si se recortó, se
   DICE: un recorte que no se dice es una mentira (bloque 101).
============================================================================= */
export interface Recorte { total: number; mostradas: number }

/** Lee el total de las cabeceras de una respuesta de axios. */
export function recorteDe(r: { headers?: any; data?: any }): Recorte | null {
  const total = Number(r?.headers?.['x-total']);
  const mostradas = Array.isArray(r?.data) ? r.data.length : 0;
  if (!Number.isFinite(total) || total <= mostradas) return null;
  return { total, mostradas };
}

export default function AvisoDeRecorte({ recorte, cuales, como }: {
  recorte: Recorte | null; cuales: string; como: string;
}) {
  if (!recorte) return null;
  return (
    <div className="card aviso" role="status" style={{ marginBottom: 10, fontSize: 13 }}>
      Se muestran las <b>{recorte.mostradas}</b> {cuales} de <b>{recorte.total}</b>. {como}
    </div>
  );
}
