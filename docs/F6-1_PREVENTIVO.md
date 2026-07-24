# F6.1 — Mantenimiento Preventivo + segmentación 4 tipos + PC iVMS

Aceros Arequipa · Planta Pisco · SGIT-CCTV

## Qué entra en F6.1

1. **Módulo de Mantenimiento Preventivo** (nueva sección):
   - **Plan por activo** con intervalo en meses. Regla: **3 meses en zona crítica** (cerca del horno / alta exposición), **6 meses en el resto**. Editable por el Jefe.
   - **Tablero de cumplimiento:** al día / próximos (30 días) / vencidos / sin programar.
   - **Generar OM preventivas vencidas** con un botón (crea la OM solo si no hay ya una preventiva abierta para ese activo). Pensado también para una tarea programada diaria.
   - Al **cerrar** una OM preventiva, el plan se **reprograma solo** (próximo = fecha de cierre + intervalo).
   - Checklist de condición: la OM ya admite un campo estructurado `condition` (limpieza, cableado, etc.) para la evidencia; el formulario detallado se completa en el siguiente incremento.

2. **Segmentación en 4 tipos de OM:** se añade **PREDICTIVO** a Preventivo/Correctivo/Mejora (el predictivo pleno llega con F7 monitoreo; su tipo ya queda disponible).

3. **PC con iVMS-4200 como activo:** nuevo tipo `PC / iVMS-4200`. Se registra y mantiene como cualquier activo CCTV. Demo: `AA-PC-T1-PUL-001` en el púlpito del Tren 1.

4. **Fix incluido:** se agrega `EN_ESPERA` al estado de incidencias (lo que faltaba para que el técnico pudiera dejarla “En espera”).

## Cambios técnicos (sin deuda, aditivos)

- **Esquema:** `WorkOrderType += PREDICTIVO`, `AssetType += PC`, `IncidentStatus += EN_ESPERA`, `WorkOrder.condition Json?`, nuevo modelo `PreventivePlan` (1:1 con Asset).
- **Backend:** nuevo módulo `preventive` (service/controller/dto) registrado en `app.module`; `MaintenanceModule` lo usa para reprogramar al cerrar. Permisos: leer = `wo.read`, gestionar/generar = `wo.create`.
- **Frontend:** página `Preventivo` (cumplimiento + planes + generar + editar intervalo), en el menú; `PREDICTIVO` en Mantenimiento; `PC` en Activos.

## Aplicar en Railway (importante)

El backend arranca con `node dist/main.js` (no toca el esquema). Como hay tablas/enums nuevos, se aplican **una vez** desde la **Console** del backend (con el servicio ya Online):

```
npx prisma@5.22.0 db push --skip-generate
node dist/seed.js
```

- La primera línea crea la tabla `preventive_plans` y agrega los valores de enum nuevos (se fija Prisma 5 para evitar el error de la v7).
- La segunda siembra permisos, planes preventivos demo y el PC iVMS. Es idempotente (no borra ni duplica).

En local: `npx prisma db push && npx prisma generate` (con Postgres levantado por Docker).

## Roadmap que sigue
- **F6.2 Correctivo:** historial por activo, métricas, candidato a reemplazo, informe PDF.
- **F6.3 Predictivo (reglas P-F):** alerta temprana por condición/recurrencia/señal.
- **F6.4 Accesibilidad/Manlift (SSOMA):** solicitud del técnico, aprobación del Jefe, documento sustentado (PETAR/IPERC/ATS).
