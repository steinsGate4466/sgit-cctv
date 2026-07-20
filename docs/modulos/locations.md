# Módulo: Locations (Ubicaciones)

## Objetivo
Modelar y consultar la jerarquía física de la planta
(Empresa → Planta → Tren → Área → Sala/Zona → Rack) y su árbol navegable.

## Archivos principales
```
src/modules/locations/
├── locations.controller.ts   # /locations y /locations/tree
├── locations.service.ts      # listado y construcción del árbol
└── locations.module.ts
```

## Controladores
- `GET /api/v1/locations` — listado plano ordenado por `path`.
- `GET /api/v1/locations/tree` — árbol jerárquico anidado.

## Servicios
- `findAll()` — devuelve todas las ubicaciones ordenadas por su ruta materializada.
- `tree()` — reconstruye la jerarquía en memoria agrupando por `parentId`.
  *Recibe:* nada. *Devuelve:* array de nodos raíz con `children` anidados.
  *Por qué existe:* la UI necesita un árbol para navegar la planta tipo "explorador".

## Entidades Prisma
`Location` (auto-referenciada mediante `parentId`, relación `LocationTree`).

## Flujo de datos
```
GET /locations/tree
   → LocationsService.tree
     → prisma.location.findMany
     → agrupa por parentId y arma recursivamente children
   ← [ { code:"AASA", children:[ { code:"AASA-PISCO", children:[...] } ] } ]
```

## Ejemplo de uso
```bash
curl http://localhost:3000/api/v1/locations/tree -H "Authorization: Bearer <TOKEN>"
```
