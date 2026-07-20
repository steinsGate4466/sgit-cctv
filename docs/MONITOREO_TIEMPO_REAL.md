# Monitoreo en tiempo real — Análisis de arquitectura (NO implementado)

> Documento de **diseño y evaluación**. No se implementa nada en esta etapa. Su objetivo
> es definir cómo SGIT-CCTV recibirá alertas de infraestructura en tiempo real de forma
> **no invasiva**, aprovechando lo que la planta ya tiene (HikCentral) y una herramienta
> estándar de red (Zabbix). Implementación prevista para **F5**.

---

## 1. Necesidad

Se requieren alertas en tiempo real ante:

| Evento | Naturaleza |
|---|---|
| Cámara offline | CCTV |
| NVR sin comunicación | CCTV |
| Falta de grabación | CCTV |
| Disco lleno (NVR) | CCTV / almacenamiento |
| Switch caído | Red |
| Puerto PoE caído | Red |
| Problemas de enlace (antena/fibra) | Red |

En una planta de laminación, la pérdida de visión impacta directo en producción, por lo
que estas alertas deben llegar **rápido** y correlacionarse con la topología (p. ej. si
cae una antena PMP, avisar de todas las cámaras aguas abajo).

---

## 2. Principio rector: NO INVASIVO

El diseño evita explícitamente:

- ❌ Consultar (hacer *polling*) directamente a miles de cámaras.
- ❌ Añadir carga de tráfico sobre las VLAN de CCTV (10/20/30/100).
- ❌ Instalar servidores nuevos **dentro** de la red CCTV.

En su lugar:

- ✅ Consumir a los sistemas que **ya** hablan con las cámaras/NVR (**HikCentral**).
- ✅ Monitorear la red con protocolos ligeros y estándar (**SNMP/ICMP** vía **Zabbix**).
- ✅ SGIT-CCTV **solo integra y correlaciona**; no toca los dispositivos finales.

---

## 3. Arquitectura propuesta

Dos fuentes de verdad especializadas, un consumidor central (SGIT-CCTV):

```
   ┌─────────────────────────┐        ┌──────────────────────────┐
   │        CCTV              │        │      INFRAESTRUCTURA      │
   │ Cámaras · NVR · Decoders │        │ Switches · PoE · Antenas  │
   │ (VLAN 10/20/30/100)      │        │ Enlaces · Servidores      │
   └───────────┬─────────────┘        └───────────┬──────────────┘
               │ (ya integradas)                   │ SNMP / ICMP
        ┌──────▼──────┐                     ┌──────▼──────┐
        │ HikCentral  │  fuente CCTV        │   Zabbix    │  fuente red
        │ (OpenAPI)   │                     │  (server)   │
        └──────┬──────┘                     └──────┬──────┘
               │ eventos/estado (AK/SK)            │ alertas (webhook/trap)
               └───────────────┬──────────────────┘
                               ▼
                    ┌────────────────────┐
                    │     SGIT-CCTV      │  módulo Integration (F5)
                    │  normaliza + correl.│  → Incidencias / estado de activos
                    └─────────┬──────────┘
                              ▼
                    Dashboard / Troubleshooting / Alertas
```

Ambas fuentes viven en la **VLAN de gestión (200)**; SGIT-CCTV les habla solo a ellas,
nunca a las cámaras directamente.

---

## 4. HikCentral como fuente CCTV

HikCentral Professional expone una **OpenAPI** (framework *Artemis*) con autenticación por
**API Key + API Secret (AK/SK)**. Es el punto de integración correcto porque HikCentral
**ya** administra cámaras y NVR: preguntarle a él evita tocar los dispositivos.

Información que HikCentral puede entregar (relevante para nuestras alertas):

| Dato | Uso en SGIT-CCTV |
|---|---|
| Estado **online/offline** de dispositivos | Cámara offline / NVR sin comunicación |
| **Eventos y alarmas** (suscripción de eventos hacia sistemas socios) | Falta de grabación, manipulación, pérdida de vídeo |
| **Identificación del dispositivo** (recurso, nombre, IP) | Mapear el evento al activo correcto en el inventario |
| Estado de **grabación / almacenamiento** | Falta de grabación, disco lleno |

Mecanismo recomendado (no invasivo): **suscripción de eventos** (HikCentral empuja los
eventos a SGIT-CCTV) complementada con *polling* de bajo ritmo del estado de dispositivos
(cada varios minutos), no consultas masivas por cámara.

> Nota: las capacidades exactas dependen de la versión de HikCentral y de la licencia de
> OpenAPI instalada; se confirmará contra el *Developer Guide* de la versión desplegada.

---

## 5. Zabbix como monitoreo de infraestructura

Zabbix es el estándar para monitorear la **red**, con protocolos ligeros que no cargan la
VLAN CCTV:

| Elemento | Qué monitorea | Cómo (protocolo) |
|---|---|---|
| Switches (Fortinet/TP-Link) | CPU, uptime, estado de interfaces | SNMP |
| **Puertos PoE** | Estado del puerto, energía entregada, caída | SNMP (OIDs PoE) |
| Antenas (Ubiquiti/Mimosa) | Alcanzabilidad, señal, estado del enlace | ICMP + SNMP |
| Enlaces (fibra/inalámbrico) | Disponibilidad, latencia, pérdida | ICMP / SNMP |
| Servidores (host de SGIT, NVR host si aplica) | CPU, RAM, disco | SNMP / agente |
| Disponibilidad de red general | up/down, tiempos de respuesta | ICMP |

Zabbix dispara alertas que SGIT-CCTV recibe (por webhook/acción o trap), sin que SGIT
tenga que sondear la red por su cuenta.

---

## 6. Reparto de responsabilidades (quién ve qué)

| Alerta requerida | Fuente | Mecanismo |
|---|---|---|
| Cámara offline | **HikCentral** | estado/evento de dispositivo |
| NVR sin comunicación | **HikCentral** | estado de dispositivo |
| Falta de grabación | **HikCentral** | evento/alarma de grabación |
| Disco lleno (NVR) | **HikCentral** | evento de almacenamiento |
| Switch caído | **Zabbix** | SNMP/ICMP |
| Puerto PoE caído | **Zabbix** | SNMP (OID PoE) |
| Problemas de enlace (antena/fibra) | **Zabbix** | ICMP + SNMP |

Regla simple: **CCTV (cámaras/NVR/vídeo) → HikCentral. Red (switches/PoE/enlaces/servidores)
→ Zabbix.** SGIT-CCTV los une.

---

## 7. Flujo de alertas en SGIT-CCTV

```
1. HikCentral detecta "cámara AA-CAM-T1-FX-001 offline"
   └─► empuja el evento al módulo Integration de SGIT-CCTV (AK/SK)

2. SGIT normaliza el evento y lo mapea al activo por su código/IP

3. SGIT correlaciona con la TOPOLOGÍA ya modelada:
   - ¿la cámara cuelga de una antena PMP caída? → causa raíz = enlace
   - ¿varias cámaras del mismo switch? → causa raíz = switch/PoE (confirmar con Zabbix)

4. SGIT crea/actualiza una Incidencia (categoría CAIDA_ENLACE / CAMARA_SIN_IMAGEN),
   calcula impacto (cámaras afectadas, tiempo sin visión) y prioriza por criticidad

5. Se refleja en Dashboard y Troubleshooting (alerta en tiempo real)
```

El valor diferencial de SGIT no es "otro visor de alertas", sino **correlacionar** las dos
fuentes con la topología real (anillo/fibra/PMP) para señalar la **causa raíz** y el
**impacto en producción**.

---

## 8. Ventajas de no acceder directo a las cámaras

- **Sin carga extra en la VLAN CCTV:** no se sondea dispositivo por dispositivo.
- **Un solo punto de integración por dominio:** HikCentral (CCTV) y Zabbix (red), en vez
  de miles de conexiones.
- **Menor superficie de ataque:** SGIT no necesita credenciales de cada cámara; usa AK/SK
  de HikCentral y datos SNMP de solo lectura.
- **Aprovecha lo existente:** HikCentral ya conoce el estado de cada dispositivo.
- **Escalable:** agregar cámaras no añade trabajo de integración a SGIT.
- **Estable:** evita saturar NVR/cámaras con sesiones (justamente el problema recurrente
  "NO MORE USER CAN BE CONNECTED").

---

## 9. Consideraciones de VLAN y seguridad

- SGIT-CCTV se comunica **solo** con HikCentral y con el servidor Zabbix, ambos en la
  **VLAN de gestión (200)**. No abre conexiones a las VLAN CCTV (10/20/30/100).
- Reglas de firewall: permitir SGIT → HikCentral (HTTPS/OpenAPI) y SGIT ← Zabbix
  (webhook), denegar SGIT → VLAN CCTV.
- Autenticación: **AK/SK** para HikCentral (rotables), SNMP **v3** (con credenciales) o al
  menos comunidades de solo lectura y segmentadas para Zabbix.
- Acceso **solo lectura**: el monitoreo no debe poder cambiar configuración de dispositivos.
- Los eventos entrantes se validan y se auditan (tabla `audit_logs`).
- Cuando exista HTTPS en Nginx (ver `DESPLIEGUE_ACEROS_AREQUIPA.md`), las integraciones
  viajarán cifradas.

---

## 10. Encaje con SGIT-CCTV (sin implementar aún)

- El módulo **`integration`** (hoy esqueleto) será el consumidor de HikCentral y Zabbix.
- El modelo de datos **ya soporta** esto: `Asset.status`, `Incident.category`
  (`CAIDA_ENLACE_INALAMBRICO`, `SATURACION_SESIONES_NVR`...), `NetworkLink`,
  `AssetWireless.mode` (PMP base/suscriptor) para la cascada de impacto.
- Fase objetivo: **F5** (integración), después de la seguridad empresarial (F1) y de los
  módulos operativos (F3/F4).

---

## 11. Conclusión

La arquitectura recomendada es **híbrida y no invasiva**: HikCentral como fuente única para
CCTV (vía OpenAPI/AK-SK, con suscripción de eventos) y Zabbix como monitoreo de red (SNMP/
ICMP). SGIT-CCTV actúa de **cerebro correlacionador** que traduce eventos crudos en
incidencias priorizadas por impacto en producción, sin añadir carga ni riesgo a la red de
cámaras. **No se implementa ahora**; queda documentado como arquitectura objetivo de F5.
