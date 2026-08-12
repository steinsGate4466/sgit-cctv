# SGIT-CCTV — expediente técnico para el área de TI

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
11/08/2026

---

## 1. Qué es, en una frase

Un sistema de gestión de la infraestructura de CCTV y red de Laminación:
inventario de equipos, mantenimiento (correctivo, preventivo, predictivo),
almacén de repuestos, trazabilidad completa y control de acceso por roles.

No es un visor de video. **No sustituye a HikCentral ni a iVMS**: gestiona los
equipos que dan el video, no el video.

---

## 2. Arquitectura

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA, sin framework pesado; carga por demanda |
| Backend | NestJS 10 + TypeScript | Estructura modular estricta, guards e interceptores de serie |
| ORM | Prisma 5 | Migraciones versionadas y consultas parametrizadas por defecto |
| Base | PostgreSQL 18 | Relacional; 65 modelos, 27 migraciones versionadas |
| Archivos | MinIO (S3) | Fotos e informes, fuera de la base |
| Despliegue | Railway (contenedores) + GitHub Actions | CI en cada push |

**Tamaño:** 34 módulos de backend · 292 endpoints · 37 pantallas ·
**499 pruebas automáticas** · 10 verificadores propios.

**Todo el stack es de código abierto y licencia permisiva** (MIT / Apache 2.0).
Sin licencias por usuario ni por equipo gestionado.

---

## 3. Seguridad — lo que TI va a preguntar

### Autenticación y sesión
- Contraseñas con **argon2** (no MD5, no SHA sin sal).
- **JWT de acceso corto + refresh con sesión en base**: cerrar sesión revoca
  de verdad, no sólo borra el token del navegador.
- **Freno de fuerza bruta** por usuario, persistido. Se cuenta por usuario y
  no por IP a propósito: la planta entera sale por una sola IP y frenar por
  IP la bloquearía completa por un solo abusador.

### Autorización
- **Roles editables** con permisos granulares (30 permisos).
- **Ámbito por tren**: un usuario del Tren 2 sólo ve el Tren 2 — y desde el
  bloque 12.3 eso se aplica **también al pedir un registro por su
  identificador**, que es donde suele quedar el agujero (OWASP A01).
- Devuelve **404 y no 403** ante un recurso ajeno: un 403 confirmaría que el
  registro existe y permitiría enumerar el inventario del vecino.

### Datos sensibles
- **Credenciales de las cámaras cifradas** en base; revelarlas queda auditado.
- La IP de gestión de los switches **no viaja al frontend**.
- Los archivos se validan por **magic bytes**, no por extensión: un
  ejecutable renombrado con extensión de PDF **no entra**.

### Cabeceras y transporte
HTTPS obligatorio, HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`. **CORS falla en cerrado**: en producción, sin lista
blanca declarada, el servidor no arranca.

### Auditoría
Cada escritura queda registrada con **quién, qué, cuándo, desde qué IP, con
qué navegador y desde qué PC de planta** (registro de equipos conocidos).

### Control de acceso por dispositivo *(nuevo)*
Tres modos: **LIBRE → AVISAR → ESTRICTO**. En estricto sólo entran los
aparatos que el Jefe de Mantenimiento haya aprobado.

> **Nota honesta sobre el filtrado por MAC:** no se puede hacer desde una
> aplicación web. La MAC es de capa 2 y no pasa del primer router. El
> filtrado por MAC se hace en la electrónica de red (802.1X o port-security)
> y es trabajo del área de redes, no de este sistema.

### Resultado de la auditoría interna
Escaneo completo del código: **0** SQL crudo sin parametrizar, **0** secretos
en el repositorio, **0** XSS, **0** ejecución de comandos, **0** SSRF, **0**
path traversal, **0** asignación masiva. El detalle está en
`docs/AUDITORIA_QA_2026-08.md`.

**Deuda reconocida:** 28 endpoints reciben el cuerpo sin clase de validación
(no explotables hoy, pero es donde entraría el próximo fallo) y el token vive
en `localStorage` (sin vía de XSS actual, así que el riesgo es condicional).

---

## 4. Respaldo y recuperación

| Qué | Cómo | Estado |
|---|---|---|
| Base de datos | Backups de Railway + PITR | ⚠️ **Pendiente de activar** |
| Base de datos | Volcado diario a GitHub Actions | ✅ Funcionando |
| Fotos y PDF | Backup de volumen + espejo semanal a S3 externo | ⚠️ **Pendiente de activar** |
| Código | GitHub, con CI en cada push | ✅ |
| Datos legibles | Exportación completa a Excel desde la interfaz | ✅ |

**Ensayo de restauración: no realizado.** Hasta que se restaure una copia y
arranque, el respaldo es una suposición. Está planificado antes del mapeo.

---

## 5. Integración

- **SAP:** convive. Se guarda el código SAP de activos y órdenes, y el almacén
  se puede cargar desde el Excel de SAP. **No hay integración automática**: no
  existe un export en línea disponible hoy.
- **Telegram:** cinco tipos de aviso.
- **Directorio activo / SSO:** no implementado. Los usuarios se dan de alta en
  el sistema. Si TI lo requiere, es un desarrollo aparte.
- **API documentada** (OpenAPI/Swagger), publicada sólo fuera de producción.

---

## 6. Lo que NO tiene — dicho antes de que lo pregunten

- No reproduce ni almacena video.
- No detecta la MAC del cliente (ver arriba: no se puede).
- No tiene doble factor. Está planificado para los roles con más poder.
- No tiene alta disponibilidad: es una instancia. Una caída de Railway es una
  caída del sistema.
- No hay integración con el directorio corporativo.

---

## 7. Continuidad — la pregunta incómoda

El sistema lo ha desarrollado una sola persona. Para que eso no sea un riesgo:

- **Todo el código está en GitHub**, no en un equipo personal.
- **499 pruebas automáticas** y **10 verificadores** que corren en cada
  entrega: un tercero puede tocar el código y saber si lo rompió.
- **Documentación en el repositorio**, incluido `CLAUDE.md`, que recoge cada
  decisión de diseño y cada error cometido, con su motivo.
- El stack es estándar: cualquier desarrollador de TypeScript se orienta.

Lo que **sí** hace falta de TI: decidir dónde vive esto a largo plazo (Railway
o infraestructura propia) y quién lo administra.

---

## 8. Lo que se pide al área de TI

1. **Decisión de alojamiento.** Hoy Railway. Si debe ir a infraestructura
   propia, el sistema es un contenedor y se mueve.
2. **Acceso desde planta.** Hoy es público en internet, protegido por
   contraseña, freno de fuerza bruta y control por dispositivo. Si TI prefiere
   restringirlo a la red corporativa, se puede hacer por IP — con la salvedad
   de que los técnicos usan datos móviles en las naves.
3. **Filtrado por MAC en la electrónica de red**, si se quiere ese nivel:
   802.1X o port-security en los switches.
4. **Dominio propio**, si se quiere sacar el nombre de la empresa de una URL
   de Railway.
5. **Política de respaldo:** confirmar RPO y RTO aceptables. Hoy el objetivo
   razonable con PITR activado es RPO de minutos y RTO de horas.
