import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CriticidadService } from '../criticidad/criticidad.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { alcanza, ambitoDelUsuario, noVeNada } from '../../common/ambito-usuario';
import {
  accesoDeActivo, montajeDe, resumirAcceso,
  Acceso, CandidatoASubida, MedioAcceso, Montaje,
} from '../../common/acceso-fisico';

/**
 * QUÉ HAY EN CADA TREN Y CÓMO SE LLEGA — bloque 41.
 *
 * =============================================================================
 *  LA PREGUNTA QUE NO TENÍA PANTALLA
 * =============================================================================
 *  El bloque 39 responde «qué cámara está fallando». Ésta responde la otra
 *  mitad, que es la que hace Producción cuando le llega una solicitud:
 *
 *      «¿QUÉ TENGO EN MI TREN Y CUÁNTO DE ESO EXIGE MANLIFT?»
 *
 *  Producción costea el manlift. Hasta hoy cada subida se pedía suelta, se
 *  aprobaba suelta y se pagaba suelta — y dos cámaras del mismo poste se
 *  atendían en dos días distintos con dos manlifts distintos, porque nadie
 *  tenía delante la lista que enseña que están juntas.
 *
 * =============================================================================
 *  POR QUÉ SE SEGMENTA POR GABINETE / TABLERO / CAMPO
 * =============================================================================
 *  No es una clasificación bonita: son los tres sitios donde CAMBIA la forma de
 *  llegar. Al gabinete se entra a pie y con llave. Al tablero eléctrico se
 *  entra a pie y con bloqueo. Al campo se sube.
 *
 *  Agrupar así pone junto lo que se atiende junto, que es lo único que permite
 *  planificar una jornada.
 *
 * =============================================================================
 *  AQUÍ NO HAY SOLES, Y ES DELIBERADO
 * =============================================================================
 *  Se cuentan EQUIPOS y SUBIDAS, nunca dinero. Una tarifa metida en el sistema
 *  envejece sola y en seis meses da una cifra falsa con aspecto de exacta. El
 *  número que Producción puede decidir es «cuántas veces sube el equipo», y ése
 *  sí sale de datos que el sistema conoce.
 *
 * =============================================================================
 *  MIRAN. NO TOCAN.
 * =============================================================================
 *  Mismo permiso que el panel de cámaras caídas (`om.mirar`) y mismo verbo
 *  único: GET. Declarar el acceso de un equipo es otra cosa y vive en el módulo
 *  de Activos, donde ya está el resto de la ficha y donde hace falta
 *  `asset.update`.
 */
@Injectable()
export class ActivosPorTrenService {
  constructor(
    private readonly prisma: PrismaService,
    // Bloque 78: la letra A/B/C también se ve aquí.
    private readonly criticidad: CriticidadService,
  ) {}

  /** Estados en los que el equipo no está prestando servicio. */
  private readonly CAIDO = ['FUERA_SERVICIO', 'MANTENIMIENTO', 'CON_INCIDENCIA'];
  private readonly OM_VIVA = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];
  private readonly INC_VIVA = ['ABIERTA', 'EN_DIAGNOSTICO', 'EN_PROCESO'];

  async porTren(trenCode: string, userId?: string) {
    const ambito = await ambitoDelUsuario(this.prisma, userId);

    /* EL ÁMBITO SE COMPRUEBA AQUÍ, NO EN LA PANTALLA. Un jefe del Tren 2 que
       escriba T1 en la dirección recibe vacío, no el Tren 1.

       Bloque 42: la comparación ya no se escribe a mano. `alcanza()` es la
       única forma correcta de preguntarlo — la versión anterior usaba
       `includes` sobre la cadena, y por subcadena el ámbito «T1» habría
       alcanzado también a un futuro «T10». */
    if (noVeNada(ambito)) return this.vacio(trenCode, ambito.motivo);
    if (!alcanza(ambito, trenCode)) {
      return this.vacio(trenCode, 'Ese tren no está en tu ámbito.');
    }

    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null },
      select: {
        id: true, assetCode: true, type: true, status: true,
        brand: true, model: true, referencePlace: true, criticality: true,
        cabinetId: true, tableroId: true, locationId: true,
        medioAcceso: true, alturaMetros: true, accesoNota: true,
        accesoDeclaradoEn: true,
        accesoDeclaradoPor: { select: { fullName: true } },
        location: { select: { id: true, name: true, howToGet: true, requiereAltura: true } },
        cabinet: { select: { id: true, code: true, name: true, referencePlace: true } },
        tableroMontaje: {
          select: { id: true, codigo: true, nombre: true, referencia: true, requierePermiso: true },
        },
      },
      orderBy: { assetCode: 'asc' },
    });

    const [estados, ctx, letras] = await Promise.all([
      computeEffectiveStatuses(this.prisma, activos),
      resolverContextoDePlanta(this.prisma, activos),
      /* Bloque 78. Una sola llamada para todo el tren: el cálculo recorre la
         planta entera (la letra de un switch depende de sus cámaras), así que
         pedirlo por activo serían cincuenta recorridos.

         Si falla, la lista se pinta igual sin letra: es un dato útil, no un
         requisito para ver el inventario del tren. */
      this.criticidad.resumen().then((r: any) => {
        const m: Record<string, any> = {};
        for (const e of r.equipos || []) m[e.id] = e;
        return m;
      }).catch(() => ({} as Record<string, any>)),
    ]);

    const delTren = activos.filter((a) =>
      (ctx[a.id]?.trenCode || '').toUpperCase().includes(trenCode.toUpperCase()));

    if (!delTren.length) return this.vacio(trenCode, null);

    const ids = delTren.map((a) => a.id);

    /* QUÉ TIENE TRABAJO PENDIENTE. Dos consultas para N activos, no dos por
       activo. Hace falta para agrupar subidas: sólo se agrupa lo que alguien
       va a ir a tocar; contar una subida que nadie ha pedido le daría a
       Producción un número que no corresponde a ningún trabajo real. */
    const [ordenes, incidencias] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { assetId: { in: ids }, status: { in: this.OM_VIVA as any } },
        orderBy: { createdAt: 'desc' },
        select: { assetId: true, code: true, status: true, type: true },
      }),
      this.prisma.incident.findMany({
        where: { assetId: { in: ids }, status: { in: this.INC_VIVA as any } },
        select: { assetId: true, code: true },
      }),
    ]);

    const omDe = new Map<string, typeof ordenes[number]>();
    for (const o of ordenes) if (o.assetId && !omDe.has(o.assetId)) omDe.set(o.assetId, o);
    const incDe = new Set(incidencias.map((i) => i.assetId).filter(Boolean) as string[]);

    const filas = delTren.map((a) => {
      const acceso = accesoDeActivo({
        id: a.id,
        cabinetId: a.cabinetId,
        tableroId: a.tableroId,
        medioAcceso: a.medioAcceso as MedioAcceso | null,
        alturaMetros: a.alturaMetros,
        accesoDeclaradoEn: a.accesoDeclaradoEn,
        /* La zona sólo PROPONE. `requiereAltura` de la ubicación directa y de
           toda la rama por encima: el contexto de planta ya la heredó cuando
           calculó la intervenibilidad, pero aquí interesa el dato crudo para
           poder decir «la zona dice que hay que subir». */
        zonaRequiereAltura: !!a.location?.requiereAltura
          || ctx[a.id]?.intervencionPropuesta === 'CON_PERMISO_ALTURA',
      });

      const om = omDe.get(a.id);
      const tienePendiente = !!om || incDe.has(a.id);

      return {
        fila: {
          id: a.id,
          codigo: a.assetCode,
          tipo: a.type,
          equipo: [a.brand, a.model].filter(Boolean).join(' ') || null,
          referencia: a.referencePlace,
          estado: estados[a.id] || a.status,
          estaCaido: this.CAIDO.includes(estados[a.id] || a.status),
          criticidad: ctx[a.id]?.criticidad ?? a.criticality,
          /* LA LETRA A/B/C (bloque 78). «Mis activos» es la lista del Jefe de
             Tren: la equivalente a Activos para quien no tiene `asset.read`.
             Si la letra saliera en una y no en la otra, la mitad de la planta
             no la vería nunca. */
          criticidadAbc: letras[a.id]?.letra ?? null,
          diasEntreRevisiones: letras[a.id]?.diasEntreRevisiones ?? null,
          zonaVital: !!ctx[a.id]?.zonaVital,
          etapa: ctx[a.id]?.etapaNombre ?? null,
          ubicacion: a.location?.name ?? null,
          comoLlegar: a.location?.howToGet ?? null,
          montaje: montajeDe(a),
          acceso: {
            ...acceso,
            nota: a.accesoNota,
            declaradoPor: a.accesoDeclaradoPor?.fullName ?? null,
            declaradoEn: a.accesoDeclaradoEn,
          },
          pendiente: om
            ? { om: om.code, estado: om.status, tipo: om.type }
            : incDe.has(a.id) ? { om: null, estado: 'INCIDENCIA_ABIERTA', tipo: null } : null,
        },
        acceso,
        candidato: {
          id: a.id,
          ubicacionId: a.location?.id ?? null,
          ubicacionNombre: a.location?.name ?? null,
          veredicto: acceso.veredicto,
          tienePendiente,
        } as CandidatoASubida,
      };
    });

    const resumen = resumirAcceso(filas.map((f) => ({ acceso: f.acceso, candidato: f.candidato })));

    return {
      tren: trenCode,
      resumen,
      grupos: this.agrupar(filas.map((f) => f.fila), delTren),
      /* NO HAY PARÁMETROS DE FILTRO EN ESTE ENDPOINT, y es deliberado. El
         listado de un tren son decenas de filas, no miles: filtrar en la
         PANTALLA sobre esta misma respuesta es más rápido que volver a
         preguntar, y sobre todo evita que las cifras de arriba bailen con cada
         casilla que se marca — que es lo que hace que alguien deje de fiarse
         de un tablero. */
      mensaje: null as string | null,
    };
  }

  /**
   * DECLARAR CÓMO SE LLEGA A UN EQUIPO.
   *
   * Queda con nombre y fecha, y eso no es burocracia: de este dato depende que
   * alguien suba con manlift o suba con una escalera. Si algún día pasa algo,
   * se sabe quién dijo que ahí se llegaba así. Es la misma regla que la firma
   * de intervenibilidad del bloque 28.
   *
   * La fecha permite además la pregunta que se hará dentro de dos años: «esto
   * lo declararon en 2026, ¿sigue siendo verdad?». Sin fecha, una declaración
   * vieja y una nueva se leen igual.
   */
  async declararAcceso(
    id: string,
    dto: { medioAcceso: string; alturaMetros?: number; accesoNota?: string },
    userId?: string,
  ) {
    /* `updateMany` con `deletedAt: null` en el WHERE, no `update`. Un activo
       dado de baja no debe poder recibir declaraciones nuevas: reaparecería en
       los listados con datos frescos y parecería vivo. Si no toca ninguna fila,
       se dice por qué en vez de devolver un 500. */
    const r = await this.prisma.asset.updateMany({
      where: { id, deletedAt: null },
      data: {
        medioAcceso: dto.medioAcceso as any,
        /* `?? null` y no `|| null`: con `||`, una altura de 0 —un equipo a ras
           de piso, que existe— se guardaría como «sin dato». */
        alturaMetros: dto.alturaMetros ?? null,
        accesoNota: dto.accesoNota?.trim() || null,
        accesoDeclaradoPorId: userId ?? null,
        accesoDeclaradoEn: new Date(),
      },
    });

    if (r.count === 0) {
      return {
        ok: false,
        mensaje: 'Ese equipo no existe o está dado de baja. No se guardó nada.',
      };
    }
    return { ok: true, mensaje: 'Declarado. Ya cuenta en el total del tren.' };
  }

  /**
   * Los tres grupos, y dentro de gabinete y tablero, uno por cada uno.
   *
   * No se devuelven grupos vacíos: un tren sin tableros no tiene por qué
   * enseñar una sección «Dentro de tablero eléctrico (0)». Una pantalla llena
   * de ceros es una pantalla que se deja de leer.
   */
  private agrupar(filas: Fila[], activos: ActivoCrudo[]) {
    const porId = new Map(activos.map((a) => [a.id, a]));
    const grupos = new Map<string, Grupo>();

    for (const f of filas) {
      const a = porId.get(f.id)!;
      const { clave, titulo, subtitulo, aviso } = this.cabecera(f.montaje, a);

      let g = grupos.get(clave);
      if (!g) {
        g = {
          clave, montaje: f.montaje, titulo, subtitulo, aviso,
          activos: [], exigenElevador: 0, sinDeclarar: 0, caidos: 0,
        };
        grupos.set(clave, g);
      }
      g.activos.push(f);
      if (f.acceso.veredicto === 'EXIGE_ELEVADOR') g.exigenElevador++;
      if (f.acceso.veredicto === 'SIN_DECLARAR') g.sinDeclarar++;
      if (f.estaCaido) g.caidos++;
    }

    /* ORDEN: primero lo que tiene equipos caídos, después lo que exige
       elevador, y por último el resto alfabético. Quien abre esta pantalla no
       viene a leerla entera: viene a ver lo que está mal. */
    const orden: Record<Montaje, number> = { CAMPO: 0, TABLERO: 1, GABINETE: 2 };
    return [...grupos.values()].sort((x, y) =>
      (y.caidos > 0 ? 1 : 0) - (x.caidos > 0 ? 1 : 0)
      || y.exigenElevador - x.exigenElevador
      || orden[x.montaje] - orden[y.montaje]
      || x.titulo.localeCompare(y.titulo, 'es'));
  }

  private cabecera(montaje: Montaje, a: ActivoCrudo) {
    if (montaje === 'TABLERO' && a.tableroMontaje) {
      return {
        clave: `TAB-${a.tableroMontaje.id}`,
        titulo: `${a.tableroMontaje.codigo} · ${a.tableroMontaje.nombre}`,
        subtitulo: a.tableroMontaje.referencia ?? null,
        /* Es la advertencia que evita que alguien abra un tablero con tensión
           creyendo que va a cambiar un switch. */
        aviso: a.tableroMontaje.requierePermiso
          ? 'Abrir este tablero exige permiso eléctrico y bloqueo.'
          : null,
      };
    }
    if (montaje === 'GABINETE' && a.cabinet) {
      return {
        clave: `GAB-${a.cabinet.id}`,
        titulo: `${a.cabinet.code} · ${a.cabinet.name}`,
        subtitulo: a.cabinet.referencePlace ?? null,
        aviso: null,
      };
    }
    /* En campo se agrupa por UBICACIÓN, que es justo donde se posiciona el
       manlift. Los que no tienen ubicación cargada van a un grupo aparte con
       nombre honesto, no mezclados con los que sí la tienen. */
    const u = a.location;
    return {
      clave: u ? `LOC-${u.id}` : 'SIN-UBICACION',
      titulo: u ? u.name : 'Sin ubicación cargada',
      subtitulo: u?.howToGet ?? null,
      aviso: u ? null : 'Estos equipos no cuelgan de ninguna zona del árbol, así que no se puede saber si están cerca unos de otros ni planificar una subida conjunta.',
    };
  }

  private vacio(tren: string, mensaje: string | null) {
    return {
      tren,
      resumen: resumirAcceso([]),
      grupos: [] as Grupo[],
      mensaje,
    };
  }
}

type ActivoCrudo = {
  id: string;
  location: { id: string; name: string; howToGet: string | null; requiereAltura: boolean } | null;
  cabinet: { id: string; code: string; name: string; referencePlace: string | null } | null;
  tableroMontaje: {
    id: string; codigo: string; nombre: string;
    referencia: string | null; requierePermiso: boolean;
  } | null;
};

/* EXPORTADOS, y no por gusto: el controlador devuelve estos tipos, así que
   TypeScript necesita poder NOMBRARLOS desde fuera del archivo. Sin `export`
   el `build` falla con TS4053 — «has or is using name 'Grupo' but cannot be
   named»— aunque el editor no diga nada, porque `tsc --noEmit` sobre el
   proyecto entero sí lo ve y el servidor de tipos del editor no. */
export type Fila = {
  id: string; montaje: Montaje; estaCaido: boolean;
  acceso: Acceso & { nota: string | null };
};

export interface Grupo {
  clave: string;
  montaje: Montaje;
  titulo: string;
  subtitulo: string | null;
  aviso: string | null;
  activos: Fila[];
  exigenElevador: number;
  sinDeclarar: number;
  caidos: number;
}
