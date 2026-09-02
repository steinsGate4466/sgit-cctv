import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 87 · NI A MEDIAS NI DOS VECES
   -----------------------------------------------------------------------------
   Dos familias de fallo que comparten una cosa: **no rompen nada**. No hay
   error, no hay pantalla en rojo, y el dato queda mal para siempre.

     A) UNA ESCRITURA QUE SE PARTE POR LA MITAD.
        Dos llamadas sueltas que describen UN solo hecho. Si la segunda falla,
        la primera se queda hecha y nadie se entera.

     B) UNA ESCRITURA QUE SE DISPARA DOS VECES.
        Un botón sin freno. En una tablet con la wifi de la nave, cuando la
        primera pulsación parece no responder, se pulsa otra vez. Es lo normal.

   Las dos salieron de barridos sistemáticos, no de intuición.
============================================================================= */

const BACK = path.join(__dirname, '..', 'src');
const FRONT = path.join(__dirname, '..', '..', 'frontend', 'src');
const leer = (p: string) => fs.readFileSync(p, 'utf8');
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

/** Acota al método. Nunca a un número de caracteres — es el fallo que este
 *  proyecto lleva cazándose siete veces. */
function metodo(fuente: string, nombre: string): string {
  const i = fuente.indexOf(nombre);
  if (i < 0) return '';
  const sig = fuente.indexOf('\n  async ', i + nombre.length);
  return fuente.slice(i, sig > i ? sig : undefined);
}

const ASSETS = sinComentarios(leer(path.join(BACK, 'modules', 'assets', 'assets.service.ts')));
const USERS = sinComentarios(leer(path.join(BACK, 'modules', 'users', 'users.service.ts')));
const INSTA = sinComentarios(leer(path.join(FRONT, 'pages', 'Instalaciones.tsx')));

describe('Bloque 87 — A · una escritura no se parte por la mitad', () => {
  it('dar de baja un activo apaga su plan preventivo EN LA MISMA transacción', () => {
    /* EL BUG: si la segunda escritura fallaba, el activo quedaba de BAJA y su
       plan preventivo seguía ACTIVO — generando órdenes para un equipo que ya
       no existe. Esas órdenes vencen, entran en el backlog y hunden el
       cumplimiento del preventivo.

       Nadie relaciona jamás «el cumplimiento bajó» con «hace tres meses una
       baja falló a medias». Es un dato que se corrompe en silencio. */
    const m = metodo(ASSETS, 'async remove(');
    expect(m).toContain('$transaction');
    const t = m.indexOf('$transaction');
    const plan = m.indexOf('preventivePlan.updateMany');
    const cierre = m.indexOf('])', t);
    expect(plan).toBeGreaterThan(t);
    expect(plan).toBeLessThan(cierre);
  });

  it('desactivar a alguien y revocar sus sesiones van juntas', () => {
    /* Hoy no se colaría por defensa en profundidad —el contador ya subió—,
       pero eso es tener el corte sujeto por una sola capa sin saberlo. Cuando
       la seguridad depende de que la otra mitad falle de la forma correcta,
       deja de ser una decisión y pasa a ser suerte. */
    const m = metodo(USERS, 'async deactivate(');
    expect(m).toContain('$transaction');
    const t = m.indexOf('$transaction');
    const ses = m.indexOf('sesion.updateMany');
    const cierre = m.indexOf('])', t);
    expect(ses).toBeGreaterThan(t);
    expect(ses).toBeLessThan(cierre);
  });
});

describe('Bloque 87 — B · una escritura no se dispara dos veces', () => {
  /* EL PEOR DE LOS DOS. `generarOrden` CREA UNA ORDEN DE TRABAJO: dos clics
     seguidos son DOS ÓRDENES para la misma instalación. Y eso no es un
     registro duplicado que se borra — es una cuadrilla que sube dos veces al
     mismo poste, y dos órdenes contando en el nivel de servicio y en el
     reparto correctivo/preventivo.

     Lo delató que `cerrarInstalacion`, treinta líneas más abajo, SÍ tenía la
     guarda: cuando dos funciones hermanas del mismo archivo se comportan
     distinto, una de las dos está mal (regla del bloque 77). */

  function fn(nombre: string): string {
    const i = INSTA.indexOf(`async function ${nombre}(`);
    if (i < 0) return '';
    const sig = INSTA.indexOf('\n  async function ', i + 10);
    return INSTA.slice(i, sig > i ? sig : i + 2500);
  }

  for (const nombre of ['decidir', 'generarOrden']) {
    it(`${nombre} corta la segunda llamada antes de empezar`, () => {
      /* `if (guardando) return` y NO sólo el `disabled` del botón: el estado
         se lee al instante, el `disabled` tarda un ciclo de repintado. En ese
         hueco cabe el segundo clic. Los dos frenos, no uno. */
      const c = fn(nombre);
      expect(c).toMatch(/if \(guardando\) return/);
      expect(c).toContain('setGuardando(true)');
      expect(c).toMatch(/finally \{ setGuardando\(false\); \}/);
    });
  }

  it('los tres botones que escriben se apagan mientras corre', () => {
    for (const ancla of [
      'decidir(detalle, false)',
      'decidir(detalle, true)',
      'generarOrden(detalle)',
    ]) {
      const i = INSTA.indexOf(ancla);
      expect([ancla, i > -1]).toEqual([ancla, true]);
      /* Se mira hasta el `>` que cierra la etiqueta, no una ventana de N
         caracteres: con una ventana se lee el botón de al lado. */
      const fin = INSTA.indexOf('>', i);
      expect(INSTA.slice(i, fin)).toContain('disabled={guardando}');
    }
  });
});
