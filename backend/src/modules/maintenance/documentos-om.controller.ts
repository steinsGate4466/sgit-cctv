import { Body, Controller, Get, Ip, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DocumentsService } from '../documents/documents.service';
import { DocumentoDelTrabajoDto } from '../documents/dto/documento-del-trabajo.dto';
import { MAX_BYTES_DOC } from '../documents/archivos-documento';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AmbitoDe } from '../../common/ambito.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * EL EXPEDIENTE DE LA ORDEN — bloque 155.
 *
 * Además de las fotos de evidencia (que van al informe), la orden guarda sus
 * DOCUMENTOS: el protocolo firmado, el plano del tramo, la configuración que
 * se cargó. Lo sube quien ejecuta (`wo.update`) y lo lee quien ve órdenes.
 */
@ApiTags('work-orders')
@ApiBearerAuth()
@Controller('work-orders/:id/documentos')
export class DocumentosOmController {
  constructor(private readonly docs: DocumentsService) {}

  @AmbitoDe('workOrder')
  @Get()
  @RequirePermissions('wo.read')
  lista(@Param('id') id: string) {
    return this.docs.lista({ workOrderId: id });
  }

  @AmbitoDe('workOrder')
  @Post()
  @RequirePermissions('wo.update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_DOC } }))
  subir(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body() dto: DocumentoDelTrabajoDto,
    @CurrentUser() u: any,
    @Ip() ip: string,
  ) {
    return this.docs.subir(file, { ...dto, workOrderId: id }, u?.userId, ip);
  }
}
