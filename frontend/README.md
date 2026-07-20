# Frontend — SGIT-CCTV (pendiente · Fase F4)

Este directorio alojará la **SPA React + TypeScript (Vite)** del sistema. **Aún no
está implementado**: se construye en la fase **F4 (Documentación + Dashboard)**.

## Plan
- Vite + React + TypeScript
- UI: Tailwind + shadcn/ui
- Autenticación contra `/api/v1/auth/login` (JWT)
- Vistas: login, dashboard (KPIs), inventario de activos, árbol de ubicaciones,
  órdenes de trabajo, incidencias y panel de troubleshooting.

## Comandos previstos (cuando exista el proyecto)
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Mientras tanto, la API es totalmente utilizable vía **Swagger** en
`http://localhost:3000/docs`.
