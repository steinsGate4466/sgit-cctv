# Visión general del ERP — SGIT

> Documento de arquitectura (análisis, sin código). Define la evolución del proyecto de
> un sistema de CCTV a un **ERP especializado en Gestión de Infraestructura Tecnológica
> Industrial**, para Aceros Arequipa (Planta Pisco) y con capacidad de crecer por décadas.

---

## 1. De CCTV a ERP de infraestructura

El proyecto nació para administrar videovigilancia (SGIT-CCTV). El análisis funcional
mostró que el alcance real es mucho mayor: **toda** la infraestructura tecnológica de la
planta y su ciclo de vida. El CCTV pasa a ser **un dominio más** dentro de un ERP.

```
Antes:  SGIT-CCTV  = gestión de cámaras/NVR/red
Ahora:  SGIT       = ERP de Infraestructura Tecnológica Industrial
                     (CCTV es uno de sus módulos)
```

> Nota de producto: el código base conserva el nombre `sgit-cctv`, pero el producto es
> **SGIT** (Sistema de Gestión de Infraestructura y Tecnología). No requiere renombrar el
> repositorio ahora; sí conviene reflejarlo en la documentación y en el título de la API.

---

## 2. Qué administrará el sistema

**Activos e infraestructura** (Configuration Items):
CCTV (cámaras, NVR, decoders), redes (switches, routers, firewalls), servidores,
antenas/radioenlaces, fibra óptica, UPS y gabinetes.

**Procesos y datos transversales:**
inventario de activos, almacén de materiales/repuestos, documentación técnica,
incidencias, auditoría, integraciones (SAP, HikCentral, Zabbix) y **mantenimiento como
CMMS completo**.

---

## 3. Principios rectores

| Principio | Qué implica |
|---|---|
| **Modularidad** | Cada dominio es un módulo con frontera clara; se agregan módulos sin rehacer el sistema. |
| **Una sola fuente de verdad** | El activo, su ubicación, su historial y su documentación viven en un solo lugar. |
| **Trazabilidad total** | Auditoría e historial en todo cambio relevante (append-only). |
| **No invasivo** | El monitoreo se apoya en sistemas existentes (HikCentral, Zabbix), no sondea dispositivos. |
| **Preparado para integrar** | SAP, HikCentral y Zabbix mediante capas de integración aisladas (anticorrupción). |
| **Evolución sin reescritura** | Monolito modular hoy; extracción de servicios solo si un módulo lo justifica. |
| **Configurable por el negocio** | Formularios/checklists de mantenimiento definidos como datos, no en código. |

---

## 4. Escala objetivo (a validar en `ARQUITECTURA_EMPRESARIAL.md`)

| Dimensión | Meta | Viabilidad |
|---|---|---|
| Activos gestionados | ~100 000 | PostgreSQL con índices: holgado |
| Órdenes de mantenimiento | ~500 000 | Particionado por fecha: holgado |
| Registros históricos (eventos, movimientos, auditoría) | Millones | Particionado + archivado |
| Horizonte de operación | Décadas | Modularidad + versionado de esquema/API |

Conclusión preliminar: el volumen es **manejable** para el stack actual con las prácticas
de escalabilidad que se detallan en el documento de arquitectura empresarial.

---

## 5. Alcance por horizontes (no compromete fechas)

- **Corto plazo (F1–F4):** seguridad empresarial, activos+topología, CMMS base, almacén,
  documentación, dashboard, frontend.
- **Mediano plazo (F5):** integraciones (HikCentral, Zabbix, SAP) y monitoreo en tiempo real.
- **Largo plazo:** analítica avanzada, mantenimiento predictivo, multi-planta.

---

## 6. Multi-planta y multi-empresa (previsión)

Hoy el alcance es **Planta Pisco**. El modelo de ubicaciones ya contempla los niveles
`EMPRESA` y `PLANTA`, por lo que extender a otras plantas en el futuro **no exige
rediseño**: solo poblar la jerarquía. Se recomienda mantener ese diseño y no "hardcodear"
Pisco en la lógica.

---

## 7. Conclusión

La visión de convertir SGIT en un ERP modular de infraestructura industrial es coherente y
alcanzable sobre la base de F0. Los documentos siguientes analizan la arquitectura
empresarial, la división modular, el CMMS y el monitoreo, y detallan los ajustes
recomendados **antes** de continuar con F1.
