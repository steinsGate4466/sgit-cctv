import * as fs from 'fs';
import * as path from 'path';
import {
  AcuerdoSla, IncidenciaMedible, SLA_PROPUESTO,
  cumplimientoPorPrioridad, enRiesgo, motivoParaNoGuardarSla,
} from '../src/common/nivel-de-servicio-sla';

/* =============================================================================
   BLOQUE 98 · SATISFACCIÓN DEL SERVICIO
   -----------------------------------------------------------------------------
   Lo pidió el usuario. Y satisfacción NO es una encuesta: es promesas
   cumplidas. Sin promesa declarada no hay incumplimiento que medir, así que lo
   primero es el acuerdo de plazos por prioridad.
============================================================================= */

const leer = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const H = 3_600_000;
const base = new Date('2026-09-01T08:00:00Z');
const inci = (o: Partial<IncidenciaMedible>): IncidenciaMedible => ({
  id: 'i', code: 'INC-1', priority: 'CRITICA',
  reportedAt: base, atendidaEn: null, resolvedAt: null, ...o,
});

describe('El cumplimiento contra el plazo prometido', () => {
  it('cuenta en plazo lo que se resolvió dentro, y fuera lo que no', () => {
    const c = cumplimientoPorPrioridad([
      inci({ resolvedAt: new Date(base.getTime() + 2 * H) }),          // CRITICA: 8 h
      inci({ resolvedAt: new Date(base.getTime() + 20 * H) }),         // se pasó
    ], SLA_PROPUESTO);
    const critica = c.find((x) => x.prioridad === 'CRITICA')!;
    expect(critica.enPlazo).toBe(1);
    expect(critica.fueraDePlazo).toBe(1);
    expect(critica.pct).toBe(50);
  });

  it('sin ninguna resuelta devuelve `null`, NUNCA un 0 %', () => {
    /* Un 0 % en una prioridad sin incidencias diría que se falló en todas — y
       no se falló en ninguna porque no hubo. Es la peor mentira posible en un
       tablero que va a un comité. */
    const c = cumplimientoPorPrioridad([], SLA_PROPUESTO);
    expect(c.every((x) => x.pct === null)).toBe(true);
  });

  it('las que siguen vivas NO cuentan como incumplidas', () => {
    /* Meterlas castigaría dos veces a la que lleva una hora abierta dentro de
       su plazo. Salen en su propio bloque, `enRiesgo`. */
    const c = cumplimientoPorPrioridad([inci({}), inci({})], SLA_PROPUESTO);
    const critica = c.find((x) => x.prioridad === 'CRITICA')!;
    expect(critica.total).toBe(2);
    expect(critica.resueltas).toBe(0);
    expect(critica.pct).toBeNull();
  });
});

describe('Las que siguen abiertas', () => {
  const ahora = new Date(base.getTime() + 30 * H);

  it('marca vencida la que se pasó de su plazo', () => {
    const r = enRiesgo([inci({ code: 'INC-9' })], SLA_PROPUESTO, ahora);
    expect(r[0].vencida).toBe(true);          // CRÍTICA a las 30 h, plazo 8
    expect(r[0].horasAbierta).toBe(30);
  });

  it('marca «sin atender» la que no tiene ninguna orden', () => {
    const r = enRiesgo([inci({ atendidaEn: null })], SLA_PROPUESTO, ahora);
    expect(r[0].sinAtender).toBe(true);
  });

  it('ordena por lo PEOR, no por fecha', () => {
    /* Ordenar por fecha dejaría una crítica de hoy debajo de una baja de hace
       un mes, que es justo al revés de lo que hay que mirar primero. */
    const r = enRiesgo([
      inci({ id: 'a', code: 'BAJA-VIEJA', priority: 'BAJA', reportedAt: new Date(base.getTime() - 400 * H), atendidaEn: base }),
      inci({ id: 'b', code: 'CRIT-HOY', priority: 'CRITICA', reportedAt: new Date(ahora.getTime() - 20 * H), atendidaEn: base }),
    ], SLA_PROPUESTO, ahora);
    expect(r[0].code).toBe('BAJA-VIEJA');     // vencida y más antigua
    expect(r.map((x) => x.vencida)).toEqual([true, true]);
  });
});

describe('El acuerdo que se guarda', () => {
  const ok: AcuerdoSla = {
    CRITICA: { respuestaH: 1, restitucionH: 8 },
    ALTA: { respuestaH: 4, restitucionH: 24 },
    MEDIA: { respuestaH: 8, restitucionH: 72 },
    BAJA: { respuestaH: 24, restitucionH: 168 },
  };

  it('acepta un acuerdo coherente', () => {
    expect(motivoParaNoGuardarSla(ok)).toBeNull();
  });

  it('restituir NO puede ser antes que responder', () => {
    /* El servicio no vuelve antes de que alguien lo mire. Un acuerdo así no se
       puede cumplir nunca, y un objetivo imposible se deja de mirar. */
    const m = motivoParaNoGuardarSla({ ...ok, ALTA: { respuestaH: 24, restitucionH: 4 } });
    expect(m).toContain('no puede ser antes');
  });

  it('lo más CRÍTICO no puede tener el plazo más largo', () => {
    /* Diría que lo crítico corre menos prisa, y entonces el reparto de
       prioridades deja de significar nada. */
    const m = motivoParaNoGuardarSla({ ...ok, CRITICA: { respuestaH: 1, restitucionH: 999 } });
    expect(m).toContain('menos prisa');
  });

  it('rechaza plazos vacíos o negativos', () => {
    expect(motivoParaNoGuardarSla({ ...ok, MEDIA: undefined as any })).toContain('Falta el plazo');
    expect(motivoParaNoGuardarSla({ ...ok, MEDIA: { respuestaH: 0, restitucionH: 72 } }))
      .toContain('mayores que cero');
  });
});

describe('Cómo queda montado', () => {
  it('la migración NO inserta ninguna fila: una propuesta no es un acuerdo', () => {
    const sql = leer('prisma/migrations/20260915000000_acuerdo_de_servicio/migration.sql');
    expect(sql).toContain('CREATE TABLE "acuerdo_servicio"');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"acuerdo_servicio"/i);
  });

  it('el índice lleva el nombre EXACTO que generaría Prisma', () => {
    /* Abreviarlo hace que `migrate dev` lo cree otra vez: dos índices iguales
       sobre la misma columna, y cada escritura paga los dos (bloque 16.3). */
    const sql = leer('prisma/migrations/20260915000000_acuerdo_de_servicio/migration.sql');
    expect(sql).toContain('CREATE INDEX "acuerdo_servicio_fijadoPorId_idx"');
  });

  it('lo MIRA quien ve indicadores; lo FIJA sólo el Jefe', () => {
    /* No lo decide la dificultad —son ocho números— sino lo que la acción
       AFIRMA: es el criterio contra el que se juzga al área entera. */
    const c = leer('src/modules/indicadores/indicadores.controller.ts');
    const get = c.slice(c.indexOf("@Get('satisfaccion')"), c.indexOf("@Put('sla')"));
    const put = c.slice(c.indexOf("@Put('sla')"));
    expect(get).toContain("@RequirePermissions('dashboard.read')");
    expect(put).toContain("@RequirePermissions('wo.approve')");
    expect(put).not.toContain("@RequirePermissions('wo.update')");
  });

  it('LO RESUELTO va antes que la deuda en la respuesta', () => {
    /* Un tablero que sólo enseña deuda se deja de mirar en dos semanas.
       Se fija el ORDEN, no sólo que los dos existan. */
    const svc = leer('src/modules/indicadores/indicadores.service.ts');
    const m = svc.slice(svc.indexOf('async satisfaccion'));
    expect(m.indexOf('resueltas:')).toBeLessThan(m.indexOf('enRiesgo:'));
  });

  it('la primera atención sale de la primera ORDEN, no de un campo nuevo', () => {
    /* Un campo que alguien tenga que acordarse de marcar no se marca, y el
       indicador queda con huecos y con pinta de estar completo (bloque 78). */
    const svc = leer('src/modules/indicadores/indicadores.service.ts');
    expect(svc).toContain("workOrders: { select: { createdAt: true }, orderBy: { createdAt: 'asc' }, take: 1 }");
  });
});
