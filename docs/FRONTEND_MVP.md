# Frontend MVP — Documentación

**Estado:** implementado (código), pendiente de `npm install` + `npm run dev` en la máquina
del desarrollador. Sintaxis de los 10 archivos TS/TSX verificada.

## Objetivo
Dar una interfaz visual al ERP para operar sin copiar tokens en la terminal. Login que
gestiona la sesión, y dashboards útiles para infraestructura CCTV industrial.

## Estructura (`frontend/`)
```
frontend/
├── package.json · vite.config.ts · tsconfig.json · index.html
└── src/
    ├── main.tsx · App.tsx · styles.css
    ├── api/client.ts            # axios + token JWT + manejo de 401
    ├── auth/AuthContext.tsx     # login/logout, token en localStorage
    ├── components/
    │   ├── Layout.tsx           # sidebar + topbar
    │   └── ProtectedRoute.tsx   # protege rutas privadas
    └── pages/
        ├── Login.tsx
        ├── Dashboard.tsx        # KPIs + gráficos (Recharts)
        ├── Assets.tsx           # tabla de activos
        └── Audit.tsx            # tabla de auditoría
```

## Diseño del Dashboard (análisis)
KPIs elegidos según los requerimientos de Pisco (CCTV/redes):
- Activos totales, **disponibilidad de visión %** (con color según umbral), cámaras fuera
  de servicio, activos críticos, incidencias abiertas, mantenimientos pendientes.
- Gráficos: activos por **tipo** (dona), por **estado** y por **criticidad** (barras),
  **incidencias por causa raíz** (barras horizontales, de `/troubleshooting/metrics`).
- Métricas de troubleshooting: MTTR, tiempo sin visión, incidencias resueltas.

Los datos de gráficos se agregan en el cliente a partir de `/assets` (no requiere endpoints
nuevos en el backend). A medida que crezcan los módulos (F2/F3), el dashboard se enriquece.

## Cómo ejecutar
```cmd
cd frontend
npm install
npm run dev      # http://localhost:5173
```
Requiere el backend corriendo (CORS ya está habilitado en la API).

## Verificación realizada
- Sintaxis JSX/TS de los 10 archivos: **sin errores**.
- Falta `npm install` + arranque en la máquina del desarrollador.
