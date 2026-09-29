import { Link } from 'react-router-dom';
import { IconoEquipo } from './Marcador';
import { Zona } from './ZonasDelPlano';

/**
 * LA FICHA DE UNA ZONA — bloque 165. Qué hay en la sala, cómo está y a dónde
 * ir: su plano propio si lo tiene, sus órdenes. Ve y manda (§58).
 */
const NOMBRE: Record<string, string> = { caida: 'sin servicio', alerta: 'con alerta', sindato: 'sin dato', ok: 'operativos' };
const ORDEN: Record<string, number> = { caida: 0, alerta: 1, sindato: 2, ok: 3 };

export default function TarjetaZona({ z, equipos, onIrA, onAbrirPlano, onCerrar }: {
  z: Zona; equipos: any[]; onIrA: (e: any) => void; onAbrirPlano: (id: string) => void; onCerrar: () => void;
}) {
  const suyos = equipos.filter((e) => z.equipos.includes(e.assetId)).sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]);
  const resumen = suyos.length ? z.resumen : (z.planoHijo?.resumen ?? z.resumen);
  return (
    <aside className="tarjeta-mapa">
      <header className="tarjeta-mapa-cab">
        <span className="tarjeta-mapa-tipo">Zona</span>
        <h2>{z.nombre}</h2>
        <button type="button" className="tarjeta-mapa-cerrar" aria-label="Cerrar" onClick={onCerrar}>×</button>
      </header>
      <div className="tarjeta-mapa-cuerpo">
        <div className="zona-cuentas">
          {(['caida', 'alerta', 'sindato', 'ok'] as const).map((k) => (
            <span key={k} className={'punto-' + k}><i /> <b>{resumen[k] ?? 0}</b> {NOMBRE[k]}</span>
          ))}
        </div>
        {!suyos.length && z.planoHijo && <p className="muted">Sus equipos están en el plano propio de la zona.</p>}
        {!suyos.length && !z.planoHijo && <p className="muted">No hay equipos dibujados dentro de esta zona.</p>}
        {z.conOtraUbicacion.length > 0 && (
          <p className="aviso-mapa">
            {z.conOtraUbicacion.length} equipo(s) dibujado(s) aquí tienen otra ubicación en su ficha. Revisa cuál está mal: el dibujo o la ficha.
          </p>
        )}
        <ul className="mapa-lista">
          {suyos.map((e) => (
            <li key={e.assetId}>
              <button type="button" onClick={() => onIrA(e)}>
                <IconoEquipo e={e} tam={20} /> <b>{e.codigo}</b>
                <span className="muted">{e.estado === 'ok' ? (e.referencia || e.estadoTexto) : e.estadoTexto}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="tarjeta-mapa-acciones">
          {z.planoHijo && (
            <button type="button" className="btn-primary" onClick={() => onAbrirPlano(z.planoHijo!.id)}>Abrir el plano de la zona</button>
          )}
          <Link className="btn-mini" to={`/maintenance?zona=${encodeURIComponent(z.locationId)}&zonaNombre=${encodeURIComponent(z.nombre)}`}>Órdenes de la zona</Link>
        </div>
      </div>
    </aside>
  );
}
