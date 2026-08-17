/* eslint-disable no-console */
// =============================================================================
//  SGIT-CCTV — Semilla de datos (Aceros Arequipa · Planta Pisco)
//  Carga: permisos, roles, usuario admin, VLANs, jerarquía de planta y
//         activos de ejemplo con topología PMP (anillo -> switch -> NVR ;
//         FortiSwitch -> antena PMP púlpito -> suscriptoras -> cámaras).
// =============================================================================
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ---- Catálogo de permisos ----
const PERMISSIONS = [
  'user.read', 'user.manage',
  'asset.create', 'asset.read', 'asset.update', 'asset.delete',
  'location.read', 'location.manage',
  'wo.create', 'wo.read', 'wo.update', 'wo.approve',
  'incident.create', 'incident.read', 'incident.update', 'incident.close',
  'document.read', 'document.manage',
  'dashboard.read', 'troubleshooting.read',
  'audit.read',
  'credential.read', 'credential.manage',
  'inventory.read', 'inventory.manage', 'inventory.check',
  // Accesibilidad / trabajo en altura (manlift, izaje) — SSOMA
  'access.read', 'access.request', 'access.approve',
  // Bloque 26 — PRODUCCIÓN declara qué zonas son vitales. TI y Mantenimiento
  // lo LEEN con 'location.read'; declararlo es de quien conoce el proceso.
  'zona.criticidad',

  /* ==========================================================================
     PERMISOS QUE NACIERON EN UNA MIGRACIÓN Y NUNCA VOLVIERON AQUÍ
     --------------------------------------------------------------------------
     Los seis de abajo se crearon con `INSERT INTO permissions` dentro de las
     migraciones de los bloques 12.x, y esta lista no se actualizó. La base
     los tenía; esta lista no.

     No era inofensivo. Unas líneas más abajo, el seed hace:

         deleteMany({ permissionId: { notIn: allowed } })

     …para poder RETIRAR un permiso a un rol sin recrear la base. Con la lista
     incompleta, eso significa que CADA VEZ que alguien ejecutara la semilla,
     el Jefe de Mantenimiento perdía en silencio el acceso a Roles, Monitoreo,
     Avisos y al informe PDF de las órdenes. El sistema seguiría arrancando,
     los menús simplemente desaparecerían, y nadie sabría por qué.

     Lo cazó `verificar-roles.js`. La lección es la de siempre en este
     proyecto: dos sitios que dicen lo mismo y nadie los obliga a coincidir.
     ========================================================================== */
  'role.manage',
  'wo.report',
  /* Bloque 28. Firmar si una zona se puede intervenir con el tren en marcha.
     Es una autorización de SEGURIDAD, no un permiso administrativo: lo tienen
     sólo el Jefe de Mantenimiento y el Supervisor Operativo de Tercería. */
  'zona.intervencion',
  /* Bloque 29. Escribir y aprobar los procedimientos de restauración: lo que
     va a seguir el próximo técnico, posiblemente de noche y solo. */
  'procedimiento.manage',
  'monitor.read', 'monitor.manage',
  'notify.read', 'notify.manage',

  /* ==========================================================================
     BLOQUE 34 — LA SEGUNDA LLAVE DEL BORRADO DEFINITIVO
     --------------------------------------------------------------------------
     El borrado definitivo siempre pidió DOS llaves: un permiso amplio
     (`asset.delete` o `wo.approve`) y, además, ser Jefe de Mantenimiento. La
     idea es buena: un permiso amplio se otorga por error al armar un rol, y
     esto no tiene vuelta atrás.

     El problema era CÓMO estaba escrita la segunda llave: el texto
     'Jefe de Mantenimiento' aparecía a mano en cinco archivos. Si alguien
     renombra ese rol desde la pantalla de Roles —algo que la propia pantalla
     invita a hacer— las cinco comparaciones dejan de cumplirse. No falla
     nada: el botón simplemente desaparece y el servidor empieza a rechazar a
     todo el mundo. O al revés, si alguien crea un rol nuevo con ese nombre
     exacto, hereda la llave sin que nadie se lo haya dado.

     Ahora la segunda llave es este permiso. Sigue habiendo dos llaves y sigue
     siendo estrecha, pero es un dato de la base que se ve y se otorga desde la
     pantalla de Roles, en vez de una cadena de texto enterrada en el código.
     ========================================================================== */
  'purga.definitiva',

  /* ==========================================================================
     BLOQUE 39 — PRODUCCIÓN MIRA LA ORDEN, NO LA TOCA
     --------------------------------------------------------------------------
     El jefe de tren necesita ver qué se está haciendo con SUS cámaras: el
     avance, la última nota del técnico, qué material falta para poder mover
     una compra.

     Darle `wo.read` para eso le abriría el módulo de Mantenimiento entero —las
     trescientas órdenes de la planta, los filtros, las de otros trenes— y le
     metería en el menú pantallas que no va a usar nunca. Ésa es la forma más
     rápida de que deje de entrar al sistema.

     `om.mirar` es una llave estrecha: sólo el panel de su tren, sólo lectura,
     sólo su ámbito. Si alguien se la concede por error, lo peor que puede
     hacer es MIRAR.
     ========================================================================== */
  'om.mirar',

  /* ==========================================================================
     BLOQUE 42 — LAS LLAVES PROPIAS DE PRODUCCIÓN
     --------------------------------------------------------------------------
     Se vio en planta: un jefe de línea con Gabinetes, Cableado, Electricidad,
     Conexiones, Mi bandeja, Dashboard e Indicadores en el menú.

     No fue un descuido al armar el rol: era el diseño. «Mi cobertura» colgaba
     de `dashboard.read` —que abre el tablero de MANTENIMIENTO entero— y el
     inventario del tren de `asset.read`. Las pantallas de Producción colgaban
     de permisos de Mantenimiento, así que Producción acababa con el módulo de
     Mantenimiento.

     Ahora cada pantalla de Producción tiene su llave, y son estrechas por
     definición: si alguien las concede por error, lo peor que pasa es que
     MIREN su tren.
     ========================================================================== */
  'cobertura.mirar',
  'activos.mirar',
];

/**
 * ROLES QUE NO VEN LA PLANTA ENTERA NUNCA (bloque 42).
 *
 * Sin tren asignado NO VEN NADA, y la pantalla lo explica. El resto de roles
 * mantiene el comportamiento de siempre —ámbito vacío = todos los trenes—, así
 * que aplicar esto no le quita acceso a nadie que lo tenga hoy.
 *
 * Es una lista corta y tiene que seguir siéndolo: cada nombre aquí es alguien
 * que dejará de ver la planta si nadie le asigna su tren.
 */
const ROLES_SECTORIZADOS = ['Jefe de Tren'];

// ---- Roles y sus permisos ----
const ROLES: Record<string, string[]> = {
  // Jefe de Mantenimiento = administrador del sistema (control total).
  'Jefe de Mantenimiento': PERMISSIONS,
  // Supervisor TI: supervisa y analiza TODO, pero SIN borrar, sin gestionar usuarios
  // y sin revelar/gestionar credenciales.
  // Supervisor TI: supervisa TODO, pero el CIERRE/resolución de incidencias y OM
  // queda reservado al Jefe de Mantenimiento (sin incident.close ni wo.approve).
  'Supervisor TI': [
    'user.read', 'asset.create', 'asset.read', 'asset.update',
    'location.read', 'location.manage',
    'wo.read', 'wo.update',
    'incident.create', 'incident.read', 'incident.update',
    'document.read', 'document.manage',
    'dashboard.read', 'troubleshooting.read', 'credential.read',
    'inventory.read', 'inventory.manage', 'inventory.check',
    // Supervisa las solicitudes de acceso, pero NO las aprueba (eso es del Jefe).
    'access.read', 'access.request',
    // Los concedía la migración a quien ya tenía asset.read / wo.read.
    'monitor.read', 'wo.report',
    'procedimiento.manage',
  ],
  // Técnico: rol de campo. Registra y llena formularios (incidencias y OT), actualiza su
  // trabajo; NO borra, NO aprueba, NO cierra, NO gestiona usuarios ni credenciales.
  'Técnico': [
    'asset.read', 'asset.update', 'location.read',
    'wo.read', 'wo.update',
    'incident.create', 'incident.read', 'incident.update',
    'document.read', 'dashboard.read', 'troubleshooting.read',
    'inventory.read', 'inventory.check',
    // Levanta la solicitud de acceso especial desde campo (no la aprueba).
    'access.read', 'access.request',
    'monitor.read', 'wo.report',
  ],
  // Técnico de Red: como el Técnico, pero PUEDE ver datos de red y credenciales (accesos).
  'Técnico de Red': [
    'asset.read', 'asset.update', 'location.read',
    'wo.read', 'wo.update',
    'incident.create', 'incident.read', 'incident.update',
    'document.read', 'dashboard.read', 'troubleshooting.read',
    'credential.read', 'credential.manage',
    'inventory.read', 'inventory.check',
    'access.read', 'access.request',
    'monitor.read', 'wo.report',
  ],
  // Consultor Externo: SOLO lectura del avance del proceso.
  'Consultor Externo': [
    'dashboard.read', 'incident.read', 'wo.read',
    'troubleshooting.read', 'asset.read', 'location.read',
    'inventory.read', 'access.read',
    'monitor.read', 'wo.report',
  ],
  /* JEFE DE PRODUCCIÓN (bloque 26). Antes compartía rol con el consultor
     externo, que es sólo mirar. Pero Producción no viene a mirar: viene a
     DECIR qué zonas no pueden quedarse sin vista. Ése es su único permiso de
     escritura, y es el que integra a las tres áreas. */
  /* JEFE DE PRODUCCIÓN — nivel PLANTA. Ve los tres trenes a propósito: es
     quien compara líneas y decide dónde duele más. No lleva `exigeAmbito`. */
  'Jefe de Producción': [
    'om.mirar', 'cobertura.mirar', 'activos.mirar',
    'dashboard.read', 'incident.read', 'incident.create', 'wo.read',
    'troubleshooting.read', 'asset.read', 'location.read',
    'inventory.read', 'access.read',
    'zona.criticidad',
    'monitor.read', 'wo.report',
  ],

  /* ==========================================================================
     JEFE DE TREN (bloque 42) — UNO POR TREN, Y SÓLO EL SUYO
     --------------------------------------------------------------------------
     ESTA PLANTILLA ES CORTA A PROPÓSITO. Cinco pantallas y ni una más:

       Mis cámaras      (om.mirar)         qué falla ahora y qué se hace
       Mis activos      (activos.mirar)    qué hay y cuánto exige manlift
       Mi cobertura     (cobertura.mirar)  qué zonas están sin vista
       Zonas vitales    (zona.criticidad)  LO ÚNICO QUE ESCRIBE
       (y el detalle de su tren, vía location.read)

     LO QUE NO LLEVA, Y ES LA PARTE IMPORTANTE:
       · `dashboard.read`  -> abriría el tablero de Mantenimiento, Mi bandeja
                              e Indicadores. Nada de eso es información de
                              producción: son herramientas de decisión de otra
                              área.
       · `asset.read`      -> abriría el módulo de Activos con doce columnas y
                              veintiocho campos, y con él la sección
                              INFRAESTRUCTURA entera del menú.
       · `wo.read`         -> las trescientas órdenes de la planta. Para ver la
                              de SU cámara ya tiene `om.mirar`.
       · `inventory.read`  -> el almacén es de Mantenimiento.

     Y LLEVA `exigeAmbito` (ver más abajo): sin tren asignado no ve NADA, en
     vez de ver los tres. En Aceros Arequipa que el jefe del Tren 1 vea el
     Tren 3 no es ruido en pantalla: es información que sale de su área.

     El JEFE DE TURNO usa esta misma plantilla: mismo alcance, mismo tren.
     ========================================================================== */
  'Jefe de Tren': [
    'om.mirar', 'activos.mirar', 'cobertura.mirar',
    'location.read',
    'zona.criticidad',
  ],
  /* SUPERVISOR OPERATIVO DE TERCERÍA (bloque 28).
     Responde por la cuadrilla contratada, que cubre los tres trenes. Su
     escritura fuerte es una sola: FIRMAR en qué zonas se puede trabajar con
     el tren en marcha. Lo demás es lo que necesita para firmar con criterio
     —ver el equipo, cómo se llega y qué órdenes hay— y para mover el trabajo
     de su gente. NO cierra órdenes: eso sigue siendo del Jefe. */
  'Supervisor Operativo de Tercería': [
    'dashboard.read', 'asset.read', 'location.read',
    'incident.read', 'incident.create',
    'wo.read', 'wo.update', 'wo.report',
    'access.read', 'access.request', 'document.read',
    'zona.intervencion',
  /* Bloque 29. Escribir y aprobar los procedimientos de restauración: lo que
     va a seguir el próximo técnico, posiblemente de noche y solo. */
  'procedimiento.manage',
  ],
};

async function main() {
  console.log('Sembrando SGIT-CCTV (Planta Pisco)...');

  // 1) Permisos
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  }
  const permMap = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  // 2) Roles + asignación de permisos
  const roleIds: Record<string, string> = {};
  for (const [name, perms] of Object.entries(ROLES)) {
    /* BLOQUE 42 — `exigeAmbito` se ESCRIBE también al actualizar, y es
       deliberado. El resto del upsert usa `update: {}` para no pisar lo que
       alguien haya editado a mano desde la pantalla de Roles; aquí no vale esa
       regla: si la plantilla dice que un Jefe de Tren sólo ve su tren y alguien
       lo desmarca, la sectorización se pierde en silencio y nadie se entera
       hasta que ve las tres pestañas. Es una regla de contención de
       información, no una preferencia. */
    const exigeAmbito = ROLES_SECTORIZADOS.includes(name);
    const role = await prisma.role.upsert({
      where: { name },
      update: { exigeAmbito },
      create: { name, exigeAmbito },
    });
    roleIds[name] = role.id;
    for (const code of perms) {
      const permissionId = permMap.get(code)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }
  // Sincroniza permisos por rol: elimina los que ya no correspondan. Hace el seed idempotente
  // ante cambios de rol SIN recrear la BD (ej.: retirar wo.approve a Supervisor TI).
  for (const [name, perms] of Object.entries(ROLES)) {
    const allowed = perms.map((c) => permMap.get(c)!);
    await prisma.rolePermission.deleteMany({
      where: { roleId: roleIds[name], permissionId: { notIn: allowed } },
    });
  }

  // 3) Usuario administrador inicial
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@acerosarequipa.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin.Pisco2026';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      fullName: 'Administrador SGIT',
      passwordHash: await argon2.hash(adminPass),
      roleId: roleIds['Jefe de Mantenimiento'],
    },
  });

  // 4) VLANs (arquitectura por Tren)
  const vlans = [
    { number: 10, name: 'Laminación Tren 1', role: 'tren', subnet: '172.16.10.0/24' },
    { number: 20, name: 'Laminación Tren 2', role: 'tren', subnet: '172.16.20.0/24' },
    { number: 30, name: 'Laminación Tren 3', role: 'tren', subnet: '172.16.30.0/24' },
    { number: 100, name: 'NVR / Grabación', role: 'nvr', subnet: '172.16.100.0/24' },
    { number: 200, name: 'Gestión', role: 'gestion', subnet: '172.16.200.0/24' },
  ];
  for (const v of vlans) {
    await prisma.vlan.upsert({ where: { number: v.number }, update: {}, create: v });
  }

  // 5) Jerarquía de ubicaciones: Empresa > Planta > Tren 1/2/3
  const empresa = await prisma.location.upsert({
    where: { code: 'AASA' },
    update: {},
    create: { code: 'AASA', name: 'Aceros Arequipa', type: 'EMPRESA', path: 'AASA' },
  });
  const planta = await prisma.location.upsert({
    where: { code: 'AASA-PISCO' },
    update: {},
    create: { code: 'AASA-PISCO', name: 'Planta Pisco', type: 'PLANTA', parentId: empresa.id, path: 'AASA/PISCO' },
  });
  const trenes: Record<string, string> = {};
  for (const n of [1, 2, 3]) {
    const t = await prisma.location.upsert({
      where: { code: `AASA-PISCO-T${n}` },
      update: {},
      create: {
        code: `AASA-PISCO-T${n}`, name: `Tren ${n} (Laminación)`, type: 'TREN',
        parentId: planta.id, path: `AASA/PISCO/T${n}`,
      },
    });
    trenes[`T${n}`] = t.id;
  }

  // Gabinete de ejemplo en Tren 1 (antes "Rack")
  const rackT1 = await prisma.location.upsert({
    where: { code: 'AASA-PISCO-T1-R01' },
    update: { name: 'Gabinete R-01' },
    create: {
      code: 'AASA-PISCO-T1-R01', name: 'Gabinete R-01', type: 'RACK',
      parentId: trenes['T1'], path: 'AASA/PISCO/T1/R01',
    },
  });

  // 6) Activos de ejemplo con topología PMP
  //    Switch core (anillo) -> switch distribución -> NVR ; FortiSwitch -> antena PMP -> cámara
  const coreSwitch = await prisma.asset.upsert({
    where: { assetCode: 'AA-SW-T1-CORE-001' },
    update: {},
    create: {
      assetCode: 'AA-SW-T1-CORE-001', type: 'SWITCH', brand: 'Fortinet', model: 'FortiSwitch',
      status: 'OPERATIVO', criticality: 'CRITICA', train: 'TREN_1', locationId: rackT1.id,
      switchDev: { create: { portCount: 24, mgmtIp: '172.16.200.2', vendor: 'Fortinet', switchRole: 'CORE_ANILLO' } },
    },
  });
  const nvr = await prisma.asset.upsert({
    where: { assetCode: 'AA-NVR-T1-R01-001' },
    update: {},
    create: {
      assetCode: 'AA-NVR-T1-R01-001', type: 'NVR', brand: 'Hikvision', model: 'DS-96xxNI',
      status: 'OPERATIVO', criticality: 'CRITICA', train: 'TREN_1', locationId: rackT1.id,
      nvr: { create: { channels: 64, diskCount: 8, capacityTb: 90, hasLocalDisk: true, nicPrimary: '172.16.100.10', nicSecondary: '10.0.0.10' } },
    },
  });
  const pmp = await prisma.asset.upsert({
    where: { assetCode: 'AA-AP-T1-PUL-001' },
    update: {},
    create: {
      assetCode: 'AA-AP-T1-PUL-001', type: 'WIRELESS', brand: 'Ubiquiti', model: 'airMAX PMP',
      status: 'OPERATIVO', criticality: 'ALTA', train: 'TREN_1', locationId: trenes['T1'],
      wireless: { create: { vendor: 'Ubiquiti', frequency: '5 GHz', mode: 'PMP_BASE', originPoint: 'Púlpito T1', linkStable: true } },
    },
  });
  const camera = await prisma.asset.upsert({
    where: { assetCode: 'AA-CAM-T1-FX-001' },
    update: {},
    create: {
      assetCode: 'AA-CAM-T1-FX-001', type: 'CAMERA', brand: 'Hikvision', model: 'DS-2CD1143G0-I',
      firmware: 'V5.5.x',
      status: 'OPERATIVO', criticality: 'ALTA', train: 'TREN_1', locationId: trenes['T1'],
      camera: { create: { resolution: '2560x1440', ipAddress: '172.16.10.21', nvrId: nvr.id, wirelessUplinkId: pmp.id } },
    },
  });

  // 6b) Gabinete (rack) — parámetro de mantenimiento con rótulo, ubicación y equipos montados
  const gabT1 = await prisma.cabinet.upsert({
    where: { code: 'GAB-T1-R01' },
    update: {},
    create: {
      code: 'GAB-T1-R01', name: 'Gabinete R-01 (Tren 1)', locationId: rackT1.id,
      referencePlace: 'Sala de equipos — Tren 1, Gabinete R-01',
    },
  });
  // El NVR y el switch core van montados en ese gabinete (para ubicarlos rápido).
  await prisma.asset.updateMany({
    where: { assetCode: { in: ['AA-NVR-T1-R01-001', 'AA-SW-T1-CORE-001'] } },
    data: { cabinetId: gabT1.id },
  });

  // 7) Enlaces de topología (anillo de fibra + uplink)
  const linkExists = await prisma.networkLink.findFirst({ where: { endpointAId: coreSwitch.id, endpointBId: nvr.id } });
  if (!linkExists) {
    await prisma.networkLink.create({
      data: { medium: 'FIBRA', endpointAId: coreSwitch.id, endpointBId: nvr.id, isRing: true, description: 'Core (anillo) → NVR directo' },
    });
  }

  // 8) Incidencias demo (encienden el dashboard de troubleshooting)
  await prisma.incident.upsert({
    where: { code: 'INC-2026-0001' },
    update: {},
    create: {
      code: 'INC-2026-0001',
      title: 'Saturación de sesiones en NVR de grúa',
      description: 'NO MORE USER CAN BE CONNECTED; 20+ sesiones concurrentes.',
      category: 'SATURACION_SESIONES_NVR',
      priority: 'ALTA',
      status: 'RESUELTA',
      assetId: nvr.id,
      rootCause: 'Caídas del enlace Ubiquiti que no cierran sesión en el NVR',
      concurrentSessions: 22,
      affectedCameras: 6,
      visionDownMin: 45,
      mttrMinutes: 90,
      resolvedAt: new Date(),
    },
  });
  const inc2 = await prisma.incident.upsert({
    where: { code: 'INC-2026-0002' },
    update: {},
    create: {
      code: 'INC-2026-0002',
      title: 'Enlace PMP inestable en Tren 1',
      description: 'Radioenlace Ubiquiti del púlpito con cortes intermitentes.',
      category: 'CAIDA_ENLACE_INALAMBRICO',
      priority: 'CRITICA',
      status: 'ABIERTA',
      assetId: pmp.id,
      affectedCameras: 4,
    },
  });

  // 9) Orden de mantenimiento demo (preventiva sobre el NVR)
  await prisma.workOrder.upsert({
    where: { code: 'OM-2026-0001' },
    update: {},
    create: {
      code: 'OM-2026-0001',
      type: 'PREVENTIVO',
      status: 'ABIERTA',
      assetId: nvr.id,
      zone: 'Sala NVR — Grúa (Tren 1)',
      activity: 'Mantenimiento preventivo del NVR: limpieza, verificación de discos y firmware.',
      scheduledDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });

  // OM correctiva demo (vencida) originada por la incidencia INC-2026-0002
  await prisma.workOrder.upsert({
    where: { code: 'OM-2026-0002' },
    update: {},
    create: {
      code: 'OM-2026-0002',
      type: 'CORRECTIVO',
      status: 'ABIERTA',
      assetId: pmp.id,
      zone: 'Tren 1 — Púlpito (antena PMP)',
      incidentId: inc2.id,
      activity: 'Corrección de enlace PMP inestable: alineación de antena y revisión del radioenlace.',
      scheduledDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
    },
  });

  // 9a-bis) OM correctivas adicionales para que la antena PMP sea candidata a reemplazo (≥3 en 12 meses)
  for (const n of [3, 4]) {
    const when = new Date(Date.now() - n * 20 * 24 * 3600 * 1000);
    await prisma.workOrder.upsert({
      where: { code: `OM-2026-000${n}` },
      update: {},
      create: {
        code: `OM-2026-000${n}`, type: 'CORRECTIVO', status: 'CERRADA', assetId: pmp.id,
        zone: 'Tren 1 — Púlpito (antena PMP)',
        activity: 'Corrección de enlace PMP inestable (reincidencia).',
        scheduledDate: when, executedDate: when,
      },
    });
  }

  // 9b) PC de visualización con iVMS-4200 (parte del mantenimiento CCTV)
  const pcIvms = await prisma.asset.upsert({
    where: { assetCode: 'AA-PC-T1-PUL-001' },
    update: {},
    create: {
      assetCode: 'AA-PC-T1-PUL-001', type: 'PC', brand: 'Dell', model: 'iVMS-4200 v3.x',
      status: 'OPERATIVO', criticality: 'ALTA', train: 'TREN_1', locationId: trenes['T1'],
      referencePlace: 'Púlpito Tren 1 — estación de visualización iVMS-4200',
      ipAddress: '10.0.0.50',
    },
  });

  // 9c) Planes de mantenimiento preventivo (30 días zona crítica, 60 días el resto).
  //     La cámara del Tren 1 (cerca del horno) queda VENCIDA para ver la alerta.
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const plans = [
    { assetId: camera.id, zoneCritical: true, overdue: true },  // cerca del horno → 30 días (vencida)
    { assetId: nvr.id, zoneCritical: true, overdue: false },
    { assetId: pmp.id, zoneCritical: true, overdue: false },
    { assetId: coreSwitch.id, zoneCritical: false, overdue: false },
    { assetId: pcIvms.id, zoneCritical: false, overdue: false },
  ];
  for (const pl of plans) {
    const interval = pl.zoneCritical ? 30 : 60;
    const last = pl.overdue ? addDays(new Date(), -(interval + 10)) : new Date();
    const data = {
      intervalDays: interval, zoneCritical: pl.zoneCritical,
      lastServiceAt: last, nextDueAt: addDays(last, interval), active: true,
    };
    await prisma.preventivePlan.upsert({
      where: { assetId: pl.assetId },
      update: data,
      create: { assetId: pl.assetId, ...data },
    });
  }

  // 10) Inventario / repuestos demo (con faltantes y sin stock para ver alertas)
  async function ensureSpare(data: any) {
    const found = await prisma.sparePart.findFirst({ where: { name: data.name } });
    return found || prisma.sparePart.create({ data });
  }
  const link = (sparePartId: string, assetId: string) =>
    prisma.sparePartAsset.upsert({
      where: { sparePartId_assetId: { sparePartId, assetId } },
      update: {}, create: { sparePartId, assetId },
    });

  const spPoe = await ensureSpare({ name: 'Fuente PoE 48V 30W', sapCode: 'SAP-REP-1001', category: 'Energía', brand: 'Genérico', unit: 'unidad', warehouse: 'Almacén TI', currentStock: 6, minStock: 3, lastCheckedAt: new Date() });
  const spCam = await ensureSpare({ name: 'Cámara Hikvision DS-2CD1143G0-I', sapCode: 'SAP-REP-1002', category: 'Cámara', brand: 'Hikvision', model: 'DS-2CD1143G0-I', unit: 'unidad', warehouse: 'Almacén TI', currentStock: 1, minStock: 2, lastCheckedAt: new Date() });
  const spAnt = await ensureSpare({ name: 'Antena Ubiquiti airMAX suscriptor', sapCode: 'SAP-REP-1003', category: 'Inalámbrico', brand: 'Ubiquiti', model: 'airMAX PMP', unit: 'unidad', warehouse: 'Almacén TI', currentStock: 0, minStock: 1 });
  const spDisk = await ensureSpare({ name: 'Disco 4TB Vigilancia (NVR)', sapCode: 'SAP-REP-1004', category: 'Almacenamiento', brand: 'WD Purple', unit: 'unidad', warehouse: 'Almacén TI', currentStock: 4, minStock: 1, lastCheckedAt: new Date() });
  await ensureSpare({ name: 'Conector RJ45 Cat6', sapCode: 'SAP-REP-1005', category: 'Conectividad', unit: 'unidad', warehouse: 'Almacén TI', currentStock: 80, minStock: 20, lastCheckedAt: new Date() });

  await link(spPoe.id, coreSwitch.id);
  await link(spPoe.id, camera.id);
  await link(spCam.id, camera.id);
  await link(spAnt.id, pmp.id);
  await link(spDisk.id, nvr.id);

  console.log('  Inventario: 5 repuestos demo (Cámara y Antena con faltante/sin stock)');
  console.log('Semilla completada:'.replace('Semilla','Semilla'));
  console.log('Semilla completada:');
  console.log(`  Roles: ${Object.keys(ROLES).join(', ')}`);
  console.log(`  Admin: ${adminEmail} / ${adminPass}`);
  console.log('  VLANs: 10, 20, 30, 100, 200');
  console.log('  Ubicaciones: AASA > Pisco > Tren 1/2/3 (+Rack R-01)');
  console.log('  Activos demo: Core Fortinet, NVR Hikvision, Antena PMP púlpito, Cámara T1');
  console.log('  Incidencias demo: INC-2026-0001 (resuelta), INC-2026-0002 (abierta)');
  console.log('  OM demo: OM-2026-0001 (preventiva) y OM-2026-0002 (correctiva, ligada a INC-2026-0002)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
