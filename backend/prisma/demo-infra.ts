/* eslint-disable no-console */
/**
 * DATOS DE DEMO · INFRAESTRUCTURA — 21/09/2026.
 *
 * =============================================================================
 *  POR QUÉ EXISTE ESTE SEGUNDO ARCHIVO
 * =============================================================================
 *  Palabras del usuario, después de recorrer el software entero:
 *
 *  > «Creo que gran parte de los defectos del software es que **no tenemos
 *  >  data avanzada por módulo**.»
 *
 *  Tenía razón, y explica la mitad de lo que le chirrió en el paseo. «Cableado:
 *  0 tramos», «No hay subredes declaradas», «No hay tableros registrados»,
 *  «0 ocupados · 24 sin mapear»… no eran pantallas mal hechas: eran pantallas
 *  **vacías**, y una pantalla vacía no se puede juzgar ni enseñar.
 *
 *  `demo.ts` carga el caso de Producción —dos cámaras caídas—. Éste carga la
 *  INFRAESTRUCTURA que sostiene ese caso, que es lo que hacía falta para que
 *  los módulos de Dependencias dejaran de estar en blanco.
 *
 * =============================================================================
 *  LA CADENA, EN EL ORDEN QUE ÉL PUSO
 * =============================================================================
 *  > «Empezamos por lo más básico: primero la energía, luego los dispositivos,
 *  >  luego el cableado, luego los dispositivos que dependen de ese
 *  >  dispositivo, el gabinete…»
 *
 *  Así se carga aquí, y ese orden no es estético: cada paso necesita el
 *  anterior para poder engancharse.
 *
 *      TABLERO ─ circuito ─→ SWITCH capa 3 ─ puerto ─→ SWITCH capa 2 (PoE)
 *                                                          │
 *                                                          ├─→ cámara
 *                                                          └─→ antena
 *
 * =============================================================================
 *  REGLAS QUE SE RESPETAN
 * =============================================================================
 *  · TODO lleva el prefijo `DEMO-`, como en `demo.ts`: se ve a simple vista y
 *    «Dejar la base vacía» lo borra con el resto.
 *  · Es IDEMPOTENTE: se puede lanzar dos veces. Se usa `upsert` por código en
 *    todo lo que tiene clave única.
 *  · NO se inventan datos que en planta se miden: hay un switch **sin declarar
 *    su presupuesto PoE** y un tramo **sin medir**, a propósito. Enseñar el
 *    sistema con todo perfecto esconde justo lo que lo hace fiable — que dice
 *    lo que NO sabe.
 *  · Deja un tramo de 112 m: por encima de los 90 m de norma. Es el caso que
 *    hace útil la pantalla de Cableado, y sin él no se ve para qué sirve.
 *
 *  CÓMO SE USA:   npm run demo:infra
 */
import { clienteDeScript } from './cliente';

const prisma = clienteDeScript();

async function main() {
  console.log('Cargando INFRAESTRUCTURA de demo (todo con prefijo DEMO-)…');

  /* Se cuelga del árbol real, igual que demo.ts: sin tren, las pantallas
     sectorizadas no sabrían dónde poner nada. */
  const tren = await prisma.location.findFirst({
    where: { type: 'TREN' }, orderBy: { path: 'asc' },
    select: { id: true, name: true, code: true },
  });
  if (!tren) {
    console.error('No hay ningún TREN en el árbol. Ejecuta antes `npm run prisma:seed`.');
    process.exit(1);
  }
  console.log(`  Colgando la infraestructura de: ${tren.name}`);

  const sala = await prisma.location.findFirst({
    where: { name: { contains: 'ctrica' } }, select: { id: true, name: true },
  }) ?? tren;

  // ======================================================== 1. LA ENERGÍA
  /* PRIMERO EL TABLERO. Es el eslabón del que depende todo lo demás, y el que
     el usuario echó en falta: «si el switch pierde el 220, ¿cómo lo
     restauramos? Ni siquiera sabemos dónde está el tablero». */
  const tablero = await prisma.tableroElectrico.upsert({
    where: { codigo: 'DEMO-TAB-T1-MCC-01' },
    update: {},
    create: {
      codigo: 'DEMO-TAB-T1-MCC-01',
      nombre: 'MCC Tren 1 — sala eléctrica',
      tipo: 'MCC',
      locationId: sala.id,
      referencia: 'Sala eléctrica, pared norte, segundo tablero desde la puerta',
      comoLlegar: 'Entrada por el pasillo de laminación; la sala está cerrada con llave, la tiene el operador de turno.',
      tensionV: 440,
      fases: 3,
      corrienteNominalA: 250,
      riesgos: 'Exige permiso eléctrico y bloqueo (LOTO). Hay barras expuestas en la parte superior.',
    },
  });

  const cQuince = await prisma.circuitoElectrico.upsert({
    where: { id: 'demo-circuito-15' },
    update: {},
    create: {
      id: 'demo-circuito-15',
      tableroId: tablero.id,
      numero: '15',
      designacion: 'Gabinete de comunicaciones R-01 (CCTV)',
      proteccion: 'TERMOMAGNETICO',
      amperajeA: 16, polos: 2, tensionV: 220,
      estado: 'ACTIVO',
      esCctv: true,
    },
  });

  await prisma.circuitoElectrico.upsert({
    where: { id: 'demo-circuito-22' },
    update: {},
    create: {
      id: 'demo-circuito-22',
      tableroId: tablero.id,
      numero: '22',
      designacion: 'Iluminación pasillo norte',
      proteccion: 'TERMOMAGNETICO',
      amperajeA: 10, polos: 1, tensionV: 220,
      estado: 'ACTIVO',
      /* NO es CCTV, y está a propósito: el filtro «sólo CCTV» de la pantalla
         no demuestra nada si todos los circuitos son de CCTV. */
      esCctv: false,
    },
  });

  // =================================================== 2. EL GABINETE
  const gabinete = await prisma.cabinet.upsert({
    where: { code: 'DEMO-GAB-T1-R01' },
    update: {},
    create: {
      code: 'DEMO-GAB-T1-R01',
      name: 'Comunicaciones R-01 (Tren 1)',
      locationId: sala.id,
      referencePlace: 'Sala eléctrica — rack de 19", junto al MCC',
    },
  });

  // ================================= 3. LOS DISPOSITIVOS, DE ARRIBA ABAJO
  /* EL CAPA 3 DEL ANILLO. Lo que el usuario llama «los Fortinet». */
  const core = await prisma.asset.upsert({
    where: { assetCode: 'DEMO-SW-T1-CORE' },
    update: {},
    create: {
      assetCode: 'DEMO-SW-T1-CORE',
      type: 'SWITCH', status: 'OPERATIVO', criticality: 'CRITICA',
      brand: 'Fortinet', model: 'FortiSwitch 124F',
      referencePlace: 'Gabinete R-01, U-12',
      locationId: sala.id, cabinetId: gabinete.id,
      installDate: new Date('2022-06-01'),
      ipAddress: '10.20.4.10',
    },
  });
  await prisma.assetSwitch.upsert({
    where: { assetId: core.id },
    update: {},
    create: {
      assetId: core.id,
      portCount: 24, poePorts: 0, poeBudgetW: 0,
      mgmtIp: '10.20.4.10', mgmtNetwork: 'GESTION',
      vendor: 'Fortinet', switchRole: 'CORE_ANILLO',
      capa: 'CAPA_3', gestionable: true, soportaVlan: true,
    },
  });

  /* EL CAPA 2 DE CAMPO. «Los TP-Link, los switch que reparten power, los que
     están dispersados en los tableros o en los pequeños gabinetes.»

     SU PRESUPUESTO PoE SE QUEDA SIN DECLARAR, a propósito: es el caso que hace
     que la pantalla de Capacidad diga «presupuesto sin declarar» en vez de
     inventar un número. Un PoE supuesto es cómo se quema una fuente. */
  const acceso = await prisma.asset.upsert({
    where: { assetCode: 'DEMO-SW-T1-PUL' },
    update: {},
    create: {
      assetCode: 'DEMO-SW-T1-PUL',
      type: 'SWITCH', status: 'OPERATIVO', criticality: 'ALTA',
      brand: 'TP-Link', model: 'TL-SG1008P',
      referencePlace: 'Caja de paso sobre el púlpito de control',
      locationId: tren.id,
      installDate: new Date('2023-02-10'),
      ipAddress: '10.20.4.11',
    },
  });
  await prisma.assetSwitch.upsert({
    where: { assetId: acceso.id },
    update: {},
    create: {
      assetId: acceso.id,
      portCount: 8, poePorts: 8,
      poeBudgetW: null,            // sin declarar, a propósito
      vendor: 'TP-Link', switchRole: 'POE_ACCESO',
      capa: 'CAPA_2', gestionable: false, soportaVlan: false,
    },
  });

  const nvr = await prisma.asset.upsert({
    where: { assetCode: 'DEMO-NVR-T1-R01' },
    update: {},
    create: {
      assetCode: 'DEMO-NVR-T1-R01',
      type: 'NVR', status: 'OPERATIVO', criticality: 'CRITICA',
      brand: 'Hikvision', model: 'DS-9664NI-I8',
      referencePlace: 'Gabinete R-01, U-8',
      locationId: sala.id, cabinetId: gabinete.id,
      installDate: new Date('2022-06-01'),
      ipAddress: '10.20.4.20',
    },
  });
  await prisma.assetNvr.upsert({
    where: { assetId: nvr.id },
    update: {},
    create: { assetId: nvr.id, channels: 64, nicPrimary: '192.168.10.20', nicSecondary: '10.20.4.20' },
  });

  console.log('  Energía, gabinete y equipos de red listos.');

  // ================================== 4. LAS CONEXIONES, PUERTO A PUERTO
  /* Sin esto, «Capacidad de red» no puede decir cuántos puertos quedan libres
     — y era justo lo que el usuario vio: 24 declarados, 0 registrados. */
  const puertosCore = [
    { n: 1, conectado: nvr.id, vlan: 40 },
    { n: 2, conectado: acceso.id, vlan: 10 },
  ];
  for (const p of puertosCore) {
    await prisma.switchPort.upsert({
      where: { switchId_portNumber: { switchId: core.id, portNumber: p.n } },
      update: {},
      create: {
        switchId: core.id, assetSwitchId: core.id,
        portNumber: p.n, poe: false, vlanNumber: p.vlan,
        connectedAssetId: p.conectado,
      },
    });
  }
  /* Y ocho puertos más SIN nada enchufado: son los «libres» de verdad, los que
     permiten contestar «¿caben cuatro cámaras más?». */
  for (let n = 3; n <= 10; n += 1) {
    await prisma.switchPort.upsert({
      where: { switchId_portNumber: { switchId: core.id, portNumber: n } },
      update: {},
      create: { switchId: core.id, assetSwitchId: core.id, portNumber: n, poe: false, vlanNumber: 40 },
    });
  }

  for (let n = 1; n <= 8; n += 1) {
    await prisma.switchPort.upsert({
      where: { switchId_portNumber: { switchId: acceso.id, portNumber: n } },
      update: {},
      create: { switchId: acceso.id, assetSwitchId: acceso.id, portNumber: n, poe: true, vlanNumber: 40 },
    });
  }

  // =========================================== 5. QUÉ CUELGA DE QUÉ LLAVE
  for (const [assetId, viaPoe] of [[core.id, false], [nvr.id, false], [acceso.id, true]] as const) {
    await prisma.alimentacionActivo.upsert({
      where: { circuitoId_assetId: { circuitoId: cQuince.id, assetId } },
      update: {},
      create: { circuitoId: cQuince.id, assetId, viaPoe },
    });
  }

  // ==================================================== 6. EL DIRECCIONAMIENTO
  for (const s of [
    {
      cidr: '192.168.10.0/24', nombre: 'DEMO · CCTV Tren 1', proposito: 'CCTV' as const,
      vlan: 40, gateway: '192.168.10.1', dhcpDesde: '192.168.10.200', dhcpHasta: '192.168.10.250',
      descripcion: 'Cámaras y grabador del Tren 1. Las estáticas van por debajo de .200.',
    },
    {
      cidr: '10.20.4.0/24', nombre: 'DEMO · Gestión de red', proposito: 'GESTION' as const,
      vlan: 10, gateway: '10.20.4.1',
      descripcion: 'Gestión de switches, NVR y UPS. Es la única que alcanza el servidor por ping.',
    },
  ]) {
    await prisma.subred.upsert({
      where: { cidr: s.cidr },
      update: {},
      create: { ...s, locationId: tren.id },
    });
  }

  // ======================================================= 7. EL CABLEADO
  /* UNO FUERA DE NORMA Y UNO SIN MEDIR, a propósito. La pantalla de Cableado
     sólo demuestra para qué sirve cuando hay un tramo que se pasa de los 90 m
     — que es el que falla «a veces» y vuelve loco a todo el mundo. */
  for (const c of [
    {
      id: 'demo-cable-01', code: 'DEMO-TR-001', category: 'CAT6' as const,
      meters: 42, metersEstimated: false, shielded: true, route: 'BANDEJA' as const,
      fromAssetId: core.id, fromPortNumber: 2, toAssetId: acceso.id,
      notes: 'Bandeja compartida con fuerza: por eso va blindado.',
    },
    {
      id: 'demo-cable-02', code: 'DEMO-TR-002', category: 'CAT5E' as const,
      meters: 112, metersEstimated: false, shielded: false, route: 'CANALETA' as const,
      fromAssetId: acceso.id, fromPortNumber: 4, toAssetId: null,
      notes: 'Pasa de los 90 m de norma. La cámara del lecho se cae a ratos desde que se alargó.',
    },
    {
      id: 'demo-cable-03', code: 'DEMO-TR-003', category: 'CAT6' as const,
      meters: null, metersEstimated: true, shielded: false, route: 'TUBERIA' as const,
      fromAssetId: core.id, fromPortNumber: 1, toAssetId: nvr.id,
      notes: 'Sin medir: está por dentro de la tubería y no se ha pasado el metrajo.',
    },
  ]) {
    await prisma.assetCable.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, status: 'INSTALADO', installedAt: new Date('2023-02-10') },
    });
  }

  console.log('');
  console.log('  Listo. Cargado, en el orden de la cadena:');
  console.log('    1. DEMO-TAB-T1-MCC-01 · MCC con 2 circuitos (uno de CCTV, otro no)');
  console.log('    2. DEMO-GAB-T1-R01    · gabinete de comunicaciones');
  console.log('    3. DEMO-SW-T1-CORE    · Fortinet capa 3, 24 puertos, 10 registrados');
  console.log('       DEMO-SW-T1-PUL     · TP-Link capa 2 PoE, presupuesto SIN declarar');
  console.log('       DEMO-NVR-T1-R01    · grabador de 64 canales');
  console.log('    4. Dos subredes: CCTV (VLAN 40) y Gestión (VLAN 10)');
  console.log('    5. Tres tramos: uno de 112 m FUERA DE NORMA y uno sin medir');
  console.log('');
  console.log('  Mira el QR del tablero en Electricidad: dice qué se apaga con cada llave.');
  console.log('  Y Capacidad de red ya puede contestar «¿caben más cámaras?».');
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
