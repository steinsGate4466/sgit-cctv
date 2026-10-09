import { NavLink } from 'react-router-dom';
import { Modulo, Pantalla } from '../modulos';
import { Contadores, totalDelModulo } from '../contadores';
import Icono from './Iconos';
import Insignia from './Insignia';

/**
 * LO QUE HAY DENTRO DE UN MÓDULO, SIN ENTRAR — bloque 170.
 *
 * Con una entrada por módulo (bloque 147) el menú dejó de marear, pero escondió
 * lo de dentro: para saber que «Puntos críticos» vive en «Red y energía» había
 * que entrar y mirar las pestañas. Al dejar el ratón sobre un módulo sale este
 * panel con sus pantallas, para qué sirve cada una y cuántas cosas esperan.
 * Se pulsa la que se quiere y se llega directo: un clic en vez de dos.
 *
 * En el celular no sale (no hay «pasar el ratón»): allí está la página
 * «Todos los módulos», con lo mismo.
 */
export default function PanelDeModulo({
  m, visibles, actual, contadores, top, left, onEntrar, onSalir, onElegir,
}: {
  m: Modulo;
  visibles: Pantalla[];
  actual: string;
  contadores: Contadores;
  top: number;
  left: number;
  onEntrar: () => void;
  onSalir: () => void;
  onElegir: () => void;
}) {
  const total = totalDelModulo(m, visibles.map((p) => p.ruta), contadores);
  return (
    <div className="panel-modulo" role="menu" aria-label={m.titulo} style={{ top, left }}
      onMouseEnter={onEntrar} onMouseLeave={onSalir}>
      <div className="panel-modulo-cab">
        <span className="panel-modulo-ico"><Icono n={m.icono} size={18} /></span>
        <span>
          <b>{m.titulo}</b>
          <small>{m.descripcion}</small>
        </span>
        <Insignia c={total} />
      </div>
      <div className="panel-modulo-lista">
        {visibles.map((p) => (
          <NavLink key={p.ruta} to={p.ruta} role="menuitem" onClick={onElegir}
            className={'panel-modulo-item' + (p.ruta === actual ? ' actual' : '')}>
            <span>
              <b>{p.texto}</b>
              {p.nota && <small>{p.nota}</small>}
            </span>
            <Insignia c={contadores[p.ruta]} />
          </NavLink>
        ))}
      </div>
    </div>
  );
}
