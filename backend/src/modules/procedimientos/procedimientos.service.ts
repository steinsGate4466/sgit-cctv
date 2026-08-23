import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { elegir, aplicables } from './aplicabilidad';

/**
 * PROCEDIMIENTOS DE RESTAURACIÓN Y NOTAS DE CAMPO — bloque 29.
 *
 * =============================================================================
 *  LO QUE VE EL TÉCNICO AL ESCANEAR EL QR
 * =============================================================================
 *  Tres cosas, en este orden, porque es el orden en que las necesita:
 *
 *   1. ¿HAY ALGO ABIERTO AQUÍ AHORA MISMO? Si otro ya está en ello, que no
 *      abra una orden duplicada ni desmonte lo que el otro dejó a medias.
 *   2. ¿QUÉ ME DEJÓ DICHO EL ANTERIOR? Las notas de campo. Esto es la entrega
 *      de turno, y funciona porque no hay que acordarse de escribirla al final
 *      del turno: se escribe trabajando y aparece sola aquí.
 *   3. ¿CÓMO SE ARREGLA ESTO? El procedimiento del modelo, con el tiempo que
 *      suele llevar.
 */
@Injectable()
export class ProcedimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /* OJO CON EL TIPO, y no es un capricho de TypeScript.
     Escrito como `= ['ABIERTA', ...]` sin más, TS lo infiere `string[]` y
     Prisma lo rechaza al meterlo en un `in:` — porque un `string` cualquiera
     no es un estado válido. Inline dentro del `where` sí funciona (ahí el
     literal se tipa por contexto), pero extraerlo a una constante pierde ese
     contexto. Anotarlo con el enum del cliente es lo que hace que un estado
     mal escrito se cace al compilar y no en producción. */
  private readonly OM_ABIERTA: WorkOrderStatus[] = ['ABIERTA', 'EN_PROCESO', 'EN_ESPERA'];

  /**
   * TODO lo que hace falta saber estando delante del equipo.
   * Una sola llamada: en planta la señal es mala y tres peticiones son tres
   * oportunidades de que no cargue.
   */
  async contextoDeCampo(assetId: string) {
    const activo = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, assetCode: true, type: true, brand: true, model: true },
    });
    if (!activo) throw new NotFoundException('Ese equipo no existe.');

    const ahora = new Date();
    const [ordenes, notas, procedimientos] = await Promise.all([
      // La OM en curso CON lo que el técnico ya lleva registrado. Ese es el
      // «documento a medias»: no hace falta un modelo nuevo, la orden ya lo
      // guarda todo. Lo que faltaba era enseñarlo aquí.
      this.prisma.workOrder.findMany({
        where: { assetId, status: { in: this.OM_ABIERTA } },
        select: {
          id: true, code: true, status: true, type: true,
          /* `activity` y `diagnosis` SON el documento a medias: lo que el
             técnico lleva escrito sin cerrar la orden. No hace falta un modelo
             nuevo para la entrega de turno — la orden ya lo guardaba, sólo que
             no se enseñaba aquí, que es donde se necesita. */
          activity: true, diagnosis: true,
          startedAt: true, scheduledDate: true,
          technician: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Notas vigentes: ni resueltas ni caducadas. Una nota vieja enterrada
      // entre veinte hace que el técnico deje de leerlas todas.
      this.prisma.notaDeCampo.findMany({
        where: {
          assetId, resuelta: false,
          OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: ahora } }],
        },
        select: {
          id: true, tipo: true, texto: true, createdAt: true, vigenteHasta: true,
          autor: { select: { fullName: true } },
          workOrder: { select: { code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.procedimientoRestauracion.findMany({
        where: { tipoActivo: activo.type, activo: true },
        select: {
          id: true, tipoActivo: true, marca: true, modelo: true, activo: true,
          titulo: true, pasos: true, advertencias: true, minutosEstimados: true,
        },
        // A igual especificidad gana el más antiguo: el que la gente ya conoce.
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const proc = elegir(procedimientos as any, activo as any);

    return {
      activo,
      /* Lo primero que se lee. Si hay trabajo abierto, la frase lo dice antes
         de que el técnico empiece a tocar nada. */
      aviso: ordenes.length
        ? `Ya hay ${ordenes.length} orden(es) abierta(s) en este equipo. Mira qué dejó el anterior antes de tocar nada.`
        : notas.length
          ? `Sin órdenes abiertas, pero el turno anterior dejó ${notas.length} aviso(s).`
          : null,
      ordenesAbiertas: ordenes,
      notas,
      procedimiento: proc,
      /* Si no hay procedimiento se dice, no se enseña el de otro modelo
         «porque se parece». Y se invita a escribirlo: el que acaba de
         arreglarlo es el que mejor lo puede contar. */
      otrosAplicables: aplicables(procedimientos as any, activo as any)
        .filter((p: any) => p.id !== proc?.id),
    };
  }

  // ---------------------------------------------------------------- NOTAS
  /**
   * Dejar un aviso pegado al equipo.
   *
   * NO exige un permiso propio a propósito: quien puede tocar una orden puede
   * avisar. Pedir un permiso aparte para escribir «no subas por esa escalera»
   * sería la forma más tonta de conseguir que nadie avise.
   */
  async dejarNota(
    assetId: string,
    dto: { tipo?: string; texto?: string; diasVigencia?: number; workOrderId?: string },
    userId?: string,
    ip?: string,
  ) {
    const texto = (dto.texto ?? '').trim();
    if (texto.length < 5) {
      throw new BadRequestException(
        'Escribe el aviso completo. «Ojo» no le sirve de nada al que llegue mañana.',
      );
    }
    const TIPOS = ['DEJADO_A_MEDIAS', 'VIGILAR', 'RIESGO_ACCESO', 'ESPERANDO_A_OTRO'];
    const tipo = dto.tipo && TIPOS.includes(dto.tipo) ? dto.tipo : 'VIGILAR';

    const existe = await this.prisma.asset.findUnique({
      where: { id: assetId }, select: { id: true },
    });
    if (!existe) throw new NotFoundException('Ese equipo no existe.');

    /* Vigencia por defecto 30 días. Una nota sin caducidad parece más segura
       y es lo contrario: a los seis meses el QR devuelve veinte avisos viejos,
       el técnico deja de leerlos, y el que sí importaba queda enterrado. */
    const dias = Number.isFinite(dto.diasVigencia as number) ? Number(dto.diasVigencia) : 30;
    const vigenteHasta = dias > 0
      ? new Date(Date.now() + dias * 86_400_000)
      : null;

    const nota = await this.prisma.notaDeCampo.create({
      data: {
        assetId, tipo: tipo as any, texto, vigenteHasta,
        workOrderId: dto.workOrderId || null,
        autorId: userId ?? null,
      },
      select: { id: true, tipo: true, texto: true, vigenteHasta: true },
    });
    await this.audit.record({
      userId, ip, action: 'CREATE', entity: 'nota-campo', entityId: nota.id,
      after: { assetId, tipo, texto: texto.slice(0, 120) },
    });
    return nota;
  }

  /** Marcar el aviso como atendido. Lo puede hacer cualquiera que trabaje el
   *  equipo: si sólo pudiera el autor, un aviso de alguien que se fue de la
   *  empresa quedaría puesto para siempre. */
  async resolverNota(id: string, userId?: string, ip?: string) {
    const nota = await this.prisma.notaDeCampo.findUnique({
      where: { id }, select: { id: true, texto: true, resuelta: true },
    });
    if (!nota) throw new NotFoundException('Ese aviso no existe.');
    const r = await this.prisma.notaDeCampo.update({
      where: { id },
      data: { resuelta: true, resueltaPorId: userId ?? null, resueltaEn: new Date() },
      select: { id: true, resuelta: true },
    });
    await this.audit.record({
      userId, ip, action: 'UPDATE', entity: 'nota-campo', entityId: id,
      before: { resuelta: nota.resuelta }, after: { resuelta: true },
    });
    return r;
  }

  // -------------------------------------------------------- PROCEDIMIENTOS
  async listarProcedimientos(tipo?: string) {
    return this.prisma.procedimientoRestauracion.findMany({
      where: tipo ? { tipoActivo: tipo as any } : {},
      select: {
        id: true, tipoActivo: true, marca: true, modelo: true, titulo: true,
        pasos: true, advertencias: true, minutosEstimados: true, activo: true,
        creadoPor: { select: { fullName: true } },
        updatedAt: true,
        _count: { select: { mejoras: true } },
      },
      orderBy: [{ tipoActivo: 'asc' }, { marca: 'asc' }, { modelo: 'asc' }],
    });
  }

  async guardarProcedimiento(dto: any, userId?: string, ip?: string) {
    const titulo = (dto.titulo ?? '').trim();
    const pasos = (Array.isArray(dto.pasos) ? dto.pasos : [])
      .map((p: any) => String(p).trim()).filter(Boolean);
    if (!titulo) throw new BadRequestException('Ponle un título que se entienda.');
    if (!pasos.length) {
      throw new BadRequestException(
        'Un procedimiento sin pasos no es un procedimiento. Escribe al menos uno.',
      );
    }
    if (!dto.tipoActivo) throw new BadRequestException('Falta el tipo de equipo.');

    const datos = {
      tipoActivo: dto.tipoActivo,
      marca: (dto.marca ?? '').trim() || null,
      modelo: (dto.modelo ?? '').trim() || null,
      titulo,
      pasos,
      advertencias: (dto.advertencias ?? '').trim() || null,
      minutosEstimados: Number.isFinite(dto.minutosEstimados) ? dto.minutosEstimados : null,
      activo: dto.activo !== false,
    };

    const r = dto.id
      ? await this.prisma.procedimientoRestauracion.update({
          where: { id: dto.id }, data: datos, select: { id: true, titulo: true },
        })
      : await this.prisma.procedimientoRestauracion.create({
          data: { ...datos, creadoPorId: userId ?? null },
          select: { id: true, titulo: true },
        });

    await this.audit.record({
      userId, ip, action: dto.id ? 'UPDATE' : 'CREATE',
      entity: 'procedimiento', entityId: r.id, after: { titulo, pasos: pasos.length },
    });
    return r;
  }

  // -------------------------------------------------------------- MEJORAS
  /**
   * El que acaba de arreglarlo propone el atajo que encontró.
   *
   * Se guarda con los MINUTOS REALES que le llevó. Eso es lo que convierte
   * esto en «cada mantenimiento mejora el siguiente»: comparando el estimado
   * con lo que de verdad cuesta se ve si el procedimiento está mejorando o si
   * sólo lo parece sobre el papel.
   */
  async proponerMejora(
    procedimientoId: string,
    dto: { texto?: string; minutosReales?: number; workOrderId?: string },
    userId?: string,
    ip?: string,
  ) {
    const texto = (dto.texto ?? '').trim();
    if (texto.length < 10) {
      throw new BadRequestException(
        'Cuenta la mejora con detalle. El que la lea no estuvo ahí contigo.',
      );
    }
    const proc = await this.prisma.procedimientoRestauracion.findUnique({
      where: { id: procedimientoId }, select: { id: true },
    });
    if (!proc) throw new NotFoundException('Ese procedimiento no existe.');

    const m = await this.prisma.mejoraProcedimiento.create({
      data: {
        procedimientoId, texto,
        minutosReales: Number.isFinite(dto.minutosReales as number) ? Number(dto.minutosReales) : null,
        workOrderId: dto.workOrderId || null,
        propuestaPorId: userId ?? null,
      },
      select: { id: true, estado: true },
    });
    await this.audit.record({
      userId, ip, action: 'CREATE', entity: 'mejora-procedimiento', entityId: m.id,
      after: { procedimientoId, texto: texto.slice(0, 120) },
    });
    return m;
  }

  /**
   * El Jefe acepta o rechaza. Si acepta, el paso se AÑADE al procedimiento.
   *
   * No entra sola por dos razones: el procedimiento se llenaría de manías
   * personales, y hace falta que alguien responda de lo que ahí dice — es lo
   * que va a seguir el próximo, posiblemente de noche y solo.
   */
  async decidirMejora(
    id: string,
    dto: { estado?: string; motivo?: string; comoPaso?: boolean },
    permisos?: string[],
    userId?: string,
    ip?: string,
  ) {
    if (permisos && !permisos.includes('procedimiento.manage')) {
      throw new ForbiddenException(
        'Aceptar una mejora cambia lo que va a seguir el próximo técnico. ' +
        'Hace falta el permiso de procedimientos.',
      );
    }
    const estado = dto.estado === 'ACEPTADA' ? 'ACEPTADA'
      : dto.estado === 'RECHAZADA' ? 'RECHAZADA' : null;
    if (!estado) throw new BadRequestException('Hay que aceptarla o rechazarla.');

    const mejora = await this.prisma.mejoraProcedimiento.findUnique({
      where: { id },
      select: { id: true, texto: true, estado: true, procedimientoId: true },
    });
    if (!mejora) throw new NotFoundException('Esa propuesta no existe.');
    if (mejora.estado !== 'PROPUESTA') {
      throw new BadRequestException('Esa propuesta ya estaba decidida.');
    }
    if (estado === 'RECHAZADA' && !(dto.motivo ?? '').trim()) {
      throw new BadRequestException(
        'Di por qué se rechaza. El que la propuso estuvo en campo y merece la respuesta; ' +
        'si no, deja de proponer.',
      );
    }

    /* ==========================================================================
       BLOQUE 37 — DOS JEFES DECIDIENDO A LA VEZ
       --------------------------------------------------------------------------
       Esta función tenía los dos fallos de concurrencia a la vez, y el segundo
       es de los que borran trabajo de campo sin dejar rastro.

       1) DOBLE DECISIÓN. Arriba se comprueba «¿ya estaba decidida?» sobre una
          lectura. Un doble clic, o dos personas en la bandeja de pendientes,
          pasaban los dos esa comprobación: la mejora se aceptaba dos veces y
          el paso se añadía DUPLICADO al procedimiento.
          Ahora la condición va en el `where` del propio update: PostgreSQL
          comprueba y escribe en la misma sentencia.

       2) UN PASO SE PERDÍA. Los pasos son un array, y se actualizaba leyendo
          el array entero, añadiendo uno, y volviendo a escribirlo. Dos mejoras
          aceptadas a la vez leían los mismos 4 pasos, cada una añadía el suyo,
          y las dos guardaban 5. El segundo paso desaparecía.
          Eso es una mejora que un técnico propuso desde campo, que el jefe
          aceptó, y que no aparece en el procedimiento. Nadie lo nota: el
          técnico ve «ACEPTADA» y da por hecho que está.

          Se resuelve serializando dentro de una transacción, y releyendo los
          pasos DENTRO de ella para que la lectura y la escritura no se
          separen.
       ========================================================================== */
    const r = await this.prisma.$transaction(async (tx) => {
      const movidas = await tx.mejoraProcedimiento.updateMany({
        where: { id, estado: 'PROPUESTA' },
        data: {
          estado: estado as any,
          motivoDecision: (dto.motivo ?? '').trim() || null,
          decididaPorId: userId ?? null,
          decididaEn: new Date(),
        },
      });

      if (movidas.count === 0) {
        throw new ConflictException(
          'Esta propuesta ya la decidió alguien mientras la mirabas. Actualiza la pantalla.',
        );
      }

      // Aceptada y marcada como paso: se añade al final del procedimiento.
      if (estado === 'ACEPTADA' && dto.comoPaso !== false) {
        const proc = await tx.procedimientoRestauracion.findUnique({
          where: { id: mejora.procedimientoId }, select: { pasos: true },
        });
        await tx.procedimientoRestauracion.update({
          where: { id: mejora.procedimientoId },
          data: { pasos: [...(proc?.pasos ?? []), mejora.texto] },
        });
      }

      return { id, estado };
    });

    await this.audit.record({
      userId, ip, action: 'UPDATE', entity: 'mejora-procedimiento', entityId: id,
      before: { estado: mejora.estado }, after: { estado },
    });
    return r;
  }

  /** Lo que espera decisión del Jefe. */
  async mejorasPendientes() {
    return this.prisma.mejoraProcedimiento.findMany({
      where: { estado: 'PROPUESTA' },
      select: {
        id: true, texto: true, minutosReales: true, createdAt: true,
        propuestaPor: { select: { fullName: true } },
        workOrder: { select: { code: true } },
        procedimiento: { select: { id: true, titulo: true, minutosEstimados: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
