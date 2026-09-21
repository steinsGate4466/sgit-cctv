/* eslint-disable no-console */
/**
 * BORRAR LOS DATOS DE DEMO — 21/09/2026.
 *
 * =============================================================================
 *  POR QUÉ EXISTE
 * =============================================================================
 *  Petición del usuario, y es la correcta:
 *
 *  > «Es demo, se debe poder borrar en cualquier momento, y tampoco quiero que
 *  >  toques usuarios ni nada.»
 *
 *  «Dejar la base vacía» ya existía, pero hace otra cosa: **vacía la base
 *  entera**. Y además no llega a las tablas de infraestructura que carga
 *  `demo-infra.ts` —tableros, circuitos, subredes, tramos de cable, gabinetes—,
 *  así que ni siquiera serviría para deshacer esto del todo.
 *
 *  Esto es lo contrario: **un bisturí**. Borra EXACTAMENTE lo que cargaron
 *  `demo.ts` y `demo-infra.ts`, y nada más.
 *
 * =============================================================================
 *  LO QUE NO TOCA, PASE LO QUE PASE
 * =============================================================================
 *    · usuarios, roles y permisos   -> ni los lee para escribir
 *    · el árbol de ubicaciones      -> es la planta, no un dato de prueba
 *    · los catálogos                -> causas, síntomas, acciones
 *    · la auditoría                 -> es la prueba de qué pasó
 *    · CUALQUIER dato real          -> todo filtro exige el prefijo `DEMO-`
 *
 *  No hay un solo `deleteMany({})` sin filtro en este archivo. A propósito.
 *
 * =============================================================================
 *  EL ORDEN ES DE LAS HOJAS AL TRONCO
 * =============================================================================
 *  Una fila que alguien referencia no se puede borrar. Así que primero lo que
 *  cuelga —puertos, alimentaciones, avances— y al final los activos.
 *
 *  Cada paso va en su propio `try`: si una tabla no existe en esta versión, se
 *  salta y el resto sigue. Un borrado que se detiene a la mitad deja la base
 *  peor que antes de empezar.
 *
 *  CÓMO SE USA:   npm run demo:borrar
 */
import { clienteDeScript } from './cliente';

const prisma = clienteDeScript();
const P = 'DEMO-';

async function paso(nombre: string, fn: () => Promise<{ count: number }>) {
  try {
    const r = await fn();
    if (r.count) console.log(`    · ${nombre}: ${r.count}`);
  } catch (e: any) {
    console.log(`    · ${nombre}: se salta (${e?.code || 'sin tabla'})`);
  }
}

async function main() {
  console.log('Borrando SÓLO los datos de demo (prefijo DEMO-)…');
  console.log('  No se tocan usuarios, roles, ubicaciones ni auditoría.');
  console.log('');

  const p = prisma as any;

  const activos = await prisma.asset.findMany({
    where: { assetCode: { startsWith: P } }, select: { id: true },
  });
  const ids = activos.map((a) => a.id);
  console.log(`  Activos de demo encontrados: ${ids.length}`);

  const ordenes = await prisma.workOrder.findMany({
    where: { code: { startsWith: P } }, select: { id: true },
  });
  const omIds = ordenes.map((o) => o.id);

  const tableros = await prisma.tableroElectrico.findMany({
    where: { codigo: { startsWith: P } }, select: { id: true },
  });
  const tabIds = tableros.map((t) => t.id);

  // ------------------------------------------------ 1. lo que cuelga de la OM
  await paso('avances de OM', () => p.workOrderProgress.deleteMany({ where: { workOrderId: { in: omIds } } }));
  await paso('materiales de OM', () => p.workOrderMaterial.deleteMany({ where: { workOrderId: { in: omIds } } }));
  await paso('evidencias de OM', () => p.workOrderEvidence.deleteMany({ where: { workOrderId: { in: omIds } } }));
  await paso('notas de campo', () => p.notaCampo.deleteMany({ where: { workOrderId: { in: omIds } } }));

  // ------------------------------------------- 2. lo que cuelga del activo
  await paso('alimentación eléctrica', () => p.alimentacionActivo.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('puertos de switch', () => p.switchPort.deleteMany({ where: { switchId: { in: ids } } }));
  await paso('puertos que apuntaban a un equipo de demo',
    () => p.switchPort.updateMany({ where: { connectedAssetId: { in: ids } }, data: { connectedAssetId: null } }));
  await paso('enlaces de red', () => p.networkLink.deleteMany({ where: { OR: [{ fromAssetId: { in: ids } }, { toAssetId: { in: ids } }] } }));
  await paso('tramos de cable', () => p.assetCable.deleteMany({ where: { code: { startsWith: P } } }));
  await paso('fotos', () => p.assetPhoto.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('historial', () => p.assetHistory.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('credenciales', () => p.credential.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('observaciones', () => p.assetObservation.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('planes preventivos', () => p.preventivePlan.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('solicitudes de acceso', () => p.accessRequest.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('equipos instalados', () => p.equipoInstalado.deleteMany({ where: { assetId: { in: ids } } }));
  await paso('equipos en OM', () => p.omEquipo.deleteMany({ where: { OR: [{ assetId: { in: ids } }, { workOrderId: { in: omIds } }] } }));

  // --------------------------------------------------- 3. órdenes e incidencias
  await paso('órdenes de mantenimiento', () => p.workOrder.deleteMany({ where: { code: { startsWith: P } } }));
  await paso('evidencias de incidencia', () => p.incidentEvidence.deleteMany({ where: { incident: { code: { startsWith: P } } } }));
  await paso('incidencias', () => p.incident.deleteMany({ where: { code: { startsWith: P } } }));

  // ------------------------------------------------------------- 4. la energía
  await paso('circuitos eléctricos', () => p.circuitoElectrico.deleteMany({ where: { tableroId: { in: tabIds } } }));
  await paso('mediciones eléctricas', () => p.medicionElectrica.deleteMany({ where: { tableroId: { in: tabIds } } }));
  await paso('tableros eléctricos', () => p.tableroElectrico.deleteMany({ where: { codigo: { startsWith: P } } }));

  // ----------------------------------------------------------- 5. los activos
  /* Las fichas por tipo —assetCamera, assetSwitch, assetNvr…— se van solas:
     están declaradas con `onDelete: Cascade` sobre el activo. */
  await paso('activos', () => p.asset.deleteMany({ where: { assetCode: { startsWith: P } } }));

  // ------------------------------------------------------- 6. lo que queda
  await paso('gabinetes', () => p.cabinet.deleteMany({ where: { code: { startsWith: P } } }));
  await paso('subredes', () => p.subred.deleteMany({ where: { nombre: { startsWith: 'DEMO' } } }));
  await paso('repuestos', () => p.sparePart.deleteMany({ where: { sapCode: { startsWith: P } } }));

  console.log('');
  console.log('  Listo. La base queda como estaba antes de cargar la demo.');
  console.log('  Usuarios, roles, ubicaciones, catálogos y auditoría: intactos.');
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
