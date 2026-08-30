import {
  HOJAS_DE_ARRANQUE,
  PASOS_POR_DEFECTO,
  MAX_CARACTERES_DESCRIPCION,
} from './hojas-de-arranque';

/* =============================================================================
   BLOQUE 75 · LAS HOJAS DE RUTA CUMPLEN EL FORMATO DE SAP
   -----------------------------------------------------------------------------
   La prueba que de verdad importa es la de los 40 caracteres. El Excel del
   ingeniero lleva una columna que los cuenta, y no es decoración: **SAP corta
   ese campo en 40, y si uno se pasa la carga se rechaza ENTERA** — no la
   línea, la carga. Buscar cuál fue entre setenta líneas es media mañana.

   Aquí se caza al escribir el código, no al exportar.
============================================================================= */

describe('Bloque 75 — hojas de ruta de arranque', () => {
  it('están las cinco del ingeniero', () => {
    expect(HOJAS_DE_ARRANQUE).toHaveLength(5);
    const tipos = HOJAS_DE_ARRANQUE.map((h) => h.tipoEquipo).sort();
    expect(tipos).toEqual(['CABINET', 'CAMERA', 'PC', 'SWITCH', 'WIRELESS']);
  });

  it('NINGUNA descripción pasa de 40 caracteres', () => {
    /* Si esta prueba se cae, la carga a SAP se rechazaría entera. Se dice
       exactamente cuál y cuánto se pasa, porque buscarlo a mano entre setenta
       líneas es lo que hace que nadie quiera tocar el documento. */
    const largas: string[] = [];
    for (const h of HOJAS_DE_ARRANQUE) {
      if (h.descripcion.length > MAX_CARACTERES_DESCRIPCION) {
        largas.push(`[cabecera ${h.tipoEquipo}] ${h.descripcion.length}: ${h.descripcion}`);
      }
      for (const p of h.pasos) {
        if (p.texto.length > MAX_CARACTERES_DESCRIPCION) {
          largas.push(`[${h.tipoEquipo} ${p.op}/${p.sub}] ${p.texto.length}: ${p.texto}`);
        }
      }
    }
    expect(largas).toEqual([]);
  });

  it('cada hoja tiene UNA operación principal y el resto suboperaciones', () => {
    /* PM01 es el trabajo; PM04 son los pasos. Dos PM01 en una hoja significa
       que alguien metió dos trabajos en el mismo documento. */
    for (const h of HOJAS_DE_ARRANQUE) {
      const principales = h.pasos.filter((p) => p.clave === 'PM01');
      expect([h.tipoEquipo, principales.length]).toEqual([h.tipoEquipo, 1]);
      expect([h.tipoEquipo, principales[0].sub]).toEqual([h.tipoEquipo, null]);
    }
  });

  it('no hay dos pasos con el mismo número dentro de una hoja', () => {
    /* La base tiene un índice único por (hoja, operación, suboperación). Si
       aquí hubiera un repetido, la carga inicial reventaría en la máquina del
       usuario, que es donde peor se descubre. */
    for (const h of HOJAS_DE_ARRANQUE) {
      const claves = h.pasos.map((p) => `${p.op}-${p.sub}`);
      expect([h.tipoEquipo, claves.length]).toEqual([h.tipoEquipo, new Set(claves).size]);
    }
  });

  it('TODAS empiezan por seguridad', () => {
    /* El EPP y el bloqueo de energía no son un paso más: son la razón por la
       que un mantenimiento no acaba en el hospital. Que estén los primeros en
       las cinco no es casualidad, y esta prueba impide que deje de serlo. */
    for (const h of HOJAS_DE_ARRANQUE) {
      const primerPaso = h.pasos.find((p) => p.clave === 'PM04');
      expect([h.tipoEquipo, primerPaso?.texto]).toEqual([h.tipoEquipo, 'USO DE EPP OBLIGATORIO']);
    }
  });

  it('TODAS terminan documentando', () => {
    /* Un mantenimiento que no se documenta no se puede auditar, y para el
       indicador es como si no se hubiera hecho. */
    for (const h of HOJAS_DE_ARRANQUE) {
      const ultimo = h.pasos[h.pasos.length - 1];
      expect([h.tipoEquipo, /DOCUMENTAC/i.test(ultimo.texto)]).toEqual([h.tipoEquipo, true]);
    }
  });

  it('la cabecera es la misma en las cinco: 3 meses, 2 personas, 8 horas', () => {
    for (const h of HOJAS_DE_ARRANQUE) {
      expect([h.tipoEquipo, h.frecuencia]).toEqual([h.tipoEquipo, '3 MESES']);
      expect([h.tipoEquipo, h.frecuenciaDias]).toEqual([h.tipoEquipo, 90]);
      expect([h.tipoEquipo, h.numPersonas]).toEqual([h.tipoEquipo, 2]);
      expect([h.tipoEquipo, h.trabajoTotalH]).toEqual([h.tipoEquipo, 8]);
      expect([h.tipoEquipo, h.puestoTrabajo]).toEqual([h.tipoEquipo, 'LAM1ELECT1']);
      expect([h.tipoEquipo, h.centro]).toEqual([h.tipoEquipo, '2100']);
    }
  });

  it('una hoja nueva nace con la seguridad y la documentación puestas', () => {
    /* Quien crea una hoja para un equipo nuevo no tiene que acordarse del EPP
       ni del bloqueo — y sobre todo, no puede olvidarse. */
    expect(PASOS_POR_DEFECTO[0].texto).toBe('USO DE EPP OBLIGATORIO');
    expect(PASOS_POR_DEFECTO.some((p) => /LOTO/.test(p.texto))).toBe(true);
    expect(/DOCUMENTAC/i.test(PASOS_POR_DEFECTO[PASOS_POR_DEFECTO.length - 1].texto)).toBe(true);
    for (const p of PASOS_POR_DEFECTO) {
      expect(p.texto.length).toBeLessThanOrEqual(MAX_CARACTERES_DESCRIPCION);
    }
  });

  it('no hay fibra ni cable: un cable no es un activo (regla 1)', () => {
    /* No se le hace mantenimiento preventivo a un tramo de cable. Si alguien
       añade una hoja de ruta para FIBER, es que volvió a tratarlo como equipo. */
    const tipos = HOJAS_DE_ARRANQUE.map((h) => h.tipoEquipo);
    expect(tipos).not.toContain('FIBER');
  });
});
