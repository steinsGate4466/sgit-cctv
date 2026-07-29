import { Module } from '@nestjs/common';

/**
 * MÓDULO DE INTEGRACIONES — reservado para la fase F9.
 *
 * El sistema ya está preparado para estas integraciones: los activos tienen
 * campos SAP-ready (sapId, costCenter, responsibleArea) y las órdenes admiten
 * el código SAP manual.
 *
 * Qué resolverá cuando se implemente:
 *   · SAP             → sincronizar activos, materiales y órdenes; evitar doble digitación.
 *   · HikCentral      → estado en vivo de cámaras y NVR; autocreación de incidencias.
 *   · Zabbix / SNMP   → monitoreo de switches y enlaces (ping, disponibilidad).
 *   · Active Directory→ inicio de sesión con la cuenta corporativa.
 *
 * Se mantiene declarado para conservar la estructura del dominio ya modelada.
 */
@Module({})
export class IntegrationModule {}
