# Auditoría QA y seguridad — SGIT-CCTV

**10/08/2026** · Aceros Arequipa, Planta Pisco, Laminación
Revisión completa del código como QA y como pentester, antes del estreno.

---

## 1. Tamaño de lo auditado

| | |
|---|---|
| Módulos backend | 33 |
| Servicios / controladores | 43 / 36 |
| Endpoints | 262 |
| Pantallas | 34 |
| Migraciones | 24 |
| Pruebas automáticas | **458** en 28 archivos |
| Verificadores propios | 7 |
| Modelos / enums en el esquema | 58 / 41 |

---

## 2. Veredicto en una línea

**El código está sano.** No hay inyección SQL, no hay secretos escritos, no
hay XSS, la validación es estricta por defecto y los errores no se filtran al
usuario. Queda **un** agujero real de permisos y una lista de deuda menor.

---

## 3. Lo que se buscó y NO apareció

Esto vale tanto como lo que sí apareció, porque son las clases de fallo que
hunden un sistema:

| Se buscó | Resultado |
|---|---|
| **Inyección SQL** (`$queryRawUnsafe`, `$executeRawUnsafe`) | **0**. Todo pasa por Prisma parametrizado |
| **Secretos en el código** (contraseñas, tokens, claves) | **0**. Todo por `process.env` |
| **XSS** (`dangerouslySetInnerHTML`, `eval`, `new Function`) | **0** en las 34 pantallas |
| **Asignación masiva** (`data: {...body}` sin validar) | **0** efectivas. Los 3 casos que hacen *spread* usan DTO, y el `ValidationPipe` global corre con `whitelist: true` **y** `forbidNonWhitelisted: true`: un campo de más no se ignora, **rechaza la petición entera** |
| **`passwordHash` escapándose** a una respuesta | **0**. Proyección segura en `users.service.ts` |
| **Fugas de memoria** (`setInterval` sin limpiar) | **0**. Los 3 intervalos tienen su `clear` |
| **Foco robado en formularios** | **0** en 65 efectos (verificador propio) |
| **`console.log` en producción** | 1, y está en un bloque de arranque marcado |

### Falsos positivos que revisé uno a uno

- **8 llamadas a Prisma «sin `await`»** → todas están dentro de
  `$transaction([...])`, que **recibe promesas sin resolver a propósito**, o
  son fuego-y-olvido con su `.catch()`. Correcto.
- **`(ok / total) * 100` sin proteger** → la función `pct()` hace
  `if (total <= 0) return 100` en la primera línea. Correcto.

---

## 4. HALLAZGOS

### 🔴 A-1 · Ámbito de tren no se aplica en rutas por identificador

**OWASP A01:2025 — Broken Access Control, el riesgo número 1.**

El filtro de tren se aplica en los **listados**, pero **no cuando se pide un
registro por su id**. Hay **41 rutas** `findUnique({ where: { id } })` que no
comprueban a qué tren pertenece lo que devuelven.

**Cómo se explota, sin herramientas:** un usuario del Tren 2 abre
`/assets/<id-de-un-activo-del-Tren-1>` en la barra de direcciones y lo ve
entero, credenciales incluidas.

**Por qué no está arreglado ya:** cerrarlo mal es peor que dejarlo. Si se
cierra de más, se rompe trabajo legítimo y **no se nota hasta que alguien no
puede hacer su trabajo en planta**. Hay que probar los dos casos —el propio
pasa, el ajeno no— en cada ruta tocada.

**Riesgo real hoy:** medio. Sólo lo puede hacer alguien **ya autenticado** y
con permiso de lectura. No es un extraño desde internet.
**Es el bloque 12.3 y es lo siguiente que hay que hacer.**

---

### 🟠 A-2 · 28 endpoints reciben `@Body() dto: any`

Sin clase DTO, el `ValidationPipe` **no tiene metadatos que validar** y el
cuerpo pasa crudo. Ninguno hace *spread* a Prisma (lo comprobé uno a uno), así
que hoy no es explotable — pero es la puerta por la que entraría el próximo
fallo.

Dónde están: `catalogos` (2), `checklist` (5), `inventory` (2),
`maintenance` (varios), `auth/logout` (1), y otros.

**Prioridad:** los de `catalogos` y `checklist` primero, que son los que
escriben datos de planta.

---

### 🟠 A-3 · El token vive en `localStorage`

Si algún día hubiera un XSS, el token sería robable. Hoy **no hay ninguna vía
de XSS** (cero `dangerouslySetInnerHTML`, React escapa por defecto, CSP
puesta), así que el riesgo es condicional.

La alternativa —cookie `httpOnly`— obliga a rehacer el flujo de autenticación
completo, y **auth es el único módulo cuyo fallo no degrada el sistema: lo
apaga**. No se toca antes del estreno.

---

### 🟡 A-4 · 55 `catch(() => [])` en el frontend

Cuando el servidor falla, la pantalla enseña una lista vacía y el técnico lo
lee como «no hay trabajo pendiente». En una lista de trabajo ése es el peor
error posible.

**Ya está mitigado** por el aviso central de red (`alFallarLaRed`), que anuncia
el fallo antes de que el `catch` lo silencie. Queda como deuda: la mitigación
avisa, pero la pantalla sigue mintiendo debajo.

---

### 🟡 A-5 · Sin ámbito de tren en 4 de 43 servicios

Sólo `auth`, `maintenance`, `roles` y `users` comprueban `ambitoTrenes`. Es la
otra cara del A-1 y se cierra con el mismo trabajo.

---

### 🟢 A-6 · Menores

- 14 `key={index}` en React. Sólo molesta en listas que se reordenan.
- 28 `@Body(): any` ya contados en A-2.
- La restauración de respaldo **nunca se ha probado**. No es código: es el
  ensayo pendiente en Railway, y hasta que se haga, el respaldo es una
  suposición.

---

## 5. Lo que está bien hecho y conviene no tocar

- **`ValidationPipe` con `forbidNonWhitelisted`** — un campo de más no se
  ignora en silencio: rechaza la petición. Es la postura correcta.
- **CORS falla en cerrado**: en producción, sin `CORS_ORIGIN`, el servidor
  **no arranca**. Un servidor que no levanta se arregla en dos minutos; uno
  que levanta abierto no se nota nunca.
- **Cabeceras**: `nosniff`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, CSP.
- **Freno por usuario y no por IP** — en planta todos salen por la misma IP:
  frenar por IP habría bloqueado a la planta entera por un solo abusador.
- **Documentos validados por *magic bytes***, no por extensión. Un `.exe`
  renombrado a `.pdf` no entra.
- **Credenciales CCTV cifradas** y reveladas bajo auditoría.
- **Sesiones revocables**: cerrar sesión revoca de verdad, no sólo borra el
  token del navegador.
- **7 verificadores propios** que corren antes de cada entrega y cazan las
  clases de error que este proyecto ya cometió una vez.

---

## 6. Prioridad recomendada

| | Qué | Cuándo |
|---|---|---|
| 1 | **S2/S3 en Railway: Backups + PITR** | **Antes de cargar datos reales.** PITR sólo protege desde que se enciende |
| 2 | **A-1 · Ámbito por identificador (12.3)** | Antes de que entre gente real |
| 3 | S7 · Rotar contraseña de Postgres | Esta semana |
| 4 | S5 · Ensayo de restauración | Antes del estreno |
| 5 | A-2 · DTOs en catálogos y checklist | Después del estreno |
| 6 | A-4 · Saldar los `catch(() => [])` | Continuo |
