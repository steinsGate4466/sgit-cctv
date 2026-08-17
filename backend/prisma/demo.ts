/* eslint-disable no-console */
/**
 * DATOS DE DEMO — bloque 39.
 *
 * =============================================================================
 *  QUÉ ES ESTO Y QUÉ **NO** ES
 * =============================================================================
 *  Es un archivo APARTE de `seed.ts`, y esa separación es lo importante:
 *
 *    seed.ts   -> lo que la planta necesita SIEMPRE: permisos, roles, usuarios,
 *                 el árbol de ubicaciones, los catálogos. Se ejecuta en el
 *                 despliegue real.
 *
 *    demo.ts   -> dos cámaras caídas de mentira para poder ENSEÑAR el sistema.
 *                 NO se ejecuta en el despliegue real. Nunca.
 *
 *  Si esto viviera dentro de `seed.ts` detrás de un `if`, tarde o temprano
 *  alguien ejecutaría la semilla en producción con la variable mal puesta y
 *  aparecerían dos incidencias inventadas en la base de Pisco. Un archivo
 *  distinto no se ejecuta por accidente.
 *
 * =============================================================================
 *  TODO LLEVA EL PREFIJO `DEMO-`
 * =============================================================================
 *  Se ve a simple vista en cualquier listado, y el botón «Dejar la base vacía»
 *  lo borra junto con el resto de lo operativo. Ver `datos-de-demo.ts`.
 *
 * =============================================================================
 *  CÓMO SE USA
 * =============================================================================
 *      npm run demo:cargar     -> mete los datos de ejemplo
 *      (y en la pantalla de Limpieza, «Dejar la base vacía» los quita)
 *
 *  LOS DOS CASOS SON DISTINTOS A PROPÓSITO, porque enseñan cosas distintas:
 *
 *    1. Colada continua  — zona VITAL, el técnico está trabajando, avance al
 *                          60 %, se puede resolver con el tren en marcha.
 *                          Enseña el caso bueno: el sistema funcionando.
 *
 *    2. Salida de horno  — PARADA esperando un repuesto que NO hay en almacén.
 *                          Enseña lo que de verdad le interesa a Producción:
 *                          «hasta aquí se puede llegar, y falta comprar esto».
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Hace N horas, desde ahora. Para que la demo se lea igual a cualquier hora. */
const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000);

async function main() {
  console.log('Cargando datos de DEMO (todo con prefijo DEMO-)…');

  /* La demo se cuelga del árbol REAL. Si no hay ubicaciones cargadas no se
     inventa una: sin árbol, el contexto de planta no resuelve tren ni zona y
     las tarjetas saldrían sin tren, que es peor que no tener demo. */
  /* DE DÓNDE CUELGA LA DEMO.
     -------------------------------------------------------------------------
     La primera versión exigía una ubicación de tipo ZONA o ETAPA y abortaba si
     no la había. Estaba mal: la semilla crea Empresa -> Planta -> Tren -> Rack
     y NINGUNA zona ni etapa, así que la demo no arrancaba nunca en una base
     recién sembrada — que es justo el caso para el que se escribió.

     Lo que la demo necesita de verdad no es una zona: es colgarse de algo que
     RESUELVA UN TREN, porque el tren es lo que sectoriza las pantallas. Se
     busca de lo más específico a lo más general y se comprueba el resultado,
     en vez de exigir un tipo concreto.

     Sigue sin inventarse nada: si no hay ni un tren en el árbol, aborta. */
  const PREFERENCIA = ['ZONA', 'ETAPA', 'SALA', 'RACK', 'TREN'];
  let zona: { id: string; name: string } | null = null;
  for (const tipo of PREFERENCIA) {
    zona = await prisma.location.findFirst({
      where: { type: tipo as any },
      orderBy: { path: 'asc' },
      select: { id: true, name: true },
    });
    if (zona) break;
  }
  if (!zona) {
    console.error(
      'No hay ubicaciones en el árbol. Ejecuta primero `npm run prisma:seed`:\n'
      + 'sin árbol de planta, las cámaras de demo saldrían sin tren ni zona.',
    );
    process.exit(1);
  }
  console.log(`  Las cámaras de demo se cuelgan de: ${zona.name}`);

  const tecnico = await prisma.user.findFirst({
    where: { active: true }, orderBy: { createdAt: 'asc' },
  });

  // ---------------------------------------------------------------- CÁMARA 1
  /* OJO CON EL ESTADO, que aquí se ve la arquitectura funcionando.
     -------------------------------------------------------------------------
     La cámara se crea OPERATIVA. `CON_INCIDENCIA` NO es un estado que se
     guarde: se DERIVA de tener una incidencia abierta (ver `asset-status.ts`).

     Escribirlo a mano habría sido posible sólo si existiera la columna, y no
     existe a propósito: un estado guardado se desincroniza en cuanto alguien
     cierra la incidencia y se olvida de cambiarlo. Aquí basta con abrir la
     incidencia y el estado sale solo — y se corrige solo al cerrarla. */
  const cam1 = await prisma.asset.upsert({
    where: { assetCode: 'DEMO-CAM-COLADA' },
    update: {},
    create: {
      assetCode: 'DEMO-CAM-COLADA',
      type: 'CAMERA', status: 'OPERATIVO', criticality: 'ALTA',
      brand: 'Hikvision', model: 'DS-2CD2T47G2',
      referencePlace: 'Poste 4, sobre la colada continua',
      locationId: zona.id,
      installDate: new Date('2021-03-15'),
      /* Bloque 41. Declarada a propósito: es la mitad de la demostración del
         módulo de activos por tren. Junto con la del horno —que está en la
         MISMA zona— produce el titular que le interesa a Producción: dos
         equipos pendientes que exigen manlift y se atienden en UNA subida. */
      medioAcceso: 'MANLIFT',
      alturaMetros: 8,
      accesoNota: 'El manlift se posiciona desde el pasillo norte; con el tren en marcha no entra.',
      accesoDeclaradoPorId: tecnico?.id ?? null,
      accesoDeclaradoEn: haceHoras(700),
    },
  });

  const inc1 = await prisma.incident.upsert({
    where: { code: 'DEMO-INC-0001' },
    update: {},
    create: {
      code: 'DEMO-INC-0001',
      title: 'Cámara de colada continua sin imagen',
      description: 'El púlpito reporta pantalla en negro desde el turno de mañana.',
      category: 'GENERAL', priority: 'ALTA', status: 'EN_PROCESO',
      assetId: cam1.id,
      reportedAt: haceHoras(3.3),
      responsibleId: tecnico?.id ?? null,
      zone: zona.name,
    },
  });

  const om1 = await prisma.workOrder.upsert({
    where: { code: 'DEMO-OM-0001' },
    update: {},
    create: {
      code: 'DEMO-OM-0001',
      type: 'CORRECTIVO', status: 'EN_PROCESO',
      activity: 'Revisar cámara de colada continua: sin imagen desde el turno de mañana.',
      assetId: cam1.id, incidentId: inc1.id, locationId: zona.id,
      technicianId: tecnico?.id ?? null,
      openedById: tecnico?.id ?? null,
      progressPct: 60,
      createdAt: haceHoras(3.0),
      startedAt: haceHoras(1.6),
      scheduledDate: new Date(),
    },
  });

  /* El parte de avance con su nota. Es lo que convierte «60 %» en algo que un
     jefe de línea puede usar: sabe QUÉ están haciendo, no sólo cuánto llevan. */
  const yaHayAvance = await prisma.workOrderProgress.count({ where: { workOrderId: om1.id } });
  if (!yaHayAvance) {
    await prisma.workOrderProgress.create({
      data: {
        workOrderId: om1.id, pct: 60,
        note: 'Cable cortado en la bandeja sobre el poste 4. Tirando tramo nuevo.',
        reportedById: tecnico?.id ?? null,
        reportedAt: haceHoras(0.4),
      },
    });
  }

  // ---------------------------------------------------------------- CÁMARA 2
  const cam2 = await prisma.asset.upsert({
    where: { assetCode: 'DEMO-CAM-HORNO' },
    update: { status: 'FUERA_SERVICIO' },
    create: {
      assetCode: 'DEMO-CAM-HORNO',
      type: 'CAMERA', status: 'FUERA_SERVICIO', criticality: 'ALTA',
      brand: 'Hikvision', model: 'DS-2TD2617',
      referencePlace: 'Salida de horno de recalentamiento',
      locationId: zona.id,
      installDate: new Date('2019-08-02'),
      medioAcceso: 'MANLIFT',
      alturaMetros: 6.5,
      accesoDeclaradoPorId: tecnico?.id ?? null,
      accesoDeclaradoEn: haceHoras(700),
    },
  });

  /* ------------------------------------------------------- CÁMARA 3 (bloque 41)
     ESTA NO TIENE INCIDENCIA NI ORDEN, Y NO ES UN DESCUIDO.

     Está OPERATIVA y SIN DECLARAR cómo se llega. Existe para enseñar lo que de
     verdad diferencia a este módulo de una lista de inventario: el gris.

     En la pantalla sale aparte, en gris, y NO suma al total de los que exigen
     manlift — aunque la zona diga que hay que subir. Es la regla que evita que
     Producción apruebe un número bajo y el día del trabajo falte el equipo.

     Sin este caso, la demo sólo enseñaría el camino feliz. */
  await prisma.asset.upsert({
    where: { assetCode: 'DEMO-CAM-LECHO' },
    update: {},
    create: {
      assetCode: 'DEMO-CAM-LECHO',
      type: 'CAMERA', status: 'OPERATIVO', criticality: 'MEDIA',
      brand: 'Hikvision', model: 'DS-2CD2143G2',
      referencePlace: 'Lecho de enfriamiento, poste central',
      locationId: zona.id,
      installDate: new Date('2022-11-20'),
      // medioAcceso queda a NULL a propósito: nadie lo ha declarado.
    },
  });

  const inc2 = await prisma.incident.upsert({
    where: { code: 'DEMO-INC-0002' },
    update: {},
    create: {
      code: 'DEMO-INC-0002',
      title: 'Cámara de salida de horno fuera de servicio',
      description: 'No responde a ping. Se sospecha de la fuente PoE.',
      category: 'GENERAL', priority: 'ALTA', status: 'EN_PROCESO',
      assetId: cam2.id,
      reportedAt: haceHoras(28),
      responsibleId: tecnico?.id ?? null,
      zone: zona.name,
    },
  });

  const om2 = await prisma.workOrder.upsert({
    where: { code: 'DEMO-OM-0002' },
    update: {},
    create: {
      code: 'DEMO-OM-0002',
      type: 'CORRECTIVO',
      /* EN_ESPERA es el caso que de verdad le importa a Producción: no es que
         vayan lentos, es que están bloqueados por algo que Producción PUEDE
         desbloquear moviendo una compra. */
      status: 'EN_ESPERA',
      activity: 'Reemplazar inyector PoE de la cámara de salida de horno.',
      assetId: cam2.id, incidentId: inc2.id, locationId: zona.id,
      technicianId: tecnico?.id ?? null,
      progressPct: 30,
      createdAt: haceHoras(26),
      startedAt: haceHoras(24),
      scheduledDate: new Date(),
    },
  });

  if (!(await prisma.workOrderProgress.count({ where: { workOrderId: om2.id } }))) {
    await prisma.workOrderProgress.create({
      data: {
        workOrderId: om2.id, pct: 30,
        reasonCode: 'ESPERA_REPUESTO',
        note: 'sin inyector PoE en almacén',
        reportedById: tecnico?.id ?? null,
        reportedAt: haceHoras(14),
      },
    });
  }

  /* EL REPUESTO QUE FALTA. Con stock 0 a propósito: es la línea que dispara
     una compra, y es exactamente lo que Producción quiere poder ver. */
  /* `sapCode` NO es único en el esquema —a propósito: el mismo código puede
     existir en dos almacenes— así que aquí no cabe un `upsert`. Se busca y se
     crea sólo si falta, que es lo que un upsert haría por debajo. */
  const repuesto = await prisma.sparePart.findFirst({ where: { sapCode: 'DEMO-4711' } })
    ?? await prisma.sparePart.create({
      data: {
        sapCode: 'DEMO-4711',
        name: 'Inyector PoE 30 W industrial',
        currentStock: 0, minStock: 2, unit: 'und',
        warehouse: 'Almacén Laminación',
      },
    });

  if (!(await prisma.workOrderMaterial.count({ where: { workOrderId: om2.id } }))) {
    await prisma.workOrderMaterial.createMany({
      data: [
        {
          workOrderId: om2.id, sparePartId: repuesto.id, sapCode: 'DEMO-4711',
          description: 'Inyector PoE 30 W industrial',
          plannedQty: 1, status: 'SOLICITADO', unit: 'und',
        },
        {
          workOrderId: om2.id,
          description: 'Precinto plástico 200 mm',
          plannedQty: 10, status: 'SOLICITADO', unit: 'und',
        },
      ],
    });
  }

  console.log('');
  console.log('  Listo. Cargado:');
  console.log('    · DEMO-CAM-COLADA  con DEMO-OM-0001 al 60 %, trabajando');
  console.log('    · DEMO-CAM-HORNO   con DEMO-OM-0002 EN ESPERA, falta un inyector PoE');
  console.log('    · DEMO-CAM-LECHO   operativa y SIN DECLARAR cómo se llega');
  console.log('');
  console.log('  Míralo en «Mis cámaras» y en «Activos por tren».');
  console.log('  Las dos primeras exigen manlift y están en la misma zona:');
  console.log('  el tablero lo dice como UNA subida, no dos.');
  console.log('  Para dejar la base vacía antes del despliegue real:');
  console.log('    Limpieza -> «Dejar la base vacía» -> escribir DEJAR LA BASE VACIA');
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
