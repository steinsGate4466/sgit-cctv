# F2-B — Roles reales de Aceros + código de activo flexible

**Estado:** implementado (código), pendiente de compilar/probar. Requiere **recrear la BD**
(los roles se renombran).

## 1. Roles según la organización real (Producción ↔ Mantenimiento ↔ TI)

| Rol | Alcance | Permisos clave |
|---|---|---|
| **Jefe de Mantenimiento** | Administrador (control total) | Todos (incluye borrar, gestionar usuarios y credenciales) |
| **Supervisor TI** | Supervisa y analiza TODO | Ver todo + crear/actualizar/aprobar/analizar incidencias y OT + `credential.read`. **Sin** `asset.delete`, **sin** `user.manage`, **sin** `credential.manage` |
| **Técnico** (campo) | Registra y llena formularios | `incident.create/read/update`, `wo.create/read/update`, `asset.read/update`, `location.read`, `document.read`, `dashboard.read`, `troubleshooting.read`. **Sin** borrar, aprobar, cerrar ni tocar usuarios/credenciales |
| **Consultor Externo / Jefe de Producción** | Solo visualiza el avance | Solo lectura: `dashboard.read`, `incident.read`, `wo.read`, `troubleshooting.read`, `asset.read`, `location.read` |

La seguridad se aplica en el **backend** (guard global de permisos); el **frontend** solo
oculta lo que el rol no puede usar (menús y botones).

## 2. Código de activo flexible
Se **quitó el formato forzado** `AA-CAM-T1-FX-001` en `create-asset.dto.ts`. Ahora el
código/rótulo es libre (mín. 2 caracteres), hasta que Aceros defina su estándar de
rotulamiento (que luego se hará configurable).

## 3. Archivos
Backend: `prisma/seed.ts` (roles), `src/modules/assets/dto/create-asset.dto.ts` (código flexible).
Frontend: `auth/AuthContext.tsx` (helper `can()`), `components/Layout.tsx` (menú por permisos),
`pages/Incidents.tsx` y `pages/Users.tsx` (botones por permisos).

## 4. Cómo aplicar (¡requiere recrear la BD por el renombre de roles!)
```cmd
cd %USERPROFILE%\Desktop\sgit-cctv
docker compose down -v
docker compose up -d --build
docker compose exec api npx prisma db seed
```
Frontend: descomprimir y **recargar el navegador** (Vite recarga solo).

## 5. Cómo probar los roles
1. Login admin (`admin@acerosarequipa.local` / `Admin.Pisco2026`) → ahora es **Jefe de Mantenimiento**, ve todo el menú.
2. En **Usuarios**, crea un **Técnico** y un **Consultor Externo** (elige el rol en el desplegable).
3. Cierra sesión y entra como el **Técnico**: verás menú reducido (sin Usuarios ni Auditoría),
   puedes **crear** incidencias pero **no** el botón "Resolver".
4. Entra como **Consultor Externo**: todo en **solo lectura** (sin botones de crear/resolver).

## 6. Nota
El código de activo libre no rompe los activos del seed (siguen válidos). Los roles antiguos
(Administrador/Consulta) desaparecen al recrear la BD.
