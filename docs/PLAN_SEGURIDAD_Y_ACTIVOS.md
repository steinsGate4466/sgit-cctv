# Plan DevOps — Seguridad, Firma, Activos sensibles y Métricas

Backlog que captura todos los requerimientos del área (siderúrgica). Se ejecuta por
incrementos; cada uno aditivo y probado.

## Requerimientos capturados

### R1 — Firma de responsabilidad (e-signature) en acciones críticas
- Al **resolver una incidencia**, quien la cierra (técnico) ingresa **correo + contraseña**
  como firma; el backend re-verifica y registra quién firmó. Igual patrón para
  **modificar/agregar activos**.

### R2 — Trazabilidad total (auditoría)
- Registrar **login**, **modificaciones**, y **accesos a módulos** de cada usuario.
- La auditoría muestra **fecha/hora** y tiene **buscador** (por fecha y texto).
- **Solo el Jefe de Mantenimiento** ve la auditoría.

### R3 — Órdenes de Mantenimiento (OM / CMMS)
- **Solo el Jefe de Mantenimiento genera la OM.**
- La OM aparece en el **dashboard**.
- El **Técnico** puede **ver** la OM y **referenciar su código** dentro de una incidencia.
- (Módulo grande — F3.)

### R4 — Activos enriquecidos + datos sensibles protegidos
- El activo debe guardar: **IP**, **contraseña/credenciales**, **dependencia de red**
  (a qué switch/NVR/antena cuelga), e **imágenes/planos** para ubicarlo rápido en la planta.
- **Solo Jefe de Mantenimiento y Supervisor TI** ven los datos sensibles (IP, credenciales,
  red). Puede existir un **Técnico de Red** específico con ese acceso.
- Métricas de seguridad extra por ser **accesos** (NVR, switch, antena): auditar cada
  visualización de credencial (ya se hace con `REVEAL`).

### R5 — Código de activo según rotulamiento (ya hecho: campo libre)

## Métricas propuestas (análisis DevOps)

Operación / mantenimiento:
- **MTTR** (medio de reparación) y **MTBF** (entre fallas) por activo y por Tren/área.
- **Disponibilidad de visión** por zona/tren (ya en dashboard).
- **Tiempo sin visión** acumulado (impacto en producción).
- **Top activos reincidentes** (más incidencias) → priorizar reemplazo.
- **Backlog de incidencias** por antigüedad y por prioridad.
- **Incidencias por área/ubicación** (Horno, Laminación…).
- **% resueltas dentro de SLA** por prioridad.
- **Cumplimiento de preventivo** (con CMMS).

Seguridad / trazabilidad:
- **Accesos a credenciales** (nº de `REVEAL`) por usuario/equipo.
- **Actividad por usuario** (logins, cambios) — panel para el Jefe.
- **Acciones firmadas** vs no firmadas.

Infraestructura (con monitoreo F5):
- **Uptime** de switches/enlaces (Zabbix), **estado de NVR/almacenamiento** (HikCentral).

## Orden de ejecución propuesto
1. **Seguridad/trazabilidad** (este incremento): firma al resolver, LOGIN auditado,
   auditoría con buscador por fecha, auditoría solo Jefe.
2. **Activos enriquecidos**: IP/dependencia de red/credenciales visibles solo a Jefe/TI,
   con firma para editar; imágenes/planos (requiere MinIO, F4).
3. **CMMS / OM**: generación por Jefe, visible en dashboard, referencia en incidencias.
4. **Categorías configurables + áreas de planta + incidencia por ubicación**.
5. **Más métricas y paneles** por rol (incluido panel del Consultor/Producción).
