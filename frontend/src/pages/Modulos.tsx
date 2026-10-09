import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { MODULOS, pantallasVisibles } from '../modulos';
import { totalDelModulo, useContadores } from '../contadores';
import Icono from '../components/Iconos';
import Insignia from '../components/Insignia';

/**
 * TODOS LOS MÓDULOS — bloque 170.
 *
 * El mapa del sistema en una pantalla: cada módulo con lo que lleva dentro,
 * para qué sirve cada pantalla y cuántas cosas esperan en cada una. Es lo que
 * en el PC da el panel al pasar el ratón, pero pensado para el celular, donde
 * no hay ratón y la tira de arriba sólo enseña los nombres.
 *
 * Sale de `modulos.ts` igual que el menú: una pantalla nueva aparece aquí sola,
 * y una que la persona no puede abrir no aparece.
 */
export default function Modulos() {
  const { can, user } = useAuth();
  const contadores = useContadores();
  const modulos = MODULOS
    .map((m) => ({ m, visibles: pantallasVisibles(m, can, user) }))
    .filter((x) => x.visibles.length > 0);

  return (
    <div className="modulos-hub">
      <p className="page-sub">{'Cada módulo con sus pantallas. El número dice cuántas cosas esperan dentro.'}</p>
      <div className="modulos-grid">
        {modulos.map(({ m, visibles }) => {
          const total = totalDelModulo(m, visibles.map((p) => p.ruta), contadores);
          return (
            <section key={m.titulo} className={'modulo-tarjeta' + (total ? ' con-pendientes ' + total.tono : '')}>
              <Link to={visibles[0].ruta} className="modulo-tarjeta-cab">
                <span className="modulo-tarjeta-ico"><Icono n={m.icono} size={22} /></span>
                <span className="modulo-tarjeta-tit">
                  <b>{m.titulo}</b>
                  <small>{m.descripcion}</small>
                </span>
                <Insignia c={total} />
              </Link>
              <ul className="modulo-tarjeta-lista">
                {visibles.map((p) => (
                  <li key={p.ruta}>
                    <Link to={p.ruta}>
                      <span>
                        <b>{p.texto}</b>
                        {p.nota && <small>{p.nota}</small>}
                      </span>
                      <Insignia c={contadores[p.ruta]} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
