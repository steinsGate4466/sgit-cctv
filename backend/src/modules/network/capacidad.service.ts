import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { filtroConAmbito } from '../../common/ambito-usuario';

/**
 * CAPACIDAD DE RED — bloque 122.
 *
 * =============================================================================
 *  LA PREGUNTA QUE NADIE PODÍA CONTESTAR
 * =============================================================================
 *  Palabras del usuario: *«cuando ellos quieren realizar algo, necesitan la
 *  información primero de cómo está la infraestructura, para poder validar si
 *  es apto o no apto»*.
 *
 *  En concreto: **«quieren cuatro cámaras nuevas en el lecho de enfriamiento.
 *  ¿Hay puertos? ¿Hay PoE? ¿O hay que comprar un switch antes?»**
 *
 *  El dato estaba TODO en la base desde hace meses —`SwitchPort` guarda número
 *  de puerto, si da PoE y a qué equipo está conectado— y **nadie lo
 *  preguntaba**. Un puerto libre es una fila con `connectedAssetId` vacío. Eso
 *  es todo. Esta pantalla es leerlo.
 *
 * =============================================================================
 *  Y LA SEGUNDA PREGUNTA, LA DE LOS PROYECTOS
 * =============================================================================
 *  *«¿Cómo proponemos cámaras con inteligencia artificial si no sabemos qué
 *  modelo tenemos en planta?»*
 *
 *  Tampoco tenía respuesta: el campo `model` existe en cada activo y **nadie lo
 *  agrupaba**. Aquí se cuenta el parque por marca y modelo, con su antigüedad
 *  media. Sin esa tabla no se puede proponer una renovación ni justificar una
 *  reinversión.
 *
 * =============================================================================
 *  LO QUE NO SE INVENTA
 * =============================================================================
 *  Un switch sin `portCount` declarado NO se cuenta como «0 puertos libres»:
 *  se cuenta aparte, como **sin declarar**. La diferencia importa: cero libres
 *  significa «está lleno, compra un switch»; sin declarar significa «ve y
 *  mídelo». Confundirlos haría comprar un switch que no hace falta.
 */
@Injectable()
export class CapacidadService {
  constructor(private prisma: PrismaService) {}

  /** Tope de switches por consulta. Una planta con más de 500 es otro problema. */
  static readonly TOPE = 500;

  async resumen(
    q: { tren?: string | null; etapa?: string | null } | null | undefined,
    userId?: string | null,
  ) {
    const generadoEn = new Date();
    const ambito = await filtroConAmbito(this.prisma, userId, {
      tren: q?.tren, etapa: q?.etapa,
    });

    const where: any = { deletedAt: null, type: 'SWITCH', status: { notIn: ['BAJA'] } };
    if (ambito) where.locationId = ambito;

    const switches = await this.prisma.asset.findMany({
      where,
      orderBy: { assetCode: 'asc' },
      take: CapacidadService.TOPE,
      select: {
        id: true, assetCode: true, brand: true, model: true, status: true,
        location: { select: { id: true, code: true, name: true } },
        cabinet: { select: { id: true, code: true, name: true } },
        switchDev: {
          select: {
            portCount: true, poePorts: true, poeBudgetW: true,
            switchRole: true, vendor: true,
            capa: true, gestionable: true, soportaVlan: true,
            /* Los puertos REALES, no el número declarado. Un switch puede
               decir 24 y tener 18 filas: la diferencia es lo que nadie ha
               mapeado todavía, y se dice en vez de disimularla. */
            ports: { select: { id: true, portNumber: true, poe: true, connectedAssetId: true } },
          },
        },
      },
    });

    const filas = switches.map((s) => {
      const d = s.switchDev;
      const puertos = d?.ports ?? [];
      const mapeados = puertos.length;
      const ocupados = puertos.filter((p) => p.connectedAssetId).length;
      const libres = mapeados - ocupados;
      const libresPoe = puertos.filter((p) => !p.connectedAssetId && p.poe).length;

      /* SIN DECLARAR ≠ LLENO. Ver el comentario de cabecera: confundirlos hace
         comprar un switch que no hace falta. */
      const declarados = d?.portCount ?? null;
      const sinMapear = declarados !== null && declarados > mapeados
        ? declarados - mapeados
        : 0;

      return {
        id: s.id,
        assetCode: s.assetCode,
        marca: s.brand || d?.vendor || null,
        modelo: s.model || null,
        rol: d?.switchRole ?? null,
        /* LA CAPA VIAJA CON EL SWITCH — bloque 145.
           Quien mira esta pantalla está decidiendo si una instalación cabe. Un
           capa 2 plano no admite segmentar lo nuevo, así que «hay puertos» no
           siempre significa «se puede instalar aquí». */
        capa: d?.capa ?? null,
        gestionable: d?.gestionable ?? null,
        soportaVlan: d?.soportaVlan ?? null,
        gabinete: s.cabinet ? `${s.cabinet.code} — ${s.cabinet.name}` : null,
        ubicacion: s.location?.name ?? null,
        puertosDeclarados: declarados,
        puertosMapeados: mapeados,
        ocupados,
        libres,
        libresPoe,
        sinMapear,
        presupuestoPoeW: d?.poeBudgetW ?? null,
        /* El PoE no se estima: o está declarado o no se sabe. Un presupuesto
           supuesto es cómo se quema una fuente. */
        poeDeclarado: d?.poeBudgetW != null,
      };
    });

    const suma = (f: (x: any) => number) => filas.reduce((t, x) => t + f(x), 0);

    return {
      generadoEn,
      switches: filas.length,
      tope: CapacidadService.TOPE,
      resumen: {
        puertosMapeados: suma((x) => x.puertosMapeados),
        ocupados: suma((x) => x.ocupados),
        libres: suma((x) => x.libres),
        libresPoe: suma((x) => x.libresPoe),
        sinMapear: suma((x) => x.sinMapear),
        /* Los switches que no pueden contestar a la pregunta. Es LA cifra que
           mide si el inventario sirve para planificar. */
        sinDeclarar: filas.filter((x) => x.puertosDeclarados === null).length,
        sinPoeDeclarado: filas.filter((x) => !x.poeDeclarado).length,
      },
      filas,
    };
  }

  /**
   * EL PARQUE POR MODELO.
   *
   * Sin esta tabla no se puede proponer una renovación: «tenemos 47 cámaras y
   * 31 son del mismo modelo de 2019» es una frase que hasta hoy nadie podía
   * decir con un dato detrás.
   *
   * Se agrupa por TIPO + MARCA + MODELO. Los que no tienen modelo declarado
   * salen aparte y contados: son la deuda de inventario, y esconderlos haría
   * creer que el parque está mejor documentado de lo que está.
   */
  async parque(
    q: { tren?: string | null; etapa?: string | null } | null | undefined,
    userId?: string | null,
  ) {
    const ambito = await filtroConAmbito(this.prisma, userId, {
      tren: q?.tren, etapa: q?.etapa,
    });
    const where: any = { deletedAt: null, status: { notIn: ['BAJA'] } };
    if (ambito) where.locationId = ambito;

    const filas = await this.prisma.asset.groupBy({
      by: ['type', 'brand', 'model'],
      where,
      _count: { _all: true },
      _min: { installDate: true },
      _max: { installDate: true },
    });

    const total = filas.reduce((t, f) => t + f._count._all, 0);
    const items = filas
      .map((f) => ({
        tipo: f.type,
        marca: f.brand || null,
        modelo: f.model || null,
        cuantos: f._count._all,
        /* Sin fecha de instalación no se inventa una antigüedad. */
        masAntiguo: f._min.installDate ?? null,
        masNuevo: f._max.installDate ?? null,
        declarado: !!(f.brand || f.model),
      }))
      .sort((a, b) => b.cuantos - a.cuantos);

    return {
      generadoEn: new Date(),
      total,
      /* La deuda de inventario, dicha con su número. */
      sinModelo: items.filter((x) => !x.declarado).reduce((t, x) => t + x.cuantos, 0),
      modelosDistintos: items.filter((x) => x.declarado).length,
      items,
    };
  }
}
