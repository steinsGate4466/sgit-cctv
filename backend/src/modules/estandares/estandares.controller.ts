import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import {
  CODIGO_DE_COLOR, ABREVIATURA_TIPO, generarCodigo, revisarCodigo, textoDeEtiqueta,
} from '../../common/estandar-rotulado';

/**
 * EL ESTÁNDAR DE LA PLANTA, EXPUESTO COMO DATO — bloque 30.
 *
 * Un estándar de rotulado en un PDF se cumple el primer mes. Aquí el sistema
 * lo GENERA y lo VALIDA, así que no depende de que nadie se acuerde. Basado en
 * ANSI/TIA-606-C, que es lo que va a pedir cualquier auditoría de cableado.
 */
@ApiTags('estandares')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('estandares')
export class EstandaresController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * EL CATÁLOGO DE COLORES DE CHAQUETA — bloque 45.
   *
   * Es la ÚNICA fuente de la leyenda: la lee Rotulado, la leerá el formulario
   * de Instalar y la ficha de Cableado. Si cada pantalla tuviera su lista, en
   * seis meses dirían cosas distintas — que es el fallo que este proyecto
   * persigue en todas partes.
   *
   * Se sirven sólo los ACTIVOS: los desactivados siguen existiendo para los
   * tramos viejos que los usan, pero no se ofrecen para tramos nuevos.
   */
  @SinAmbito()
  @Get('colores')
  @RequirePermissions('asset.read')
  colores() {
    return this.prisma.colorDeCable.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
      select: { id: true, code: true, nombre: true, uso: true, porQue: true, hex: true },
    });
  }

  /** El código de color y las abreviaturas. Lo consulta la pantalla y el que
   *  está comprando patch cords. */
  @SinAmbito()
  @Get()
  @RequirePermissions('asset.read')
  todo() {
    return {
      norma: 'ANSI/TIA-606-C (2017) — Administración de infraestructura de telecomunicaciones',
      nota:
        'El color es RECOMENDADO por la norma, no obligatorio. Lo obligatorio es que ' +
        'exista un estándar interno, documentado y aplicado en TODA la instalación. ' +
        'Un color a medias es peor que ninguno: enseña a desconfiar del rótulo.',
      colores: CODIGO_DE_COLOR,
      abreviaturas: ABREVIATURA_TIPO,
      formula: 'AA-<TIPO>-<TREN>-<ZONA>-<NNN>',
      ejemplo: 'AA-CAM-T2-LECHO-014',
    };
  }

  /** Propone el rótulo de un equipo nuevo. */
  @SinAmbito()
  @Get('rotulo')
  @RequirePermissions('asset.read')
  rotulo(
    @Query('tipo') tipo: string,
    @Query('tren') tren?: string,
    @Query('zona') zona?: string,
    @Query('n') n?: string,
  ) {
    const r = generarCodigo({
      tipoActivo: tipo, trenCode: tren, zonaNombre: zona,
      secuencia: Number(n) || 1,
    });
    return { ...r, etiqueta: textoDeEtiqueta(r.codigo) };
  }

  /** Revisa un código escrito a mano. Devuelve errores y avisos por separado:
   *  un formato imposible no entra, un desfase con el árbol sólo avisa. */
  @SinAmbito()
  @Post('revisar-rotulo')
  @RequirePermissions('asset.read')
  revisar(@Body() dto: { codigo?: string; tipoActivo?: string; trenCode?: string }) {
    return revisarCodigo(dto?.codigo ?? '', dto);
  }
}
