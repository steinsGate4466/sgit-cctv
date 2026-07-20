# CMMS — Gestión de Mantenimiento (análisis de diseño)

> El módulo de mantenimiento deja de ser "registrar un mantenimiento" y se convierte en un
> **CMMS** (Computerized Maintenance Management System) completo. Este documento define su
> arquitectura de dominio. Sin código; no se implementa aún.

---

## 1. Concepto central: la Orden de Mantenimiento (OM)

Todo mantenimiento **nace de una OM**. La OM es el *agregado* (la unidad de negocio y de
transacción) que gobierna el flujo. Una OM puede tener una o varias **intervenciones**
(visitas/ejecuciones) hasta cerrarse.

Tipos de OM: **Preventivo**, **Correctivo**, **Predictivo** (futuro) y **Mejora**.
Origen de la OM: manual, plan preventivo (calendario), o **automática desde una alerta de
monitoreo** (HikCentral/Zabbix → Incidente → OM).

---

## 2. Ciclo de vida de la OM (máquina de estados)

```
[REGISTRO] → [PLANEACIÓN] → [ASIGNACIÓN] → [EJECUCIÓN] → [VALIDACIÓN] → [CIERRE]
     │            │             │              │             │            │
   crea la      define        asigna        técnicos      supervisor    OM cerrada,
   OM y su      procedimiento, técnico(s)    ejecutan y    revisa y      KPIs y
   activo       repuestos,     y fecha       registran     aprueba/       auditoría
                checklist                    intervención  rechaza
                                                  │
                                             (si rechaza → vuelve a EJECUCIÓN)
```

- **Registro:** activo/ubicación, tipo, prioridad, descripción, origen.
- **Planeación:** procedimiento, checklist (formulario dinámico según tipo de activo),
  repuestos/materiales estimados, tiempo estimado.
- **Asignación:** responsable y técnicos, fecha programada.
- **Ejecución:** una o más **intervenciones** con todos los datos de campo (ver §3).
- **Validación:** supervisor revisa evidencia, checklist y resultado; aprueba o devuelve.
- **Cierre:** consolida horas, consumos, resultado y recomendaciones; dispara KPIs y auditoría.

Cada transición se **audita** (quién, cuándo) y respeta permisos (RBAC).

---

## 3. Datos de cada intervención

La intervención es el registro de campo de una ejecución de la OM. Captura:

| Campo | Descripción |
|---|---|
| Activo | Equipo intervenido (FK a Activos) |
| Ubicación | Dónde se realizó (FK a Ubicaciones) |
| Fecha / horario | Inicio y fin |
| Responsable / técnicos | Quién lidera y quiénes ejecutan |
| Diagnóstico | Qué se encontró |
| Causa raíz | Por qué ocurrió (alimenta troubleshooting) |
| Actividades realizadas | Qué se hizo |
| Procedimiento | Referencia al procedimiento seguido |
| **Checklist** | Formulario dinámico según tipo de activo (ver §4) |
| Tiempo empleado | Duración real |
| **Horas hombre (HH)** | Suma de horas por técnico |
| Materiales / repuestos | Consumos reales (descuenta de Almacén, §5) |
| Evidencias | Fotografías, videos, archivos (MinIO) |
| Firmas | Técnico y supervisor (validación) |
| Resultado | OK / parcial / requiere seguimiento |
| Estado | Estado de la intervención |
| Recomendaciones | Acciones futuras sugeridas |
| Auditoría | Trazabilidad del registro |

Modelo de entidades (conceptual):
```
WorkOrder (OM) 1───* Intervention 1───* InterventionActivity
     │                    │
     │                    ├──* LaborLog (técnico, horas)   → HH
     │                    ├──* MaterialUsage (item, cantidad, lote/serie) → Almacén
     │                    ├──* Evidence (foto/video/archivo → MinIO)
     │                    ├──* Signature (técnico/supervisor)
     │                    └──1 FormInstance (checklist dinámico)
     └──1 MaintenancePlan? (si es preventivo)
```

---

## 4. Checklists / formularios dinámicos

Cada tipo de activo tiene su propio checklist (una cámara ≠ un switch ≠ un NVR ≠ una UPS).
Se resuelve con **formularios dinámicos definidos como datos** (decisión analizada en
`ARQUITECTURA_EMPRESARIAL.md` §5):

```
FormTemplate
  - id, nombre, versión
  - appliesTo: tipo/categoría de activo (CAMERA, SWITCH, NVR, UPS...)
  - schema: definición de campos (JSON-Schema): tipos, obligatorios, rangos, opciones
  - activo/inactivo

FormInstance
  - formTemplateId + versión usada
  - interventionId
  - respuestas (JSON validado contra el schema de ESA versión)
```

Principios:
- El administrador crea/edita plantillas **sin tocar código**.
- Cada intervención guarda la **versión** de plantilla usada (trazabilidad histórica).
- Validación estricta contra el esquema; sin lógica arbitraria embebida.
- Solo los **checklists/formularios** son dinámicos; el resto del modelo es relacional.

---

## 5. Consumo de repuestos ↔ Almacén

El CMMS **no** gestiona stock; **lo consume** del módulo Almacén:

```
Intervención registra MaterialUsage (item, cantidad, lote/serie)
        │  evento / servicio
        ▼
Almacén genera un MOVIMIENTO de salida (Kardex) y descuenta stock
        │
        ▼
La OM queda con el costo real de materiales (para reportes y SAP futuro)
```

- Almacén se diseña como **libro de movimientos inmutable** (entradas/salidas); el stock es
  la suma de movimientos. El Kardex es la vista cronológica.
- Soporta **lotes** y **series** (repuestos serializados como una fuente de alimentación).
- El consumo por OM permite **costeo** de mantenimiento y, a futuro, conciliación con SAP.

---

## 6. Mantenimiento preventivo (planes)

- `MaintenancePlan`: define frecuencia (calendario o por uso), activos/categoría objetivo,
  procedimiento y checklist por defecto.
- Un *scheduler* genera OM preventivas automáticamente al vencer el plan.
- Convive con el correctivo (OM desde incidente) y la mejora.

---

## 7. Indicadores del CMMS

A partir de OM e intervenciones se calculan:

| KPI | Definición |
|---|---|
| **MTTR** | Tiempo medio de reparación (correctivo) |
| **MTBF** | Tiempo medio entre fallas por activo |
| **Cumplimiento de preventivo** | % de OM preventivas ejecutadas a tiempo |
| **HH por OM / por activo** | Carga de trabajo |
| **Costo de mantenimiento** | Materiales + HH por activo/tren |
| **Disponibilidad** | % de tiempo operativo (se cruza con monitoreo) |
| **Backlog** | OM pendientes por antigüedad |

Estos alimentan el módulo **Dashboard** y **Troubleshooting**.

---

## 8. Relación con otros módulos

- **Activos / Ubicaciones:** toda OM referencia un activo y su ubicación.
- **Almacén:** consumo de repuestos (movimientos/Kardex).
- **Incidentes / Monitoreo:** un incidente puede **generar** una OM correctiva automática.
- **Documentación:** procedimientos y evidencias (MinIO).
- **Auditoría:** cada transición de la OM se registra.
- **Integración SAP (futuro):** costos, materiales y centros de costo.

---

## 9. Impacto sobre F0 y recomendación

F0 tiene un `WorkOrder` básico (código, activo, técnico, diagnóstico, repuestos JSON,
evidencias). Es un **buen punto de partida**, pero el CMMS completo requiere **ampliar el
modelo** (intervenciones, HH, checklist dinámico, consumos ligados a Almacén, firmas, plan
preventivo, máquina de estados).

**Recomendación:** el CMMS es un **módulo grande**; conviene abordarlo como **fase propia
(F3)**, después de F1 (seguridad) y con Almacén disponible o en paralelo. No se implementa
ahora; este documento fija su arquitectura para no improvisar después.
