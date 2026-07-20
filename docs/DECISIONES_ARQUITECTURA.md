# Decisiones de arquitectura (CONGELADAS) — SGIT

> Registro oficial de decisiones aprobadas (ADR). **Documento maestro y congelado.** A
> partir de aquí, SGIT es un **ERP de Gestión de Infraestructura Tecnológica Industrial**
> (el CCTV es un módulo más). Solo documentación; no se modificó código, base de datos ni
> NestJS. Fecha de congelación: Julio 2026.

---

## Índice de decisiones

| ADR | Decisión | Estado |
|---|---|---|
| 01 | SGIT es un ERP modular (no solo CCTV) | Aprobada |
| 02 | Arquitectura: Monolito Modular + Clean Architecture | Aprobada |
| 03 | Stack tecnológico oficial | Aprobada |
| 04 | Taxonomía de 13 módulos + Inventario transversal | Aprobada |
| 05 | Activos vs Almacén vs Inventario (tres conceptos) | Aprobada |
| 06 | CMMS completo con ciclo de OM | Aprobada |
| 07 | Formularios dinámicos por plantillas versionadas | Aprobada (diseño) |
| 08 | Monitoreo no invasivo (HikCentral + Zabbix → SGIT) | Aprobada |
| 09 | Preparación SAP por fases (archivos → API → servicios) | Aprobada (diseño) |
| 10 | Módulo futuro: Gestión de Proyectos | Registrada (idea) |

---

## ADR-01 — SGIT es un ERP modular

El proyecto deja de ser únicamente CCTV y pasa a ser un **ERP de Gestión de Infraestructura
Tecnológica Industrial**. El CCTV es un módulo. El nombre de producto es **SGIT** (el
repositorio conserva `sgit-cctv` por compatibilidad).

## ADR-02 — Monolito Modular + Clean Architecture

Se confirma **monolito modular** con **Clean Architecture** (capas Presentación →
Aplicación → Dominio → Infraestructura), con fronteras de módulo estrictas (cada tabla
pertenece a un módulo; comunicación por servicios/eventos). Permite crecer por décadas y
extraer servicios solo si un módulo lo justifica.

## ADR-03 — Stack tecnológico oficial

**Monolito Modular · Clean Architecture · NestJS · PostgreSQL · Prisma · Docker · React ·
Redis · MinIO · JWT · RBAC · OpenAPI.** Sin cambios respecto a F0.

## ADR-04 — Módulos definitivos

13 módulos + Inventario transversal (detalle y dependencias en `MODULOS_DEL_SISTEMA.md`):

1. Dashboard Ejecutivo · 2. Activos Tecnológicos · 3. Ubicaciones · 4. Topología de Red ·
5. CCTV · 6. CMMS · 7. Almacén · 8. Incidentes · 9. Documentación · 10. Monitoreo ·
11. Integraciones · 12. Administración · 13. Auditoría · **(T) Inventario** (transversal).

## ADR-05 — Activos vs Almacén vs Inventario

**No se elimina Inventario.** Tres conceptos distintos:
- **Activos** → equipos tecnológicos (CI).
- **Almacén** → materiales, herramientas, repuestos y consumibles (mueve stock).
- **Inventario** → módulo **transversal** de conciliaciones, auditorías, diferencias y
  conteos físicos (audita y cuadra lo registrado contra lo real).

## ADR-06 — CMMS completo

Mantenimiento = **CMMS**. Toda intervención nace de una **Orden de Mantenimiento (OM)** con
ciclo **Registro → Planeación → Asignación → Ejecución → Validación → Cierre**. Cada
intervención registra: activo, ubicación, responsable, técnicos, diagnóstico, causa raíz,
procedimiento, actividades, checklist, horas hombre, materiales, repuestos, fotografías,
videos, documentos, firmas, observaciones, resultado, estado y auditoría. Detalle en
`CMMS.md`. Se prevé como fase propia (F3). No se implementa ahora.

## ADR-07 — Formularios dinámicos (APROBADO, diseño)

Los formularios/checklists de mantenimiento serán **dinámicos mediante plantillas
versionadas** (`FormTemplate`/`FormInstance`), configurables por el administrador sin tocar
código. Solo checklists/formularios son dinámicos; el núcleo permanece relacional. **No se
implementa aún**; queda documentada la decisión (ver `CMMS.md` §4 y
`ARQUITECTURA_EMPRESARIAL.md` §5).

## ADR-08 — Monitoreo no invasivo

Arquitectura definitiva:
```
HikCentral → SGIT → Dashboard   (CCTV)
Zabbix     → SGIT → Dashboard   (infraestructura)
```
SGIT **solo correlaciona** eventos; **no** hace monitoreo invasivo sobre cada cámara.
Herramientas Hikvision complementarias evaluadas (HMS, OpenAPI, ISAPI puntual, SNMP en
switches) con su regla de uso en `ARQUITECTURA_DE_MONITOREO.md`. No se implementa (F5).

## ADR-09 — Preparación SAP por fases

SGIT queda preparado para SAP: primero **archivos (CSV/Excel)**, luego **API**, luego
**servicios oficiales**. Capa anticorrupción + staging; campos SAP-ready ya en F0. Detalle
en `INTEGRACION_SAP.md`. No se implementa (F5).

## ADR-10 — Módulo futuro: Gestión de Proyectos

Registrado **solo como idea futura**: gestión de proyectos de instalaciones, migraciones,
expansiones y modernizaciones. No se diseña ni implementa aún.

---

## Estado del sistema tras la congelación

- **F0** permanece intacto (código, base de datos y NestJS sin cambios).
- La documentación queda **congelada y coherente** con estas decisiones.
- Próximo paso: **validación completa de F0** en la máquina del usuario (guiada, paso a
  paso). Solo después se inicia **F1**.

## Documentos relacionados

- `VISION_GENERAL_DEL_ERP.md` · `ARQUITECTURA_EMPRESARIAL.md` · `MODULOS_DEL_SISTEMA.md` ·
  `CMMS.md` · `ARQUITECTURA_DE_MONITOREO.md` · `INTEGRACION_SAP.md`
- Ejecución/validación: `CONFIGURACION_ENTORNO_DESARROLLO.md` ·
  `GUIA_EJECUCION_DESARROLLO.md` · `VALIDACION_F0_REAL.md`
