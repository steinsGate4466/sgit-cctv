/**
 * LA PLANTA DE UN VISTAZO — bloque 165.
 *
 * «¿Cómo hago para ver por zonas, sala eléctrica y así, en todos lados y para
 * el Tren 2?» Cuando hay más de un plano, el Mapa abre aquí: cada tren con sus
 * planos (el del tren y, debajo, los de sus salas), del color de su peor
 * equipo y con cuántos hay de cada estado. Primero dónde está el problema;
 * después se entra al plano.
 */
const NOMBRE: Record<string, string> = { caida: 'sin servicio', alerta: 'con alerta', sindato: 'sin dato', ok: 'operativos' };

export default function VistaDePlanta({ planta, onAbrir }: { planta: any[]; onAbrir: (id: string) => void }) {
  const grupos = new Map<string, any[]>();
  for (const p of planta) {
    const k = p.tren || 'Otras áreas';
    grupos.set(k, [...(grupos.get(k) ?? []), p]);
  }
  // Dentro de cada tren: primero el plano general, debajo los que cuelgan de él.
  const orden = (xs: any[]) => [...xs.filter((x) => !x.dentroDe), ...xs.filter((x) => x.dentroDe)];
  return (
    <div className="planta">
      {[...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tren, planos]) => (
        <section key={tren} className="planta-tren">
          <h2>{tren}</h2>
          <div className="planta-planos">
            {orden(planos).map((p) => (
              <button key={p.id} type="button" className={'planta-plano estado-' + p.estado + (p.dentroDe ? ' hijo' : '')} onClick={() => onAbrir(p.id)}>
                <span className="planta-nombre">{p.dentroDe ? '↳ ' : ''}{p.ubicacion}</span>
                <span className="planta-sub">{p.nombre}</span>
                <span className="planta-cuentas">
                  {(['caida', 'alerta', 'sindato', 'ok'] as const).filter((k) => p.resumen?.[k]).map((k) => (
                    <span key={k} className={'punto-' + k} title={NOMBRE[k]}><i /> {p.resumen[k]}</span>
                  ))}
                  {!p.total && <span className="muted">sin equipos colocados</span>}
                </span>
                <span className="planta-pie">{p.total} equipos{p.zonas ? ` · ${p.zonas} zonas` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
