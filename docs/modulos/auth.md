# Módulo: Auth

## Objetivo
Autenticar usuarios y emitir tokens JWT que llevan el rol y los permisos resueltos,
para que el resto de la API pueda proteger sus endpoints.

## Archivos principales
```
src/modules/auth/
├── auth.controller.ts    # rutas /auth/login y /auth/me
├── auth.service.ts       # verifica credenciales y firma tokens
├── auth.module.ts        # registra JwtModule y Passport
├── jwt.strategy.ts       # valida el token en cada request protegida
└── dto/login.dto.ts      # forma y validación del body de login
```

## Controladores
- `POST /api/v1/auth/login` — recibe `{ email, password }`, devuelve `{ accessToken,
  refreshToken, user }`. Es público (`@Public()`).
- `GET /api/v1/auth/me` — protegido; devuelve el usuario del token (`@CurrentUser()`).

## Servicios
`AuthService.login(dto)`:
- **Qué recibe:** email y password.
- **Qué hace:** busca el usuario (con su rol y permisos), verifica el hash con `argon2`,
  arma el payload `{ sub, email, role, permissions }`, firma access y refresh tokens y
  actualiza `lastLoginAt`.
- **Qué devuelve:** los tokens y los datos públicos del usuario.
- **Por qué existe:** centralizar la seguridad del login y la resolución de permisos.

## Entidades Prisma
`User`, `Role`, `Permission`, `RolePermission`.

## Flujo de datos
```
POST /auth/login {email,password}
   → AuthService.login
     → prisma.user.findUnique (incluye role.permissions)
     → argon2.verify(hash, password)
     → jwt.signAsync(payload)
   ← { accessToken, refreshToken, user }
```

## Ejemplo de uso
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acerosarequipa.local","password":"Admin.Pisco2026"}'
```
