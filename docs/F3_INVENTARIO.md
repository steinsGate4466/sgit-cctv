# F3 — Módulo de Inventario / Repuestos

**Fase:** F3 · **Estado:** Implementado (pendiente de validación en máquina real).

## Objetivo
Almacén de repuestos que responde a dos preguntas de mantenimiento: *"¿este equipo de campo tiene repuesto?"* y *"si se malogra algo, ¿tengo suficientes?"*. Con control diario (otras áreas retiran material) y todo pivotando sobre el **código SAP**.

## Modelo de datos (Prisma)
- **SparePart** — repuesto: `sapCode` (libre), `name`, `category`, `brand`, `model` (para compatibilidad por modelo), `unit`, `warehouse`, `currentStock`, `minStock`, `lastCheckedAt`.
- **SparePartAsset** — compatibilidad repuesto ↔ activo específico (M:N).
- **StockMovement** — movimientos `INGRESO | RETIRO | AJUSTE` con `sapCode` del retiro/ingreso.
- **StockCheck** — comprobación física periódica (`countedQty`, `previousQty`, `checkedAt`, usuario).
- Enum **MovementType**.

## Reglas de negocio
- **Compatibilidad (ambas):** por vínculo directo a activos **y** por modelo (un repuesto sirve a todos los activos de ese modelo). `GET /inventory/for-asset/:assetId` combina ambas.
- **Alertas (ambas):** `bajo mínimo` si `currentStock < minStock`; `sin stock` si `currentStock <= 0`. El panel compara **equipos en campo vs repuestos en stock** por categoría.
- **Control de stock (ambos):** comprobación física (fija `currentStock` y `lastCheckedAt`) + movimientos con código SAP (recalculan stock). Se marca "sin comprobar" si pasan +2 días.

## API (`/api/v1/inventory`)
| Método | Ruta | Permiso |
|---|---|---|
| GET | `/summary` | inventory.read |
| GET | `/` (filtros q, category, lowStock) | inventory.read |
| GET | `/for-asset/:assetId` | inventory.read |
| GET | `/:id` | inventory.read |
| POST | `/` | inventory.manage |
| PATCH | `/:id` | inventory.manage |
| DELETE | `/:id` | inventory.manage |
| POST | `/:id/link` · DELETE `/:id/link/:assetId` | inventory.manage |
| POST | `/:id/movement` | inventory.check |
| POST | `/:id/check` | inventory.check |

## Permisos y roles
Permisos nuevos: `inventory.read`, `inventory.manage`, `inventory.check`.
- **Jefe de Mantenimiento:** todo.
- **Supervisor TI:** read + manage + check.
- **Técnico / Técnico de Red:** read + check (comprueban y registran movimientos).
- **Consultor Externo:** read.

## Frontend
Página **Inventario**: panel de KPIs (tipos, unidades, bajo mínimo, sin stock, sin comprobar), gráfico **campo vs repuestos por categoría** (Recharts), buscador/filtros, tabla con estado de stock y acciones **Comprobar / Movimiento / Compatibilidad / Editar**.

## Integración SAP (futuro)
El `sapCode` del repuesto y del movimiento es libre hoy; queda listo para sincronizar con SAP. El activo ya tiene sus campos SAP.

## Pendiente / siguiente
- Mostrar "repuestos compatibles y su stock" dentro de la ficha del Activo (usa `GET /inventory/for-asset/:id`).
- Objetivo de cobertura configurable por repuesto (además del mínimo fijo).
