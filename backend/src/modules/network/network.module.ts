import { Module } from '@nestjs/common';

/**
 * MÓDULO DE RED Y TOPOLOGÍA — reservado para la fase F8.
 *
 * Sus modelos YA existen en el esquema de datos (schema.prisma):
 *   · Vlan        → segmentación por Tren (VLAN 10/20/30, NVR 100, gestión 200)
 *   · SwitchPort  → puertos de switch, PoE y qué equipo cuelga de cada uno
 *   · NetworkLink → enlaces entre activos (fibra del anillo, cobre, inalámbrico)
 *
 * Qué resolverá cuando se implemente:
 *   - Mapa de dependencias: "este NVR alimenta estas 8 cámaras"; "esta antena PMP
 *     da servicio a estas cámaras a través del switch del púlpito".
 *   - Análisis de impacto: ante la caída de un switch o un radioenlace, saber al
 *     instante QUÉ se deja de ver y priorizar según el riesgo para producción.
 *   - Registro del anillo de fibra del core y de los enlaces PMP de los Trenes.
 *
 * Se mantiene declarado para conservar la estructura del dominio ya modelada.
 */
@Module({})
export class NetworkModule {}
