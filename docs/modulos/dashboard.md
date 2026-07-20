# Módulo: Dashboard

## Objetivo
Entregar indicadores gerenciales de un vistazo: cuántos activos hay, cuántas cámaras
están fuera de servicio, disponibilidad, incidencias abiertas, etc.

## Archivos principales
```
src/modules/dashboard/
├── dashboard.controller.ts   # /dashboard/kpis
├── dashboard.service.ts      # cálculo de KPIs con conteos Prisma
└── dashboard.module.ts
```

## Controladores
- `GET /api/v1/dashboard/kpis` — protegido; devuelve el objeto de indicadores.

## Servicios
`kpis()`:
- **Qué hace:** ejecuta varios `count()` en paralelo (`Promise.all`) sobre activos,
  cámaras, órdenes de trabajo e incidencias, y calcula el % de disponibilidad de cámaras.
- **Qué devuelve:** `{ totalAssets, cameras, camerasDown, criticalAssets,
  pendingWorkOrders, openIncidents, cameraAvailabilityPct }`.
- **Por qué existe:** dar a supervisión una foto operativa sin consultar tabla por tabla.

## Entidades Prisma
`Asset`, `WorkOrder`, `Incident` (solo lectura/agregación).

## Flujo de datos
```
GET /dashboard/kpis
   → DashboardService.kpis
     → Promise.all([ asset.count, ... , incident.count ])
     → availability = (cameras - camerasDown)/cameras * 100
   ← { totalAssets, camerasDown, cameraAvailabilityPct, ... }
```

## Ejemplo de uso
```bash
curl http://localhost:3000/api/v1/dashboard/kpis -H "Authorization: Bearer <TOKEN>"
```
