# F5 — Estado sincronizado, categorías de planta y refinamiento visual

Aceros Arequipa · Planta Pisco · SGIT-CCTV
Fase F5 (primer incremento) · Julio 2026

## 1. Problema que se resuelve

Antes, el estado del activo era un campo manual. Podía ocurrir que el ingeniero
abriera una OM con "error" o una incidencia crítica y, al mirar el activo, este
siguiera figurando como **Operativo**. Esa contradicción genera confusión y resta
credibilidad al sistema.

## 2. Decisión de arquitectura: estado operativo DERIVADO

Se introduce una **única fuente de verdad**: el estado operativo del activo se
**calcula en vivo** a partir de sus incidencias y órdenes de mantenimiento
abiertas. No se duplica ningún dato, por lo que es **imposible** que la OM diga
"error" y el activo diga "operativo".

Regla de precedencia (de mayor a menor severidad):

1. **BAJA / STOCK** → estado administrativo; se respeta tal cual (el activo no está en operación).
2. **OM activa** (ABIERTA / EN_PROCESO / EN_ESPERA) → **En mantenimiento**.
3. **Incidencia abierta ALTA o CRÍTICA** → **Fuera de servicio**.
4. **Incidencia abierta** (media/baja) → **Con incidencia** (degradado).
5. Sin nada abierto → se respeta el estado base registrado (Operativo, etc.).

El estado base manual sigue existiendo (lo fija el técnico), pero cuando hay
operación en curso, **la OM/incidencia manda**. En el detalle del activo se
muestra el estado calculado y, si difiere, también el estado base registrado.

### Dónde se ve reflejado
- **Activos**: la columna Estado y el detalle muestran el estado efectivo.
- **Mantenimiento** e **Incidencias**: junto al activo se muestra su estado efectivo (coherencia total).
- **Dashboard**: el gráfico "Activos por estado" agrupa por estado efectivo.

## 3. Análisis de rendimiento (sin degradación)

El cálculo NO usa N+1 consultas. Por cada listado se ejecutan **2 consultas
agregadas en lote**, sin importar cuántos activos haya:

- `work_orders` filtrando por `assetId IN (...)` y `status IN (activos)` — apoyada en los índices `@@index([assetId])` y `@@index([status])`.
- `incidents` filtrando por `assetId IN (...)` y `status IN (abiertas)` — apoyada en `@@index([assetId])` y `@@index([status])`.

Impacto: **2 consultas indexadas adicionales por carga de listado** (milisegundos
sobre decenas/centenas de activos). No hay escritura extra ni migración de datos.
El coste es despreciable frente a la lectura principal que ya se hacía.

Alternativa descartada: escribir el estado en el activo por evento (al crear/cerrar
OM). Era más rápida en lectura pero introducía **riesgo de desincronización** —
justo la confusión que se quería eliminar. Se eligió el modelo derivado por
correctitud.

## 4. Categorías de incidencia orientadas a planta siderúrgica

Se ampliaron las categorías con casos reales de la operación de Pisco, agrupadas
en el selector para elegir rápido:

- **CCTV / NVR**: cámara sin imagen, saturación de sesiones NVR, falla de almacenamiento NVR, falla de NVR, decoder/videowall.
- **Red / Energía**: caída de enlace inalámbrico, falla de switch/puerto, falla de fibra/anillo, falla de fuente/PoE, pérdida de conectividad, corte de energía, falla de UPS, red (general).
- **Entorno de planta**: falla de gabinete, ambiental (polvo/calor/escoria), seguridad física/vandalismo, configuración/firmware, general.

Cambio aditivo en el enum `IncidentCategory` (no rompe datos existentes; se
aplica con `prisma db push`).

## 5. Refinamiento visual (ejecutivo)

Sobre el diseño actual (sin reescribir navegación ni lógica):
- Nuevos badges de estado consistentes en todos los módulos, incluido **"Con incidencia"**.
- Tarjetas KPI con realce al pasar el cursor y números tabulares.
- Cabecera de tabla fija al hacer scroll y filas más legibles.
- Títulos de página y paneles con barra de acento; barra de filtros como tarjeta.
- Foco accesible en botones.

Riesgo de rendimiento del frontend: **nulo** — son reglas CSS y no añaden lógica
ni peticiones. El estado efectivo llega ya calculado desde el backend.

## 6. Cómo aplicar el cambio de esquema
- **Local**: en `backend/` ejecutar `npx prisma db push` y `npx prisma generate`.
- **Railway**: se aplica solo, porque el Start Command ya corre `prisma db push` al desplegar.
