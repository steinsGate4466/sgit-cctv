# Integración con SAP — Preparación (análisis, sin implementar)

> Diseño de cómo SGIT quedará **preparado** para integrarse con SAP. No se implementa nada
> en esta etapa. Sin código.

---

## 1. Objetivo

Dejar el ERP listo para intercambiar información con SAP de forma **progresiva**, sin
acoplar el dominio de SGIT al modelo de SAP. Casos de uso previstos:

- Consultar **materiales** y **stock** (para Almacén y CMMS).
- Usar **centros de costo** y **ubicaciones SAP** en activos y OM.
- **Importar** y **exportar** información entre ambos sistemas.

---

## 2. Enfoque por fases

| Fase | Mecanismo | Descripción |
|---|---|---|
| **A — Archivos** | **CSV / Excel** | Importación/exportación manual o programada por archivos. Es la vía más simple y no requiere acceso directo a SAP. Ideal para arrancar. |
| **B — API** | **REST/OData** | SGIT consume/expone endpoints (p. ej. OData de SAP o un middleware) para consultas puntuales de materiales, stock y centros de costo. |
| **C — Servicios oficiales** | **SAP oficial** (BAPI/IDoc/RFC vía PI/PO o BTP) | Integración robusta y en línea a través de los servicios oficiales de SAP, ya con el área de sistemas corporativa. |

Se empieza por **A** (archivos), se evoluciona a **B** (API) y finalmente a **C**
(servicios oficiales), sin rehacer el diseño.

---

## 3. Arquitectura de integración (capa anticorrupción)

```
        SAP (materiales, stock, centros de costo, ubicaciones)
                     │  CSV/Excel · API · servicios oficiales
        ┌────────────▼─────────────┐
        │  Módulo Integraciones     │  Adaptador SAP (ACL)
        │  - importador/exportador  │  traduce modelo SAP → modelo SGIT
        │  - tablas de staging      │  valida y concilia antes de promover
        └────────────┬─────────────┘
                     │ datos validados
        ┌────────────▼─────────────┐
        │  Dominio SGIT             │  Activos · Almacén · CMMS
        └───────────────────────────┘
```

Principios:
- **Nada de SAP escribe directo** en las tablas núcleo: entra a **staging**, se valida, se
  concilia y recién se promueve.
- El **adaptador (ACL)** aísla el modelo de SAP; si SAP cambia, el impacto queda contenido.
- Operaciones **idempotentes** (reprocesar un archivo no duplica datos) y **auditadas**.
- Procesos de import/export **asíncronos** (colas), no en el request del usuario.

---

## 4. Campos SAP-ready ya presentes en F0

El modelo de datos **ya** incluye los campos de enganche (no requiere cambios ahora):

| Campo | Entidad | Uso con SAP |
|---|---|---|
| `sapId` | Activo, (Material futuro) | Identificador del objeto en SAP |
| `costCenter` | Activo, Ubicación | Centro de costo |
| `sapLocationCode` | Ubicación | Ubicación SAP |
| `responsibleArea` | Activo, Ubicación | Área responsable |

Cuando se implemente la integración, estos campos permiten **cruzar** activos, ubicaciones,
materiales y consumos de OM con SAP sin rediseño.

---

## 5. Qué se consultará / intercambiará (previsto)

| Dato | Dirección | Módulo SGIT |
|---|---|---|
| Catálogo de materiales | SAP → SGIT | Almacén |
| Stock de materiales | SAP ↔ SGIT | Almacén / Inventario |
| Centros de costo | SAP → SGIT | Activos / CMMS |
| Ubicaciones SAP | SAP → SGIT | Ubicaciones |
| Consumos por OM (costeo) | SGIT → SAP | CMMS |
| Movimientos de almacén | SGIT ↔ SAP | Almacén |

---

## 6. Seguridad

- Credenciales/keys de SAP gestionadas como secretos, rotables y auditadas.
- Acceso mínimo necesario; conexiones cifradas.
- Todo intercambio queda registrado en `audit_logs`.

---

## 7. Conclusión

SGIT queda **preparado** para SAP desde el diseño: campos SAP-ready en F0, un módulo de
Integraciones con capa anticorrupción y staging, y un camino por fases (archivos → API →
servicios oficiales). **No se implementa ahora**; es arquitectura objetivo (F5).
