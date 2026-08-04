# SGIT-CCTV — Plan maestro de bloques

**03 de agosto de 2026** · Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)

Este documento reemplaza como referencia a `ESQUELETO_DE_BLOQUES.md`. Contiene
**todo lo contemplado hasta hoy**: lo hecho, lo pendiente, el análisis de
seguridad, y el orden de trabajo con su justificación.

**El criterio que ordena todo:** cuánto código en marcha toca cada bloque.
El software está a punto de estrenarse. Un sistema en vísperas no se rompe por
lo que le añades — se rompe por lo que le mueves.

---

## 1. Estado actual

**27 módulos · 26 pantallas · 21 migraciones · 375 pruebas · 6 verificadores.**

| Bloque | Qué resolvió |
|---|---|
| F0–F8 | Activos, ubicaciones, incidencias, OM, inventario, preventivo, auditoría, CI/CD |
| 2f-2 | Materiales y herramientas de la OM |
| 3A · 3B | Una sola verdad de tren y etapa · Estado por Tren · filtro en seis pantallas |
| 3C · 3D | Permiso de altura al abrir la OM · retiro de almacén con firma |
| 3E · 3F | Catálogos editables · cierre con síntoma→causa→acción · rutina por tipo |
| 3G | Soltar el Excel de SAP y que se llene solo |
| 4A · 4B | El ingeniero asigna y el técnico detalla · Mi bandeja |
| 4C · 4D · 4E | Roles editables + ámbito · celular hasta 320 px · Mi tren |
| 4F · 4X | Telegram montado y apagado · token configurable desde pantalla, cifrado |
| 4G · 4H · 4K | Avisar cuando algo no carga · paginación · órdenes paradas |
| 4S · 4T · 4U | Freno de fuerza bruta · 23 pruebas de permisos · sesiones con rotación |
| 4V · 4W | Pulido de formularios · ventanas con pie fijo |
| 4Y | Fin de la página en blanco: red de seguridad + recarga tras despliegue |
| 5a · 5c | QR de activo y QR de gabinete |
| 6a · 6b | Rejilla de canales del grabador · buscador "lo que dijo el púlpito" |
| 7 · 7B | Topología, análisis de impacto y mapa dibujado |
| 8 | Monitoreo — montado y apagado, con su agente de planta |

---

## 2. Análisis de seguridad — OWASP Top 10:2025

Contrastado contra la lista publicada por OWASP en 2025, no contra la de 2021.
Dos categorías son nuevas este año y las dos nos tocan de lleno.

| | Riesgo | Cómo estamos | Qué falta |
|---|---|---|---|
| **A01** | Broken Access Control *(nº 1)* | Guards + catálogo de permisos + 23 pruebas | **El ámbito NO se aplica en las rutas por identificador.** Un usuario del Tren 2 puede pedir la foto de un equipo del Tren 1. Esto es literalmente A01 |
| **A02** | Security Misconfiguration | Cabeceras puestas a mano, CORS falla en cerrado en producción | Falta **CSP**. Y **los secretos filtrados siguen sin rotar** |
| **A03** | Software Supply Chain *(nuevo)* | Versiones fijadas, sin subidas mayores | **La CI no revisa dependencias.** Falta un paso que *informe* (nunca `--force`) |
| **A04** | Cryptographic Failures | Credenciales CCTV cifradas, con pruebas | `JWT_SECRET` expuesto en una captura — **pendiente de rotar** |
| **A05** | Injection | Prisma parametriza todo; SQL crudo sólo en migraciones | Nada urgente |
| **A06** | Insecure Design | — | **Sólo `Asset` tiene borrado lógico.** Los otros 51 modelos borran de verdad, y hay **36 `onDelete: Cascade`** |
| **A07** | Authentication Failures | Sesiones con `jti`, rotación, detección de reuso, freno de fuerza bruta, PIN de campo | Sin 2FA para roles con poder. Sin vinculación de dispositivo (crítico con datos móviles) |
| **A08** | Data/Software Integrity | Despliegue desde GitHub con CI verde obligatoria | Nada urgente |
| **A09** | Logging & Alerting Failures | Auditoría completa y consultable | **No hay alertas.** Nadie se entera de 50 intentos fallidos ni de un borrado masivo. Telegram ya está montado: es barato |
| **A10** | Mishandling of Exceptional Conditions *(nuevo)* | 4Y ya cerró la página en blanco | **92 `catch(() => [])`** que convierten un fallo en "no hay datos". Y el respaldo que "termina bien" sin hacer nada si falta el secreto |

**Lectura de conjunto:** la categoría A10 es nueva en 2025 y describe con
precisión la familia de fallos que llevamos semanas persiguiendo. No es
casualidad: un sistema que disimula sus errores es un sistema en el que nadie
puede confiar, y eso ahora tiene nombre propio en el estándar.

---

## 3. Respaldos: triggers, Excel, o qué

### Lo que corrige tu razonamiento

*"Borrar se puede anular con los roles y buenas prácticas."*

Los roles controlan **quién** borra. No hacen el borrado **reversible**. Y el
dato es peor de lo que parece:

- **Sólo `Asset` tiene `deletedAt`.** Los otros **51 modelos borran físicamente**.
- Hay **36 relaciones con `onDelete: Cascade`**. Borrar **un** gabinete o **una**
  ubicación se lleva por delante, en silencio, todo lo que cuelga.

Con roles bien puestos eso pasa poco. Pero cuando pasa, hoy no hay vuelta atrás
sin restaurar.

### Lo que te da la razón, y me corrige a mí

Propuse triggers. Repasándolo con este dato en la mano, **tienes razón en no
implementarlos ahora**, por tres motivos:

1. **PITR ya cubre el caso.** Restaura al segundo anterior al borrado. El
   escenario que motivaba los triggers está resuelto sin escribir nada.
2. Lo que añaden los triggers —restaurar 40 filas sin revertirle el trabajo a
   nadie más— es **deseable, no imprescindible**.
3. Meten SQL que Prisma no modela, la semana del estreno. Complejidad mal
   pagada.

**Decisión: los triggers salen del plan corto.** Quedan anotados por si algún
día el volumen de correcciones lo justifica.

### Tu idea del Excel: sí, y así

Es buena, pero conviene venderla por lo que de verdad vale:

**Para lo que sirve muy bien**
- Informes, trabajo sin conexión, compartir con SAP y con el ingeniero Juan.
- Copia legible por una persona, sin `pg_restore` ni conocimientos técnicos.
- **Sobrevive a que Railway desaparezca entero** — igual que el volcado de
  GitHub, pero esta la puede abrir cualquiera.

**Lo que no puede hacer, dicho claro**
- **No reconstruye las relaciones.** Son 52 tablas enlazadas por UUID. Volver a
  subir la hoja de activos no restaura los enlaces de red, ni los canales del
  grabador, ni las órdenes que apuntan a esos activos. Restauras una lista, no
  el sistema.
- **No lleva fotos ni informes PDF.** Y esto es un hueco que ninguno de los dos
  había nombrado: **hoy nadie respalda MinIO.**
- **Telegram admite 50 MB por archivo** para un bot. El Excel cabrá de sobra;
  las fotos no caben nunca.

**Forma concreta que sí funciona:** un libro con **una hoja por tabla,
incluyendo los identificadores**, generado a diario, guardado y enviado a Juan.
La reimportación se ofrece **sólo para catálogos y datos maestros**, donde
volver a subir es seguro. Prometer "restauramos todo desde el Excel" sería una
promesa que no podríamos cumplir.

### El plan de respaldo que queda

| Capa | Cubre | Código |
|---|---|---|
| **Volume backups** (Railway) | Errores de operación, despliegues malos | 0 |
| **PITR** (Railway) | Volver al segundo anterior a un borrado o migración | 0 |
| **`pg_dump`** (GitHub, ya existe) | Que desaparezca el proyecto | 0 |
| **Excel completo** (nuevo) | Copia legible, informes, Juan | Módulo nuevo |
| **MinIO** | **Nada lo cubre hoy** | Pendiente de decidir |

---

## 4. Los bloques

### OLA 0 — Antes de estrenar · **cero código de aplicación**

| # | Bloque | Qué toca | Por qué ahora |
|---|---|---|---|
| **S1** | Rotar `JWT_SECRET` y contraseña de Postgres | Variables de Railway | **Tiene ventana.** Rotar expulsa a todos los que tengan sesión. Hoy no hay nadie: coste cero. En un mes son veinte técnicos a media orden |
| **S2** | Activar Volume Backups (diario + semanal + mensual) | Panel de Railway | 2 minutos |
| **S3** | Activar PITR | Panel de Railway | *"Activarlo hoy no te deja restaurar a ayer."* La ventana empieza al encenderlo. Redespliega Postgres: segundos de corte, irrelevante hoy |
| **S4** | Comprobar el respaldo de GitHub | Mirar Actions | Está diseñado para **no fallar** si falta el secreto. Puede llevar meses sin ejecutarse |
| **S5** | Ensayo de restauración | Script aislado | Un respaldo no probado es un archivo, no un respaldo |

**Nada de esta ola toca una línea del software.**

### OLA 1 — Antes del mapeo · riesgo bajo, todo aditivo

| # | Bloque | Qué toca | Riesgo |
|---|---|---|---|
| **10** | **Exportación completa a Excel** — una hoja por tabla, con identificadores; descarga manual y envío diario a Juan por Telegram | Módulo **nuevo**, sólo lectura | Muy bajo: no modifica nada |
| **11** | **Confirmación con recuento antes de borrar** — *"esto va a borrar 14 cámaras y 3 enlaces"* | Aviso en las pantallas de borrado | Bajo. Ataca los 36 `Cascade` donde duele: antes de pulsar |
| **12** | **Ámbito en rutas por identificador** (A01) | Guard de ámbito | Medio: **cierra un agujero real**. Necesita pruebas de los dos casos |
| **13** | **Alertas de seguridad por Telegram** (A09) — intentos fallidos repetidos, borrados masivos, sesión reusada | Se engancha a lo ya montado | Bajo |
| **14** | **Revisión de dependencias en la CI** (A03) — informa, nunca `--force` | Un paso de CI | Nulo |
| **15** | **CSP** (A02) | Cabecera en `main.ts` | Bajo, pero hay que probar que no rompe el frontend |

### OLA 2 — Con el mapeo en marcha

| # | Bloque | Qué toca | Nota |
|---|---|---|---|
| **9** | **Campañas de mapeo** — repartir zonas, medir avance, revisar antes de dar por buena | Módulo nuevo | Es el control de calidad del mapeo. Contra dato mal cargado, ningún respaldo sirve |
| **16** | **Borrador sin señal** | Formularios | **Sólo se activa cuando falla la subida**: el camino normal no se toca. Con datos móviles y naves metálicas, esto decide si la gente adopta el sistema o vuelve al cuaderno |
| **5b** | **Que el QR abra una OM de un toque** | Pantalla de QR | Aditivo |

### OLA 3 — Con el sistema ya en uso

| # | Bloque | Qué toca | Por qué esperar |
|---|---|---|---|
| **17** | **Vinculación de dispositivo** — móvil nuevo queda pendiente de aprobación | **Auth** | Si sale mal, **nadie entra**. No se toca auth la semana del estreno |
| **18** | **2FA para roles con poder** (`user.manage`, `role.manage`, `credential.read`) | Auth | Igual |
| **19** | **Réplica en planta** — Postgres secundario en la PC del agente | Infraestructura | Depende de TI y de una máquina. Semanas que no controlas |
| **20** | **Respaldo de MinIO** | Decidir primero dónde | Hueco sin cubrir hoy |
| **21** | **Saldar los 92 `catch(() => [])`** (A10) | 92 sitios | Alto volumen, bajo riesgo individual. Poco a poco |

### BLOQUEADOS — esperan una decisión, no trabajo

| # | Bloque | Espera |
|---|---|---|
| **F8-F/G/H** | Ventanas de parada | **De dónde salen las paradas: ¿manual, Producción o SAP?** No existe el modelo. No se implementa sin esa respuesta |
| **3G-bis** | Columnas del Excel de SAP | Un export real |
| **4C-tercería** | Que el contratista vea sólo lo suyo | Definir el modelo con el ingeniero |
| **4F / 8 encendido** | Bot y agente en producción | Visto bueno de TI |

### DESCARTADO POR AHORA

| Bloque | Motivo |
|---|---|
| **Triggers + tablas sombra** | PITR ya cubre el caso que lo motivaba. Añade SQL que Prisma no modela, la semana del estreno. Se reconsidera si el volumen de correcciones lo pide |
| **Frontend en Vercel** | El despachador de Telegram, el resumen de las 07:00 y el sondeo del bot necesitan un proceso vivo. Serverless los mata. Y partir el despliegue obliga a cerrar dos puertas en vez de una |
| **Bloqueo por IP de planta** | Los técnicos usan **datos móviles**: están fuera de la red de planta por definición. El requisito real es *"sólo personas y dispositivos autorizados"* → bloques 17 y 18 |

---

## 5. Resumen para decidir

**Esta semana (Ola 0):** rotar secretos, encender los tres respaldos, ensayo de
restauración. **Cero riesgo, cero código.**

**Antes de mapear (Ola 1):** Excel, confirmación con recuento, ámbito por
identificador, alertas. Todo aditivo.

**Con el mapeo (Ola 2):** campañas, borrador sin señal.

**Después (Ola 3):** dispositivo, 2FA, réplica, MinIO.

Lo más urgente no es lo más grande: es **S1**, porque es la única tarea cuyo
coste sube cada día que pasa.
