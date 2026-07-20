# Acta de validación real de F0 — SGIT-CCTV

> Plantilla guiada. Complétala **mientras ejecutas** F0 en tu máquina. Copia la salida
> real de cada comando en los espacios `RESULTADO`. Al final tendrás evidencia de que F0
> funciona (o el registro exacto de dónde falló).

---

## 0. Datos de la validación

| Campo | Valor |
|---|---|
| Fecha | `____________` |
| Responsable | Cristhian Rondon Amanqui |
| Equipo (laptop) | `____________` (modelo/RAM) |
| Sistema operativo | Windows `10 / 11` |

**Versiones instaladas** (de `CONFIGURACION_ENTORNO_DESARROLLO.md`):

| Herramienta | Versión detectada |
|---|---|
| Docker | `____________` |
| Docker Compose | `____________` |
| WSL | `____________` |
| Node.js | `____________` |
| npm | `____________` |
| Git | `____________` |

---

## 1. Preparación (Parte 2)

Abrir en VS Code la carpeta **raíz** `sgit-cctv/` (la que contiene `docker-compose.yml`).
Terminal recomendada: **WSL** (Ubuntu) o PowerShell.

```bash
cd ruta/hacia/sgit-cctv     # ubícate en la raíz del proyecto
ls                          # (Linux/WSL) debe listar: backend  frontend  docs  docker-compose.yml ...
dir                         # (PowerShell) equivalente en Windows
```

- [ ] Estoy en la carpeta raíz del proyecto. RESULTADO: `____________`

---

## 2. Configuración de variables (Parte 3)

```bash
cp .env.example .env
```
- [ ] `.env` creado. (Ver `CONFIGURACION_VARIABLES.md` para el detalle de cada variable.)

---

## 3. Infraestructura Docker (Parte 4)

```bash
docker compose config     # valida y muestra la configuración combinada
docker compose up -d      # levanta los 5 contenedores en segundo plano
docker ps                 # lista los contenedores en ejecución
```

- [ ] `docker compose config` sin errores. RESULTADO: `____________`
- [ ] `docker ps` muestra 5 contenedores. RESULTADO (pegar tabla):

```
____________________________________________________
```

**Verificación por servicio:**

| Servicio | Qué guarda / hace | Cómo verificarlo | OK? |
|---|---|---|---|
| PostgreSQL (`sgit_db`) | Datos: activos, ubicaciones, incidencias, usuarios | `docker compose exec db psql -U sgit -d sgit_cctv -c "\dt"` (lista tablas) | ☐ |
| Redis (`sgit_redis`) | Cache/colas | `docker compose exec redis redis-cli ping` → `PONG` | ☐ |
| MinIO (`sgit_minio`) | Archivos (fotos, planos, backups) | Abrir `http://localhost:9001` y entrar con las credenciales | ☐ |
| API (`sgit_api`) | Backend NestJS | `curl http://localhost:3000/api/v1/health` | ☐ |
| Nginx (`sgit_nginx`) | Reverse proxy (punto de entrada) | `curl http://localhost/api/v1/health` | ☐ |

---

## 4. Validación del backend (Parte 5)

Si desarrollas fuera de Docker (recarga en caliente):
```bash
cd backend
npm install        # instala dependencias (NestJS, Prisma, argon2...)
npm run build      # compila TypeScript → dist/  (valida que NestJS compila)
```

- [ ] `npm install` sin errores. RESULTADO: `____________`
- [ ] `npm run build` genera `dist/` sin errores de TypeScript. RESULTADO: `____________`

---

## 5. Validación de base de datos (Parte 6)

Desde `backend/`:
```bash
npx prisma validate    # valida la sintaxis y relaciones de schema.prisma
npx prisma generate    # genera el Prisma Client (código tipado)
npx prisma db push     # crea las tablas en PostgreSQL desde el esquema
npx prisma db seed     # carga datos de Pisco (roles, VLANs, jerarquía, admin)
```

Qué hace cada uno y qué modifica:

| Comando | Qué hace | Qué modifica |
|---|---|---|
| `prisma validate` | Revisa que el esquema sea correcto | nada (solo valida) |
| `prisma generate` | Genera el cliente tipado | `node_modules/@prisma/client` |
| `prisma db push` | Sincroniza el esquema con la BD | crea/actualiza tablas en PostgreSQL |
| `prisma db seed` | Inserta datos iniciales | filas en las tablas |

- [ ] `prisma validate` → `The schema is valid`. RESULTADO: `____________`
- [ ] `prisma generate` → `Generated Prisma Client`. RESULTADO: `____________`
- [ ] `prisma db push` → tablas creadas. RESULTADO: `____________`
- [ ] `prisma db seed` → semilla cargada. RESULTADO: `____________`

**¿PostgreSQL tiene datos?** Verifícalo:
```bash
docker compose exec db psql -U sgit -d sgit_cctv -c "SELECT COUNT(*) FROM roles;"
docker compose exec db psql -U sgit -d sgit_cctv -c "SELECT number,name FROM vlans;"
docker compose exec db psql -U sgit -d sgit_cctv -c "SELECT email FROM users;"
```
- [ ] Hay 4 roles, 5 VLANs y el usuario admin. RESULTADO: `____________`

---

## 6. Pruebas funcionales (Parte 7)

| Prueba | Comando / acción | Esperado | OK? |
|---|---|---|---|
| API viva | `curl http://localhost:3000/api/v1/health` | `{"status":"ok","db":"up"}` | ☐ |
| Swagger | Abrir `http://localhost:3000/docs` | interfaz cargada con endpoints | ☐ |
| Login | `POST /api/v1/auth/login` con admin | devuelve `accessToken` | ☐ |
| Roles | `SELECT * FROM roles` | Administrador, Supervisor TI, Técnico, Consulta | ☐ |
| Dashboard | `GET /api/v1/dashboard/kpis` (con token) | objeto de KPIs | ☐ |
| Ubicaciones | `GET /api/v1/locations/tree` (con token) | árbol AASA→Pisco→Tren 1/2/3 | ☐ |
| Activos | `GET /api/v1/assets` (con token) | activos demo del seed | ☐ |

Login de referencia:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acerosarequipa.local","password":"Admin.Pisco2026"}'
```

---

## 7. Errores encontrados y soluciones

> Registra aquí cualquier fallo. Recuerda la regla: **no corregir sin aprobación**;
> primero se explica (qué significa, causa, archivo, solución propuesta).

| # | ERROR (mensaje) | CAUSA probable | ARCHIVO afectado | SOLUCIÓN propuesta | Estado |
|---|---|---|---|---|---|
| 1 | `____________` | `____________` | `____________` | `____________` | ☐ pendiente / ☐ aprobado / ☐ resuelto |
| 2 | | | | | |

---

## 8. Veredicto

- [ ] **F0 VALIDADO** — todos los servicios arriba, BD con datos, API y Swagger OK.
- [ ] F0 con observaciones (ver sección 7).

Firma / fecha: `____________`

> Cuando marques "F0 VALIDADO", avísame para iniciar **F1** (previa confirmación explícita).
