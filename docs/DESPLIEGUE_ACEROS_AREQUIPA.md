# Despliegue on-premise — Aceros Arequipa, Planta Pisco

Cómo se ejecutará SGIT-CCTV dentro de la red industrial, accedido por ingenieros
mediante VPN corporativa. Documento de referencia para TI/infraestructura.

---

## 1. Arquitectura de acceso

```
   Laptop del ingeniero (corporativa)
             │
             │  1) VPN corporativa (túnel cifrado)
             ▼
   Red interna de Planta Pisco
             │
             │  2) HTTP/HTTPS :80/:443
             ▼
   ┌───────────────────┐
   │       Nginx        │  único punto de entrada (reverse proxy)
   └─────────┬─────────┘
             │  3) proxy interno :3000
             ▼
   ┌───────────────────┐
   │    API (NestJS)    │
   └─────────┬─────────┘
             │  4) red Docker interna (no expuesta)
             ▼
   ┌───────────────────┐
   │   PostgreSQL 5432  │  (+ Redis, MinIO)
   └───────────────────┘
```

El ingeniero **nunca** toca directamente la base de datos ni la API: solo llega a Nginx.
Todo lo demás vive en la red interna del servidor.

---

## 2. Acceso desde la laptop corporativa

- El ingeniero se conecta primero a la **VPN** de la empresa (requisito previo).
- Una vez dentro, accede por navegador a la IP/hostname interno del servidor, p. ej.
  `http://sgit.pisco.local` o `http://172.16.200.50`.
- No se publica nada a Internet: el sistema es **solo intranet + VPN**.

---

## 3. Comunicación interna

- Los contenedores se comunican por la red Docker `sgit_net` usando **nombres de
  servicio** (`db`, `redis`, `minio`, `api`). Esta red no es accesible desde fuera del host.
- Solo Nginx (:80/:443) y, si se decide, la consola de MinIO (:9001) se exponen al host.
- La API escucha en :3000 **solo dentro** de la red interna; el acceso externo pasa por Nginx.

---

## 4. Puertos necesarios

| Puerto | Servicio | Exposición recomendada |
|---|---|---|
| 443 | Nginx (HTTPS) | Exponer en la red interna (futuro, ver §6) |
| 80 | Nginx (HTTP) | Interno; redirigir a 443 en producción |
| 3000 | API | **No exponer**; solo red interna |
| 5432 | PostgreSQL | **No exponer**; solo red interna |
| 6379 | Redis | **No exponer** |
| 9000/9001 | MinIO API/consola | Interno; consola solo para administradores |

Regla general: **abrir solo 80/443 hacia los ingenieros**; el resto permanece interno.

---

## 5. Seguridad básica (estado actual y recomendaciones)

Actual (F0):
- Autenticación JWT + RBAC por permiso.
- Contraseñas con hash `argon2` (nunca en texto plano).
- Servicios de datos no expuestos fuera de la red Docker.

Recomendaciones para el despliegue:
- Cambiar **todos** los secretos por defecto en `.env` (`JWT_SECRET`, contraseñas de
  Postgres y MinIO).
- Restringir la consola de MinIO y Prisma Studio a administradores.
- Aplicar firewall del host para permitir solo 80/443 desde la subred de ingeniería.
- Realizar **backups** periódicos de los volúmenes `db_data` y `minio_data`.

---

## 6. Futuro HTTPS

Hoy Nginx sirve por HTTP (:80). Para producción:
- Emitir un certificado TLS (CA interna corporativa o Let's Encrypt si hay resolución DNS interna).
- Añadir el bloque `server { listen 443 ssl; ... }` en `infra/nginx/nginx.conf` con
  `ssl_certificate` y `ssl_certificate_key`.
- Redirigir 80 → 443.
- Montar los certificados como volumen en el contenedor `nginx`.

> Esto se implementa junto con F1 (endurecimiento de seguridad), no antes.

---

## 7. Separación entre usuarios y base de datos

- Los **usuarios de la aplicación** (Administrador, Supervisor TI, Técnico, Consulta)
  viven en la tabla `users` y se autentican por la API. **No** son usuarios de PostgreSQL.
- La aplicación usa **una sola** cuenta técnica de PostgreSQL (`DATABASE_URL`) para
  conectarse; los permisos de negocio los controla el RBAC de la API, no el motor de BD.
- Recomendación producción: esa cuenta técnica con privilegios mínimos necesarios
  (solo sobre la base `sgit_cctv`), y credenciales distintas a las de ejemplo.
- En F1 se prepara la integración con **Active Directory** para que el login corporativo
  se valide contra el directorio de la empresa, manteniendo el RBAC interno.

---

## 8. Checklist de puesta en producción

- [ ] Servidor on-premise con Docker + Docker Compose.
- [ ] `.env` con secretos propios (no los de ejemplo).
- [ ] Firewall: solo 80/443 hacia ingeniería.
- [ ] TLS/HTTPS configurado en Nginx.
- [ ] Backups programados de volúmenes.
- [ ] Prueba de acceso vía VPN desde una laptop corporativa.
- [ ] Cuenta técnica de PostgreSQL con privilegios mínimos.
