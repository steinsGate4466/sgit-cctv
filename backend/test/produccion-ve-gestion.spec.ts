import * as fs from 'fs';
import * as path from 'path';

/* =============================================================================
   BLOQUE 83 · PRODUCCIÓN VUELVE A VER SU PARTE DE GESTIÓN
   -----------------------------------------------------------------------------
   DE DÓNDE SALE, textual del usuario:

       «Con el apartado de Producción ellos SÍ deben ver cierta parte de
        gestión para poder enviar las OM o incidencias.»

   Y tenía razón contra el código. El bloque 80 cerró la gestión con `wo.read`
   para sacar a Producción de los indicadores del ingeniero —eso estaba bien— y
   de paso se llevó por delante la lista de órdenes y las ventanas de parada.

   Consecuencia real: el Jefe de Tren podía ABRIR una orden (`wo.create`) y no
   podía ver NINGUNA. Pedir un trabajo y no poder comprobar jamás si alguien lo
   cogió es exactamente cómo se deja de usar un sistema y se vuelve a la radio.

   -----------------------------------------------------------------------------
   POR QUÉ ESTA PRUEBA LEE EL CÓDIGO

   Lo que hay que fijar no es el resultado de una llamada: es que el REPARTO
   siga escrito. El fallo típico aquí no es equivocarse de permiso, es que
   alguien vuelva a cerrar en bloque «para limpiar» sin saber qué deja muerto.

   Es la tercera vez que pasa lo mismo en este proyecto —el QR del bloque 68 y
   el QR imprimible del 77—, y las tres veces el patrón fue idéntico:
   cerrar un permiso sin preguntarse QUÉ DEJA DE FUNCIONAR.
============================================================================= */

const raiz = path.join(__dirname, '..', 'src');
const leer = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

const OM = sinComentarios(leer(path.join('modules', 'maintenance', 'maintenance.controller.ts')));
const PARADAS = sinComentarios(leer(path.join('modules', 'paradas', 'paradas.controller.ts')));
const CATALOGO = leer(path.join('modules', 'roles', 'catalogo-permisos.ts'));

/**
 * Acota al decorador de UNA ruta: desde el ancla hasta la llave del cuerpo del
 * método.
 *
 * NO se usa una ventana de N caracteres. Es el fallo que ya apareció tres
 * veces en este proyecto —verificador 9, el de etiquetas y la propia prueba
 * del bloque 82—: la ventana se come la ruta SIGUIENTE y la prueba acaba
 * señalando código que no es el suyo.
 */
function rutaDe(fuente: string, ancla: string): string {
  const i = fuente.indexOf(ancla);
  if (i < 0) return '';
  const fin = fuente.indexOf('{', fuente.indexOf('(', i + ancla.length));
  return fuente.slice(i, fin > i ? fin : i + 200);
}

describe('Bloque 83 — Producción y la gestión', () => {
  describe('Las órdenes se pueden LEER con `om.mirar`', () => {
    it('la lista', () => {
      /* Sin esto, quien abre una orden no puede verla nunca. */
      expect(rutaDe(OM, '@Get()')).toContain("@RequireAlguno('wo.read', 'om.mirar')");
    });

    it('la ficha de una orden', () => {
      /* Dar la lista sin poder pulsar una fila deja una pantalla que PARECE
         que funciona. Media puerta es peor que ninguna (bloque 77). */
      expect(rutaDe(OM, "@Get(':id')")).toContain("@RequireAlguno('wo.read', 'om.mirar')");
    });

    it('el historial de avance', () => {
      /* Es LA respuesta a «pedí el trabajo, ¿en qué va?». */
      expect(rutaDe(OM, "@Get(':id/progress')")).toContain("@RequireAlguno('wo.read', 'om.mirar')");
    });
  });

  describe('Las CUATRO lecturas de paradas, no tres', () => {
    /* La pantalla llama a las cuatro. Abrir tres deja un bloque en blanco que
       parece un fallo del software. */
    for (const ancla of ["@Get('proximas')", "@Get('fiabilidad')", '@Get()', "@Get(':id')"]) {
      it(`${ancla} acepta \`om.mirar\``, () => {
        expect(rutaDe(PARADAS, ancla)).toContain("@RequireAlguno('wo.read', 'om.mirar')");
      });
    }
  });

  describe('ESCRIBIR no se ha movido — y esto es lo que de verdad hay que fijar', () => {
    it('cerrar una orden sigue siendo `wo.approve`', () => {
      /* ABRIR NO ES CERRAR (bloque 68). Una orden de más se ve en la lista y
         se anula; una CERRADA de más lleva firma y materiales retirados:
         afirma que un trabajo se hizo. */
      expect(rutaDe(OM, "@Post(':id/close')") || OM).toContain("@RequirePermissions('wo.approve')");
    });

    it('apuntar, mover y cambiar el estado de una parada siguen en `wo.update`', () => {
      for (const ancla of ['@Post()', "@Patch(':id/mover')", "@Patch(':id/estado')"]) {
        expect(rutaDe(PARADAS, ancla)).toContain("@RequirePermissions('wo.update')");
      }
    });

    it('modificar una orden sigue en `wo.update`', () => {
      expect(rutaDe(OM, "@Patch(':id')")).toContain("@RequirePermissions('wo.update')");
    });
  });

  describe('Se reparte por CAPACIDAD, no por nombre de rol', () => {
    it('`om.mirar` es lo que llevan los dos cargos del tren', () => {
      /* Si esto deja de ser cierto, el bloque entero deja de tener sentido y
         hay que volver a pensarlo — no ensanchar el permiso en silencio. */
      const jefeTren = CATALOGO.slice(CATALOGO.indexOf("nombre: 'Jefe de Tren'"));
      const jefeLinea = CATALOGO.slice(CATALOGO.indexOf("nombre: 'Jefe de línea (Producción)'"));
      expect(jefeTren.slice(0, 1200)).toContain("'om.mirar'");
      expect(jefeLinea.slice(0, 1200)).toContain("'om.mirar'");
    });

    it('ninguno de los dos gana `wo.read`: los indicadores siguen cerrados', () => {
      /* Es la decisión del bloque 80 y NO se deshace: `wo.read` abre el
         Dashboard del ingeniero, los Indicadores y Exportar. Lo que se
         reabre es la lista de órdenes, que es otra cosa. */
      const jefeTren = CATALOGO.slice(
        CATALOGO.indexOf("nombre: 'Jefe de Tren'"),
        CATALOGO.indexOf("nombre: 'Jefe de línea (Producción)'"),
      );
      expect(jefeTren).not.toContain("'wo.read'");
    });

    it('el Operador de Púlpito NO gana la lista de órdenes', () => {
      /* Su perfil es el más estrecho a propósito: mira un monitor y avisa.
         Cada pantalla de más es un segundo más buscando el botón de avisar. */
      const pulpito = CATALOGO.slice(
        CATALOGO.indexOf("nombre: 'Operador de Púlpito'"),
        CATALOGO.indexOf("nombre: 'Jefe de Tren'"),
      );
      expect(pulpito).not.toContain("'om.mirar'");
      expect(pulpito).not.toContain("'wo.read'");
    });
  });
});
