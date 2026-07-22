# Estado del sistema — SGIT (vivo)

Fotografía de lo que **funciona hoy** y lo que **está por trabajar**. Se actualiza en cada
avance. Proyecto: ERP de Infraestructura Tecnológica Industrial — Aceros Arequipa, Pisco.

Fecha de corte: Julio 2026.

---

## 1. Lo que YA funciona (validado o implementado)

### Infraestructura y base
- Docker: PostgreSQL, Redis, MinIO, API (NestJS), Nginx. ✅ operativo.
- Base de datos versionada con **migraciones** (Prisma migrate). ✅
- Semilla de Pisco (roles, VLANs, jerarquía, activos, incidencias y OM demo). ✅

### Seguridad (F1)
- Login **JWT + refresh tokens**, guard global (seguro por defecto). ✅
- **RBAC por permiso**, con roles reales de Aceros:
  - **Jefe de Mantenimiento** (admin total), **Supervisor TI** (supervisa, sin borrar/usuarios),
    **Técnico** (campo, sin borrar/aprobar), **Técnico de Red** (técnico + ve red/accesos),
    **Consultor Externo / Jefe de Producción** (solo lectura). ✅
- **Credenciales de equipos cifradas (AES-256-GCM)**; revelar solo Jefe, auditado. ✅
- **Firma de responsabilidad** (re-autenticación) al **resolver incidencias** y **cerrar OM**. ✅
- **Auditoría**: registra **login**, creaciones, cambios, revelaciones y firmas; con
  **fecha/hora**, **buscador por fecha y texto**; **solo el Jefe de Mantenimiento** la ve. ✅

### Módulos de negocio
- **Activos**: inventario + **detalle** con datos de red (IP, NICs, etc.) y credenciales
  **protegidos por rol**; **código de activo libre** (rotulamiento aún no estándar);
  **historial de mantenimiento** por activo. ✅
- **Incidencias**: registrar (categoría, prioridad, activo), listar, resolver con firma;
  MTTR automático. ✅
- **Órdenes de Mantenimiento (OM)**: **solo el Jefe genera**; tipos preventivo/correctivo/
  mejora; asignación, cierre firmado; visibles para técnicos (solo ejecutan). ✅
- **Dashboard ejecutivo**: KPIs (activos, disponibilidad, críticos, incidencias,
  mantenimientos pendientes) + gráficos (por tipo/estado/criticidad, causa raíz) +
  troubleshooting (MTTR, tiempo sin visión). ✅

### Frontend (web)
- Login, layout con menú **según permisos del rol**, Dashboard, Activos (con detalle),
  Incidencias, Mantenimiento, Auditoría, Usuarios. ✅

---

## 2. Lo que está POR TRABAJAR (backlog priorizado)

### Corto plazo (siguiente)
- **Planos/fotos por activo y por área** (subida a MinIO) para ubicar equipos en la planta.
- **Firma también al crear/editar activos** (mismo estándar que resolver/cerrar).
- **Vincular Incidencia ↔ OM** (referenciar el código de OM en la incidencia) — requiere
  migración pequeña.
- **Campo "inicio de la falla"** en incidencias (aparte de la fecha de registro) para MTTR real.
- **Categorías de incidencia configurables** (catálogo gestionable por el admin) + **áreas
  reales de la planta** (Horno, Colada, Laminación…) e incidencia por **ubicación**.

### Mediano plazo
- **Plan de mantenimiento preventivo** (frecuencia por activo) → **generación automática de OM**
  y alerta de **vencidos**.
- **SLA por prioridad** (tiempo objetivo) y alertas al excederlo.
- **Panel del Consultor/Producción** (dashboard de avance simplificado).
- **Reportes** exportables (PDF/Excel): actas de mantenimiento, historial por activo.
- **Almacén** (repuestos/consumibles) y consumo por OM.

### Antes de producción (planta)
- **HTTPS** en Nginx, contenedor **no-root**, **secretos** reales, **backups** de BD (pg_dump).
- Acceso por **VPN** (ya documentado en `DESPLIEGUE_ACEROS_AREQUIPA.md`).

### Largo plazo (F5)
- **Monitoreo en tiempo real** no invasivo: **HikCentral** (CCTV) + **Zabbix** (red) → SGIT.
- **Integración SAP** (materiales, centros de costo).

---

## 3. Métricas (implementadas y propuestas)
- Implementadas: total de activos, disponibilidad de visión, cámaras fuera de servicio,
  activos críticos, incidencias abiertas, mantenimientos pendientes, MTTR, tiempo sin visión,
  incidencias por causa raíz.
- Propuestas: MTBF por activo, disponibilidad por Tren/área, **top activos reincidentes**,
  backlog por antigüedad, **% dentro de SLA**, **accesos a credenciales por usuario**,
  **actividad por usuario**, cumplimiento de preventivo.

---

## 4. Cómo está construido (para retomar)
- Backend NestJS modular (Clean Architecture) + Prisma + PostgreSQL. Guard global de permisos.
- Frontend React + Vite + Recharts; menú y acciones **según permisos**.
- Cada acción sensible: **auditada** y, cuando cierra un proceso, **firmada**.
- Documentación en `docs/` (arquitectura, decisiones, cada incremento F1/F2, este estado).
