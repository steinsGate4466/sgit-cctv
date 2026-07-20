# Módulo: Users

## Objetivo
Consultar los usuarios del sistema y su rol. La gestión completa (alta/edición/baja) se
amplía en F1.

## Archivos principales
```
src/modules/users/
├── users.controller.ts   # /users (requiere permiso user.read)
├── users.service.ts      # listado con rol
└── users.module.ts
```

## Controladores
- `GET /api/v1/users` — protegido con `user.read`; lista usuarios (sin datos sensibles).

## Servicios
- `findAll()` — devuelve `id, email, fullName, active, role.name`. Nunca expone el hash.

## Entidades Prisma
`User`, `Role`.

## Flujo de datos
```
GET /users → PermissionsGuard(user.read) → UsersService.findAll
   → prisma.user.findMany (select seguro) ← [ { email, role } ]
```

## Ejemplo de uso
```bash
curl http://localhost:3000/api/v1/users -H "Authorization: Bearer <TOKEN>"
```
