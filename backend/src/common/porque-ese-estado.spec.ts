import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 83 · POR QUÉ EL EQUIPO ESTÁ EN ESE ESTADO
   -----------------------------------------------------------------------------
   DE DÓNDE SALE, textual del usuario:

       «Eso del estado es grave, ¿cómo se puede actualizar?, ¿cómo es que
        funciona esa lógica si aquí se supone que se actualizó?»

   Y NO era un bug. El estado se DERIVA (bloque F5) y una orden abierta lo fija
   en MANTENIMIENTO por diseño: el equipo puede estar reparado, pero mientras la
   orden siga abierta el sistema dice —con razón— que hay trabajo en curso.

   El fallo era otro, y es el de siempre en este proyecto:

   > **Un cálculo correcto que no se explica es indistinguible de un fallo.**

   El técnico ponía el activo en OPERATIVO, recargaba, seguía leyendo «En
   mantenimiento» y no había NADA en pantalla que dijera por qué. Con eso, la
   conclusión razonable es que el software no guarda.

   -----------------------------------------------------------------------------
   POR QUÉ SE LEE EL CÓDIGO Y NO SE MONTA UNA BASE

   Lo que hay que fijar aquí no son los datos: es que el MOTIVO siga el MISMO
   orden de precedencia que el estado. Dos criterios paralelos acabarían
   discrepando, y una pantalla que enseña un estado y a su lado un motivo que
   no le corresponde es peor que no enseñar el motivo — porque el usuario ya no
   sabe cuál de los dos creerse.
============================================================================= */

const ARCHIVO = path.join(__dirname, 'asset-status.ts');
const SRC = fs.readFileSync(ARCHIVO, 'utf8');
const sinComentarios = SRC
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '');

/** Acota al cuerpo de una función, cortando en la SIGUIENTE `export`. */
function funcion(nombre: string): string {
  const i = sinComentarios.indexOf(nombre);
  if (i < 0) return '';
  const sig = sinComentarios.indexOf('export ', i + nombre.length);
  return sinComentarios.slice(i, sig > i ? sig : undefined);
}

const MOTIVOS = funcion('async function motivosDelEstado');

describe('Bloque 83 — el motivo del estado', () => {
  it('existe y está EXPORTADO: si no, es cálculo muerto', () => {
    /* Es el error del bloque 76 con la criticidad, que llevaba tres bloques
       escrita y sólo la importaba su propia prueba. */
    expect(SRC).toContain('export async function motivosDelEstado');
    expect(SRC).toContain('export async function motivoDelEstado');
  });

  it('está ENCHUFADO a la ficha del activo', () => {
    /* Cálculo + pruebas en verde ≠ función. Sin pantalla, no existe. */
    const servicio = fs.readFileSync(
      path.join(__dirname, '..', 'modules', 'assets', 'assets.service.ts'), 'utf8',
    );
    expect(servicio).toContain('motivoDelEstado');
    expect(servicio).toContain('porQueEseEstado');
  });

  it('respeta el MISMO orden de precedencia que el estado', () => {
    /* BAJA/STOCK → ORDEN → INCIDENCIA. Si el motivo mirase primero la
       incidencia, un equipo con orden abierta diría «lo retiene la incidencia»
       mientras el badge dice «En mantenimiento». Dos verdades. */
    /* SE BUSCA `.get(a.id)`, con el argumento, y no `.get` a secas.
       -----------------------------------------------------------------------
       La primera versión buscaba `porIncidencia.get` y encontraba la de ARRIBA
       —la que arma el mapa, `porIncidencia.get(i.assetId)`—, así que salía
       antes que la orden y la prueba fallaba señalando código correcto.

       Es la misma familia de fallo que las ventanas anchas del verificador 9 y
       de la prueba del bloque 82: un patrón más flojo de lo necesario acaba
       leyendo otra cosa. */
    const baja = MOTIVOS.indexOf("base === 'BAJA'");
    const orden = MOTIVOS.indexOf('porOrden.get(a.id)');
    const inc = MOTIVOS.indexOf('porIncidencia.get(a.id)');
    expect(orden).toBeGreaterThan(-1);
    expect(inc).toBeGreaterThan(-1);
    expect(baja).toBeGreaterThan(-1);
    expect(baja).toBeLessThan(orden);
    expect(orden).toBeLessThan(inc);
  });

  it('coge la MÁS ANTIGUA, no la más reciente', () => {
    /* Si un equipo arrastra dos órdenes abiertas, la vieja es la que lleva
       semanas falseando el estado y la que hay que cerrar.

       Se comprueban las DOS consultas, y con su campo propio: `WorkOrder`
       ordena por `createdAt` e `Incident` por `reportedAt` —no tiene
       `createdAt`, lo cazó el typecheck—. Un patrón que sólo mirase uno
       dejaría pasar que el otro se ponga en 'desc'. */
    expect(MOTIVOS).toMatch(/orderBy:\s*\{\s*createdAt:\s*'asc'\s*\}/);
    expect(MOTIVOS).toMatch(/orderBy:\s*\{\s*reportedAt:\s*'asc'\s*\}/);
  });

  it('entre incidencias gana la de MAYOR prioridad', () => {
    /* Con la primera a secas, un equipo con una avería crítica y una menor
       anterior explicaría su FUERA_SERVICIO citando la menor — el motivo
       diría lo contrario que el estado. */
    expect(MOTIVOS).toContain('HIGH_PRIORITY.includes(i.priority)');
    expect(MOTIVOS).toContain('!HIGH_PRIORITY.includes(previa.priority)');
  });

  it('devuelve el código y el id: sin ellos no se puede ir a cerrarla', () => {
    /* Decir «hay una orden abierta» deja al usuario en el mismo sitio. El
       código y el enlace son lo que convierte la frase en algo accionable. */
    expect(MOTIVOS).toMatch(/codigo:\s*om\.code/);
    expect(MOTIVOS).toMatch(/id:\s*om\.id/);
  });

  it('cuando no hay nada abierto también lo DICE', () => {
    /* El silencio se lee como «el sistema no sabe». Decir «nada lo retiene,
       este es el estado guardado» cierra la pregunta. */
    expect(MOTIVOS).toMatch(/Nada abierto lo retiene/);
  });

  it('el estado NO se ha cambiado: sigue derivándose igual', () => {
    /* La corrección era explicar, no aflojar el cálculo. Si alguien «arregla»
       esto haciendo que una orden abierta deje de fijar MANTENIMIENTO, el
       tablero volvería a decir que todo está operativo con trabajo en curso. */
    const calculo = funcion('async function computeEffectiveStatuses');
    expect(calculo).toContain("result[a.id] = 'MANTENIMIENTO'");
  });
});
