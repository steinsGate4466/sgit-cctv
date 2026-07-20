# SGIT-CCTV — Sistema de Gestión de Infraestructura y Tecnología

Plataforma de gestión de infraestructura de **CCTV y redes** para **Aceros Arequipa – Planta Pisco** (Trenes 1, 2 y 3 / Laminación). Centraliza inventario, ubicación, mantenimiento, incidencias, documentación y **troubleshooting con métricas de resolución**, con arquitectura modular tipo ERP y preparación para SAP y Zabbix.

> Documento de especificación: `SGIT-CCTV-ESP-2026-001` · Fase actual: **F0 – Fundaciones**

## Arquitectura

Monolito modular (Clean Architecture) desplegado **on-premise** con Docker.

| Componente | Tecnología |
|---|---|
| Backend / API REST | NestJS (TypeScript) — `/api/v1`, OpenAPI en `/docs` |
| Base de datos | PostgreSQL 16 + Prisma ORM |
| Cache / colas | Redis |
| Archivos (fotos, planos, backups) | MinIO (S3-compatible) |
| Reverse proxy | Nginx |
| Auth | JWT + RBAC por permiso granular |

## Estructura

```
sgit-cctv/
├── docker-compose.yml        # PG + Redis + MinIO + API + Nginx
├── .env.example              # variables de entorno
├── Makefile                  # atajos (make up / migrate / seed)
├── infra/nginx/nginx.conf
└── backend/
    ├── prisma/
    │   ├── schema.prisma      # modelo de datos completo
    │   └── seed.ts            # semilla de Pisco
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── prisma/            # PrismaService (global)
        ├── common/            # guards RBAC, decoradores, health
        └── modules/           # auth, users, locations, assets, network,
                               # maintenance, incidents, troubleshooting,
                               # documents, dashboard, audit, integration
```

## Puesta en marcha (desarrollo)

Requisitos: Docker + Docker Compose (o Node 20 + PostgreSQL local).

```bash
cp .env.example .env

# Opción A — todo con Docker
make up                    # levanta la plataforma
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed

# Opción B — backend local
cd backend
npm install
npx prisma migrate dev     # crea las tablas
npx prisma db seed         # carga datos de Pisco
npm run start:dev          # API en http://localhost:3000/docs
```

Servicios: API `:3000` · Swagger `/docs` · MinIO consola `:9001` · Postgres `:5432`.

## Credenciales iniciales (seed)

- Usuario: `admin@acerosarequipa.local`
- Contraseña: `Admin.Pisco2026` (cambiar en producción vía `.env`)

Roles: **Administrador**, **Supervisor TI**, **Técnico**, **Consulta** (permisos granulares).

## Endpoints de referencia (F0/F1)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/auth/login` | Autenticación (JWT) |
| GET | `/api/v1/health` | Estado del servicio y BD |
| GET | `/api/v1/assets` | Listado de activos (filtros) |
| POST | `/api/v1/assets` | Alta de activo (valida `AA-CAM-T1-FX-001`) |
| GET | `/api/v1/locations/tree` | Árbol jerárquico de la planta |
| GET | `/api/v1/dashboard/kpis` | KPIs gerenciales |
| GET | `/api/v1/troubleshooting/metrics` | Métricas de resolución (MTTR, causa raíz) |

## Modelo de datos (resumen)

Ubicaciones jerárquicas · Activos tipados (cámara, NVR, switch, antena PMP…) · Topología (VLAN, puertos, enlaces fibra/PMP) · Órdenes de trabajo · Incidencias (con saturación de sesiones NVR y tiempo sin visión) · Documentos · Auditoría append-only · Campos SAP-ready (`sapId`, `costCenter`, `sapLocationCode`).

## Roadmap por fases

- **F0 – Fundaciones** ✅ scaffolding, Docker, esquema Prisma, seed
- **F1** – Seguridad y auditoría (login, RBAC, audit log)
- **F2** – Ubicaciones + Activos + Topología (anillo/fibra/PMP)
- **F3** – Operación + Troubleshooting (OT, incidencias, MTTR/MTBF)
- **F4** – Documentación + Dashboard (MinIO, KPIs, reportes)
- **F5** – Hardening + SAP/Zabbix-ready

## Documentación del proyecto (`docs/`)

- [Estado actual del proyecto](docs/ESTADO_ACTUAL_DEL_PROYECTO.md) — auditoría de F0
- [Guía de ejecución en desarrollo](docs/GUIA_EJECUCION_DESARROLLO.md) — instalar desde cero
- [Documentación de arquitectura](docs/DOCUMENTACION_ARQUITECTURA.md) — cómo funciona por dentro
- [Documentación por módulo](docs/modulos/README.md)
- [Despliegue on-premise Aceros Arequipa](docs/DESPLIEGUE_ACEROS_AREQUIPA.md) — VPN/red industrial
- [Plan de la Fase F1](docs/PLAN_F1.md) — seguridad empresarial (pendiente)
- [Quickstart](docs/QUICKSTART.md)
- [Configuración del entorno](docs/CONFIGURACION_ENTORNO_DESARROLLO.md) — verificar Docker/WSL/Node/Git
- [Configuración de variables](docs/CONFIGURACION_VARIABLES.md) — cada variable .env (dev vs prod)
- [Acta de validación real de F0](docs/VALIDACION_F0_REAL.md) — plantilla para validar en tu máquina
- [Monitoreo en tiempo real (análisis)](docs/MONITOREO_TIEMPO_REAL.md) — HikCentral + Zabbix (F5, no implementado)

### Arquitectura del ERP (análisis)

- **[Decisiones de arquitectura (CONGELADAS)](docs/DECISIONES_ARQUITECTURA.md)** — documento maestro

- [Visión general del ERP](docs/VISION_GENERAL_DEL_ERP.md)
- [Arquitectura empresarial](docs/ARQUITECTURA_EMPRESARIAL.md)
- [Módulos del sistema](docs/MODULOS_DEL_SISTEMA.md)
- [CMMS (gestión de mantenimiento)](docs/CMMS.md)
- [Arquitectura de monitoreo](docs/ARQUITECTURA_DE_MONITOREO.md)
- [Integración con SAP](docs/INTEGRACION_SAP.md)
