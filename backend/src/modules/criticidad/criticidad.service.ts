import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  clasificarPlanta, repartoPorLetra, intervaloFinal,
  type ActivoCrit, type CriticidadDeActivo, type EntradaDePlanta, type UbicacionCrit,
} from '../../common/criticidad-datos';
import { PARAMETROS_PROPUESTOS, type ParametrosCriticidad } from '../../common/criticidad-abc';
import { resolverContextoDePlanta, intervaloParaAmbiente } from '../../common/plant-context';

/* =============================================================================
   CRITICIDAD A/B/C — el servicio que trae los datos de planta (bloque 76)
   -----------------------------------------------------------------------------
   El cálculo vive en `common/criticidad-abc.ts` y el armado en
   `common/criticidad-datos.ts`, los dos sin Prisma. Aquí sólo se LEE.

   Esa separación no es purismo: es lo que permite probar la cascada
   —tablero → switch → cámaras— con cuatro objetos escritos a mano en vez de
   montar media planta en una base de pruebas. Una prueba que necesita una base
   acaba desactivada, y entonces no prueba nada.
============================================================================= */
@Injectable()
export class CriticidadService {
  constructor(private prisma: PrismaService) {}

  /* ---------------------------------------------------------------------------
     LOS NÚMEROS DE LA PLANTA
  --------------------------------------------------------------------------- */

  /**
   * Los parámetros vigentes.
   *
   * Si nadie los ha guardado todavía se devuelven los PROPUESTOS, marcados
   * como tales (`confirmados: false`). La pantalla lo dice con todas las
   * letras: «estos números todavía no los ha confirmado la planta».
   *
   * Enseñarlos sin avisar los convertiría en una decisión que nadie tomó, y
   * este proyecto ya tiene escrito que no se inventan datos de planta.
   */
  async parametros(): Promise<{
    valores: ParametrosCriticidad;
    confirmados: boolean;
    actualizadoPor: string | null;
    actualizadoEn: Date | null;
  }> {
    const fila = await this.prisma.parametrosCriticidad.findFirst({
      include: { actualizadoPor: { select: { fullName: true } } },
    });
    if (!fila) {
      return {
        valores: PARAMETROS_PROPUESTOS,
        confirmados: false,
        actualizadoPor: null,
        actualizadoEn: null,
      };
    }
    return {
      valores: {
        corteA: fila.corteA, corteB: fila.corteB,
        diasA: fila.diasA, diasB: fila.diasB, diasC: fila.diasC,
      },
      confirmados: true,
      actualizadoPor: fila.actualizadoPor?.fullName ?? null,
      actualizadoEn: fila.actualizadoEn,
    };
  }

  /**
   * Guardar los números. Fila única: siempre el mismo identificador.
   *
   * Las comprobaciones no son burocracia. `corteA <= corteB` dejaría la letra B
   * sin ningún puntaje posible y **la planta entera se repartiría entre A y C
   * sin que nada avisara** — el sistema seguiría funcionando y las cifras
   * serían basura. Y `diasA > diasC` diría que lo más crítico se revisa menos a
   * menudo, que es exactamente al revés de para qué existe el módulo.
   */
  async guardarParametros(dto: any, userId?: string | null) {
    const n = (v: any, nombre: string): number => {
      const x = Number(v);
      if (!Number.isFinite(x) || x <= 0 || !Number.isInteger(x)) {
        throw new BadRequestException(`«${nombre}» tiene que ser un número entero mayor que cero.`);
      }
      return x;
    };
    const corteA = n(dto?.corteA, 'corte de A');
    const corteB = n(dto?.corteB, 'corte de B');
    const diasA = n(dto?.diasA, 'días de A');
    const diasB = n(dto?.diasB, 'días de B');
    const diasC = n(dto?.diasC, 'días de C');

    if (corteA <= corteB) {
      throw new BadRequestException(
        'El corte de A tiene que ser MAYOR que el de B. Si no, ningún equipo podría salir B.',
      );
    }
    if (!(diasA <= diasB && diasB <= diasC)) {
      throw new BadRequestException(
        'Una A se revisa igual o más seguido que una B, y una B igual o más seguido que una C.',
      );
    }

    const datos = { corteA, corteB, diasA, diasB, diasC, actualizadoPorId: userId ?? null };
    return this.prisma.parametrosCriticidad.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...datos },
      update: datos,
    });
  }

  /* ---------------------------------------------------------------------------
     LA LECTURA DE PLANTA
  --------------------------------------------------------------------------- */

  /**
   * Trae de la base todo lo que hace falta para clasificar, de una sola vez.
   *
   * Se hace en una tacada y no equipo por equipo porque el respaldo de una
   * cámara depende de sus vecinas y la letra de un switch depende de sus
   * cámaras: pedirlo por equipo obligaría a recorrer la planta entera una vez
   * por cada uno.
   */
  private async leerPlanta(): Promise<EntradaDePlanta> {
    const haceUnAnio = new Date();
    haceUnAnio.setFullYear(haceUnAnio.getFullYear() - 1);

    const [activos, ubicaciones, fallas, puertos, camaras, alimentacion] = await Promise.all([
      this.prisma.asset.findMany({
        // Los de BAJA y los que están en almacén no se mantienen: contarlos
        // llenaría la lista de pendientes de equipos que nadie va a revisar.
        where: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] } },
        select: {
          id: true, assetCode: true, type: true, locationId: true,
          medioAcceso: true, impactoOperacional: true, riesgoPersonas: true,
          parteDeId: true,
        },
      }),
      this.prisma.location.findMany({
        select: {
          id: true, parentId: true, name: true,
          criticidadProduccion: true, riesgoPersonas: true, riesgoPersonasMotivo: true,
        },
      }),
      this.prisma.incident.groupBy({
        by: ['assetId'],
        where: { assetId: { not: null }, reportedAt: { gte: haceUnAnio } },
        _count: { _all: true },
      }),
      this.prisma.switchPort.findMany({
        where: { connectedAssetId: { not: null } },
        select: { switchId: true, connectedAssetId: true },
      }),
      this.prisma.assetCamera.findMany({
        where: { nvrId: { not: null } },
        select: { assetId: true, nvrId: true },
      }),
      this.prisma.alimentacionActivo.findMany({
        select: { circuitoId: true, assetId: true, viaPoe: true },
      }),
    ]);

    const fallasPorActivo = new Map<string, number>();
    for (const f of fallas) {
      if (f.assetId) fallasPorActivo.set(f.assetId, (f as any)._count?._all ?? 0);
    }

    /* ---------------------------------------------------------------------
       QUIÉN CUELGA DE QUIÉN
       ---------------------------------------------------------------------
       Cuatro fuentes, todas ya existentes en el sistema. Ninguna se inventa:

         1. Puertos del switch  → lo enchufado depende del switch.
         2. Grabador de la cámara → si cae el NVR, esa cámara no graba.
         3. Componentes         → la fuente PoE de una antena.
         4. Tablero eléctrico   → de qué llave cuelga cada equipo.

       El alimentado VÍA PoE se salta a propósito: esa cámara no cuelga del
       breaker, cuelga del switch, y el switch ya cuelga del tablero. Contarlo
       otra vez haría que el tablero heredara dos veces de lo mismo — no
       cambiaría la letra (se toma la peor), pero el «de él dependen 40
       equipos» de la pantalla estaría inflado, y una cifra inflada es una
       cifra en la que se deja de confiar. */
    const dependientes = new Map<string, string[]>();
    const anotar = (sostenedor: string | null, hijo: string | null) => {
      if (!sostenedor || !hijo || sostenedor === hijo) return;
      const lista = dependientes.get(sostenedor);
      if (lista) { if (!lista.includes(hijo)) lista.push(hijo); }
      else dependientes.set(sostenedor, [hijo]);
    };

    for (const p of puertos) anotar(p.switchId, p.connectedAssetId);
    for (const c of camaras) anotar(c.nvrId, c.assetId);
    for (const a of activos) anotar(a.parteDeId, a.id);

    // El circuito no es un activo; el TABLERO sí. Se traduce circuito→tablero.
    if (alimentacion.length) {
      const circuitos = await this.prisma.circuitoElectrico.findMany({
        select: { id: true, tableroId: true },
      });
      const tableroDelCircuito = new Map(circuitos.map((c) => [c.id, c.tableroId]));
      const tableros = await this.prisma.tableroElectrico.findMany({
        select: { id: true, assetId: true },
      });
      const activoDelTablero = new Map(tableros.map((t) => [t.id, t.assetId]));
      for (const al of alimentacion) {
        if (al.viaPoe) continue;                       // ya cuelga del switch
        const tId = tableroDelCircuito.get(al.circuitoId);
        const assetTablero = tId ? activoDelTablero.get(tId) : null;
        anotar(assetTablero ?? null, al.assetId);
      }
    }

    return {
      activos: activos as unknown as ActivoCrit[],
      ubicaciones: ubicaciones as unknown as UbicacionCrit[],
      fallasPorActivo,
      dependientes,
    };
  }

  /** Clasifica la planta con los parámetros vigentes. */
  private async clasificarTodo(): Promise<{
    mapa: Map<string, CriticidadDeActivo>;
    datos: EntradaDePlanta;
    parametros: ParametrosCriticidad;
    confirmados: boolean;
  }> {
    const [datos, p] = await Promise.all([this.leerPlanta(), this.parametros()]);
    return {
      mapa: clasificarPlanta(datos, p.valores),
      datos,
      parametros: p.valores,
      confirmados: p.confirmados,
    };
  }

  /* ---------------------------------------------------------------------------
     LO QUE PIDE LA PANTALLA DE GESTIÓN
  --------------------------------------------------------------------------- */

  /**
   * El reparto A/B/C de la planta y la tabla equipo por equipo.
   *
   * Los pendientes NO se esconden: van en el mismo sitio y con su motivo. Un
   * equipo sin clasificar no es un fallo, es trabajo por hacer — y esconderlo
   * haría que cuatrocientas cámaras sin revisar no aparecieran en ninguna
   * parte, que es exactamente lo que este módulo viene a evitar.
   */
  async resumen(filtros?: { letra?: string; tipo?: string; q?: string }) {
    const { mapa, datos, parametros, confirmados } = await this.clasificarTodo();

    const activoPorId = new Map(datos.activos.map((a) => [a.id, a]));
    let equipos = [...mapa.entries()].map(([id, r]) => {
      const a = activoPorId.get(id)!;
      return {
        id,
        assetCode: a.assetCode,
        tipo: a.type,
        letra: r.criticidad.letra,
        puntaje: r.criticidad.puntaje,
        diasEntreRevisiones: r.criticidad.diasEntreRevisiones,
        porSeguridad: r.criticidad.porSeguridad,
        porSoporte: r.criticidad.porSoporte,
        faltaDeclarar: r.criticidad.faltaDeclarar,
        zonaNombre: r.zonaNombre,
        origenImpacto: r.origenImpacto,
        origenRiesgo: r.origenRiesgo,
      };
    });

    if (filtros?.letra) equipos = equipos.filter((e) => e.letra === filtros.letra);
    if (filtros?.tipo) equipos = equipos.filter((e) => e.tipo === filtros.tipo);
    if (filtros?.q) {
      const q = filtros.q.trim().toLowerCase();
      if (q) equipos = equipos.filter((e) => e.assetCode.toLowerCase().includes(q));
    }

    /* Orden: primero lo que exige más. Las A arriba y los pendientes JUSTO
       DESPUÉS, no al final: un pendiente al final de una lista de cuatrocientas
       es un pendiente que nadie ve. Dentro de cada letra, por código, para que
       dos cargas seguidas den el mismo orden. */
    const peso: Record<string, number> = { A: 0, SIN_CLASIFICAR: 1, B: 2, C: 3 };
    equipos.sort((x, y) => (peso[x.letra] - peso[y.letra])
      || x.assetCode.localeCompare(y.assetCode));

    return {
      reparto: repartoPorLetra(mapa),
      total: mapa.size,
      parametros,
      parametrosConfirmados: confirmados,
      equipos,
    };
  }

  /**
   * La criticidad de UN equipo, con todo lo que hace falta para explicarla.
   *
   * Se clasifica la planta entera igualmente, y no es desperdicio: la letra de
   * una cámara depende de cuántas vecinas cubren su sitio y la de un switch de
   * sus cámaras. No hay forma de calcular «sólo éste» sin mirar el resto.
   */
  async deUnActivo(assetId: string) {
    const { mapa, datos, parametros } = await this.clasificarTodo();
    const r = mapa.get(assetId);
    if (!r) {
      // Puede estar de BAJA o en almacén, que se excluyen a propósito.
      const existe = await this.prisma.asset.findFirst({
        where: { id: assetId, deletedAt: null }, select: { id: true, status: true },
      });
      if (!existe) throw new NotFoundException('Activo no encontrado');
      return {
        letra: 'SIN_CLASIFICAR', puntaje: null, diasEntreRevisiones: null,
        porque: [`Este equipo está en estado ${existe.status}: no entra en el plan de mantenimiento.`],
        faltaDeclarar: [], porSeguridad: false, porSoporte: false,
        cuantosDependenDeEl: 0, parametros,
      };
    }

    const cuantos = (datos.dependientes.get(assetId) ?? []).length;
    return {
      ...r.criticidad,
      origenImpacto: r.origenImpacto,
      origenRiesgo: r.origenRiesgo,
      zonaNombre: r.zonaNombre,
      riesgoMotivo: r.riesgoMotivo,
      // Los números que entraron, para que el ingeniero pueda discutirlos.
      factores: {
        impactoOperacional: r.entrada.impactoOperacional,
        riesgoPersonas: r.entrada.riesgoPersonas,
        equiposQueCubrenLoMismo: r.entrada.equiposQueCubrenLoMismo,
        dificultadAcceso: r.entrada.dificultadAcceso,
        fallasUltimoAnio: r.entrada.fallasUltimoAnio,
      },
      cuantosDependenDeEl: cuantos,
      parametros,
    };
  }

  /**
   * Cada cuánto se revisa este equipo, juntando la letra con el ambiente.
   *
   * MANDA EL QUE MÁS EXIGE. El sistema ya calculaba un intervalo por el
   * ambiente —el calor del horno destruye sellos aunque la cámara sea C— y
   * ahora la letra propone otro. No hay que elegir: se toma el menor, y así
   * ninguna de las dos razones se pierde.
   */
  async intervaloDeUnActivo(assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { id: true, locationId: true, criticality: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado');

    const [crit, ctx] = await Promise.all([
      this.deUnActivo(assetId),
      resolverContextoDePlanta(this.prisma, [asset as any]),
    ]);
    const c = ctx[assetId];
    const porAmbiente = c?.intervaloDias ?? intervaloParaAmbiente(c?.ambiente ?? null);
    const final = intervaloFinal(crit.diasEntreRevisiones ?? null, porAmbiente);

    return {
      letra: crit.letra,
      diasPorLetra: crit.diasEntreRevisiones ?? null,
      diasPorAmbiente: porAmbiente,
      ambiente: c?.ambiente ?? null,
      ...final,
    };
  }

  /* ---------------------------------------------------------------------------
     LO QUE DECLARA UNA PERSONA
  --------------------------------------------------------------------------- */

  /**
   * Guardar el impacto y el riesgo de UN equipo.
   *
   * `null` es un valor válido y significa «vuelve a mandar lo de la zona». Por
   * eso se distingue entre «no vino en la petición» y «vino como null»: si se
   * trataran igual, no habría forma de deshacer una anulación puesta por error
   * y el equipo se quedaría con ese valor para siempre.
   *
   * Es el mismo cuidado del bloque 16 con las instalaciones: *`false` es una
   * respuesta, `''` no*.
   */
  async declarar(assetId: string, dto: any, userId?: string | null) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null }, select: { id: true },
    });
    if (!asset) throw new NotFoundException('Activo no encontrado');

    const datos: any = {};

    if ('impactoOperacional' in (dto ?? {})) {
      const v = dto.impactoOperacional;
      if (v === null || v === '' || v === undefined) datos.impactoOperacional = null;
      else {
        const n = Number(v);
        if (![1, 2, 3, 4].includes(n)) {
          throw new BadRequestException('El impacto en producción va de 1 a 4.');
        }
        datos.impactoOperacional = n;
      }
    }

    if ('riesgoPersonas' in (dto ?? {})) {
      const v = dto.riesgoPersonas;
      if (v === null || v === '' || v === undefined) datos.riesgoPersonas = null;
      else if (typeof v === 'boolean') datos.riesgoPersonas = v;
      else if (v === 'true' || v === 'false') datos.riesgoPersonas = v === 'true';
      else throw new BadRequestException('El riesgo para personas es sí, no, o sin declarar.');
    }

    if (!Object.keys(datos).length) {
      throw new BadRequestException('No se mandó nada que guardar.');
    }

    datos.criticidadDeclaradaPorId = userId ?? null;
    datos.criticidadDeclaradaEn = new Date();

    await this.prisma.asset.update({ where: { id: assetId }, data: datos });
    // Se devuelve la letra RECALCULADA, no un «guardado». Quien acaba de
    // declarar quiere ver en qué se convirtió lo que puso; un mensaje de éxito
    // a secas obliga a recargar para saberlo.
    return this.deUnActivo(assetId);
  }

  /**
   * Declarar el riesgo para personas de una ZONA — y con él, el de todas las
   * cámaras que cuelgan de ella.
   *
   * Es la forma barata de clasificar la planta: se declara el foso una vez, no
   * cámara por cámara.
   *
   * El motivo es OBLIGATORIO cuando se marca que sí, igual que el `porQueEsVital`
   * del bloque 26. «Aquí puede resultar herida una persona» sin decir por qué no
   * se puede auditar, no se puede discutir, y a los seis meses nadie sabe si
   * sigue siendo verdad.
   */
  async declararZona(locationId: string, dto: any, userId?: string | null) {
    const loc = await this.prisma.location.findUnique({
      where: { id: locationId }, select: { id: true },
    });
    if (!loc) throw new NotFoundException('Ubicación no encontrada');

    const v = dto?.riesgoPersonas;
    let riesgo: boolean | null;
    if (v === null || v === '' || v === undefined) riesgo = null;
    else if (typeof v === 'boolean') riesgo = v;
    else if (v === 'true' || v === 'false') riesgo = v === 'true';
    else throw new BadRequestException('El riesgo para personas es sí, no, o sin declarar.');

    const motivo = typeof dto?.riesgoPersonasMotivo === 'string'
      ? dto.riesgoPersonasMotivo.trim() : '';

    if (riesgo === true && !motivo) {
      throw new BadRequestException(
        'Si aquí puede resultar herida una persona, hay que escribir qué es lo que puede herirla.',
      );
    }

    await this.prisma.location.update({
      where: { id: locationId },
      data: {
        riesgoPersonas: riesgo,
        riesgoPersonasMotivo: riesgo === null ? null : (motivo || null),
        // Se reutiliza la firma del bloque 26: es la misma declaración de zona.
        declaradoPorId: userId ?? null,
        declaradoEn: new Date(),
      },
    });
    return { ok: true };
  }
}
