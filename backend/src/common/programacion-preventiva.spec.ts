import {
  PlanParaProgramar, VentanaParaProgramar, actividadDeLaOrden,
  intervaloQueManda, numeroDeTren, programar, proximaVentana,
} from './programacion-preventiva';

/* =============================================================================
   BLOQUE 78 · LA PROGRAMACIÓN DEL PREVENTIVO — paso ③ del ingeniero
   -----------------------------------------------------------------------------
   Lo que se prueba aquí es DECIDIR LA FECHA, que es la parte que no se ve
   leyendo el código: hoy vence, la zona exige parada, hay ventana el jueves →
   se programa el jueves.

   Sin esto, el generador programaba todo «para hoy» y una orden de una zona
   que exige tren parado nacía imposible: vencía, entraba en el backlog, hundía
   el cumplimiento, y nadie podía haberla hecho.
============================================================================= */

const dia = (d: number, hora = 8) => new Date(2026, 8, d, hora, 0, 0);
const AHORA = dia(10);

const plan = (o: Partial<PlanParaProgramar> = {}): PlanParaProgramar => ({
  assetId: 'cam-1',
  assetCode: 'AA-CAM-T1-014',
  tipoEquipo: 'CAMERA',
  trenCode: 'T1',
  vencePlan: dia(10),
  diasDelPlan: 90,
  diasPorLetra: null,
  diasPorAmbiente: 60,
  intervencionAplica: 'EN_MARCHA',
  ...o,
});

const ventana = (o: Partial<VentanaParaProgramar> = {}): VentanaParaProgramar => ({
  id: 'v1', tren: 'TREN_1', estado: 'ANUNCIADA', inicioPrevisto: dia(14), ...o,
});

describe('Bloque 78 — programación del preventivo', () => {
  describe('El intervalo: manda el que MÁS exige', () => {
    it('gana el menor de las tres fuentes', () => {
      /* Ninguna de las tres razones es descartable: la letra sale del método,
         el ambiente del calor real, y el plan lo escribió el ingeniero.
         Promediarlas daría un número que no defiende nadie. */
      expect(intervaloQueManda(plan({ diasDelPlan: 90, diasPorAmbiente: 60, diasPorLetra: 30 })))
        .toEqual({ dias: 30, manda: 'LETRA' });
      expect(intervaloQueManda(plan({ diasDelPlan: 90, diasPorAmbiente: 30, diasPorLetra: 60 })))
        .toEqual({ dias: 30, manda: 'AMBIENTE' });
      expect(intervaloQueManda(plan({ diasDelPlan: 15, diasPorAmbiente: 60, diasPorLetra: 30 })))
        .toEqual({ dias: 15, manda: 'PLAN' });
    });

    it('sin letra manda lo que había: el módulo arranca sin clasificar nada', () => {
      expect(intervaloQueManda(plan({ diasPorLetra: null })).dias).toBe(60);
    });

    it('en empate gana la LETRA, que es el criterio que se puede explicar', () => {
      /* Se pinta en pantalla «manda la letra A». Decir «manda el plan» cuando
         la letra pedía lo mismo escondería el criterio bueno. */
      expect(intervaloQueManda(plan({ diasDelPlan: 30, diasPorAmbiente: 30, diasPorLetra: 30 })).manda)
        .toBe('LETRA');
    });

    it('un intervalo de cero o negativo no se usa: generaría una orden por segundo', () => {
      const r = intervaloQueManda(plan({ diasDelPlan: 0, diasPorAmbiente: 60, diasPorLetra: -5 }));
      expect(r.dias).toBe(60);
    });
  });

  describe('La ventana de parada', () => {
    it('se elige la más próxima de ese tren', () => {
      const v = proximaVentana('T1', [
        ventana({ id: 'lejos', inicioPrevisto: dia(25) }),
        ventana({ id: 'cerca', inicioPrevisto: dia(12) }),
      ], AHORA);
      expect(v?.id).toBe('cerca');
    });

    it('una CONFIRMADA lejana no gana a una ANUNCIADA cercana', () => {
      /* La hora de las paradas se mueve constantemente en esta planta
         (bloque 16). Esperar a la «segura» significa no hacer el trabajo. */
      const v = proximaVentana('T1', [
        ventana({ id: 'segura', estado: 'CONFIRMADA', inicioPrevisto: dia(30) }),
        ventana({ id: 'pronto', estado: 'ANUNCIADA', inicioPrevisto: dia(12) }),
      ], AHORA);
      expect(v?.id).toBe('pronto');
    });

    it('las que ya empezaron o terminaron no valen', () => {
      for (const estado of ['EN_CURSO', 'TERMINADA', 'CANCELADA']) {
        expect(proximaVentana('T1', [ventana({ estado })], AHORA)).toBeNull();
      }
    });

    it('las de OTRO tren no valen', () => {
      expect(proximaVentana('AASA-PISCO-T2', [ventana({ tren: 'TREN_1' })], AHORA)).toBeNull();
    });

    it('casa el tren aunque las dos partes lo escriban distinto', () => {
      /* ESTE ES EL FALLO QUE SE ESCAPÓ AL ESCRIBIRLO: la ventana guarda el
         enum `TREN_1` y el árbol de planta da `AASA-PISCO-T1`. Comparar por
         texto —`'TREN_1'.includes('T1')`— es FALSO, así que ninguna orden
         encontraba su ventana.

         Y no rompía nada: todas salían «esperando parada», que es un
         resultado plausible. Ése es el tipo de fallo que se queda meses. */
      expect(numeroDeTren('TREN_1')).toBe(1);
      expect(numeroDeTren('AASA-PISCO-T1')).toBe(1);
      expect(numeroDeTren('T1')).toBe(1);
      expect(numeroDeTren(null)).toBeNull();
      expect(numeroDeTren('OFICINAS')).toBeNull();
      expect(proximaVentana('AASA-PISCO-T1', [ventana({ tren: 'TREN_1' })], AHORA)?.id).toBe('v1');
    });

    it('un activo sin tren no puede esperar ninguna ventana', () => {
      expect(proximaVentana(null, [ventana()], AHORA)).toBeNull();
    });
  });

  describe('Programar de verdad', () => {
    it('lo que se puede hacer en marcha se programa para su fecha', () => {
      const r = programar(plan({ intervencionAplica: 'EN_MARCHA' }), [ventana()], AHORA);
      expect(r.fecha).toEqual(dia(10));
      expect(r.ventanaId).toBeNull();
      expect(r.esperandoVentana).toBe(false);
    });

    it('lo que exige tren parado se programa PARA LA VENTANA', () => {
      const r = programar(plan({ intervencionAplica: 'EXIGE_PARADA' }), [ventana()], AHORA);
      expect(r.fecha).toEqual(dia(14));
      expect(r.ventanaId).toBe('v1');
    });

    it('si exige parada y NO hay ventana, se genera igual y se avisa', () => {
      /* Dejarla sin generar la sacaría del backlog y del indicador: un trabajo
         que nadie puede hacer tampoco lo vería nadie. Que se vea vencida es la
         señal de que hay que pedir la parada. */
      const r = programar(plan({ intervencionAplica: 'EXIGE_PARADA' }), [], AHORA);
      expect(r.esperandoVentana).toBe(true);
      expect(r.porque.join(' ')).toMatch(/no hay ninguna ventana/i);
    });

    it('un equipo SIN intervención firmada espera ventana: falla al lado seguro', () => {
      /* Sin firma vale EXIGE_PARADA (bloque 28). La propuesta sugiere; sólo la
         firma autoriza. */
      const r = programar(plan({ intervencionAplica: 'EXIGE_PARADA', trenCode: 'T1' }), [ventana()], AHORA);
      expect(r.ventanaId).toBe('v1');
    });

    it('lo VENCIDO conserva su fecha original, no se reprograma para hoy', () => {
      /* Si un preventivo lleva tres semanas vencido y se programa para hoy, el
         cumplimiento diría que va a tiempo. La deuda se ve o no se paga. */
      const r = programar(plan({ vencePlan: dia(1) }), [], AHORA);
      expect(r.fecha).toEqual(dia(1));
      expect(r.porque.join(' ')).toMatch(/venció hace 9 día/i);
    });

    it('el porqué explica qué manda la frecuencia', () => {
      const r = programar(plan({ diasPorLetra: 30 }), [], AHORA);
      expect(r.cadaDias).toBe(30);
      expect(r.porque[0]).toMatch(/cada 30 días.*criticidad A\/B\/C/i);
    });
  });

  describe('La orden nace con sus pasos', () => {
    const pasos = [
      { op: 20, sub: 10, texto: 'LIMPIEZA DE DOMO' },
      { op: 10, sub: null, texto: 'MANTENIMIENTO PREVENTIVO DE CAMARA' },
      { op: 20, sub: 5, texto: 'USO DE EPP OBLIGATORIO' },
    ];

    it('los pasos van EN ORDEN dentro de la actividad', () => {
      const t = actividadDeLaOrden(programar(plan(), [], AHORA), pasos);
      expect(t.indexOf('EPP')).toBeLessThan(t.indexOf('LIMPIEZA'));
      expect(t.indexOf('MANTENIMIENTO PREVENTIVO')).toBeLessThan(t.indexOf('EPP'));
    });

    it('sin hoja de ruta se DICE, no se deja en blanco', () => {
      /* Una actividad vacía parece un fallo del sistema; «no hay hoja todavía»
         es una tarea para el Jefe de Mantenimiento. */
      const t = actividadDeLaOrden(programar(plan(), [], AHORA), []);
      expect(t).toMatch(/no hay hoja de ruta/i);
    });

    it('la actividad lleva el código del equipo y el porqué de la frecuencia', () => {
      const t = actividadDeLaOrden(programar(plan({ diasPorLetra: 30 }), [], AHORA), pasos);
      expect(t).toContain('AA-CAM-T1-014');
      expect(t).toMatch(/cada 30 días/);
    });
  });
});
