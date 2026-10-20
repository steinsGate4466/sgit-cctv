import { PrismaService } from '../prisma/prisma.service';
import { resolverContexto } from './plant-context';
import { DatosDeSeguridad, Medio, Nivel, PerfilDeSeguridad, ZonaDeRiesgoDelMapa, perfilDeSeguridad } from './seguridad-del-trabajo';
import { dentroDeZona } from '../modules/planos/geometria';

/**
 * LEE DE LA BASE LO QUE `perfilDeSeguridad` NECESITA — bloque 168.
 *
 * Una sola función para TODOS los formularios (abrir la OM, pedir acceso en
 * altura, inspección de grúa, visita de instalación): si cada pantalla juntara
 * los datos a su manera, el mismo equipo saldría «en altura» en una y no en
 * otra.
 *
 * De dónde sale cada cosa:
 *   · altura, medio y nota de acceso → el EQUIPO (o su equipo padre, si es un
 *     componente: la fuente está donde está la antena, bloque 45);
 *   · «la zona exige subir», «cómo llegar», «riesgo para personas» → la
 *     ubicación más cercana de la rama que lo declare;
 *   · cómo se interviene, ambiente e impacto → el contexto de planta de siempre;
 *   · tablero → donde está montado o, si no, el que lo alimenta y pide permiso.
 */
export async function perfilDeSeguridadEn(
  prisma: PrismaService,
  objetivo: { assetId?: string | null; locationId?: string | null },
): Promise<PerfilDeSeguridad & { assetCode: string | null; ubicacion: string | null }> {
  let activo: any = null;
  if (objetivo.assetId) {
    activo = await prisma.asset.findUnique({
      where: { id: objetivo.assetId },
      select: {
        id: true, assetCode: true, type: true, locationId: true, criticality: true,
        alturaMetros: true, medioAcceso: true, accesoNota: true, riesgoPersonas: true,
        tableroMontaje: { select: { codigo: true, requierePermiso: true, riesgos: true } },
        alimentadoPor: { select: { circuito: { select: { tablero: { select: { codigo: true, requierePermiso: true, riesgos: true } } } } } },
        parteDeId: true,
        parteDe: { select: { alturaMetros: true, medioAcceso: true, accesoNota: true, locationId: true } },
      },
    });
  }
  const locationId: string | null = activo?.locationId ?? activo?.parteDe?.locationId ?? objetivo.locationId ?? null;

  const nodos = await prisma.location.findMany({
    select: { id: true, parentId: true, name: true, requiereAltura: true, howToGet: true, riesgoPersonas: true, riesgoPersonasMotivo: true },
  });
  const porId = new Map(nodos.map((n) => [n.id, n]));
  let zonaRequiereAltura = false;
  let comoLlegarZona: string | null = null;
  let riesgoZona: boolean | null = null;
  let motivoZona: string | null = null;
  const vistos = new Set<string>();
  for (let n = locationId ? porId.get(locationId) : undefined; n && !vistos.has(n.id); n = n.parentId ? porId.get(n.parentId) : undefined) {
    vistos.add(n.id);
    if (n.requiereAltura) zonaRequiereAltura = true;
    if (!comoLlegarZona && n.howToGet) comoLlegarZona = n.howToGet;
    if (riesgoZona === null && n.riesgoPersonas !== null && n.riesgoPersonas !== undefined) {
      riesgoZona = n.riesgoPersonas;
      motivoZona = n.riesgoPersonasMotivo ?? null;
    }
  }

  const ctx: any = locationId || activo
    ? await resolverContexto(prisma, { id: activo?.id ?? `ubicacion:${locationId}`, locationId, criticality: activo?.criticality ?? null })
    : null;

  // El tablero que pesa: donde está montado; si no, uno que lo alimente y pida permiso.
  const alimentan = (activo?.alimentadoPor ?? []).map((a: any) => a.circuito?.tablero).filter(Boolean);
  const tablero = activo?.tableroMontaje ?? alimentan.find((t: any) => t.requierePermiso) ?? alimentan[0] ?? null;

  /* Bloque 176 · las ÁREAS DE RIESGO dibujadas en el mapa. Si el equipo (o su
     equipo padre) está colocado dentro de una en un plano PUBLICADO, ese
     riesgo entra en su perfil y, con él, en lo que se exige al abrir la OM.
     Sólo publicados: un borrador puede tener el área a medio dibujar. */
  const zonasDeRiesgo: ZonaDeRiesgoDelMapa[] = [];
  const dibujados = [activo?.id, activo?.parteDeId].filter(Boolean) as string[];
  if (dibujados.length) {
    const posiciones = await prisma.posicionEnPlano.findMany({
      where: { assetId: { in: dibujados }, plano: { estado: 'PUBLICADO' } },
      select: { xPx: true, yPx: true, planoId: true },
    });
    if (posiciones.length) {
      const areas = await prisma.zonaDeRiesgo.findMany({
        where: { planoId: { in: [...new Set(posiciones.map((x) => x.planoId))] } },
        select: { planoId: true, nivel: true, nombre: true, motivo: true, puntos: true },
      });
      for (const a of areas) {
        const pol = (a.puntos as unknown as [number, number][]) || [];
        if (posiciones.some((x) => x.planoId === a.planoId && dentroDeZona(x.xPx, x.yPx, pol))
          && !zonasDeRiesgo.some((z) => z.nivel === a.nivel && z.nombre === a.nombre)) {
          zonasDeRiesgo.push({ nivel: a.nivel as ZonaDeRiesgoDelMapa['nivel'], nombre: a.nombre, motivo: a.motivo });
        }
      }
    }
  }

  const acceso = activo?.alturaMetros != null || activo?.medioAcceso ? activo : activo?.parteDe ?? activo;
  const datos: DatosDeSeguridad = {
    tipoEquipo: activo?.type ?? null,
    alturaM: acceso?.alturaMetros ?? null,
    medioAcceso: (acceso?.medioAcceso as Medio) ?? null,
    accesoNota: acceso?.accesoNota ?? null,
    zonaRequiereAltura,
    comoLlegarZona,
    intervencionAplica: (ctx?.intervencionAplica as Nivel) ?? 'SIN_CLASIFICAR',
    intervencionFirmada: !!ctx?.intervencionFirmada,
    intervencionMotivo: ctx?.intervencionMotivo ?? null,
    ambiente: ctx?.ambiente ?? null,
    impactoSiSeCae: ctx?.impactoSiSeCae ?? null,
    riesgoPersonas: activo?.riesgoPersonas ?? riesgoZona,
    riesgoPersonasMotivo: motivoZona,
    tablero,
    zonasDeRiesgo,
  };
  return {
    ...perfilDeSeguridad(datos),
    assetCode: activo?.assetCode ?? null,
    ubicacion: locationId ? porId.get(locationId)?.name ?? null : null,
  };
}
