// Prueba UNITARIA: no depende del cliente Prisma generado.
jest.mock('@prisma/client', () => ({ PrismaClient: class {}, Prisma: {} }));
// argon2 se sustituye: la firma es válida cuando la contraseña es 'correcta'.
jest.mock('argon2', () => ({
  verify: jest.fn(async (_hash: string, pass: string) => pass === 'correcta'),
}));

import { MaintenanceService } from '../src/modules/maintenance/maintenance.service';

/**
 * Camino crítico del Bloque 1: la ejecución de la OM en campo.
 * Es el único registro escrito de lo que pasó en planta; si acepta datos
 * imposibles, el análisis posterior de reincidencia no vale nada.
 */
describe('MaintenanceService — ejecución de OM en campo', () => {
  const USUARIO = (rol: string, id = 'u1') => ({
    id, email: 'tec@aa.local', active: true,
    passwordHash: 'hash', role: { name: rol },
  });

  function build(over: any = {}) {
    /* ESTADO VIVO DE LA ORDEN.
       -----------------------------------------------------------------------
       Bloque 37: el servicio dejó de escribir con `update` y pasó a
       `updateMany` con el estado en el `where`. Eso lo cambia todo aquí: el
       doble ya no puede devolver un objeto fijo, porque LA PRUEBA depende de
       si la fila cumplía o no la condición.

       Este objeto es la «fila» de la base. `updateMany` la mira, decide si la
       toca, y devuelve cuántas cambió — igual que PostgreSQL. Con eso se puede
       probar de verdad la carrera: basta con cambiar `filaViva.status` entre
       medias para simular que otro cerró la orden. */
    const filaViva: any = { id: 'w1', ...(over.wo || {}) };

    const prisma: any = {
      workOrder: {
        /* Devuelve la fila VIVA, no la foto inicial. Es lo que hace una base
           de datos de verdad, y es justo lo que hace falta para que el
           mensaje de conflicto pueda decir en qué estado quedó la orden.
           Con la foto, `escribirSiSigueEn` releía y encontraba el estado
           viejo — y el aviso al técnico habría sido incorrecto. */
        findUnique: jest.fn().mockImplementation(() =>
          (over.wo ? { ...filaViva } : null)),
        findUniqueOrThrow: jest.fn().mockImplementation(() => ({ ...filaViva })),
        findFirst: jest.fn().mockResolvedValue(over.ultimaOm ?? null),
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'w1', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => {
          Object.assign(filaViva, data);
          return { ...filaViva };
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
          const permitidos = where?.status?.in;
          if (permitidos && !permitidos.includes(filaViva.status)) return { count: 0 };
          Object.assign(filaViva, data);
          return { count: 1 };
        }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(over.usuario ?? USUARIO('Técnico de Red')) },
      workOrderProgress: {
        create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'p1', ...data })),
        findMany: jest.fn().mockResolvedValue(over.avances ?? []),
      },
      /* `$transaction` recibe DOS formas: un arreglo de promesas ya
         construidas, o una función que recibe el cliente transaccional. El
         bloque 37 introdujo la segunda —hace falta para poder abortar a mitad
         cuando otro se adelantó—, así que el doble tiene que servir las dos. */
      $transaction: jest.fn((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
    };
    // Se expone para que las pruebas de carrera puedan moverla.
    prisma.__fila = filaViva;
    const audit = { record: jest.fn().mockResolvedValue(null) };
    const preventive = { markServiced: jest.fn().mockResolvedValue(null) };
    // Bandeja de salida de avisos (4F). Se puede hacer que FALLE a propósito
    // con `over.avisosRotos`, para comprobar lo que promete el bloque: que un
    // aviso caído no impide cerrar una orden.
    const avisos = {
      encolar: jest.fn().mockImplementation(() =>
        over.avisosRotos ? Promise.reject(new Error('Telegram caído')) : Promise.resolve(1),
      ),
      destinatarios: jest.fn().mockResolvedValue([{ telegramChatId: '123' }]),
    };
    const svc = new MaintenanceService(
      prisma, audit as any, {} as any, preventive as any, avisos as any,
    );
    return { svc, prisma, audit, avisos };
  }

  // --------------------------------------------------- correlativo por año
  describe('correlativo del código', () => {
    it('parte de 0001 cuando no hay órdenes del año', async () => {
      const { svc, prisma } = build({ ultimaOm: null });
      await svc.create({ type: 'MAPEO', locationId: 'loc1' } as any);
      const code = prisma.workOrder.create.mock.calls[0][0].data.code;
      expect(code).toMatch(/^OM-\d{4}-0001$/);
    });

    it('toma el MAYOR correlativo del año, no la cantidad de órdenes', async () => {
      // Defecto anterior: contaba todas las órdenes de la historia. Si había 50
      // de años previos, la primera de este año salía 0051 y podía chocar.
      const year = new Date().getFullYear();
      const { svc, prisma } = build({ ultimaOm: { code: `OM-${year}-0042` } });
      await svc.create({ type: 'CORRECTIVO', assetId: 'a1' } as any);
      expect(prisma.workOrder.create.mock.calls[0][0].data.code).toBe(`OM-${year}-0043`);
    });

    it('respeta el código manual si lo envían (viene de SAP)', async () => {
      const { svc, prisma } = build();
      await svc.create({ type: 'CORRECTIVO', assetId: 'a1', code: 'OM-SAP-999' } as any);
      expect(prisma.workOrder.create.mock.calls[0][0].data.code).toBe('OM-SAP-999');
    });
  });

  // ------------------------------------------------------------ alta de OM
  describe('alta', () => {
    it('rechaza una orden sin activo ni ubicación', async () => {
      const { svc } = build();
      // Sin ninguno de los dos, el técnico no sabe a dónde ir.
      await expect(svc.create({ type: 'CORRECTIVO' } as any)).rejects.toThrow(/activo o la ubicación/i);
    });

    it('acepta una orden de MAPEO con solo ubicación', async () => {
      const { svc, prisma } = build();
      await svc.create({ type: 'MAPEO', locationId: 'loc1' } as any);
      const data = prisma.workOrder.create.mock.calls[0][0].data;
      expect(data.locationId).toBe('loc1');
      expect(data.assetId).toBeUndefined();
    });

    it('guarda la recepción de Producción y la parada estimada', async () => {
      const { svc, prisma } = build();
      await svc.create({
        type: 'CORRECTIVO', assetId: 'a1',
        requestedBy: 'Ing. Producción', requestChannel: 'WHATSAPP',
        externalRef: 'SAP-4711', plannedStopAt: '2026-07-30T14:00:00Z',
      } as any);
      const d = prisma.workOrder.create.mock.calls[0][0].data;
      expect(d.requestedBy).toBe('Ing. Producción');
      expect(d.requestChannel).toBe('WHATSAPP');
      expect(d.externalRef).toBe('SAP-4711');
      expect(d.plannedStopAt).toBeInstanceOf(Date);
    });
  });

  // ------------------------------------------------------------- apertura
  describe('apertura en campo', () => {
    const abierta = { id: 'w1', code: 'OM-2026-0001', type: 'CORRECTIVO', status: 'ABIERTA', startedAt: null };

    it('registra inicio real, firmante y acompañante', async () => {
      const { svc, prisma } = build({ wo: abierta });
      await svc.openSigned('w1', {
        email: 'tec@aa.local', password: 'correcta', companionId: 'u2',
      } as any);
      const d = prisma.__fila;
      expect(d.status).toBe('EN_PROCESO');
      expect(d.openedById).toBe('u1');
      expect(d.companionId).toBe('u2');
      expect(d.startedAt).toBeInstanceOf(Date);
    });

    it('rechaza la firma con contraseña incorrecta y lo deja auditado', async () => {
      const { svc, audit } = build({ wo: abierta });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'mala' } as any))
        .rejects.toThrow(/firma inválida/i);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'FIRMA_FALLIDA' }),
      );
    });

    it('no permite abrir dos veces la misma orden', async () => {
      const { svc } = build({ wo: { ...abierta, startedAt: new Date('2026-07-29T08:00:00Z') } });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/ya fue abierta/i);
    });

    it('no permite abrir una orden ya cerrada', async () => {
      const { svc } = build({ wo: { ...abierta, status: 'CERRADA' } });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/ya está cerrada/i);
    });

    it('el acompañante no puede ser el mismo que firma', async () => {
      const { svc } = build({ wo: abierta });
      // Si van dos a campo, son dos personas.
      await expect(svc.openSigned('w1', {
        email: 'tec@aa.local', password: 'correcta', companionId: 'u1',
      } as any)).rejects.toThrow(/persona distinta/i);
    });

    it('un Técnico eléctrico NO puede abrir una orden de mapeo', async () => {
      const { svc } = build({
        wo: { ...abierta, type: 'MAPEO' },
        usuario: USUARIO('Técnico'),
      });
      await expect(svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any))
        .rejects.toThrow(/mapeo/i);
    });

    it('el Técnico de Red sí puede abrir una orden de mapeo', async () => {
      const { svc, prisma } = build({
        wo: { ...abierta, type: 'MAPEO' },
        usuario: USUARIO('Técnico de Red'),
      });
      await svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.workOrder.updateMany).toHaveBeenCalled();
    });

    it('un Técnico eléctrico SÍ puede abrir una correctiva', async () => {
      const { svc, prisma } = build({ wo: abierta, usuario: USUARIO('Técnico') });
      await svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.workOrder.updateMany).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- avance
  describe('reporte de avance', () => {
    const enCurso = { id: 'w1', code: 'OM-2026-0001', status: 'ABIERTA', progressPct: 0 };

    it('guarda el avance y deja la orden EN PROCESO', async () => {
      const { svc, prisma } = build({ wo: enCurso });
      await svc.addProgress('w1', { pct: 30, note: 'la parada se acortó' } as any, 'u1');
      expect(prisma.workOrderProgress.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pct: 30 }) }),
      );
      const d = prisma.__fila;
      expect(d.progressPct).toBe(30);
      expect(d.status).toBe('EN_PROCESO');
    });

    it('acota el porcentaje entre 0 y 100', async () => {
      const { svc, prisma } = build({ wo: enCurso });
      await svc.addProgress('w1', { pct: 150 } as any, 'u1');
      expect(prisma.__fila.progressPct).toBe(100);
    });

    it('no deja bajar el avance sin explicación', async () => {
      // Si el avance retrocede es porque apareció más trabajo del previsto:
      // eso hay que poder justificarlo ante el Jefe.
      const { svc } = build({ wo: { ...enCurso, progressPct: 60 } });
      await expect(svc.addProgress('w1', { pct: 40 } as any, 'u1'))
        .rejects.toThrow(/elige el motivo/i);
    });

    // CAMBIO DELIBERADO (3F-1): antes SOLO valía escribir. Exigir texto hacía
    // que se pusiera un punto para poder continuar, y ahí se perdía el dato.
    // Ahora basta con elegir el motivo de la lista: cero escritura y encima
    // contable.
    it('deja bajarlo eligiendo el motivo de la lista, sin escribir nada', async () => {
      const { svc, prisma } = build({ wo: { ...enCurso, progressPct: 60 } });
      await svc.addProgress('w1', { pct: 40, reasonCode: 'FALTA_REPUESTO' } as any, 'u1');
      expect(prisma.workOrder.updateMany).toHaveBeenCalled();
      expect(prisma.workOrderProgress.create.mock.calls[0][0].data.reasonCode)
        .toBe('FALTA_REPUESTO');
    });

    it('sí deja bajarlo si se explica por escrito', async () => {
      // La válvula de escape sigue existiendo para lo que la lista no prevé.
      const { svc, prisma } = build({ wo: { ...enCurso, progressPct: 60 } });
      await svc.addProgress('w1', { pct: 40, note: 'se encontró otro tramo dañado' } as any, 'u1');
      expect(prisma.workOrder.updateMany).toHaveBeenCalled();
    });

    it('no admite avance sobre una orden cerrada', async () => {
      const { svc } = build({ wo: { ...enCurso, status: 'CERRADA' } });
      await expect(svc.addProgress('w1', { pct: 80 } as any, 'u1'))
        .rejects.toThrow(/cerrada/i);
    });
  });

  // ------------------------------------------------------------ desviación
  describe('desviación de lo planificado', () => {
    it('calcula duración real, retraso de inicio y exceso', async () => {
      const d = MaintenanceService.calcularDesviacion({
        plannedStopAt: new Date('2026-07-29T08:00:00Z'),
        plannedDurationMin: 60,
        startedAt: new Date('2026-07-29T08:30:00Z'), // arrancó 30 min tarde
        endedAt: new Date('2026-07-29T10:00:00Z'),   // duró 90 min
      });
      expect(d.duracionRealMin).toBe(90);
      expect(d.retrasoInicioMin).toBe(30);
      expect(d.desviacionMin).toBe(30);   // 90 real - 60 estimado
      expect(d.desviacionPct).toBe(50);
    });

    it('devuelve null cuando falta el dato, no un cero', async () => {
      // Una desviación de 0 y "no se sabe" no son lo mismo: si se devolviera
      // cero, el informe diría que Producción estima perfecto.
      const d = MaintenanceService.calcularDesviacion({ startedAt: null, endedAt: null });
      expect(d.duracionRealMin).toBeNull();
      expect(d.desviacionMin).toBeNull();
      expect(d.desviacionPct).toBeNull();
    });

    it('si terminó antes de lo estimado, la desviación es negativa', async () => {
      const d = MaintenanceService.calcularDesviacion({
        plannedDurationMin: 120,
        startedAt: new Date('2026-07-29T08:00:00Z'),
        endedAt: new Date('2026-07-29T09:00:00Z'),
      });
      expect(d.desviacionMin).toBe(-60);
    });
  });

  // ---------------------------------------------------------------- cierre
  describe('cierre', () => {
    const enProceso = {
      id: 'w1', code: 'OM-2026-0001', type: 'CORRECTIVO', status: 'EN_PROCESO',
      startedAt: new Date('2026-07-29T08:00:00Z'), executedDate: null,
      technicianId: null, assetId: 'a1', diagnosis: null,
    };

    it('guarda causa, reincidencia y hora real de cierre', async () => {
      const { svc, prisma } = build({ wo: enProceso });
      await svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        rootCause: 'CABLE_FUERA_NORMA', isRecurrent: true,
        endedAt: '2026-07-29T09:30:00Z',
      } as any);
      const d = prisma.__fila;
      expect(d.status).toBe('CERRADA');
      expect(d.rootCause).toBe('CABLE_FUERA_NORMA');
      expect(d.isRecurrent).toBe(true);
      expect(d.closedById).toBe('u1');
    });

    // ------------------------------------------------- avisos al cerrar (4F)
    it('al cerrar se ENCOLA el aviso, no se envía', async () => {
      // Encolar es lo único que ocurre dentro del cierre. El envío es de
      // otro proceso, y esa separación es toda la garantía del bloque.
      const { svc, avisos } = build({ wo: enProceso });
      await svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta', rootCauseCode: 'FUENTE',
      } as any);
      expect(avisos.encolar).toHaveBeenCalledTimes(1);
      expect(avisos.encolar.mock.calls[0][0]).toBe('OM_CERRADA');
      const aviso = avisos.encolar.mock.calls[0][1];
      expect(aviso.asunto).toContain('OM-2026-0001');
    });

    it('SI EL AVISO FALLA, LA ORDEN SE CIERRA IGUAL', async () => {
      // Ésta es LA promesa del bloque 4F, y por eso se prueba: si el envío
      // formara parte del cierre, un corte de internet dejaría al técnico
      // sin poder cerrar su orden a las once de la noche, en planta.
      const { svc, prisma } = build({ wo: enProceso, avisosRotos: true });
      await expect(svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
      } as any)).resolves.toBeDefined();
      // Y lo importante: la orden quedó cerrada de verdad.
      expect(prisma.__fila.status).toBe('CERRADA');
    });

    it('rechaza una hora de cierre anterior al inicio', async () => {
      const { svc } = build({ wo: enProceso });
      // Un dato imposible ensucia para siempre el cálculo de duración.
      await expect(svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        endedAt: '2026-07-29T07:00:00Z',
      } as any)).rejects.toThrow(/anterior a la de inicio/i);
    });

    it('deja la duración real en la auditoría', async () => {
      const { svc, audit } = build({ wo: enProceso });
      await svc.closeSigned('w1', {
        email: 'tec@aa.local', password: 'correcta',
        endedAt: '2026-07-29T09:30:00Z',
      } as any);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSE_WO',
          after: expect.objectContaining({ duracionMinutos: 90 }),
        }),
      );
    });

    it('si se cierra sin haber abierto, no deja el inicio en blanco', async () => {
      const { svc, prisma } = build({ wo: { ...enProceso, startedAt: null } });
      await svc.closeSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.__fila.startedAt).toBeTruthy();
    });
  });

  /* ==========================================================================
     BLOQUE 37 — DOS O TRES ÓRDENES A LA VEZ
     --------------------------------------------------------------------------
     Estas pruebas son las únicas que reproducen el escenario que el bloque 37
     vino a arreglar, y no se pueden hacer a mano: hay que provocar el instante
     exacto en que dos personas tocan la misma orden.

     El truco es `prisma.__fila`: el doble se comporta como PostgreSQL —mira el
     estado, decide si toca la fila, y devuelve cuántas cambió—. Moviendo esa
     fila entre medias se simula al Jefe cerrando desde el púlpito mientras el
     técnico está registrando en el teléfono.
     ========================================================================== */
  describe('carrera: alguien mueve la orden mientras trabajas', () => {
    const enProceso = {
      id: 'w1', code: 'OM-2026-0007', type: 'CORRECTIVO',
      status: 'EN_PROCESO', progressPct: 40, startedAt: new Date('2026-08-15T08:00:00Z'),
    };

    /* CÓMO SE FABRICA LA CARRERA.
       -----------------------------------------------------------------------
       No basta con poner la orden en CERRADA: la comprobación del principio
       del método la vería y saltaría antes —que es lo correcto, y además ya
       funcionaba—.

       La carrera de verdad es más estrecha: el método LEE la orden (todavía
       EN_PROCESO), y el Jefe la cierra en el instante siguiente, antes de que
       el método escriba. Se reproduce haciendo que la primera lectura
       devuelva la foto vieja mientras la fila real ya está cerrada. */
    function conCierreEntreMedias(over: any) {
      const b = build(over);
      b.prisma.workOrder.findUnique.mockImplementationOnce(() => ({ ...over.wo }));
      b.prisma.__fila.status = 'CERRADA';
      return b;
    }

    it('el avance NO resucita una orden que otro cerró', async () => {
      /* EL FALLO QUE ESTO PREVIENE, paso a paso:
           1. el técnico abre la pantalla   -> la orden está EN_PROCESO
           2. el Jefe la cierra             -> pasa a CERRADA
           3. el técnico pulsa «avance»     -> escribía `status: EN_PROCESO`
              y la orden volvía a la vida, con su firma de cierre dentro.
         Un cierre lleva firma, materiales y a veces un informe en PDF.
         Deshacerlo sin dejar rastro es de los peores fallos posibles aquí. */
      const { svc, prisma } = conCierreEntreMedias({ wo: enProceso });

      await expect(svc.addProgress('w1', { pct: 80 } as any, 'u1', null))
        .rejects.toThrow(/cerró o canceló/i);

      expect(prisma.__fila.status).toBe('CERRADA');
      expect(prisma.__fila.progressPct).toBe(40);  // no se movió
    });

    it('cuando el avance se rechaza, TAMPOCO queda el parte colgando', async () => {
      /* El parte de avance se crea DENTRO de la transacción, después de la
         guarda. Si se creara antes, quedaría un avance del 80 % colgando de
         una orden cerrada al 100 % — y el historial contaría una secuencia
         que nunca ocurrió. */
      const { svc, prisma } = conCierreEntreMedias({ wo: enProceso });

      await expect(svc.addProgress('w1', { pct: 80 } as any, 'u1', null)).rejects.toThrow();
      expect(prisma.workOrderProgress.create).not.toHaveBeenCalled();
    });

    it('la comprobación temprana sigue funcionando (sin carrera, mensaje simple)', async () => {
      // Cuando la orden YA estaba cerrada al abrir la pantalla, el aviso lo da
      // la comprobación de siempre. No hace falta llegar a la guarda.
      const { svc } = build({ wo: { ...enProceso, status: 'CERRADA' } });
      await expect(svc.addProgress('w1', { pct: 80 } as any, 'u1', null))
        .rejects.toThrow(/orden cerrada/i);
    });

    it('dos técnicos cerrando: el segundo recibe un aviso, no pisa al primero', async () => {
      const { svc, prisma } = build({ wo: enProceso });
      // El primero cierra.
      await svc.closeSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any);
      expect(prisma.__fila.status).toBe('CERRADA');
      const quienCerro = prisma.__fila.closedById;

      // El segundo llega tarde.
      await expect(
        svc.closeSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any),
      ).rejects.toThrow(/está ahora CERRADA/i);

      // Y el registro sigue diciendo quién cerró de verdad.
      expect(prisma.__fila.closedById).toBe(quienCerro);
    });

    it('el mensaje dice EN QUÉ quedó la orden, no sólo que falló', async () => {
      /* «Alguien la movió» a secas deja al técnico sin saber si tiene que
         rehacer el trabajo. El estado actual es la mitad útil del mensaje. */
      const base = { ...enProceso, status: 'ABIERTA', startedAt: null };
      const { svc, prisma } = build({ wo: base });
      prisma.workOrder.findUnique.mockImplementationOnce(() => ({ ...base }));
      prisma.__fila.status = 'CANCELADA';   // el Jefe la cancela entre medias

      await expect(
        svc.openSigned('w1', { email: 'tec@aa.local', password: 'correcta' } as any),
      ).rejects.toThrow(/OM-2026-0007.*CANCELADA/is);
    });

    it('sin carrera, todo sigue funcionando igual', async () => {
      // La guarda no puede estorbar al caso normal, que es el 99 % de las veces.
      const { svc, prisma } = build({ wo: enProceso });
      await svc.addProgress('w1', { pct: 75 } as any, 'u1', null);
      expect(prisma.__fila.progressPct).toBe(75);
      expect(prisma.workOrderProgress.create).toHaveBeenCalled();
    });
  });
});
