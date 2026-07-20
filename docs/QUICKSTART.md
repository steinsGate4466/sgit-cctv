# Quickstart — SGIT-CCTV

## 1. Levantar con Docker
```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed
```

## 2. Probar la API
```bash
# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acerosarequipa.local","password":"Admin.Pisco2026"}'

# Usar el accessToken devuelto:
curl http://localhost:3000/api/v1/dashboard/kpis -H "Authorization: Bearer <TOKEN>"
```

## 3. Explorar
- Swagger: http://localhost:3000/docs
- MinIO:   http://localhost:9001
- Prisma Studio: `cd backend && npx prisma studio`
