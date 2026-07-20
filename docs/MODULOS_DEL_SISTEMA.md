# Módulos del sistema — SGIT (taxonomía DEFINITIVA aprobada)

> **Documento congelado.** Refleja las decisiones aprobadas por el propietario del proyecto.
> Supersede cualquier recomendación previa. Sin código.

---

## 1. Corrección importante sobre "Inventario"

En el análisis anterior se sugirió eliminar "Inventario" como módulo. **Esa recomendación
queda anulada.** Por decisión aprobada, **Inventario NO se elimina**. Se distinguen **tres
conceptos distintos**, cada uno con su rol:

| Concepto | Qué gestiona | Rol |
|---|---|---|
| **Activos** | Equipos tecnológicos instalados (cámaras, switches, NVR, UPS…) = Configuration Items. | Módulo núcleo |
| **Almacén** | Materiales, herramientas, repuestos y consumibles: entradas, salidas, stock, lotes, series, Kardex. | Módulo operativo |
| **Inventario** | Módulo **transversal** para **conciliaciones, auditorías, diferencias y conteos físicos** (cuadre entre lo registrado y lo real, tanto de activos como de almacén). | Módulo transversal |

Es decir: **Almacén** mueve stock; **Inventario** lo **audita y concilia**. Son
complementarios, no duplicados.

---

## 2. Módulos definitivos

| # | Módulo | Responsabilidad |
|---|---|---|
| 1 | **Dashboard Ejecutivo** | KPIs y tableros de lectura sobre todos los módulos. |
| 2 | **Activos Tecnológicos** | Registro de CI tipados y su ciclo de vida (alta/baja/estado/garantía). |
| 3 | **Ubicaciones** | Jerarquía física Empresa→Planta→Tren→Área→Rack. |
| 4 | **Topología de Red** | Grafo de red: VLAN, puertos, enlaces (anillo/fibra/PMP). |
| 5 | **CCTV** | Vertical especializado sobre Activos: cámaras/NVR, integración HikCentral. |
| 6 | **CMMS (Gestión de Mantenimiento)** | Órdenes de mantenimiento con flujo completo (ver `CMMS.md`). |
| 7 | **Almacén** | Materiales, herramientas, repuestos, consumibles; stock, lotes, series, Kardex. |
| 8 | **Incidentes** | Fallas y diagnósticos; puente con Monitoreo y CMMS. |
| 9 | **Documentación** | Manuales, planos, configs, backups (MinIO), versionado. |
| 10 | **Monitoreo** | Correlación de alertas en tiempo real (HikCentral/Zabbix → SGIT). |
| 11 | **Integraciones** | ACL para SAP, HikCentral, Zabbix (importar/exportar, eventos). |
| 12 | **Administración** | Usuarios, roles, permisos, parámetros del sistema. |
| 13 | **Auditoría** | Registro append-only de acciones; trazabilidad. |
| T | **Inventario** *(transversal)* | Conciliaciones, auditorías, diferencias, conteos físicos. |

> Total: **13 módulos** + **Inventario** como módulo transversal.

---

## 3. Mapa de dependencias

```
        Administración ── Auditoría ── Inventario   (transversales a todo)
                │
      ┌─────────┼─────────────────────────────┐
   Ubicaciones  │                              │
      │         │                              │
   Activos ─────┼── Topología ── CCTV          │
      │         │        │         │           │
      │       Almacén    └─────────┤           │
      │         │                  │           │
      └──► CMMS ◄── (consume repuestos de Almacén)
              │                    │
          Incidentes ◄── Monitoreo ◄── Integraciones (SAP/HikCentral/Zabbix)
              │
        Dashboard Ejecutivo (lee de todos)
```

- **Activos** es el núcleo; casi todo se relaciona con un activo.
- **CMMS** consume **Almacén** (repuestos) y actúa sobre **Activos**/**Ubicaciones**.
- **Inventario** concilia lo que **Activos** y **Almacén** registran contra la realidad física.
- **Monitoreo** alimenta **Incidentes** y puede **disparar OM** en el CMMS.
- **Administración / Auditoría / Inventario** son transversales.

---

## 4. ¿Por qué CCTV y Topología son módulos aparte de Activos?

- **CCTV** es un *vertical* sobre Activos: lógica específica de cámaras/NVR (integración
  HikCentral, estados de grabación, cascada de impacto por antena PMP). Evita inflar Activos.
- **Topología** modela las **relaciones** de red (grafo), base del análisis de causa raíz.

Ambos **dependen de** Activos; no lo reemplazan.

---

## 5. Estructura de carpetas prevista (referencia, sin crear aún)

```
backend/src/modules/
├── dashboard/
├── assets/          # Activos Tecnológicos
├── locations/       # Ubicaciones
├── topology/        # Topología de Red (evolución de network)
├── cctv/            # vertical CCTV (nuevo)
├── cmms/            # CMMS (evolución de maintenance)
├── warehouse/       # Almacén (nuevo)
├── inventory/       # Inventario transversal (nuevo)
├── incidents/
├── documents/
├── monitoring/      # correlación de alertas (nuevo)
├── integration/     # SAP / HikCentral / Zabbix (ACL)
├── admin/           # Administración (evolución de users)
└── audit/           # Auditoría
```

Respeta la estructura de F0; son renombres/altas de módulos, no un rediseño.

---

## 6. Módulo futuro (solo registrado como idea)

**Gestión de Proyectos** — instalaciones, migraciones, expansiones y modernizaciones de
infraestructura. **No se implementa ni se diseña aún**; queda registrado como evolución
posterior del ERP.

---

## 7. Conclusión

Taxonomía definitiva: **13 módulos + Inventario transversal**, con Activos como núcleo,
Almacén e Inventario como complementarios (mover vs. conciliar), y CCTV/Topología como
verticales sobre Activos. Lista para crecer sin solapamientos.
