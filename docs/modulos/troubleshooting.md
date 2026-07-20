# Módulo: Troubleshooting

## Objetivo
Medir y analizar la **resolución de problemas**: MTTR, tiempo sin visión y patrones de
falla por causa raíz (saturación de sesiones NVR, caída de enlace PMP, etc.).

## Archivos principales
```
src/modules/troubleshooting/
├── troubleshooting.controller.ts   # /troubleshooting/metrics
├── troubleshooting.service.ts      # cálculo de métricas
└── troubleshooting.module.ts
```

## Controladores
- `GET /api/v1/troubleshooting/metrics` — protegido; devuelve las métricas de resolución.

## Servicios
`metrics()`:
- **Qué hace:** toma las incidencias resueltas con `mttrMinutes`, calcula el MTTR
  promedio y el promedio de minutos sin visión, y agrupa las incidencias por categoría
  (`groupBy`) para ver la reincidencia por causa raíz.
- **Qué devuelve:** `{ resolvedIncidents, mttrMinutes, avgVisionDownMinutes,
  incidentsByRootCause[] }`.
- **Por qué existe:** es el núcleo diferenciador — convierte el registro de incidencias
  en inteligencia operativa para acelerar el diagnóstico y priorizar por criticidad.

## Entidades Prisma
`Incident` (lectura y agregación; campos `mttrMinutes`, `visionDownMin`, `category`).

## Flujo de datos
```
GET /troubleshooting/metrics
   → TroubleshootingService.metrics
     → prisma.incident.findMany (resueltas)  → promedios MTTR / visión
     → prisma.incident.groupBy(category)     → reincidencia por causa
   ← { mttrMinutes, avgVisionDownMinutes, incidentsByRootCause:[...] }
```

## Ejemplo de uso
```bash
curl http://localhost:3000/api/v1/troubleshooting/metrics -H "Authorization: Bearer <TOKEN>"
```
