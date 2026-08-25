import { HORA, OrdenParaCalculo, backlog, cumplimientoPreventivo, disponibilidad, mtbf, mttr, peoresEquipos, repartoDeTrabajo } from './calculo';

/**
 * INDICADORES DE MANTENIMIENTO
 *
 * Estos números se llevan a una reunión de gerencia y se toman decisiones de
 * presupuesto con ellos. Un indicador mal calculado es PEOR que no tenerlo:
 * no se nota, y se decide con él igual.
 *
 * Por eso cada `it` usa datos escritos a mano donde el resultado correcto se
 * sabe de antemano, y hay una prueba por cada decisión de diseño que se tomó.
 */

const h = (horas: number) => new Date(2026, 0, 1, 0, 0, 0, 0).getTime() + horas * HORA;
const fecha = (horas: number) => new Date(h(horas));

const om = (p: Partial<OrdenParaCalculo>): OrdenParaCalculo => ({
  id: Math.random().toString(36).slice(2),
  tipo: 'CORRECTIVO', estado: 'CERRADA',
  creada: fecha(0), cerrada: fecha(4),
  ...p,
});

describe('MTTR · cuánto tardamos en arreglar', () => {
  it('promedia las horas de las correctivas cerradas', () => {
    const r = mttr([
      om({ creada: fecha(0), cerrada: fecha(2) }),   // 2 h
      om({ creada: fecha(0), cerrada: fecha(6) }),   // 6 h
    ]);
    expect(r.horas).toBe(4);
    expect(r.muestra).toBe(2);
  });

  it('cuenta desde que se ABRE, no desde que llega el técnico', () => {
    // Una cámara tres días esperando repuesto son tres días sin ver, aunque
    // el trabajo dure media hora. Medir sólo la mano de obra da un número
    // bonito que no se parece a lo que sufre el púlpito.
    const r = mttr([om({ creada: fecha(0), cerrada: fecha(72) })]);
    expect(r.horas).toBe(72);
  });

  it('NO mete el preventivo: hundiría el número y cambiaría su significado', () => {
    // Una rutina programada para dentro de un mes «tarda» un mes. Si contara,
    // el MTTR dejaría de responder «cuánto tardamos en arreglar una avería».
    const r = mttr([
      om({ creada: fecha(0), cerrada: fecha(4) }),
      om({ tipo: 'PREVENTIVO', creada: fecha(0), cerrada: fecha(720) }),
    ]);
    expect(r.horas).toBe(4);
    expect(r.muestra).toBe(1);
  });

  it('sin ninguna cerrada devuelve null, no cero', () => {
    // Cero significaría «arreglamos al instante», que es lo contrario de
    // «no tenemos datos». Es la diferencia entre informar y mentir.
    expect(mttr([om({ cerrada: null, estado: 'ABIERTA' })]).horas).toBeNull();
    expect(mttr([]).horas).toBeNull();
  });

  it('descarta una orden cerrada ANTES de abrirse', () => {
    // Pasa cuando alguien corrige una fecha a mano. Daría un MTTR negativo.
    expect(mttr([om({ creada: fecha(10), cerrada: fecha(2) })]).horas).toBeNull();
  });
});

describe('MTBF · cuánto aguanta antes de volver a fallar', () => {
  it('reparte las horas del periodo entre los fallos', () => {
    expect(mtbf(4, 720)).toBe(180);
  });

  it('CON UN SOLO FALLO devuelve null', () => {
    // Con un fallo no hay intervalo ENTRE fallos: hay un fallo suelto.
    // Decir «aguanta 720 horas» a partir de eso es inventar un dato, y con
    // datos inventados se toman malas decisiones sin saberlo.
    expect(mtbf(1, 720)).toBeNull();
    expect(mtbf(0, 720)).toBeNull();
  });

  it('sin periodo no calcula', () => {
    expect(mtbf(5, 0)).toBeNull();
  });
});

describe('Disponibilidad', () => {
  it('el caso de manual', () => {
    // 180 h aguantando, 20 h reparando -> 90 %
    expect(disponibilidad(20, 180)).toBe(90);
  });

  it('si falta cualquiera de los dos, NO se inventa', () => {
    expect(disponibilidad(null, 180)).toBeNull();
    expect(disponibilidad(20, null)).toBeNull();
  });

  it('un equipo que nunca falla y nunca se repara no da 0 %', () => {
    expect(disponibilidad(0, 0)).toBeNull();
  });
});

describe('Cumplimiento del preventivo', () => {
  it('cerrada ANTES de la fecha cuenta; cerrada tarde NO', () => {
    // Una rutina hecha tres semanas tarde está hecha, pero no cumplió.
    // Contarla como cumplida convertiría esto en un contador de trabajo.
    const r = cumplimientoPreventivo([
      om({ tipo: 'PREVENTIVO', programada: fecha(100), cerrada: fecha(90) }),
      om({ tipo: 'PREVENTIVO', programada: fecha(100), cerrada: fecha(200) }),
    ]);
    expect(r.aTiempo).toBe(1);
    expect(r.tarde).toBe(1);
    expect(r.pct).toBe(50);
  });

  it('cuenta aparte las vencidas sin cerrar', () => {
    const r = cumplimientoPreventivo([
      om({ tipo: 'PREVENTIVO', programada: new Date(2020, 0, 1), cerrada: null, estado: 'ABIERTA' }),
    ]);
    expect(r.pendientesVencidas).toBe(1);
    expect(r.pct).toBeNull(); // ninguna cerrada todavía
  });

  it('ignora las preventivas sin fecha programada', () => {
    const r = cumplimientoPreventivo([om({ tipo: 'PREVENTIVO', programada: null, cerrada: fecha(5) })]);
    expect(r.pct).toBeNull();
  });
});

describe('Backlog · el trabajo que se acumula', () => {
  const ahora = fecha(0);
  const haceDias = (d: number) => new Date(ahora.getTime() - d * 24 * HORA);

  it('reparte por antigüedad', () => {
    const r = backlog([
      om({ cerrada: null, estado: 'ABIERTA', creada: haceDias(3) }),
      om({ cerrada: null, estado: 'ABIERTA', creada: haceDias(20) }),
      om({ cerrada: null, estado: 'EN_PROCESO', creada: haceDias(60) }),
      om({ cerrada: null, estado: 'ABIERTA', creada: haceDias(200) }),
    ], ahora);
    expect(r.total).toBe(4);
    expect(r.hasta7).toBe(1);
    expect(r.de8a30).toBe(1);
    expect(r.de31a90).toBe(1);
    expect(r.masDe90).toBe(1);
    expect(r.masAntiguaDias).toBe(200);
  });

  it('las CANCELADAS no son backlog', () => {
    // Una orden cancelada no es trabajo pendiente. Contarla infla el número
    // y esconde lo que de verdad está esperando.
    const r = backlog([om({ cerrada: null, estado: 'CANCELADA', creada: haceDias(50) })], ahora);
    expect(r.total).toBe(0);
  });

  it('sin nada abierto no revienta', () => {
    const r = backlog([], ahora);
    expect(r.total).toBe(0);
    expect(r.antiguedadMediaDias).toBe(0);
  });
});

describe('Peores equipos · la conversación de presupuesto', () => {
  it('ordena por número de fallos', () => {
    const r = peoresEquipos([
      om({ assetId: 'a', creada: fecha(0), cerrada: fecha(2) }),
      om({ assetId: 'a', creada: fecha(0), cerrada: fecha(4) }),
      om({ assetId: 'a', creada: fecha(0), cerrada: fecha(6) }),
      om({ assetId: 'b', creada: fecha(0), cerrada: fecha(10) }),
    ]);
    expect(r[0].assetId).toBe('a');
    expect(r[0].fallos).toBe(3);
    expect(r[0].mttrHoras).toBe(4); // (2+4+6)/3
  });

  it('una orden ABIERTA cuenta como fallo pero no baja el MTTR', () => {
    // Meterla como duración cero bajaría el MTTR justo de los equipos que
    // peor están, que es lo contrario de la realidad.
    const r = peoresEquipos([
      om({ assetId: 'a', creada: fecha(0), cerrada: fecha(8) }),
      om({ assetId: 'a', creada: fecha(0), cerrada: null, estado: 'ABIERTA' }),
    ]);
    expect(r[0].fallos).toBe(2);
    expect(r[0].mttrHoras).toBe(8);
  });

  it('no cuenta el preventivo como fallo', () => {
    const r = peoresEquipos([om({ assetId: 'a', tipo: 'PREVENTIVO' })]);
    expect(r).toEqual([]);
  });

  it('ignora las órdenes sin equipo (mapeo, zona)', () => {
    expect(peoresEquipos([om({ assetId: null })])).toEqual([]);
  });
});

/* =============================================================================
   EL REPARTO CORRECTIVO / PREVENTIVO / PREDICTIVO — bloque 65
   -----------------------------------------------------------------------------
   Es el indicador que el ingeniero dibujó en el centro de su hoja, así que se
   prueba con el mismo cuidado que el MTTR: es el número que va a mirar una
   jefatura para decidir si el mantenimiento está mejorando.
============================================================================= */
describe('reparto correctivo / preventivo / predictivo', () => {
  const om = (tipo: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${tipo}-${i}`, tipo, estado: 'CERRADA', assetId: 'a1',
      creada: new Date('2026-08-01'), cerrada: new Date('2026-08-02'),
      programada: new Date('2026-08-01'),
    }));

  it('reparte en porcentaje sobre las TRES estrategias', () => {
    const r = repartoDeTrabajo([...om('CORRECTIVO', 4), ...om('PREVENTIVO', 3), ...om('PREDICTIVO', 3)]);
    expect(r.base).toBe(10);
    expect(r.pct).toEqual({ correctivo: 40, preventivo: 30, predictivo: 30 });
  });

  it('MEJORA y MAPEO se cuentan aparte y NO entran en el porcentaje', () => {
    /* Si entraran, el lado «bueno» del quesito se inflaría con trabajo que no
       previene ninguna avería. Un indicador que se puede mejorar registrando
       mapeo deja de medir mantenimiento. */
    const r = repartoDeTrabajo([...om('CORRECTIVO', 5), ...om('MEJORA', 20), ...om('MAPEO', 30)]);
    expect(r.base).toBe(5);
    expect(r.pct).toEqual({ correctivo: 100, preventivo: 0, predictivo: 0 });
    expect(r.otros).toEqual({ mejora: 20, mapeo: 30 });
  });

  it('SIN ÓRDENES devuelve null, nunca «0 % correctivo»', () => {
    /* Un cero se lee como un logro. La regla de la casa: sin datos, nunca cero. */
    const r = repartoDeTrabajo([]);
    expect(r.pct).toBeNull();
    expect(r.lectura).toContain('Sin órdenes');
  });

  it('avisa cuando se están apagando incendios', () => {
    const r = repartoDeTrabajo([...om('CORRECTIVO', 8), ...om('PREVENTIVO', 2)]);
    expect(r.lectura).toContain('correctivo');
    expect(r.lectura).toContain('incendios');
  });

  it('reconoce el mantenimiento planificado', () => {
    const r = repartoDeTrabajo([...om('CORRECTIVO', 1), ...om('PREVENTIVO', 7), ...om('PREDICTIVO', 2)]);
    expect(r.pct!.preventivo + r.pct!.predictivo).toBeGreaterThanOrEqual(70);
    expect(r.lectura).toContain('planificado');
  });
});
