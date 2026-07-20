# Arquitectura empresarial — SGIT (análisis)

> Evaluación de si la arquitectura actual soporta convertirse en un ERP modular capaz de
> crecer por décadas, y qué ajustes se recomiendan **antes** de F1. No incluye código.

---

## 1. ¿El diseño actual sirve como ERP modular? — Sí, con refinamientos

F0 usa un **monolito modular** (NestJS + Prisma + PostgreSQL). Para un ERP de un equipo
reducido, con dominios muy acoplados (un activo cruza ubicación, mantenimiento, inventario
e incidencias), esta es la elección **correcta**:

- Evita la complejidad operativa de microservicios prematuros (despliegue, red, consistencia
  distribuida) que un área de mantenimiento no puede sostener.
- Mantiene transacciones ACID simples dentro de la base (clave para OM ↔ consumos de almacén).
- Permite **extraer** un módulo a servicio independiente el día que uno lo justifique
  (p. ej. Integraciones), sin rehacer el resto.

Veredicto: **la base es adecuada**. Lo que falta es formalizar las **fronteras de módulo**,
un **mecanismo de eventos** entre módulos y una **capa de integración anticorrupción**.

---

## 2. Capas y fronteras

Se mantiene Clean Architecture por capas y se **refuerza** la propiedad de datos por módulo:

```
Presentación (controllers, DTOs, OpenAPI)
      │
Aplicación (casos de uso / servicios de dominio)
      │
Dominio (entidades, reglas, máquinas de estado)   ← aquí vive la lógica del negocio
      │
Infraestructura (Prisma, MinIO, Redis, colas, adaptadores de integración)
```

Reglas de frontera (a adoptar):

- **Cada tabla pertenece a un módulo.** Ningún módulo escribe tablas de otro; se comunican
  por servicios de aplicación o por eventos.
- **Sin joins entre dominios ajenos** en consultas de escritura; para lecturas combinadas se
  usan vistas o servicios de consulta explícitos.
- **Shared kernel** mínimo: tipos comunes (IDs, enums de estado, paginación), utilidades de
  auditoría y el `PrismaService`.

Esto es lo que permite que el sistema crezca sin convertirse en un "gran barro".

---

## 3. Comunicación entre módulos: eventos + outbox

Un ERP necesita reaccionar a hechos (una OM se cierra → se consumen repuestos → se actualiza
stock → se registra auditoría). Se recomienda introducir, ya en el diseño:

- **Bus de eventos en proceso** (EventEmitter de NestJS) para desacoplar módulos: el emisor
  no conoce a los consumidores.
- **Patrón Outbox** para eventos que cruzan a sistemas externos (SAP, notificaciones): el
  evento se guarda en una tabla `outbox` dentro de la misma transacción y un worker lo
  entrega de forma confiable e idempotente. Esto evita perder o duplicar mensajes.
- Migración futura a un **broker** (Redis Streams / RabbitMQ) sin cambiar la lógica de
  dominio, solo el transporte.

Beneficio: integraciones y automatismos (alerta → OM automática) sin acoplar módulos.

---

## 4. Integraciones: capa anticorrupción (ACL)

SAP, HikCentral y Zabbix tienen modelos de datos propios. Para no contaminar el dominio:

- Cada integración vive en el módulo **`integration`** con su propio **adaptador** y
  **modelos de traducción** (ACL): traduce el mundo externo al lenguaje de SGIT y viceversa.
- **Tablas de staging** para importaciones (SAP): los datos entran crudos, se validan, se
  concilian y recién se promueven al dominio. Nada externo escribe directo en las tablas núcleo.
- Contratos **OpenAPI** versionados y credenciales por integración (AK/SK, tokens SAP),
  rotables y auditadas.

Así, si SAP o HikCentral cambian, el impacto queda contenido en el adaptador.

---

## 5. Formularios dinámicos: ¿conviene desde el inicio? — Sí, con guardarraíles

**Necesidad real:** una cámara, un switch, un NVR y una UPS tienen checklists y
procedimientos de mantenimiento distintos; el administrador debe poder crear formularios
**sin tocar código**.

**Recomendación:** implementar formularios dinámicos, pero **acotados** para evitar el
"efecto plataforma interna" (reconstruir una base de datos dentro de la base de datos):

- **Lo relacional sigue relacional.** Activos, ubicaciones, OM, movimientos de almacén: son
  entidades fuertes, con columnas tipadas. NO se vuelven dinámicas.
- **Lo dinámico se limita a checklists / formularios de inspección y mantenimiento.**
- Modelo propuesto (a diseñar en el CMMS): `FormTemplate` (definición en JSON-Schema,
  versionada, asociada a tipo/categoría de activo) + `FormInstance` (respuestas de una
  intervención, validadas contra la plantilla de su versión).
- Ventaja de decidirlo ahora: **retrofit es caro**; dejar los campos y relaciones listos
  desde el diseño evita migraciones dolorosas. La **UI constructora** de formularios puede
  llegar después; el modelo de datos, no.

Riesgos a controlar: validación estricta contra el esquema, versionado (una OM guarda la
versión de plantilla usada), y no permitir lógica de negocio arbitraria dentro del formulario.

**Conclusión:** sí, recomendable desde el inicio, pero **solo para checklists/formularios**,
no para el núcleo del modelo.

---

## 6. Arquitectura de datos

- **PostgreSQL** como base transaccional única (ACID).
- **Propiedad de datos por módulo**; posibilidad futura de *schemas* separados por dominio
  dentro de la misma BD si crece la complejidad.
- **Tablas de historial y movimientos como libros inmutables** (append-only): auditoría,
  Kardex de almacén, eventos de monitoreo, historial de activos. El estado "actual" (stock,
  estado del activo) se deriva o se materializa desde esos libros.
- **MinIO** para binarios (fotos, videos, planos, backups): nunca en la BD.
- **Redis** para cache, sesiones/refresh (F1) y colas.

---

## 7. Escalabilidad: ¿soporta 100k activos, 500k OM, millones de registros, décadas?

Sí, con estas prácticas (estándar en ERP sobre PostgreSQL):

| Técnica | Aplicación en SGIT |
|---|---|
| **Índices** adecuados | Ya presentes en F0 (tipo, estado, ubicación, entidad de auditoría). Ampliar por consultas reales. |
| **Particionado por rango de fecha** | Tablas de alto volumen: `audit_logs`, movimientos de almacén, eventos de monitoreo, historial de OM. Particiones mensuales/anuales. |
| **Archivado / retención** | Mover particiones antiguas a almacenamiento frío; políticas por tabla (p. ej. eventos > 2 años). |
| **Paginación obligatoria** | Todo listado con `limit/offset` o *keyset pagination*; nunca `findMany` sin límite. |
| **Pool de conexiones** | PgBouncer delante de PostgreSQL para muchas conexiones concurrentes. |
| **Réplicas de lectura** | Dashboards y reportes pesados contra una réplica; escritura al primario. |
| **Cache** | Redis para KPIs y catálogos poco cambiantes. |
| **Trabajo asíncrono** | Reportes, importaciones SAP y notificaciones en colas, no en el request. |

Dimensionamiento: 100k activos son decenas de MB; 500k OM y millones de movimientos son
**volúmenes moderados** para PostgreSQL bien indexado y particionado. El cuello de botella
real no es el tamaño, sino **consultas sin índice o sin paginar**: se previene con las reglas
anteriores. Para "décadas", la clave es **versionar esquema (migraciones Prisma) y API
(`/api/v1`, `/v2`...)** y mantener la disciplina modular.

**Veredicto de escalabilidad:** la arquitectura **soporta** la escala objetivo; las medidas
de particionado/archivado se planifican para cuando el volumen lo amerite (no urgen en F1).

---

## 8. Evolución hacia servicios (solo si se justifica)

Se permanece en monolito modular. Candidatos naturales a extraerse en el futuro, **por
frontera ya definida**, si la carga o el equipo crecen:

- **Integraciones/Monitoreo** (ingesta de eventos HikCentral/Zabbix de alto volumen).
- **Reporting/Analítica** (cargas pesadas de lectura).

La extracción es viable **porque** los módulos no comparten tablas ni lógica: solo eventos y
contratos. Esa es la razón de invertir hoy en fronteras y eventos.

---

## 9. Seguridad y operación (marco, se profundiza en F1)

- RBAC por permiso (F0) → refresh tokens, auditoría automática, cifrado de credenciales,
  preparación Active Directory (F1).
- Despliegue on-premise con Nginx/TLS, red interna aislada, backups de volúmenes
  (ver `DESPLIEGUE_ACEROS_AREQUIPA.md`).

---

## 10. Ajustes recomendados antes de F1 (resumen)

1. Documentar y **congelar las fronteras de módulo** (propiedad de tablas).
2. Introducir **bus de eventos en proceso** y **tabla outbox** (diseño; implementación en F5).
3. Definir el **modelo de formularios dinámicos** (FormTemplate/FormInstance) para el CMMS.
4. Rediseñar Mantenimiento como **CMMS** (ver `CMMS.md`) y Almacén como **libro de movimientos**.
5. Clarificar la **taxonomía de módulos** (ver `MODULOS_DEL_SISTEMA.md`): Activos vs
   Inventario vs Almacén.
6. Reflejar el nombre de producto **SGIT** (no solo CCTV) en API y docs.
7. Planificar **particionado/archivado** para tablas de alto volumen (cuando aplique).

Ninguno de estos ajustes exige rehacer F0: se construyen encima. F1 (seguridad) puede
iniciarse en paralelo a formalizar estas decisiones de diseño.
