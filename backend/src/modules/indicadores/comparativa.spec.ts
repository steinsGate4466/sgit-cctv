import { comparar } from './calculo';

/* =============================================================================
   BLOQUE 84 · LA COMPARACIÓN CON EL PERIODO ANTERIOR
   -----------------------------------------------------------------------------
   Es lo que convierte «MTTR 4,2 h» en «MTTR 4,2 h, una hora mejor que el
   trimestre pasado». El primero no dice nada a quien lo lee por primera vez.

   Lo que se prueba aquí es EL SENTIDO, que es la parte que no se ve leyendo el
   código y la que, si se equivoca, hace que el tablero enseñe a leerlo al
   revés: pintar de verde una subida del MTTR sería celebrar que se tarda más
   en reparar.
============================================================================= */

describe('Bloque 84 — comparar con el periodo anterior', () => {
  describe('Cada indicador sabe hacia dónde es mejor', () => {
    it('el MTTR que BAJA es una buena noticia', () => {
      /* Se tarda menos en reparar. Un tablero que pinte de verde todo lo que
         sube diría lo contrario. */
      expect(comparar(4.2, 5.3, 'BAJAR_ES_MEJOR').veredicto).toBe('MEJOR');
      expect(comparar(5.3, 4.2, 'BAJAR_ES_MEJOR').veredicto).toBe('PEOR');
    });

    it('la disponibilidad que SUBE es una buena noticia', () => {
      expect(comparar(98, 95, 'SUBIR_ES_MEJOR').veredicto).toBe('MEJOR');
      expect(comparar(95, 98, 'SUBIR_ES_MEJOR').veredicto).toBe('PEOR');
    });

    it('EL MISMO MOVIMIENTO da veredictos opuestos según el indicador', () => {
      /* Ésta es LA prueba del bloque: si el sentido dejara de mirarse, las dos
         darían lo mismo y una de las dos estaría mintiendo. */
      const sube = { ahora: 10, antes: 5 };
      expect(comparar(sube.ahora, sube.antes, 'SUBIR_ES_MEJOR').veredicto).toBe('MEJOR');
      expect(comparar(sube.ahora, sube.antes, 'BAJAR_ES_MEJOR').veredicto).toBe('PEOR');
    });
  });

  describe('Sin dato antes, NO hay flecha', () => {
    /* Un mes sin órdenes daría «+100 %» contra cero, que es una cifra
       inventada. Es la regla de todo el módulo: sin datos, nunca un número. */
    it('falta el valor anterior', () => {
      const r = comparar(10, null, 'SUBIR_ES_MEJOR');
      expect(r.veredicto).toBe('SIN_COMPARACION');
      expect(r.delta).toBeNull();
      expect(r.deltaPct).toBeNull();
    });

    it('falta el valor de ahora', () => {
      expect(comparar(null, 10, 'SUBIR_ES_MEJOR').veredicto).toBe('SIN_COMPARACION');
    });

    it('faltan los dos', () => {
      expect(comparar(null, null, 'BAJAR_ES_MEJOR').veredicto).toBe('SIN_COMPARACION');
    });
  });

  describe('El ruido no es una noticia', () => {
    it('un cambio por debajo del margen es IGUAL, no MEJOR', () => {
      /* Un movimiento del 0,1 % no es una mejora: es ruido. Pintarlo con
         flecha haría que el tablero pareciera moverse todos los días sin que
         pase nada, y a la semana se deja de mirar. */
      expect(comparar(98.0, 98.05, 'SUBIR_ES_MEJOR').veredicto).toBe('IGUAL');
      expect(comparar(100, 100, 'SUBIR_ES_MEJOR').veredicto).toBe('IGUAL');
    });

    it('el margen es PROPORCIONAL, no de unidades fijas', () => {
      /* 0,1 sobre un MTTR de 2 h importa —es un 5 %—; 0,1 sobre un 99 % de
         disponibilidad no. Con un margen fijo, el mismo umbral valdría para
         las dos cosas y fallaría en una. */
      expect(comparar(2.1, 2.0, 'BAJAR_ES_MEJOR').veredicto).toBe('PEOR');
      expect(comparar(99.1, 99.0, 'SUBIR_ES_MEJOR').veredicto).toBe('IGUAL');
    });
  });

  describe('Las cuentas', () => {
    it('el delta y el porcentaje salen bien', () => {
      const r = comparar(4.2, 5.3, 'BAJAR_ES_MEJOR');
      expect(r.delta).toBeCloseTo(-1.1, 2);
      expect(r.deltaPct).toBeCloseTo(-20.8, 1);
      expect(r.ahora).toBe(4.2);
      expect(r.antes).toBe(5.3);
    });

    it('si antes era CERO no hay porcentaje, pero sí veredicto', () => {
      /* Dividir por cero daría Infinity, y un «+∞ %» en un tablero es una
         celda rota. El valor absoluto sigue sirviendo para decidir la flecha. */
      const r = comparar(5, 0, 'SUBIR_ES_MEJOR');
      expect(r.deltaPct).toBeNull();
      expect(r.delta).toBe(5);
      expect(r.veredicto).toBe('MEJOR');
    });

    it('un valor negativo no invierte el signo del porcentaje', () => {
      /* Se divide por el VALOR ABSOLUTO del anterior. Sin eso, ir de -10 a -5
         daría -50 % cuando en realidad ha subido. */
      const r = comparar(-5, -10, 'SUBIR_ES_MEJOR');
      expect(r.delta).toBe(5);
      expect(r.deltaPct).toBe(50);
      expect(r.veredicto).toBe('MEJOR');
    });
  });
});
