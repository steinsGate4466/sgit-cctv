import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequireAlguno, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { resolverContexto } from '../../common/plant-context';
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
  @RequirePermissions('infra.read')
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
  @RequirePermissions('infra.read')
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
  @RequirePermissions('infra.read')
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

  /**
   * EL RÓTULO SIGUIENTE, YA CALCULADO — bloque 168.
   * El alta de equipo y el cierre de una instalación pedían el código a mano:
   * cada uno lo escribía a su manera y el estándar quedaba en Rotulado. Aquí
   * se arma con el tipo y la UBICACIÓN elegida (tren y zona salen del árbol) y
   * se le pone el primer número libre de esa serie.
   */
  @SinAmbito()
  @Get('proximo-rotulo')
  @RequireAlguno('infra.read', 'asset.create', 'wo.update')
  async proximoRotulo(@Query('tipo') tipo: string, @Query('locationId') locationId?: string) {
    const loc = locationId
      ? await this.prisma.location.findUnique({ where: { id: locationId }, select: { id: true, code: true, name: true, type: true } })
      : null;
    const ctx: any = loc ? await resolverContexto(this.prisma, { id: `rotulo:${loc.id}`, locationId: loc.id }) : null;
    const tren = ctx?.trenSigla || ctx?.trenCode || null;
    // La zona: el último tramo del código de la ubicación (AASA-PISCO-T1-HORNO → HORNO),
    // salvo que la ubicación sea el propio tren (entonces no hay zona más fina).
    const zona = loc && loc.type !== 'TREN' ? (loc.code.split('-').pop() || loc.name) : null;
    const base = generarCodigo({ tipoActivo: tipo, trenCode: tren, zonaNombre: zona, secuencia: 1 });
    const prefijo = base.codigo.replace(/-\d{3}$/, '-');
    const usados = await this.prisma.asset.findMany({ where: { assetCode: { startsWith: prefijo } }, select: { assetCode: true } });
    const max = usados.reduce((m, a) => Math.max(m, Number(a.assetCode.slice(prefijo.length)) || 0), 0);
    const r = generarCodigo({ tipoActivo: tipo, trenCode: tren, zonaNombre: zona, secuencia: max + 1 });
    return { ...r, etiqueta: textoDeEtiqueta(r.codigo), usados: usados.length };
  }

  /** Revisa un código escrito a mano. Devuelve errores y avisos por separado:
   *  un formato imposible no entra, un desfase con el árbol sólo avisa. */
  @SinAmbito()
  @Post('revisar-rotulo')
  @RequirePermissions('infra.read')
  revisar(@Body() dto: { codigo?: string; tipoActivo?: string; trenCode?: string }) {
    return revisarCodigo(dto?.codigo ?? '', dto);
  }
}
