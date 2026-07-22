# Frontend — SGIT-CCTV (MVP)

Interfaz web del ERP: login, dashboard con KPIs y gráficos, inventario de activos y
auditoría. Consume la API del backend (`http://localhost:3000/api/v1`).

## Requisitos
- Node.js 20+ (tú tienes 24, funciona).
- El **backend corriendo** (`docker compose up -d` en la raíz del proyecto).

## Cómo ejecutarlo
```cmd
cd frontend
npm install
npm run dev
```
Se abre en **http://localhost:5173**.

## Acceso
- Usuario: `admin@acerosarequipa.local`
- Contraseña: `Admin.Pisco2026`

La app guarda el token por ti (no tienes que copiar nada). Al iniciar sesión te lleva al
Dashboard.

## Pantallas
- **Dashboard Ejecutivo** — KPIs (activos, disponibilidad de visión, cámaras fuera de
  servicio, críticos, incidencias, mantenimientos) + gráficos (activos por tipo/estado/
  criticidad, incidencias por causa raíz) + métricas de troubleshooting (MTTR, tiempo sin visión).
- **Activos** — tabla del inventario con estado y criticidad.
- **Auditoría** — registro de acciones (quién, qué, cuándo, IP).

## Tecnología
Vite + React + TypeScript + Recharts + Axios + React Router.

## Configuración (opcional)
Si el backend está en otra URL, crea `.env` con:
```
VITE_API_URL=http://TU_HOST:3000/api/v1
```
