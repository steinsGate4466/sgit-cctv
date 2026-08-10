import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { StorageModule } from '../storage/storage.module';
import { AuditModule } from '../audit/audit.module';

/**
 * DOCUMENTOS (bloque 12.7).
 *
 * Este módulo era un `@Module({})` VACÍO mientras los permisos
 * `document.read` y `document.manage` ya existían en el catálogo de roles.
 * El ingeniero podía otorgar un permiso que no hacía nada.
 *
 * Manuales, planos, fichas y configuraciones, colgando de un equipo o de una
 * ubicación. Con versionado: subir un plano nuevo NO borra el anterior.
 */
@Module({
  imports: [StorageModule, AuditModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
