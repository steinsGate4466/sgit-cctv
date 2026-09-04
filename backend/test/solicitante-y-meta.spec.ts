import * as fs from 'fs';
import * as path from 'path';
import {
  META_PROPUESTA, motivoParaNoGuardarMeta,
} from '../src/common/meta-mantenimiento';

/* =============================================================================
   BLOQUE 94 · QUIÉN PIDIÓ LA ORDEN, Y LA META DE MANTENIMIENTO
   -----------------------------------------------------------------------------
   Estas pruebas fijan DECISIONES, no comportamiento incidental. Cada una
   corresponde a una regla que se tomó por un motivo, y si alguien la deshace
   sin querer tiene que enterarse aquí y no en planta.

   Las que leen el CÓDIGO en vez de ejecutarlo son deliberadas: el fallo típico
   no es escribir mal el permiso, es quitarlo «un momento para probar» y no
   volver a ponerlo. Eso sólo se ve leyendo el archivo.
============================================================================= */

const raiz = path.join(__dirname, '..');
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), 'utf8');

describe('El solicitante de la orden', () => {
  const schema = leer('prisma/schema.prisma');
  const servicio = leer('src/modules/maintenance/maintenance.service.ts');
  const controlador = leer('src/modules/maintenance/maintenance.controller.ts');

  it('es un campo propio y NO reemplaza a `requestedBy` ni a `openedById`', () => {
    /* Son tres hechos distintos y confundirlos borra información:
         createdById  quién PIDIÓ la orden (usuario del sistema)
         requestedBy  quién la pidió FUERA del sistema (texto libre)
         openedById   quién la ARRANCÓ en campo, al firmar
       Una orden que se pide y nunca se arranca quedaría sin dueño si se
       reutilizara `openedById`, y es justo la que hay que reclamar. */
    expect(schema).toContain('createdById   String?');
    expect(schema).toContain('requestedBy    String?');
    expect(schema).toContain('openedById    String?');
  });

  it('declara el lado inverso en User, que es lo que Prisma exige', () => {
    /* Olvidarlo fue el fallo del bloque 16.1: P1012 en la máquina del usuario,
       con los archivos ya escritos. Lo caza `verificar:relaciones`, y aquí
       queda fijado además por una prueba. */
    expect(schema).toContain("woSolicitadas   WorkOrder[]     @relation(\"WoCreatedBy\")");
  });

  it('se toma de la SESIÓN y nunca del cuerpo de la petición', () => {
    /* Si viniera en el `dto`, cualquiera podría abrir una orden a nombre de
       otro y el dato dejaría de servir para lo que se creó. */
    expect(controlador).toMatch(/create\(@Body\(\) dto: CreateWorkOrderDto, @CurrentUser\(\) user: any\)/);
    expect(controlador).toContain('this.wo.create(dto, user?.userId ?? null)');
    // Y el DTO de alta NO lo declara: no se puede colar por el cuerpo.
    expect(leer('src/modules/maintenance/dto/create-work-order.dto.ts'))
      .not.toMatch(/createdById/);
  });

  it('el filtro «sólo las mías» se resuelve en el SERVIDOR', () => {
    /* Filtrarlo sólo en la pantalla dejaría el paginador contando las de
       todos: «120 órdenes» enseñando tres. */
    expect(servicio).toContain('if (q.mias && userId) where.createdById = userId;');
  });

  it('el histórico NO se rellena: `NULL` dice la verdad', () => {
    const migracion = leer(
      'prisma/migrations/20260912000000_solicitante_de_om_y_meta/migration.sql',
    );
    expect(migracion).toContain('ADD COLUMN "createdById" TEXT');
    // Ni un UPDATE que invente el solicitante de las órdenes viejas.
    expect(migracion).not.toMatch(/UPDATE\s+"work_orders"/i);
  });

  it('el índice lleva el nombre EXACTO que generaría Prisma', () => {
    /* Abreviarlo hace que `prisma migrate dev` crea que falta y lo vuelva a
       crear: dos índices iguales sobre la misma columna (bloque 16.3). */
    const migracion = leer(
      'prisma/migrations/20260912000000_solicitante_de_om_y_meta/migration.sql',
    );
    expect(migracion).toContain('CREATE INDEX "work_orders_createdById_idx"');
    expect(schema).toContain('@@index([createdById])');
  });
});

describe('El informe PDF cuenta la historia entera', () => {
  const servicio = leer('src/modules/maintenance/maintenance.service.ts');
  const informe = servicio.slice(servicio.indexOf('async buildReport'));

  it('trae las cuatro personas de la orden', () => {
    for (const quien of ['createdBy', 'openedBy', 'closedBy', 'companion']) {
      expect(informe).toContain(`${quien}:`);
    }
  });

  it('trae la traza de avances, no sólo el diagnóstico final', () => {
    expect(informe).toContain("heading('Avances registrados')");
    expect(informe).toContain('progress: {');
    // Cada avance con su autor: un avance sin firmante no sirve para preguntar.
    expect(informe).toContain('reportedBy: { select: { fullName: true } }');
  });

  it('cuando no hay solicitante lo DICE, en vez de pintar un guion', () => {
    /* «—» se lee como «no lo pidió nadie», que es falso para el histórico. */
    expect(informe).toContain('Sin solicitante registrado');
  });
});

describe('La meta de mantenimiento', () => {
  it('la propuesta NO lleva predictivo y suma 100', () => {
    /* El predictivo se retiró en el bloque 80: en CCTV no hay desgaste que
       medir. Su tercio pasa al lado planificado. */
    expect(Object.keys(META_PROPUESTA).sort())
      .toEqual(['correctivoPct', 'omPorMes', 'preventivoPct']);
    expect(META_PROPUESTA.correctivoPct + META_PROPUESTA.preventivoPct).toBe(100);
    expect(META_PROPUESTA.omPorMes).toBeNull();
  });

  it('rechaza un reparto que no suma 100, y lo dice con el número', () => {
    const m = motivoParaNoGuardarMeta({ correctivoPct: 40, preventivoPct: 50 });
    expect(m).toContain('90');
    /* Un reparto que suma 90 deja un 10 % sin dueño y el gráfico lo repartiría
       solo entre los dos: enseñaría una meta que nadie escribió. */
  });

  it('acepta un reparto válido, con y sin meta de volumen', () => {
    expect(motivoParaNoGuardarMeta({ correctivoPct: 30, preventivoPct: 70 })).toBeNull();
    expect(motivoParaNoGuardarMeta({
      correctivoPct: 25, preventivoPct: 75, omPorMes: 40,
    })).toBeNull();
    // `null` es una respuesta válida: significa «sin meta de volumen».
    expect(motivoParaNoGuardarMeta({
      correctivoPct: 25, preventivoPct: 75, omPorMes: null,
    })).toBeNull();
  });

  it('frena el dedo resbalado en la meta de volumen', () => {
    expect(motivoParaNoGuardarMeta({
      correctivoPct: 30, preventivoPct: 70, omPorMes: 99999,
    })).toContain('error de tecleo');
    expect(motivoParaNoGuardarMeta({
      correctivoPct: 30, preventivoPct: 70, omPorMes: -1,
    })).toContain('cero o más');
  });

  it('la migración NO inserta ninguna fila: una propuesta no es una decisión', () => {
    const migracion = leer(
      'prisma/migrations/20260912000000_solicitante_de_om_y_meta/migration.sql',
    );
    expect(migracion).toContain('CREATE TABLE "meta_mantenimiento"');
    expect(migracion).not.toMatch(/INSERT\s+INTO\s+"meta_mantenimiento"/i);
  });

  it('sólo la fija el Jefe de Mantenimiento, y la ve quien ve los indicadores', () => {
    /* El permiso no lo decide la dificultad de la acción —marcar dos números
       es trivial— sino lo que la acción AFIRMA: la meta es el criterio con el
       que se juzga el trabajo de todo el año. Misma regla que el cierre de una
       orden (bloque 78). */
    const c = leer('src/modules/indicadores/indicadores.controller.ts');
    const bloqueGet = c.slice(c.indexOf("@Get('meta')"), c.indexOf("@Put('meta')"));
    const bloquePut = c.slice(c.indexOf("@Put('meta')"));
    expect(bloqueGet).toContain("@RequirePermissions('dashboard.read')");
    expect(bloquePut).toContain("@RequirePermissions('wo.approve')");
    // Y NO se ha aflojado a `wo.update`, que lo tienen los técnicos.
    expect(bloquePut).not.toContain("@RequirePermissions('wo.update')");
  });
});
