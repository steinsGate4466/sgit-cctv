import { Module } from '@nestjs/common';
import { NetworkService } from './network.service';
import { NetworkController } from './network.controller';
import { GrabadoresService } from './grabadores.service';
import { GrabadoresController } from './grabadores.controller';

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
 * BLOQUE 6a/6b (03/08/2026): rejilla de canales del grabador. El púlpito
 * habla de canales y de nombres ("el 7 está negro", "la de la grúa"); aquí
 * está la tabla que traduce eso a un activo del sistema.
 *
 * IMPLEMENTADO EN EL BLOQUE 7 (02/08/2026): topología y análisis de impacto.
 * El grafo NO se guarda: se arma en cada consulta a partir de los puertos de
 * switch, los enlaces declarados y el NVR de cada cámara. Guardarlo aparte
 * sería mantener dos verdades, y la segunda siempre se queda vieja.
 */
@Module({
  controllers: [NetworkController, GrabadoresController],
  providers: [NetworkService, GrabadoresService],
  exports: [NetworkService, GrabadoresService],
})
export class NetworkModule {}
