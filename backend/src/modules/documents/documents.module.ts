import { Module } from '@nestjs/common';

/**
 * MÓDULO DE GESTIÓN DOCUMENTAL — reservado para la fase F8.
 *
 * Su modelo YA existe en el esquema de datos (schema.prisma):
 *   · Document → archivo en MinIO con categoría, versión y vínculo a activo o ubicación
 *     (MANUAL · DIAGRAMA · PLANO · FOTO · CONFIG · BACKUP)
 *
 * Qué resolverá cuando se implemente:
 *   - Planos de planta y diagramas de red asociados a cada activo o zona.
 *   - Manuales de equipos Hikvision, Fortinet y Ubiquiti al alcance del técnico.
 *   - Respaldos de configuración de switches y NVR, con control de versión.
 *   - Carga restringida al Jefe de Mantenimiento (requisito ya definido).
 *
 * Se mantiene declarado para conservar la estructura del dominio ya modelada.
 */
@Module({})
export class DocumentsModule {}
