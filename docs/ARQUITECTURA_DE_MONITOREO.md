# Arquitectura de monitoreo — SGIT (vista de arquitectura)

> Vista **arquitectónica** del monitoreo en tiempo real dentro del ERP. Complementa a
> `MONITOREO_TIEMPO_REAL.md` (más operativo): aquí el foco es el **patrón de integración,
> la correlación y el encaje con CMMS/Incidentes**. Sin código; implementación en F5.

---

## 1. ¿Es correcta la arquitectura propuesta? — Sí

```
HikCentral ──► SGIT      (CCTV: cámaras, NVR, grabación)
Zabbix     ──► SGIT      (infraestructura: switches, PoE, antenas, enlaces, servidores)
```

Es la arquitectura **correcta** y responde al requisito **no invasivo**: SGIT no consulta
miles de cámaras ni carga las VLAN CCTV; consume a los sistemas que **ya** hablan con los
dispositivos. Cada fuente hace lo que mejor sabe:

- **HikCentral** = autoridad de CCTV (conoce estado y eventos de cámaras/NVR).
- **Zabbix** = autoridad de red (SNMP/ICMP sobre switches, PoE, enlaces, servidores).
- **SGIT** = **cerebro correlacionador** (traduce eventos crudos en incidencias y OM,
  priorizadas por impacto en producción).

---

## 2. Patrón de integración: ingesta + ACL + correlación

```
   Fuentes                Capa de integración (ACL)         Núcleo SGIT
┌────────────┐   push    ┌───────────────────────┐   evento   ┌───────────────┐
│ HikCentral │─events──► │ HikCentralAdapter      │──normaliza►│ Motor de       │
│ (OpenAPI)  │  AK/SK    │  (traduce a modelo SGIT)│           │ correlación    │
└────────────┘           └───────────────────────┘            │  - mapea a CI  │
┌────────────┐  webhook  ┌───────────────────────┐            │  - usa topología│
│  Zabbix    │──alert──► │ ZabbixAdapter          │──normaliza►│  - causa raíz  │
│  (server)  │           │  (traduce a modelo SGIT)│           │  - impacto     │
└────────────┘           └───────────────────────┘            └───────┬───────┘
                                                                        │
                                              ┌─────────────────────────┼─────────────┐
                                              ▼                         ▼             ▼
                                          Incidentes                 CMMS (OM      Dashboard/
                                          (categoría)                automática)   Alertas
```

Claves del patrón (coherentes con `ARQUITECTURA_EMPRESARIAL.md`):
- **Adaptadores** por fuente (ACL): aíslan el modelo externo del dominio SGIT.
- **Modelo de evento unificado** interno: `{ source, deviceRef, type, severity, ts, payload }`.
- **Idempotencia**: eventos repetidos no duplican incidencias (deduplicación por device+tipo+ventana).
- **Ingesta asíncrona**: los eventos entran a una cola (Redis) y se procesan sin bloquear.

---

## 3. Modelo de evento y correlación

El **motor de correlación** convierte eventos en conocimiento operativo:

1. **Mapeo a activo (CI):** el evento trae IP/identificador; se resuelve al activo del
   inventario (por `assetCode`/IP/`sapId`).
2. **Correlación por topología:** usa el grafo ya modelado (VLAN, puertos, `NetworkLink`,
   `AssetWireless` PMP base/suscriptor):
   - Antena PMP base caída → marcar todas las cámaras suscriptoras aguas abajo.
   - Varias cámaras del mismo switch offline → sospechar switch/PoE (confirmar con Zabbix).
3. **Causa raíz e impacto:** determina la causa probable, cuenta cámaras afectadas y calcula
   tiempo sin visión (impacto en producción).
4. **Acción:** crea/actualiza un **Incidente** (categoría `SATURACION_SESIONES_NVR`,
   `CAIDA_ENLACE_INALAMBRICO`, `CAMARA_SIN_IMAGEN`, `RED`...) y, si aplica, **genera una OM
   correctiva automática** en el CMMS.

Este cruce de **dos fuentes + topología** es el valor diferencial: no es "otro visor de
alarmas", sino diagnóstico priorizado.

---

## 4. Reparto de responsabilidades

| Alerta | Fuente | Mecanismo |
|---|---|---|
| Cámara offline / NVR sin comunicación | HikCentral | estado/evento de dispositivo |
| Falta de grabación / disco lleno | HikCentral | evento/alarma de almacenamiento |
| Switch caído / puerto PoE caído | Zabbix | SNMP (incl. OIDs PoE) |
| Antena/enlace/fibra con problemas | Zabbix | ICMP + SNMP |
| Servidores (host SGIT, etc.) | Zabbix | SNMP / agente |

Regla: **CCTV → HikCentral; red/infra → Zabbix; correlación → SGIT.**

---

## 5. Ventajas de no acceder directo a las cámaras

- Sin carga extra en la VLAN CCTV (no se sondea dispositivo por dispositivo).
- Un punto de integración por dominio en vez de miles de conexiones.
- Menor superficie de ataque: SGIT no guarda credenciales de cada cámara (usa AK/SK de
  HikCentral y SNMP de solo lectura).
- Evita saturar NVR/cámaras con sesiones — justo el problema recurrente
  "NO MORE USER CAN BE CONNECTED".
- Escalable: agregar cámaras no añade trabajo de integración.

---

## 6. Consideraciones de VLAN y seguridad

- SGIT se comunica **solo** con HikCentral y el servidor Zabbix, ambos en la **VLAN de
  gestión (200)**; no abre conexiones a las VLAN CCTV (10/20/30/100).
- Firewall: permitir SGIT↔HikCentral (HTTPS/OpenAPI) y Zabbix→SGIT (webhook); denegar
  SGIT→VLAN CCTV.
- Autenticación: **AK/SK** rotables (HikCentral), **SNMP v3** o comunidades de solo lectura
  segmentadas (Zabbix). Acceso **solo lectura**.
- Todos los eventos entrantes se validan y auditan (`audit_logs`).
- Con HTTPS en Nginx (ver `DESPLIEGUE_ACEROS_AREQUIPA.md`), las integraciones viajan cifradas.

---

## 7. Encaje en el ERP

- Adaptadores en el módulo **Integraciones**; correlación y reglas en el módulo **Monitoreo**
  (ver `MODULOS_DEL_SISTEMA.md`).
- Salidas hacia **Incidentes** y **CMMS** (OM automática) vía **eventos** (patrón de
  `ARQUITECTURA_EMPRESARIAL.md`).
- El modelo de datos de F0 **ya soporta** los enganches: `Asset.status`,
  `Incident.category`, `NetworkLink`, `AssetWireless.mode`.

---

## 8. Conclusión

La arquitectura HikCentral→SGIT (CCTV) + Zabbix→SGIT (infra) es **correcta, no invasiva y
escalable**. Se recomienda formalizarla como módulo **Monitoreo** (correlación) apoyado en
**Integraciones** (adaptadores/ACL), con ingesta asíncrona e idempotente. No se implementa
ahora; es arquitectura objetivo de **F5**, después de F1 (seguridad) y del CMMS/Almacén.

---

## 9. Herramientas oficiales de Hikvision que complementan HikCentral

Análisis solicitado: qué otras herramientas oficiales pueden aportar salud de dispositivos,
almacenamiento, eventos o estado de grabación **sin** aumentar la carga sobre la red CCTV.

| Herramienta | Qué aporta | ¿Invasiva? | Cuándo usarla / cuándo NO |
|---|---|---|---|
| **HikCentral Professional + módulo Health Monitoring (HMS)** | Estado online/offline, CPU/RAM, uso de red, **estado de almacenamiento**, logs de dispositivo/evento, reportes históricos y topología en tiempo real. Es el **agregador oficial**. | **No** (HikCentral ya recolecta de los equipos; SGIT lee a HikCentral) | **USAR** como fuente principal de salud CCTV. Requiere la licencia del módulo HMS. |
| **HikCentral OpenAPI (Artemis)** | El canal por el que SGIT consume HikCentral: eventos (suscripción) y estado de recursos, con AK/SK. | **No** | **USAR** siempre como vía de integración SGIT↔HikCentral. |
| **ISAPI** (Intelligent Security API, REST por dispositivo) | Salud del equipo (uptime, CPU, memoria), **estado de HDD** (status, % lleno, SMART, temperatura), **estado de grabación**. | **Sí a escala** (una conexión por dispositivo) | **USAR solo** para diagnóstico puntual y bajo demanda de UN equipo ya señalado por HMS. **NO** para sondear masivamente: saturaría la VLAN CCTV y los NVR (problema "NO MORE USER"). |
| **Hikvision Device SDK (HCNetSDK) / OTAP** | Integración profunda a nivel de dispositivo. | **Sí** | **Evitar** salvo que HikCentral no exponga un dato necesario; pesado y de bajo nivel. |
| **SNMP en equipos de red** | Estado de switches PoE, puertos, enlaces. Los NVR/cámaras Hikvision tienen soporte SNMP limitado. | **Ligero** (en VLAN de gestión) | **USAR vía Zabbix** para switches/PoE/enlaces. Para CCTV, preferir HMS. |
| **iVMS-4200** | Cliente de visualización/gestión de escritorio. | — | **NO** para monitoreo automatizado: es una app cliente, no una fuente de integración. |

### Regla práctica
1. **Salud CCTV agregada (continua):** HikCentral **HMS** + **OpenAPI**. Es la vía por
   defecto, no invasiva y escalable.
2. **Diagnóstico profundo puntual:** **ISAPI** contra **un** dispositivo concreto, bajo
   demanda y con límite de frecuencia. Nunca en bucle sobre miles de cámaras.
3. **Infraestructura de red:** **Zabbix** (SNMP/ICMP) para switches, PoE, antenas y enlaces.
4. **Nunca:** sondeo directo masivo por ISAPI/SDK a todas las cámaras (invasivo, carga la
   VLAN CCTV y provoca saturación de sesiones en los NVR).

### Recomendación de licenciamiento
El módulo **Health Monitoring** de HikCentral suele requerir **licencia** (base + canales).
Verificar con el proveedor que la instalación de Planta Pisco lo incluya; es la pieza que
hace posible el monitoreo CCTV no invasivo.
