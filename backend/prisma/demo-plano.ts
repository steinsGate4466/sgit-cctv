/* eslint-disable no-console */
/**
 * PLANO DE DEMO — bloques 151 y 156.
 *
 * Carga el PLANO REFERENCIAL DE UN TREN DE LAMINACIÓN Y SU PÚLPITO, dibujado
 * por `plano-tren-referencial.ts` (no es la planta real: lo dice en la franja
 * superior y en el rótulo), crea las cámaras de ejemplo del tren y coloca en él
 * todos los equipos de demo (`DEMO-`). Sirve para ver el Mapa funcionando antes
 * de tener el DWG de un área.
 *
 *   npm run demo:cargar && npm run demo:infra && npm run demo:plano
 *
 * NO PISA NADA REAL:
 *   · Sólo crea equipos con prefijo `DEMO-` y sólo toca planos cuyo nombre
 *     empieza por «DEMO».
 *   · Si esa zona ya tiene un plano PUBLICADO de verdad, el de demo se queda
 *     en BORRADOR y se avisa: publicar la demo archivaría el plano real.
 *   · Un equipo de demo que no tiene sitio en el dibujo NO se coloca a ojo:
 *     queda en «sin colocar», que es lo que el sistema sabe de él.
 *   · Se borra con `npm run demo:borrar`, como el resto de la demo.
 *
 * BLOQUE 165 · ZONAS Y TREN 2. Además dibuja las ZONAS del tren (horno, línea,
 * púlpito, atado, sala eléctrica, sala de comunicaciones) como ubicaciones de
 * demo (`DEMO-T1-…`, nombre «… (demo)») colgadas del tren, y si existe el
 * Tren 2 en el árbol, le hace lo mismo y le añade el PLANO DE SU SALA
 * ELÉCTRICA: en el Mapa, la zona «Sala eléctrica» del Tren 2 abre ese plano.
 * Si el Tren 2 no existe en tu árbol, NO se inventa: se avisa y se sigue.
 */
import { clienteDeScript } from './cliente';
import { StorageService } from '../src/modules/storage/storage.service';
import {
  ANCHO, ALTO, M_POR_PX, SITIOS_M, SITIOS_T2_M, CAMARAS_DEL_TREN, CAMARAS_DEL_TREN_2, CAMARA_SALA_T1,
  ESTILO_DEMO, ZONAS_DEL_TREN, Sitio, enPx, svgTrenYPulpito, zonaEnPx,
} from './plano-tren-referencial';
import {
  ANCHO_SALA, ALTO_SALA, M_POR_PX_SALA, EQUIPOS_SALA_T2, enPxSala, svgSalaElectrica,
} from './plano-sala-referencial';

const prisma = clienteDeScript();
const almacen = new StorageService();
type Nodo = { id: string; parentId: string | null; type: string; name: string; code: string; path: string; siglaTren: string | null };
type Cam = { codigo: string; lugar: string; estado: 'OPERATIVO' | 'MANTENIMIENTO' | 'FUERA_SERVICIO'; criticidad?: 'ALTA' | 'MEDIA' };

/** ¿El punto (px) cae dentro del polígono (px)? Misma regla que el servidor. */
function dentro(x: number, y: number, pol: [number, number][]): boolean {
  let d = false;
  for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
    const [xi, yi] = pol[i]; const [xj, yj] = pol[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

/** Sube la imagen y crea (o reutiliza) el plano de demo de una ubicación. */
async function planoDeDemo(locationId: string, nombre: string, svg: string, ancho: number, alto: number, mpp: number, notas: string) {
  const datos = { nombre, archivoMime: 'image/svg+xml', anchoPx: ancho, altoPx: alto, metrosPorPx: mpp, notas };
  let plano = await prisma.plano.findFirst({ where: { locationId, nombre: { startsWith: 'DEMO' } } });
  if (!plano) {
    const ultima = await prisma.plano.findFirst({ where: { locationId }, orderBy: { version: 'desc' }, select: { version: true } });
    plano = await prisma.plano.create({ data: { ...datos, locationId, version: (ultima?.version ?? 0) + 1, archivoFileId: 'pendiente' } });
  }
  const objeto = `planos/${plano.id}.svg`;
  try {
    await almacen.put(objeto, Buffer.from(svg, 'utf8'), 'image/svg+xml');
  } catch (e: any) {
    console.error(`No se pudo guardar la imagen en el almacén (MinIO): ${e?.message || e}`);
    process.exit(1);
  }
  await prisma.plano.update({ where: { id: plano.id }, data: { ...datos, archivoFileId: objeto } });
  return plano;
}

/** Publica, salvo que la ubicación ya tenga un plano REAL publicado. */
async function publicarDemo(plano: { id: string; estado: string; locationId: string }, donde: string) {
  const real = await prisma.plano.findFirst({
    where: { locationId: plano.locationId, estado: 'PUBLICADO', id: { not: plano.id }, NOT: { nombre: { startsWith: 'DEMO' } } },
    select: { nombre: true },
  });
  if (real) {
    console.log(`  AVISO: ${donde} ya tiene publicado «${real.nombre}». La demo se queda en BORRADOR para no archivarlo.`);
  } else if (plano.estado !== 'PUBLICADO') {
    await prisma.plano.update({ where: { id: plano.id }, data: { estado: 'PUBLICADO', publicadoEn: new Date() } });
  }
}

/** Coloca un equipo en un plano (o actualiza su posición). */
async function colocar(planoId: string, assetId: string, xy: { x: number; y: number }, s: Sitio) {
  const pos = {
    xPx: xy.x, yPx: xy.y, alturaM: s.alturaM ?? null, rumbo: s.rumbo ?? null,
    alcanceM: s.alcanceM ?? null, anguloVision: s.rumbo != null ? 70 : null,
  };
  await prisma.posicionEnPlano.upsert({
    where: { planoId_assetId: { planoId, assetId } }, update: pos, create: { planoId, assetId, ...pos },
  });
}

/** Crea un equipo de demo si no existe. Si ya existe no se toca (alguien pudo cambiarle el estado para probar). */
async function equipoDeDemo(c: Cam & { tipo?: string }, locationId: string) {
  const ya = await prisma.asset.findUnique({ where: { assetCode: c.codigo }, select: { id: true } });
  if (ya) return false;
  await prisma.asset.create({
    data: {
      assetCode: c.codigo, type: (c.tipo ?? 'CAMERA') as any, status: c.estado, criticality: c.criticidad ?? 'MEDIA',
      brand: c.tipo && c.tipo !== 'CAMERA' ? 'Genérico' : 'Hikvision', model: c.tipo && c.tipo !== 'CAMERA' ? 'Equipo de ejemplo' : 'DS-2CD2T47G2',
      referencePlace: c.lugar, locationId,
    },
  });
  return true;
}

async function estilosDeCamara() {
  for (const [codigo, estilo] of Object.entries(ESTILO_DEMO)) {
    const a = await prisma.asset.findUnique({ where: { assetCode: codigo }, select: { id: true, type: true } });
    if (!a || a.type !== 'CAMERA') continue;
    await prisma.assetCamera.upsert({
      where: { assetId: a.id }, update: { cameraStyle: estilo }, create: { assetId: a.id, cameraStyle: estilo },
    });
  }
}

/**
 * EL PLANO DE UN TREN con sus zonas. Devuelve el plano y la ubicación de
 * cada zona (por clave), para colgar de ella planos de más detalle.
 */
async function cargarTren(tren: Nodo, sigla: string, camaras: Cam[], sitios: Record<string, Sitio>, nombrePlano: string, rotulo: string) {
  // 1. Las zonas como ubicaciones de demo colgadas del tren.
  const zonaLoc = new Map<string, string>();
  for (const z of ZONAS_DEL_TREN) {
    const code = `DEMO-${sigla}-${z.clave}`;
    const loc = await prisma.location.upsert({
      where: { code },
      update: { name: `${z.nombre} ${sigla} (demo)`, parentId: tren.id },
      create: { code, name: `${z.nombre} ${sigla} (demo)`, type: z.tipo as any, parentId: tren.id, path: `${tren.path}/${code}` },
      select: { id: true },
    });
    zonaLoc.set(z.clave, loc.id);
  }
  const zonaDe = (s: Sitio) => {
    const { x, y } = enPx(s);
    const z = ZONAS_DEL_TREN.find((q) => dentro(x, y, zonaEnPx(q)));
    return z ? zonaLoc.get(z.clave)! : tren.id;
  };

  // 2. Las cámaras del tren, en la zona donde cae su sitio.
  let creadas = 0;
  for (const c of camaras) if (await equipoDeDemo(c, sitios[c.codigo] ? zonaDe(sitios[c.codigo]) : tren.id)) creadas++;
  if (creadas) console.log(`  ${creadas} equipo(s) de ejemplo creado(s) en ${tren.name}.`);

  // 3. El plano del tren.
  const plano = await planoDeDemo(tren.id, nombrePlano, svgTrenYPulpito(rotulo), ANCHO, ALTO, M_POR_PX,
    'Distribución típica de un tren de laminación, dibujada por el script de demo. No es la planta real.');

  // 4. Colocar los equipos de demo del tren que tienen sitio; los demás, sin colocar.
  const nodos = await prisma.location.findMany({ select: { id: true, parentId: true } });
  const rama = new Set<string>([tren.id]);
  for (let crece = true; crece;) {
    crece = false;
    for (const n of nodos) if (n.parentId && rama.has(n.parentId) && !rama.has(n.id)) { rama.add(n.id); crece = true; }
  }
  const activos = await prisma.asset.findMany({
    where: { assetCode: { startsWith: 'DEMO-' }, deletedAt: null, parteDeId: null, locationId: { in: [...rama] } },
    select: { id: true, assetCode: true, locationId: true },
  });
  const conSitio = activos.filter((a) => sitios[a.assetCode]);
  const sinSitio = activos.filter((a) => !sitios[a.assetCode]);
  await prisma.posicionEnPlano.deleteMany({ where: { planoId: plano.id, assetId: { notIn: conSitio.map((a) => a.id) } } });
  for (const a of conSitio) {
    const s = sitios[a.assetCode];
    await colocar(plano.id, a.id, enPx(s), s);
    /* La ficha del equipo de DEMO pasa a la zona donde está dibujado: así el
       mapa no avisa de «dibujado en una zona y fichado en otra». Sólo equipos
       DEMO- y sólo dentro de este tren. */
    const loc = zonaDe(s);
    if (loc !== a.locationId) await prisma.asset.update({ where: { id: a.id }, data: { locationId: loc } });
  }

  // 5. Las zonas sobre el plano.
  for (const z of ZONAS_DEL_TREN) {
    const locationId = zonaLoc.get(z.clave)!;
    await prisma.zonaEnPlano.upsert({
      where: { planoId_locationId: { planoId: plano.id, locationId } },
      update: { puntos: zonaEnPx(z) as any },
      create: { planoId: plano.id, locationId, puntos: zonaEnPx(z) as any },
    });
  }

  await publicarDemo(plano, tren.name);
  console.log(`  Listo: «${nombrePlano}» en ${tren.name}: ${conSitio.length} equipos y ${ZONAS_DEL_TREN.length} zonas.`);
  if (sinSitio.length) console.log(`  No colocados en este plano (sin sitio en el dibujo, o van en el plano de su sala): ${sinSitio.map((a) => a.assetCode).join(', ')}.`);
  return { plano, zonaLoc };
}

async function main() {
  console.log('Cargando PLANOS DE DEMO: trenes, zonas y sala eléctrica (todo con prefijo DEMO)…');
  const nodosArbol = (await prisma.location.findMany({
    select: { id: true, parentId: true, type: true, name: true, code: true, path: true, siglaTren: true },
  })) as Nodo[];
  const porId = new Map(nodosArbol.map((n) => [n.id, n]));

  /* EL TREN DE LAS CÁMARAS DE DEMO, no «el primero del árbol».
     La primera versión tomaba el primer TREN por orden alfabético de ruta, y
     en la semilla ese es «Grúas» (también es de tipo TREN: es un sector). Ahora
     se sube por el árbol desde donde está la cámara de demo hasta su TREN. */
  const ancla = await prisma.asset.findUnique({ where: { assetCode: 'DEMO-CAM-COLADA' }, select: { locationId: true } });
  let t1: Nodo | null = null;
  for (let n = ancla?.locationId ? porId.get(ancla.locationId) : undefined; n; n = n.parentId ? porId.get(n.parentId) : undefined) {
    if (n.type === 'TREN') { t1 = n; break; }
  }
  if (!t1) {
    console.error('No encuentro el tren de las cámaras de demo. Ejecuta antes `npm run demo:cargar`.');
    process.exit(1);
  }
  const sigla1 = t1.siglaTren || t1.code.split('-').pop() || 'T1';

  // La antena del púlpito de la demo es la BASE punto-multipunto (así la describe la demo).
  const ap = await prisma.asset.findUnique({ where: { assetCode: 'DEMO-AP-PULPITO' }, select: { id: true, type: true } });
  if (ap?.type === 'WIRELESS') {
    await prisma.assetWireless.upsert({ where: { assetId: ap.id }, update: { mode: 'PMP_BASE' }, create: { assetId: ap.id, mode: 'PMP_BASE' } });
  }

  // ---- TREN 1 (el de las cámaras de demo)
  const camarasT1: Cam[] = [...CAMARAS_DEL_TREN, { codigo: CAMARA_SALA_T1.codigo, lugar: CAMARA_SALA_T1.lugar, estado: 'OPERATIVO', criticidad: 'MEDIA' }];
  await cargarTren(t1, sigla1, camarasT1, { ...SITIOS_M, [CAMARA_SALA_T1.codigo]: CAMARA_SALA_T1.sitio },
    'DEMO · Tren y púlpito (referencial)', `${t1.name} y púlpito (referencial)`);

  // ---- TREN 2: sólo si existe en el árbol. No se inventa un tren.
  const t2 = nodosArbol.find((n) => n.type === 'TREN' && n.id !== t1!.id
    && ((n.siglaTren || '').toUpperCase() === 'T2' || /-T2$/i.test(n.code)));
  if (!t2) {
    console.log('  No hay un Tren 2 (sigla T2) en Ubicaciones: no se carga su plano de demo.');
  } else {
    const { zonaLoc } = await cargarTren(t2, 'T2', CAMARAS_DEL_TREN_2, SITIOS_T2_M,
      'DEMO · Tren 2 (referencial)', `${t2.name} y púlpito (referencial)`);

    // ---- La SALA ELÉCTRICA del Tren 2, con su propio plano: la zona lo abre.
    const salaId = zonaLoc.get('SALAE')!;
    let nuevos = 0;
    for (const e of EQUIPOS_SALA_T2) if (await equipoDeDemo({ ...e, criticidad: 'ALTA' }, salaId)) nuevos++;
    if (nuevos) console.log(`  ${nuevos} equipo(s) de ejemplo creado(s) en la sala eléctrica del Tren 2.`);
    const sala = await planoDeDemo(salaId, 'DEMO · Sala eléctrica T2 (referencial)', svgSalaElectrica('Sala eléctrica · Tren 2 (referencial)'),
      ANCHO_SALA, ALTO_SALA, M_POR_PX_SALA, 'Sala eléctrica típica (CCM, tablero general, gabinete y UPS), dibujada por el script de demo. No es la planta real.');
    for (const e of EQUIPOS_SALA_T2) {
      const a = await prisma.asset.findUnique({ where: { assetCode: e.codigo }, select: { id: true } });
      if (a) await colocar(sala.id, a.id, enPxSala(e.sitio), e.sitio as Sitio);
    }
    await publicarDemo(sala, 'la sala eléctrica del Tren 2');
    console.log(`  Listo: «DEMO · Sala eléctrica T2 (referencial)» con ${EQUIPOS_SALA_T2.length} equipos.`);
  }

  await estilosDeCamara();
  console.log('  Míralo en Estado de planta › Mapa (vista de planta y zonas). Se borra con `npm run demo:borrar`.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
