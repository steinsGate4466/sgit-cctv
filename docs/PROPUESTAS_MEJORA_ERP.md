# Propuestas de mejora — SGIT-CCTV

Aceros Arequipa · Planta Pisco · Enfoque: **automatización del mantenimiento CCTV/red**

Documento elaborado con el criterio de Arquitecto/DevOps, a partir de toda la operación
descrita: 400+ activos, Trenes 1/2/3, púlpitos, horno (suciedad y calor), enlaces PMP
Ubiquiti, NVR Hikvision (saturación de sesiones), gabinetes, PCs con iVMS-4200,
manlift/grúas para equipos en altura y la futura integración con SAP.

---

## 0. Estado verificado de la deuda técnica (medido en el repo)

| Deuda | Estado real | Riesgo |
|---|---|---|
| Pruebas automatizadas | **0 pruebas propias** | Alto: un cambio puede romper login/firma/cifrado sin aviso |
| Migraciones versionadas | **No existen** (solo `migration_lock.toml`; se usa `db push`) | Alto: cada cambio de esquema pide “data loss” |
| Revocación de sesiones | Permisos viajan en el JWT (~15 min de desfase) | Medio |
| Ubicación obligatoria | Solo validada en la UI | Medio |
| Paginación de activos | Listado completo sin paginar | Medio a 1000+ activos |
| Rate-limit | Solo en login | Bajo |

---

## 1. Las 5 propuestas de mayor impacto (automatización real)

### 1.1 Identificación por QR en activos y gabinetes ⭐ (impacto máximo)
**Problema:** la planta es enorme y hay 400+ activos; encontrar y registrar el equipo correcto consume tiempo y genera errores de tipeo.
**Propuesta:** generar una **etiqueta QR por activo y por gabinete** (imprimible desde el sistema). El técnico escanea con el celular y entra directo a la ficha: ver datos, subir foto, registrar intervención o abrir incidencia.
**Beneficio:** elimina la búsqueda manual, reduce errores de identificación y acelera cada intervención en campo. Es el mayor ahorro de tiempo por sol invertido.

### 1.2 Generación automática de OM preventivas (tarea programada)
**Hoy:** existe el botón “Generar OM vencidas” (manual).
**Propuesta:** una **tarea diaria** que cree las OM que vencen, sin que nadie tenga que acordarse. Con bitácora de lo generado.
**Beneficio:** el plan preventivo se cumple solo; el Jefe supervisa en vez de administrar.

### 1.3 Rutas de mantenimiento (agrupación por zona / manlift)
**Problema:** salir dos veces al mismo púlpito, o alquilar manlift para una sola cámara, es dinero perdido.
**Propuesta:** el sistema **agrupa las OM pendientes por zona, tren o gabinete** y propone una “ruta de trabajo” del día; además junta todos los activos que **requieren manlift/grúa** para atacarlos en una sola movilización.
**Beneficio:** menos viajes, menos alquiler de manlift, más equipos atendidos por salida. Ahorro directo y medible.

### 1.4 Alertas y notificaciones al Jefe / Supervisor TI
**Hoy:** el registro de la incidencia u OM *es* el aviso; hay que entrar al sistema para enterarse.
**Propuesta:** notificación automática (correo o Teams) ante: incidencia **crítica**, OM **vencida**, repuesto **bajo stock**, activo marcado **candidato a reemplazo**. Más un **resumen semanal automático** en PDF.
**Beneficio:** el Jefe se entera cuando importa, sin depender de que alguien avise.

### 1.5 Modo campo (móvil, tolerante a mala señal)
**Problema:** en planta la cobertura es irregular y el técnico anda con las manos ocupadas.
**Propuesta:** interfaz móvil optimizada para registrar la intervención y **tomar fotos**, que **guarda en el equipo y sincroniza** cuando vuelve la señal.
**Beneficio:** se acaba el “lo anoto en papel y lo paso después”: la evidencia entra en el momento, con fecha y hora reales.

---

## 2. Dashboard ejecutivo — rediseño propuesto

El dashboard actual muestra conteos generales. Para dirigir el mantenimiento de la planta, propongo reorganizarlo en tres bloques:

**Bloque 1 — Salud de la visión (lo que le importa a Producción)**
- **Disponibilidad de visión por Tren** (T1/T2/T3) con semáforo, no solo el total.
- **Minutos sin visión del mes** y su tendencia.
- **Zonas críticas sin cobertura ahora mismo** (cámaras caídas en horno/laminación).

**Bloque 2 — Cumplimiento del mantenimiento (lo que le importa al Jefe)**
- **% de cumplimiento preventivo** (al día / próximos / vencidos) global y por tren.
- **Backlog**: OM abiertas por antigüedad (0-7, 8-30, +30 días).
- **Top 10 activos reincidentes** y candidatos a reemplazo.
- **MTTR y MTBF** por tipo de activo (cámara, NVR, enlace).

**Bloque 3 — Recursos y riesgo**
- **Repuestos bajo mínimo** con los activos que dejarían sin cobertura.
- **Trabajos que requieren manlift/grúa** pendientes de aprobación.
- **Causas raíz más frecuentes** del período (para atacar el problema de fondo, no el síntoma).

**Extras:** filtro global por Tren/zona y rango de fechas; exportar el dashboard a PDF/Excel para el comité.

---

## 3. Mejoras por módulo

**Activos**
- Paginación y búsqueda avanzada (por tipo, tren, gabinete, criticidad, estado).
- **Vida útil y garantía**: alerta cuando un equipo se acerca al fin de garantía o supera su vida útil.
- **Historial unificado** en la ficha: incidencias + OM + cambios de estado, en una línea de tiempo.
- Carga masiva por Excel (para inventariar los 400+ activos sin capturarlos uno a uno).

**Mantenimiento**
- **Tableros de Predictivo y Mejora** (cerrar la segmentación de los 4 tipos).
- **Evidencia obligatoria antes/después** en preventivos de limpieza.
- **Plan anual** en calendario, exportable, para negociar ventanas con Producción.

**Inventario**
- **Reserva automática** del repuesto al crear la OM y **descuento al cerrarla** (hoy el movimiento es manual).
- Sugerencia de compra según consumo histórico y stock mínimo.

**Incidencias**
- **Plantillas por categoría** (ej. saturación NVR ya trae los pasos típicos) para que el técnico registre rápido y uniforme.
- Vinculación automática de incidencias repetidas del mismo activo (detección de recurrencia).

**Red / Dependencias (pendiente de F5 original)**
- Mapa **NVR → cámaras** y **antena PMP → cámaras**: ante una falla, saber al instante **qué se deja de ver** y priorizar por impacto en producción.

**Seguridad y cumplimiento**
- Módulo **Manlift/SSOMA** con PETAR/IPERC/ATS y aprobación del Jefe (ya diseñado).
- Reporte de auditoría exportable para inspecciones.

---

## 4. Integraciones (orden recomendado)

1. **HikCentral / Zabbix (F7)** — estado en vivo de cámaras, NVR y enlaces; **autocreación de incidencias** y alimento real del predictivo.
2. **SAP** — sincronizar códigos de activo y materiales/OM; evita doble digitación.
3. **Correo / Teams** — canal de alertas (barato y de impacto inmediato).
4. **Active Directory** — inicio de sesión con el usuario corporativo.

---

## 5. Hoja de ruta sugerida

| Fase | Contenido | Por qué en ese orden |
|---|---|---|
| **F6.7** | Tableros Predictivo y Mejora | Cierra la segmentación de los 4 tipos ya prometida |
| **F6.8** | Manlift / SSOMA con aprobación | Requisito de seguridad y costo (activo caro) |
| **F6.9** | **Migraciones versionadas + pruebas críticas** | Deuda que hoy pone en riesgo cada despliegue |
| **F7.0** | QR de activos y gabinetes + generación automática de OM | Máximo ahorro de tiempo en campo |
| **F7.1** | Alertas (correo/Teams) + dashboard rediseñado | Convierte datos en decisiones |
| **F7.2** | Monitoreo en vivo (HikCentral/Zabbix) | Predictivo real con telemetría |
| **F8** | SAP + reportes ejecutivos | Integración corporativa |

---

## 6. Indicadores para medir que la automatización funcionó

- % de cumplimiento preventivo (meta: >90%).
- Reducción del **MTTR** y aumento del **MTBF** por tipo de activo.
- Minutos sin visión por mes (tendencia a la baja).
- % de OM con evidencia fotográfica completa.
- Nº de movilizaciones de manlift por trabajo atendido (a la baja = mejor agrupación).
- Reincidencias por activo (a la baja = mantenimiento efectivo, no parches).
