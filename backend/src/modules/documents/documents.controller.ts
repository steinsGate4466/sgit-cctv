import {
  Body, Controller, Delete, Get, Ip, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { SinAmbito } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MAX_BYTES_DOC } from './archivos-documento';
import { SubirDocumentoDto } from './dto/subir-documento.dto';

@ApiTags('documentos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('documentos')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  @RequirePermissions('document.read')
  lista(
    @Query('assetId') assetId?: string,
    @Query('locationId') locationId?: string,
    @Query('categoria') categoria?: string,
    @Query('q') q?: string,
  ) {
    return this.docs.lista({ assetId, locationId, categoria, q });
  }

  @Post()
  @RequirePermissions('document.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_DOC } }))
  subir(
    @UploadedFile() file: any,
    @Body() dto: SubirDocumentoDto,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.docs.subir(file, dto, u?.userId, ip);
  }

  @SinAmbito()  // documentos: el ámbito se aplica al listar por activo
  @Get(':id/descargar')
  @RequirePermissions('document.read')
  async descargar(@Param('id') id: string, @Res() res: Response) {
    const { buffer, nombre } = await this.docs.descargar(id);
    res.set({
      // Genérico y como adjunto SIEMPRE: aunque alguien colara un HTML, el
      // navegador no lo ejecutaría dentro del dominio del sistema.
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(buffer);
  }

  @SinAmbito()  // documentos: el ámbito se aplica al listar por activo
  @Delete(':id')
  @RequirePermissions('document.manage')
  borrar(@Param('id') id: string, @CurrentUser() u: any, @Ip() ip: string) {
    return this.docs.borrar(id, u?.userId, ip);
  }
}
