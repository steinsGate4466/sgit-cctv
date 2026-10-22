import CatalogosEditables from '../components/CatalogosEditables';
import { ComoSeCalcula } from '../components/Patron';

/**
 * CATÁLOGO DE FALLAS — bloque 130.
 *
 * =============================================================================
 *  POR QUÉ SALE DE «UBICACIONES»
 * =============================================================================
 *  Lo vio el usuario en el paseo del 21/09/2026:
 *
 *  > «Catálogo… corto, falla eléctrica, conector. ¿Por qué eso va en
 *  >  Ubicaciones? No entiendo. Podemos ponerle catálogo de problemas.»
 *
 *  Tenía razón y el error era mío. Lo puse ahí razonando que era «la misma
 *  clase de decisión: cómo se llaman las cosas en esta planta». Eso es cierto
 *  para quien escribió el código y FALSO para quien usa el software: una
 *  ubicación es un SITIO, y un catálogo de fallas es el vocabulario con el que
 *  se CIERRA una orden —síntoma, causa, acción—.
 *
 *  Quien edita este catálogo está pensando en mantenimiento, no en el árbol de
 *  planta. Por eso vive en Gestión del mantenimiento, al lado de las órdenes
 *  que lo usan.
 *
 *  La lección general, que ya está en CLAUDE.md §56.3: una pantalla se coloca
 *  donde está QUIEN DECIDE CON ELLA, no donde encaje mejor en el esquema.
 */
export default function CatalogoDeFallas() {
  return (
    <div>
      <h1 className="page-title">Catálogo de fallas</h1>
      <p className="page-sub">Síntoma, causa y acción del cierre</p>

      <CatalogosEditables />

      {/* Síntesis 21/10: la explicación pasa abajo, plegada. */}
      <ComoSeCalcula>
        <p>
          Al cerrar una orden se elige de estas listas, con los nombres de esta
          planta; de ahí salen los indicadores. Si falta una opción, se agrega aquí.
        </p>
      </ComoSeCalcula>
    </div>
  );
}
