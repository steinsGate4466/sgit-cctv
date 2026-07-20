# Módulo: Assets (Activos tecnológicos)

## Objetivo
Administrar el inventario de activos (cámaras, NVR, switches, antenas, etc.) con
validación de nomenclatura, filtros y baja lógica que preserva la trazabilidad.

## Archivos principales
```
src/modules/assets/
├── assets.controller.ts     # CRUD REST protegido por permisos
├── assets.service.ts        # lógica de negocio sobre Prisma
├── assets.module.ts
└── dto/
    ├── create-asset.dto.ts   # valida AA-CAM-T1-FX-001 y campos
    ├── update-asset.dto.ts   # PartialType(create)
    └── query-asset.dto.ts    # filtros (type, status, locationId, search)
```

## Controladores
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| POST | `/assets` | `asset.create` | Alta de activo |
| GET | `/assets` | `asset.read` | Listado con filtros |
| GET | `/assets/:id` | `asset.read` | Detalle (incluye extensiones por tipo) |
| PATCH | `/assets/:id` | `asset.update` | Edición |
| DELETE | `/assets/:id` | `asset.delete` | Baja lógica |

## Servicios
- `create(dto)` — inserta el activo. *Recibe* DTO validado; *devuelve* el activo creado.
- `findAll(query)` — lista activos no borrados con filtros e `include: { location }`.
- `findOne(id)` — detalle con `camera/nvr/switchDev/wireless`; lanza 404 si no existe.
- `update(id, dto)` — actualiza campos.
- `remove(id)` — **soft delete**: fija `deletedAt` y estado `BAJA`.
  *Por qué:* nunca se pierde el historial de un equipo dado de baja.

## Entidades Prisma
`Asset` (base) + `AssetCamera`, `AssetNvr`, `AssetSwitch`, `AssetWireless`, y su relación
con `Location`.

## Flujo de datos
```
POST /assets {assetCode:"AA-CAM-T1-FX-001", type:"CAMERA", ...}
   → ValidationPipe (regex de nomenclatura)
   → JwtAuthGuard + PermissionsGuard(asset.create)
   → AssetsService.create → prisma.asset.create
   ← 201 { id, assetCode, ... }
```

## Ejemplo de uso
```bash
curl -X POST http://localhost:3000/api/v1/assets \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"assetCode":"AA-CAM-T1-FX-002","type":"CAMERA","brand":"Hikvision","criticality":"ALTA"}'
```
