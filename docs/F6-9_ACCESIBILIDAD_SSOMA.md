# F6.9 — Accesibilidad y Trabajo en Altura (Manlift / SSOMA)

Aceros Arequipa · Planta Pisco · SGIT-CCTV

## Problema que resuelve

Hay cámaras y antenas montadas en altura, sobre estructuras o sobre grúas, donde
**no se puede intervenir sin manlift, izaje o andamio**. El manlift es un recurso caro
y el trabajo en altura es de alto riesgo, así que la solicitud no puede ser un pedido
verbal: debe estar **sustentada, documentada y aprobada**.

## Marco normativo aplicado

Según la normativa peruana de seguridad (Ley 29783 / NTP 399.010), se considera
**trabajo en altura desde 1.80 m**, y exige **PETAR** (permiso de trabajo de alto riesgo,
válido por turno), **IPERC/ATS**, EPP anticaídas y **mínimo 2 personas acreditadas**.
El sistema refleja esto:

- Si la altura declarada es **≥ 1.80 m**, la solicitud se marca automáticamente como
  trabajo en altura y activa el requisito de **PETAR** (con aviso visible al técnico).
- El formulario captura **IPERC**, **ATS**, **personal asignado** (por defecto 2) y **EPP**.

## Flujo

1. **El técnico** (o Técnico de Red / Supervisor TI) registra la solicitud desde campo:
   activo, altura estimada, medio requerido (manlift, grúa, andamio, escalera, línea de vida),
   tipo de emplazamiento, **justificación detallada** (mínimo 20 caracteres), ruta de acceso,
   datos SSOMA, riesgos e impacto en producción.
2. **Adjunta fotografías** que evidencien la inaccesibilidad.
3. **Solo el Jefe de Mantenimiento** (`access.approve`) aprueba o rechaza, **con firma
   electrónica** (correo + contraseña, re-verificada y auditada).
4. Se genera un **documento sustentado en PDF** con ficha, datos SSOMA, resolución y las
   fotografías, listo para tramitar el manlift.

## Regla de control clave

**No se puede aprobar una solicitud sin sustento fotográfico.** El backend lo rechaza
explícitamente: *"No se puede aprobar sin sustento fotográfico"*. Es la protección de
fondo — el gasto de un manlift debe estar justificado con evidencia, no con un texto.

## Permisos

| Rol | Ver | Solicitar | Aprobar |
|---|:-:|:-:|:-:|
| Jefe de Mantenimiento | ✅ | ✅ | ✅ |
| Supervisor TI | ✅ | ✅ | ❌ |
| Técnico de Red | ✅ | ✅ | ❌ |
| Técnico | ✅ | ✅ | ❌ |
| Consultor Externo | ✅ | ❌ | ❌ |

## Beneficio operativo

El tablero muestra **cuántos activos tienen acceso especial aprobado**. Con eso se pueden
**agrupar todos los trabajos que requieren manlift en una sola movilización**, en lugar de
alquilarlo varias veces para equipos distintos. Ese es el ahorro directo del módulo.

## Datos nuevos

- Enums `AccessMeans` y `AccessRequestStatus`.
- Tablas `access_requests` y `access_request_photos`.
- Permisos `access.read`, `access.request`, `access.approve`.

Todo aditivo: no modifica ninguna tabla existente.

## Despliegue

Este cambio **ya trae su migración versionada** (`20260725190000_acceso_ssoma`), así que:

1. `git push` → Railway aplica la migración sola al arrancar (`prisma migrate deploy`).
2. En la **Console** del backend, una vez: `node dist/seed.js` (para cargar los permisos nuevos).

Verificación: `./node_modules/.bin/prisma migrate status` debe reportar la base al día.

> Si tienes Postgres local levantado (Docker), puedes regenerar la migración de forma
> canónica con `npx prisma migrate dev`. La migración incluida fue escrita para que no
> dependas de tener la base local corriendo.
