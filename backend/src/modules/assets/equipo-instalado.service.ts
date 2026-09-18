import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/**
 * QUÉ APARATO ESTÁ PUESTO EN ESTE SITIO — bloque 106-B.
 *
 * =============================================================================
 *  EL PROBLEMA QUE CIERRA (el del bloque 106-A, ahora con puerta)
 * =============================================================================
 *  Palabras del usuario: «imagínate que yo cambio la cámara y le pongo el mismo
 *  ID... tiene que ser de cero».
 *
 *  Hasta el 106-A, `Asset` era las dos cosas a la vez: el SITIO («la cámara del
 *  lecho de enfriamiento, columna 14») y el APARATO (marca, modelo, serie,
 *  firmware). Cuando se cambiaba el aparato y se le ponía la misma etiqueta,
 *  el sistema no tenía forma de saber que el de dentro era otro:
 *
 *    · las tres averías del aparato viejo quedaban colgando del nuevo;
 *    · la vida útil se contaba desde la instalación del PRIMERO;
 *    · y el informe de reemplazo no se podía escribir, porque el dato de qué
 *      se sustituyó y cuándo no existía en ninguna parte.
 *
 *  El 106-A creó la tabla. Esto es lo que la llena y lo que la lee.
 *
 * =============================================================================
 *  QUIÉN PUEDE, Y POR QUÉ NO ES EL SUPERVISOR
 * =============================================================================
 *  Retirar un aparato y poner otro NO es dar de baja el activo: el SITIO sigue
 *  ahí, con su etiqueta, su criticidad y su historial. Es el trabajo normal del
 *  técnico un martes por la tarde, con la cámara nueva en la mano.
 *
 *  Pedirle firma de supervisor para eso tendría un único efecto real: que no se
 *  registre. El técnico cambiaría la cámara igual y el dato se perdería — y un
 *  dato que no se registra es peor que un permiso flojo. Así que va con
 *  `asset.update`, el mismo permiso con el que ya edita la ficha.
 *
 *  LO QUE SÍ ES DEL SUPERVISOR es CORREGIR una entrada ya cerrada del
 *  historial, porque eso reescribe el pasado. Y va auditado **incluso cuando se
 *  deniega**: un intento de tocar el historial es exactamente lo que hay que
 *  poder mirar después.
 *
 * =============================================================================
 *  NADA SE BORRA. NUNCA.
 * =============================================================================
 *  Aquí no hay `delete`. Retirar CIERRA la fila con su fecha y su motivo; no la
 *  quita. Es la regla del proyecto entero y aquí pesa el doble: esta tabla ES
 *  el informe de reemplazo.
 */
@Injectable()
export class EquipoInstaladoService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Tope del historial de un sitio. Va con su `count`, como manda el 101. */
  static readonly TOPE_HISTORIAL = 100;

  /** Que el sitio exista y no esté dado de baja. Se comprueba SIEMPRE. */
  private async sitio(assetId: string) {
    const a = await this.prisma.asset.findUnique({
      where: { id: assetId },
      select: { id: true, assetCode: true, type: true, deletedAt: true },
    });
    if (!a || a.deletedAt) throw new NotFoundException('Activo no encontrado');
    return a;
  }

  /** El aparato que está puesto AHORA. `null` si el sitio está vacío. */
  async actual(assetId: string) {
    await this.sitio(assetId);
    return this.prisma.equipoInstalado.findFirst({
      where: { assetId, hasta: null },
      orderBy: { desde: 'desc' },
      select: {
        id: true, marca: true, modelo: true, serie: true, firmware: true,
        desde: true, desdeEsEstimado: true, notas: true, createdAt: true,
        instaladoPor: { select: { id: true, fullName: true } },
      },
    });
  }

  /**
   * Todos los aparatos que han pasado por este sitio, del último al primero.
   *
   * Se devuelve también `cuantos`, porque es LA cifra del informe de reemplazo:
   * «esta cámara se cambió tres veces en dos años» es una frase que hasta ahora
   * no se podía escribir con un dato detrás.
   */
  async historial(assetId: string) {
    const a = await this.sitio(assetId);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.equipoInstalado.count({ where: { assetId } }),
      this.prisma.equipoInstalado.findMany({
        where: { assetId },
        orderBy: [{ desde: 'desc' }, { createdAt: 'desc' }],
        take: EquipoInstaladoService.TOPE_HISTORIAL,
        select: {
          id: true, marca: true, modelo: true, serie: true, firmware: true,
          desde: true, desdeEsEstimado: true, hasta: true, motivoRetiro: true,
          notas: true,
          instaladoPor: { select: { id: true, fullName: true } },
          retiradoPor: { select: { id: true, fullName: true } },
        },
      }),
    ]);
    return {
      sitio: { id: a.id, assetCode: a.assetCode, type: a.type },
      cuantos: total,
      tope: EquipoInstaladoService.TOPE_HISTORIAL,
      recortados: total > items.length ? total - items.length : 0,
      /* CUÁNTOS SE HAN CAMBIADO DE VERDAD. No es `total - 1`: un sitio puede
         estar vacío ahora mismo, y entonces todos los del historial son
         reemplazos consumados. Se cuenta lo cerrado, que es lo que pasó. */
      reemplazos: items.filter((x) => x.hasta).length,
      items,
    };
  }

  /**
   * PONER UN APARATO. Si ya había uno, se retira en el mismo acto.
   *
   * ---------------------------------------------------------------------------
   * LAS DOS ESCRITURAS VAN JUNTAS O NO VA NINGUNA
   * ---------------------------------------------------------------------------
   * Cerrar el viejo y abrir el nuevo describen UN solo hecho: se cambió la
   * cámara. Si la segunda fallara —un corte con la base, un tiempo agotado— el
   * sitio quedaría con DOS aparatos abiertos, o con NINGUNO. Y la base lo
   * rechaza de todas formas: el índice único parcial del 106-A sólo admite una
   * fila con `hasta` vacío por sitio. Mejor que lo impida la transacción a que
   * lo impida un error de Postgres que nadie sabe leer.
   *
   * Es la misma regla del almacén (37-C), del rol (86) y de la baja (87).
   *
   * ---------------------------------------------------------------------------
   * EL MOTIVO DEL QUE SALE ES OBLIGATORIO
   * ---------------------------------------------------------------------------
   * «Se cambió la cámara» sin motivo no explica nada seis meses después, y es
   * justo lo que hay que leer para decidir si el modelo aguanta en esa zona o
   * hay que cambiar de modelo. Sin motivo, esto no pasa.
   */
  async instalar(
    assetId: string,
    dto: {
      marca?: string; modelo?: string; serie?: string; firmware?: string;
      desde?: string; notas?: string; motivoRetiroAnterior?: string;
    },
    actorId?: string | null,
    ip?: string,
  ) {
    const a = await this.sitio(assetId);

    /* ALGO QUE IDENTIFIQUE AL APARATO. Una fila con los cuatro campos vacíos
       no dice «hay una cámara puesta»: dice que alguien pulsó un botón. */
    const hayDatos = [dto.marca, dto.modelo, dto.serie, dto.firmware]
      .some((v) => (v || '').trim().length > 0);
    if (!hayDatos) {
      throw new BadRequestException(
        'Pon al menos la marca, el modelo o la serie del aparato. Una entrada sin '
        + 'ninguno de los tres no distingue este aparato del anterior, que es para '
        + 'lo que sirve este registro.',
      );
    }

    const desde = dto.desde ? new Date(dto.desde) : new Date();
    if (Number.isNaN(desde.getTime())) {
      throw new BadRequestException('La fecha de instalación no es una fecha válida.');
    }
    /* UNA FECHA EN EL FUTURO NO SE ACEPTA. El reloj del móvil del técnico puede
       ir adelantado, y una instalación fechada mañana rompe cualquier cálculo
       de vida útil sin que nadie lo note. */
    if (desde.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('La fecha de instalación no puede ser futura.');
    }

    const anterior = await this.prisma.equipoInstalado.findFirst({
      where: { assetId, hasta: null },
      orderBy: { desde: 'desc' },
      select: { id: true, marca: true, modelo: true, serie: true, desde: true },
    });

    const motivo = (dto.motivoRetiroAnterior || '').trim();
    if (anterior && motivo.length < 4) {
      throw new BadRequestException(
        'Este sitio ya tiene un aparato puesto. Para cambiarlo hay que decir por qué '
        + 'sale el anterior: es el dato que después explica si el modelo aguanta en '
        + 'esa zona o hay que cambiar de modelo.',
      );
    }
    /* Y no puede entrar el nuevo ANTES de que existiera el viejo. Con las dos
       fechas cruzadas, el historial se lee al revés y nadie lo nota. */
    if (anterior && desde.getTime() < new Date(anterior.desde).getTime()) {
      throw new BadRequestException(
        'La fecha de instalación es anterior a la del aparato que está puesto. '
        + 'Revisa la fecha: el historial quedaría al revés.',
      );
    }

    const escrituras: any[] = [];
    if (anterior) {
      escrituras.push(this.prisma.equipoInstalado.update({
        where: { id: anterior.id },
        data: { hasta: desde, motivoRetiro: motivo, retiradoPorId: actorId || null },
      }));
    }
    escrituras.push(this.prisma.equipoInstalado.create({
      data: {
        assetId,
        marca: dto.marca?.trim() || null,
        modelo: dto.modelo?.trim() || null,
        serie: dto.serie?.trim() || null,
        firmware: dto.firmware?.trim() || null,
        desde,
        desdeEsEstimado: false,
        notas: dto.notas?.trim() || null,
        instaladoPorId: actorId || null,
      },
    }));

    const resultado = await this.prisma.$transaction(escrituras);
    const nuevo = resultado[resultado.length - 1] as any;

    await this.audit.record({
      userId: actorId || null,
      action: anterior ? 'CAMBIO_DE_APARATO' : 'INSTALAR_APARATO',
      entity: 'equipos_instalados',
      entityId: nuevo.id,
      ip,
      before: anterior
        ? { marca: anterior.marca, modelo: anterior.modelo, serie: anterior.serie }
        : undefined,
      after: {
        sitio: a.assetCode,
        marca: nuevo.marca, modelo: nuevo.modelo, serie: nuevo.serie,
        motivoRetiroAnterior: anterior ? motivo : undefined,
      },
    });

    return { ok: true, id: nuevo.id, reemplazo: !!anterior };
  }

  /**
   * RETIRAR sin poner nada en su sitio.
   *
   * Existe porque pasa: se lleva la cámara al taller y el sitio se queda vacío
   * una semana. Si la única forma de retirar fuera instalando otra, el técnico
   * inventaría un aparato para poder cerrar el anterior — y ese invento se
   * quedaría en la base para siempre.
   */
  async retirar(
    assetId: string,
    dto: { motivo?: string; hasta?: string },
    actorId?: string | null,
    ip?: string,
  ) {
    const a = await this.sitio(assetId);
    const motivo = (dto.motivo || '').trim();
    if (motivo.length < 4) {
      throw new BadRequestException('Di por qué se retira el aparato. Sin motivo no se guarda.');
    }

    const abierto = await this.prisma.equipoInstalado.findFirst({
      where: { assetId, hasta: null },
      orderBy: { desde: 'desc' },
      select: { id: true, marca: true, modelo: true, serie: true, desde: true },
    });
    if (!abierto) {
      throw new BadRequestException('Este sitio no tiene ningún aparato registrado ahora mismo.');
    }

    const hasta = dto.hasta ? new Date(dto.hasta) : new Date();
    if (Number.isNaN(hasta.getTime())) {
      throw new BadRequestException('La fecha de retiro no es una fecha válida.');
    }
    if (hasta.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('La fecha de retiro no puede ser futura.');
    }
    if (hasta.getTime() < new Date(abierto.desde).getTime()) {
      throw new BadRequestException(
        'La fecha de retiro es anterior a la de instalación. Revisa la fecha.',
      );
    }

    await this.prisma.equipoInstalado.update({
      where: { id: abierto.id },
      data: { hasta, motivoRetiro: motivo, retiradoPorId: actorId || null },
    });

    await this.audit.record({
      userId: actorId || null,
      action: 'RETIRAR_APARATO',
      entity: 'equipos_instalados',
      entityId: abierto.id,
      ip,
      before: { marca: abierto.marca, modelo: abierto.modelo, serie: abierto.serie },
      after: { sitio: a.assetCode, motivo },
    });

    return { ok: true, id: abierto.id };
  }

  /**
   * CORREGIR una entrada del historial. **Sólo el supervisor**, y auditado
   * incluso cuando se DENIEGA.
   *
   * Aquí sí, y la diferencia con instalar/retirar es exacta: instalar registra
   * algo que acaba de pasar; esto REESCRIBE lo que ya está escrito. Una serie
   * mal tecleada hay que poder arreglarla —si no, el registro deja de usarse—,
   * pero el que la arregla tiene nombre y queda apuntado.
   *
   * SE LEE EL CARGO DE LA BASE, NO DEL TOKEN (las dos llaves, bloque 68): a
   * quien le quitaron el cargo esta mañana no le vale la sesión de ayer.
   */
  async corregir(
    id: string,
    dto: { marca?: string; modelo?: string; serie?: string; firmware?: string; notas?: string },
    actorId?: string | null,
    ip?: string,
  ) {
    const fila = await this.prisma.equipoInstalado.findUnique({
      where: { id },
      select: {
        id: true, assetId: true, marca: true, modelo: true, serie: true,
        firmware: true, notas: true,
      },
    });
    if (!fila) throw new NotFoundException('Entrada de historial no encontrada');

    const actor = actorId
      ? await this.prisma.user.findUnique({
        where: { id: actorId },
        select: {
          active: true,
          role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        },
      })
      : null;
    const puede = !!actor?.active
      && !!actor.role?.permissions.some((p) => p.permission.code === 'asset.delete');

    if (!puede) {
      /* EL INTENTO DENEGADO TAMBIÉN SE APUNTA. Un registro que sólo guarda lo
         que salió bien no sirve para investigar nada. */
      await this.audit.record({
        userId: actorId || null,
        action: 'CORREGIR_APARATO_DENEGADO',
        entity: 'equipos_instalados',
        entityId: id,
        ip,
        after: { motivo: 'sin cargo vigente para corregir el historial de aparatos' },
      }).catch(() => null);
      throw new ForbiddenException(
        'Corregir el historial de aparatos es cosa del supervisor. Si tu cargo cambió '
        + 'hace poco, cierra sesión y vuelve a entrar para que se aplique.',
      );
    }

    const data: any = {};
    for (const campo of ['marca', 'modelo', 'serie', 'firmware', 'notas'] as const) {
      const v = dto[campo];
      if (v !== undefined) data[campo] = (v || '').trim() || null;
    }
    if (!Object.keys(data).length) {
      throw new BadRequestException('No se indicó ningún campo que corregir.');
    }

    const despues = await this.prisma.equipoInstalado.update({ where: { id }, data });

    await this.audit.record({
      userId: actorId || null,
      action: 'CORREGIR_APARATO',
      entity: 'equipos_instalados',
      entityId: id,
      ip,
      before: {
        marca: fila.marca, modelo: fila.modelo, serie: fila.serie,
        firmware: fila.firmware, notas: fila.notas,
      },
      after: {
        marca: despues.marca, modelo: despues.modelo, serie: despues.serie,
        firmware: despues.firmware, notas: despues.notas,
      },
    });

    return { ok: true, id };
  }
}
