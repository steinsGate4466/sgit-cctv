# SGIT-CCTV · Esqueleto de bloques

Aceros Arequipa · Planta Pisco · **Laminación: Trenes 1, 2 y 3**

Este documento es el mapa. Cada bloque se entrega con su script de PowerShell,
sus pruebas y su verificación. Un bloque no se da por cerrado hasta que está
publicado y funcionando en producción.

---

## Hecho y entregado

Estado real a 03/08/2026: **27 módulos · 26 pantallas · 20 migraciones ·
359 pruebas automáticas · 5 verificadores.**

| Bloque | Qué resolvió |
|---|---|
| F0–F8 | Base: activos, ubicaciones, incidencias, OM, inventario, preventivo, auditoría, CI/CD |
| 2f-2 | Materiales y herramientas de la OM |
| 3A · 3B | Una sola verdad de tren y etapa · Estado por Tren · filtro en las seis pantallas |
| 3C · 3D | Permiso de altura al abrir la OM · retiro de almacén con firma |
| 3E · 3F | Catálogos editables · cierre con síntoma→causa→acción · rutina por tipo de activo |
| 3G | Soltar el Excel de SAP y que se llene solo |
| 4A · 4B | El ingeniero asigna y el técnico detalla · Mi bandeja |
| **4C** | **Roles que crea el ingeniero + ámbito por tren** |
| **4D** | **Ilustración de planta, iconos vectoriales, celular hasta 320 px, carga por página** |
| **4E** | **Mi tren: la pantalla de Producción, sólo consulta** |
| **4F** | **Bot de Telegram — montado y apagado** |
| **4G · 4H** | **Avisar cuando algo no carga · paginación en Cableado e Inventario** |
| **4K** | **Órdenes paradas, con plazo según lo que esperan** |
| **4S · 4T** | **Seguridad: freno de fuerza bruta, validación real de imágenes, JWT obligatorio · 23 pruebas de permisos** |
| **7** | **Topología y análisis de impacto** |
| **8** | **Monitoreo — montado y apagado, con su agente de planta** |
| **4U · 4V · 4W** | **Sesiones con rotación y detección de reuso · pulido de formularios · ventanas con pie fijo** |
| **4X** | **Token de Telegram configurable desde la pantalla, cifrado, sin tocar Railway** |
| **5a · 5c** | **QR de activo y QR de gabinete, con la información que sirve al llegar** |
| **7B** | **Mapa de la red dibujado, ordenado por saltos hasta el grabador** |
| **4Y** | **Fin de la página en blanco: red de seguridad + recarga automática tras un despliegue** |
| **6a · 6b** | **Rejilla de canales del grabador · buscador "lo que dijo el púlpito"** |

**Incidentes resueltos, cada uno con su guarda automática:** desfase de la base
· respaldos rotos · redirección abierta · expulsión por inactividad · arranque
caído por dependencia sin declarar · tablero en 400 por filtro anidado ·
historial de migraciones perdido · «Mi tren» apuntando a una ruta inexistente.

Guardas que corren en la CI y antes de cada push (`npm run verificar`):

    verificar:inyeccion    dependencias declaradas en su módulo
    verificar:filtros      filtros de Prisma anidados por error
    verificar:migraciones  esquema contra migraciones, sin base de datos
    verificar:bd           la base real contra schema.prisma
    (+ verificador de rutas frontend→backend)

---

## Lo que falta, por orden de lo que cambia en planta

### Corto — se puede hacer ya

| | Qué | Por qué importa | Bloquea |
|---|---|---|---|
| **1** | **Conectar los 3 avisos que ya están escritos**: OM en espera, incidencia crítica y resumen diario. Las plantillas existen y están probadas; falta el enganche y un temporizador | Hoy sólo avisan el cierre y la asignación. Lo que más valor tiene —"esta orden lleva 23 días parada"— está escrito y sin usar | Nada |
| **2** | **Sesiones y freno en base de datos** | El freno de fuerza bruta se borra en cada despliegue, y cerrar sesión no invalida el token: robado, sigue valiendo | Nada. Una migración para las dos cosas |
| **3** | **Ámbito en las rutas por identificador** | Con sesión y permiso, un usuario del Tren 2 puede pedir la foto de un equipo del Tren 1 | Nada |
| **4** | **Bloque 9 · Campañas de mapeo** | "Estas 300 cámaras hay que levantarlas": repartir, seguir el avance, cerrar. Es el modelo de tercería que quiere el ingeniero | Nada |
| **5** | **Bloque 5b · Que el QR abra una OM de un toque** | El QR ya muestra la ficha; falta que desde ahí se abra la orden sin teclear nada | Nada |

### Esperando a alguien

| | Qué | Espera |
|---|---|---|
| **4F encendido** | Crear el bot y poner el token | Visto bueno de TI |
| **8 encendido** | Instalar el agente en una PC de planta | Visto bueno de TI |
| **3G-bis** | Mapeo manual de columnas del Excel | El exporte real de SAP del ingeniero |
| **4C tercería** | Que el contratista vea sólo lo suyo | Decidir el modelo con el ingeniero |

### Deuda anotada, no urgente

- **92 `catch(() => [])`** en el frontend. Mitigado en 4G —ahora se avisa— pero
  cada pantalla sigue enseñando lista vacía en vez de decir qué pasó.
- **19 `@Body() dto: any`**: con `any`, la validación global no valida nada.
- **NestJS 11**: 25 alertas de dependencias, casi todas de desarrollo. Va como
  bloque propio con su rama, no entre entregas diarias.
- **Rediseño de tableros por público** (Jefe / ingeniero / Producción): hoy hay
  un solo tablero para tres personas distintas.
- Rotar la contraseña de Postgres y el `JWT_SECRET` que salió en una captura.

---

# 4F · Bot de Telegram

## ¿Se puede? Sí, y sin abrir un solo puerto

La duda razonable es de red, no de programación. La respuesta corta: **no hace
falta tocar el firewall de planta**.

- El bot **no recibe conexiones**. El backend abre una conexión **saliente**
  HTTPS (443) contra `api.telegram.org` y envía el mensaje. Es tráfico de
  salida, igual que cuando el servidor consulta cualquier API.
- No se usan *webhooks*. Un webhook obligaría a exponer una URL pública para que
  Telegram entre — no hace falta, porque este bot **sólo avisa**, no atiende
  comandos. Menos superficie, menos que asegurar.
- El backend ya está en Railway, con salida a internet. No se conecta nada nuevo
  a la red industrial.

## Quién recibe, y por qué esa es LA decisión

Se estudió primero un grupo de Telegram por tren, con Producción dentro. Se
descartó, y el motivo vale escribirlo porque se aplica a cualquier sistema de
avisos:

> **Una alerta sólo le sirve a quien tiene que actuar.**

Producción no actúa sobre una OM. Mandarles cada cierre no les da información
útil: les da ruido. Y el ruido tiene una consecuencia concreta y conocida —
**silencian el grupo**, y el día que llegue algo importante tampoco lo verán.
Un canal de avisos que la gente silencia no está degradado: está muerto.

Reciben, entonces, los dos que actúan:

| Quién | Qué recibe | Por qué |
|---|---|---|
| **Ingeniero** | Cierre de OM · OM puesta EN ESPERA · incidencia ALTA/CRÍTICA · resumen diario de vencidas y de repuestos bajo mínimo | Es quien decide y quien firma |
| **Técnico de red** | "Te asignaron esta OM" · "Esta orden lleva N días sin detallar" | Está en campo, no mirando el sistema. El aviso le llega donde está |

**Consecuencia práctica: son 3 o 4 personas, no quince.** Y eso da la vuelta a
la decisión anterior:

- **Chat privado, no grupo.** Telegram exige que cada persona le escriba
  `/start` al bot antes de que el bot pueda escribirle — un bot nunca inicia
  conversación. Con quince personas eso es perseguir a gente para que haga un
  paso que no entiende; con cuatro, es un minuto. A cambio, cada uno recibe
  sólo lo suyo.
- **4F-1 deja de depender de 4C y 4E.** Si nadie de Producción recibe, no hace
  falta el motor de permisos por ámbito para elegir destinatario. El bloque se
  adelanta.

## Lo que NO se va a hacer: un bot de consulta

Se planteó un bot al que cualquiera le pregunte "¿cómo va la cámara X?".
Se descarta:

- Obliga al usuario a **aprender comandos**. Un enlace a una pantalla es un
  toque; `/estado CAM-T2-014` es algo que hay que recordar y escribir bien.
- Duplica en un chat lo que ya hace una pantalla, y a partir de ahí hay dos
  sitios donde arreglar cada cosa.
- Necesita saber **quién pregunta** para no enseñar de más, lo que reobliga a
  ligar cada `chat_id` con un usuario del sistema — toda la fricción del
  registro, otra vez, y ahora sin poder evitarla.

Lo que Producción quiere de verdad —"¿cuándo vuelve mi cámara?"— se responde
con **4E**: una pantalla con el estado de SU tren.

## 4F-2 · Lo único que sí tiene sentido mandarle a Producción

Un **resumen de turno**: un mensaje al día, al empezar el turno, a un grupo por
tren.

> **Tren 2 · 07:00** — 14 cámaras. 1 fuera de servicio: CAM-T2-014 (zona de
> enfriamiento), OM abierta desde ayer, esperando repuesto. Resto operativo.

Sin comandos, sin aprender nada, y **no se puede convertir en ruido porque es
uno al día**. Va con `disable_notification` para que no suene a las siete de la
mañana. Esto sí depende de 4E, porque necesita el ámbito por tren.

## Qué manda, y cuándo

Se dispara en las transiciones que ya existen en `maintenance.service.ts`:

| Evento | Mensaje |
|---|---|
| El técnico **cierra** la OM | Qué se cerró, en qué equipo, síntoma → causa → acción, tiempo empleado, materiales usados |
| El técnico la pone **EN ESPERA** | Qué la bloquea (repuesto, permiso, parada de línea) y desde cuándo — esto es lo que más valor tiene: una OM parada y callada es una OM olvidada |
| Incidencia **ALTA o CRÍTICA** nueva | Equipo, tren, etapa y quién la reportó |
| OM **vencida** | Resumen diario, no uno por orden |
| Repuesto **bajo mínimo** | Resumen diario |

## El informe no sale por Telegram

Va un resumen y un enlace al sistema. El PDF con fotos de planta se abre
entrando con usuario. Motivo: un archivo subido a Telegram queda alojado en sus
servidores, fuera del control de Aceros Arequipa, y cualquiera lo reenvía con
dos toques. El resumen dice lo que hace falta para decidir; el detalle vive
donde está la trazabilidad.

## Lo que hay que hacer bien

**Cerrar una OM NO puede fallar porque Telegram esté caído.**
Esta es la regla que manda sobre el diseño. Si el envío fuera parte de la
transacción de cierre, un corte de internet dejaría al técnico sin poder cerrar
su orden a las 11 de la noche en planta. Se resuelve con **bandeja de salida**:

1. Al cerrar, se guarda una fila en `notificacion_saliente` dentro de la misma
   transacción. Esto no puede fallar: es la misma base.
2. Un proceso aparte la lee, la envía y la marca como enviada.
3. Si falla, reintenta con espera creciente (1 min, 5, 15, 60) y a la quinta la
   marca como fallida y la deja visible en el sistema.

Nadie se entera de que Telegram estaba caído salvo el que mire la bandeja.

**Límites de Telegram.** 30 mensajes por segundo en total y ~20 por minuto en un
mismo grupo. Con cuatro destinatarios no se rozan, pero el proceso de envío
respeta el `retry_after` que devuelve Telegram cuando avisa — ignorarlo hace que
el bot acabe bloqueado temporalmente.

**El token es una credencial.** Va en variable de entorno `TELEGRAM_BOT_TOKEN`,
nunca en el repositorio. Quien tenga ese token puede escribir como el bot. Si se
filtra, se revoca con `/revoke` en @BotFather y se genera otro.

**Silenciable por tipo.** Lo crítico va con sonido; los resúmenes diarios, con
`disable_notification: true`.

## La pregunta que decide el bloque

**¿Telegram está permitido en la empresa?** Si TI no lo autoriza, el mismo
diseño sirve tal cual cambiando el canal de salida: correo corporativo o Teams.
La bandeja de salida, los eventos y las plantillas no cambian; sólo cambia quién
entrega. Por eso el cliente de Telegram es **un solo archivo**, y todo lo demás
no sabe que Telegram existe.

## Piezas

```
backend/prisma/migrations/…_notificacion_saliente
backend/src/modules/notificaciones/
  ├─ notificaciones.module.ts
  ├─ bandeja-salida.service.ts     ← guarda; nunca falla el cierre
  ├─ telegram.client.ts            ← el ÚNICO que habla con api.telegram.org
  ├─ despachador.service.ts        ← lee, envía, reintenta
  └─ plantillas.ts                 ← el texto de cada evento (probado aparte)
backend/src/modules/maintenance/   ← engancha cierre, EN_ESPERA y asignación
frontend/src/pages/Notificaciones  ← qué se envió, qué falló, reintentar
```

Las plantillas van en su propio archivo y con pruebas: el texto de una alerta se
lee a las tres de la mañana, medio dormido, en una pantalla de 5 pulgadas. Es
contenido, no decoración.

---

## Bloque 100 · El candado de instancia ✅

**Qué cierra:** con dos réplicas en Railway, las tres tareas programadas del
backend se ejecutaban dos veces — órdenes preventivas duplicadas, avisos de
Telegram duplicados y dos resúmenes cada mañana. Y el resumen fallaba también
con una sola instancia: un despliegue después de las 7 lo mandaba otra vez.

| | |
|---|---|
| `src/common/candado-de-instancia.ts` | NUEVO · `pg_try_advisory_xact_lock` dentro de `$transaction` |
| `preventive.scheduler.ts` | El tick entero dentro del candado, con la comprobación DENTRO |
| `resumen.scheduler.ts` | Candado + marcador persistido en `ConfiguracionSistema` |
| `despachador.service.ts` | Candado en *leer y reservar*; el envío a Telegram queda fuera |
| `scripts/verificar-planificadores.js` | NUEVO · verificador 18 |
| `scripts/verificar-ci.js` | El número de verificadores se cuenta, ya no está a mano |
| `test/candado-de-instancia.spec.ts` | NUEVO · 14 pruebas |

**Migraciones: ninguna.** **Frontend: sin tocar.**

Cadena: typecheck ✅ · 18 verificadores ✅ · 1.251 pruebas ✅ · build ✅

Detalle completo en `docs/BLOQUE_100_CANDADO_DE_INSTANCIA.md`.

---

## Bloque 101 · El techo que se dice ✅

**Qué cierra:** `hojaOrdenes` y `hojaIncidencias` de la exportación no tenían
`where` NI `take` — se traían todas las filas que existen para armar un Excel
en memoria. Segunda mitad del hallazgo S-03.

**Y lo que NO se hizo, a propósito:** poner `take` a las 183 consultas sin tope.
Hay tres familias y se tratan al revés — un `take` sobre un CÁLCULO hace que el
número mienta.

| | |
|---|---|
| `src/common/tope-de-filas.ts` | NUEVO · el tope y el aviso de recorte |
| `modules/exportacion/exportacion.service.ts` | tope + `count` + aviso en la hoja y en la portada |
| `scripts/verificar-topes.js` | NUEVO · verificador 19 |
| `test/tope-de-filas.spec.ts` | NUEVO · 12 pruebas, cuatro ABREN el Excel |
| `package.json` | el verificador nuevo al agregado (19) |

**Migraciones: ninguna.** **Frontend: sin tocar.**

Cadena: typecheck ✅ · 19 verificadores ✅ · 1.263 pruebas ✅ · build ✅

Detalle en `docs/BLOQUE_101_EL_TECHO_QUE_SE_DICE.md`.

---

## Bloque 102 · La cámara que existía en una pantalla y no en la otra ✅

**Qué cierra:** «Mis cámaras» decía que el tren no tenía cámaras mientras «Por
tren» enseñaba dos. La consulta pedía `location` (el objeto) y no `locationId`
(la clave foránea); con `select:` Prisma trae sólo lo pedido, el recorrido del
árbol no arrancaba y el filtro por tren descartaba todas las cámaras.

**Lo encontró el usuario abriendo el software.**

| | |
|---|---|
| `src/common/plant-context.ts` | `locationId` pasa a OBLIGATORIO (era `?`) |
| `modules/dashboard/camaras-caidas.service.ts` | `locationId: true` en la consulta |
| 12 servicios | fuera los **19 `as any`** que apagaban al compilador |
| `scripts/verificar-contexto-planta.js` | NUEVO · verificador 20 |
| `test/contexto-de-planta-locationid.spec.ts` | NUEVO · 7 pruebas |
| `package.json` | el verificador nuevo al agregado (20) |

**Migraciones: ninguna.** **Frontend: sin tocar.**

Cadena: typecheck ✅ · 20 verificadores ✅ · 1.270 pruebas ✅ · build ✅

Detalle en `docs/BLOQUE_102_LA_CAMARA_QUE_NO_EXISTIA.md`.

**Anotado, no cerrado:** la pantalla de Usuarios no avisa de que un usuario sin
tren asignado ve la planta entera.

---

## Bloque 103 · El tren que no viajaba, y el login que culpaba a la contraseña ✅

**Los dos los encontró el usuario abriendo el software.** Ninguno rompe nada.

**103-A ·** En «Por tren» se elegía el Tren 2, se pulsaba «Qué está fallando» y
la pantalla se abría en el **Tren 1**: los enlaces no llevaban el tren, y el
destino arranca con `t[0].code`. Debajo había un segundo fallo —«Por tren»
guarda la SIGLA (`T2`) y las otras el CÓDIGO (`AASA-PISCO-T2`)—, así que se
arregla en el mecanismo y no en el enlace.

**103-B ·** Sin red, el login decía *«Credenciales incorrectas. Te quedan 4
intento(s)»* con la contraseña bien escrita — y **gastaba un intento que el
servidor nunca recibió**. `avisos.ts` distingue ese caso desde el bloque 67; el
login era el único sitio que no lo usaba.

| | |
|---|---|
| `src/trenes.ts` | NUEVO · qué es un tren y cómo se comparan dos (regla del b. 42) |
| `pages/PorTren.tsx` | los enlaces llevan `?tren=` |
| `pages/MisCamaras.tsx` · `pages/MisActivos.tsx` | resuelven el tren con `elegirTren()` |
| `pages/Login.tsx` | «sin respuesta» antes del contador · sólo el 401 gasta intento |
| `scripts/verificar-trenes.cjs` | NUEVO · verificador 19 del frontend |
| `scripts/verificar-login-red.cjs` | NUEVO · verificador 20 del frontend |

**Migraciones: ninguna.** **Backend: sin tocar.**

Cadena: typecheck ✅ · lint 0 avisos ✅ · 20 verificadores ✅ ·
**build NO se pudo correr** en Linux (`node_modules` trae el binario de rolldown
de Windows; no se reinstaló a propósito, para no romper el build del usuario).

Detalle en `docs/BLOQUE_103_EL_TREN_QUE_NO_VIAJABA.md`.

**Anotado, no cerrado:** «De qué depende» sigue sin filtrar por tren · y la
pantalla de Usuarios dice «Todos» a un rol sectorizado sin tren asignado,
cuando el servidor resuelve `NINGUNO` — afirma lo contrario de la verdad.

---

## Bloque 104 · Nadie se queda fuera, y nadie se escuda en el bloqueo ✅

El bloqueo por cuenta vivía en un `Map` en memoria y **el contador NO caducaba**:
no eran «5 fallos seguidos», eran 5 fallos desde la última vez que la persona
entró bien. Dos errores el lunes con guantes y tres el viernes: bloqueado.
Además, con dos réplicas cada una contaba por su lado y un despliegue lo borraba.

Ahora vive en `intentos_acceso` con ventana de 15 min y castigo **fijo** de 15
—**no escalonado**, decisión del usuario: un castigo corto le da al que prueba
contraseñas una ventana barata—. Y el supervisor puede **desbloquear**, con
motivo, auditado. Se audita también el intento DENEGADO.

**Migraciones: ninguna** (se reutiliza la tabla del freno por origen con su
propio prefijo de clave).

Cadena: typecheck ✅ · 16 verificadores ✅ · lint 0 avisos ✅ · 20 verificadores
frontend ✅ · 65 pruebas tocadas ✅. Los dos builds no corren en el entorno del
agente, y el motivo se dice en el documento del bloque.

Detalle en `docs/BLOQUE_104_NADIE_SE_QUEDA_FUERA.md`.

---

## Bloque 105 · Lo que crece se lee por fecha ✅

Preparación del historial de activos. **Seis índices** que faltaban —`WorkOrder`
tenía nueve y ninguno por fecha; `AssetHistory` sólo uno— y el **N+1 del
planificador preventivo**, que hacía una consulta POR ACTIVO vencido: con
cuatrocientos equipos, cuatrocientas idas y vueltas en cada tick.

`AssetHistory` y `StockMovement` quedan exentas del índice por fecha suelto,
**con su motivo medido**: cero consultas sin `assetId`.

| | |
|---|---|
| `20260917000000_indices_de_historial` | NUEVO · 6 índices con los nombres de Prisma |
| `preventive.service.ts` | una consulta para todos, no una por activo |
| `scripts/verificar-indices-de-fecha.js` | NUEVO · verificador 17 del backend |

Cadena: typecheck ✅ · 17 verificadores ✅ · sin desfase de migraciones ✅ ·
preventivo 8/8 ✅ · bloqueo 9/9 ✅.

Detalle en `docs/BLOQUE_105_LO_QUE_CRECE_SE_LEE_POR_FECHA.md`.

**Lo siguiente:** 106 · `EquipoInstalado` y el estado RETIRADO · 107 · pantalla
de Historial y Equipos retirados · 108 · los dos informes PDF · 109 · la red del
activo · 110 · OM multi-equipo · 111 · correo (hoy cero líneas) · 112 · pulido
visual de Producción.

---

## Bloque 106-A · El sitio y el aparato dejan de ser la misma cosa ✅

`Asset` pasa a ser la UBICACIÓN FUNCIONAL y el aparato concreto vive en
`EquipoInstalado` (SAP PM · ISO 14224 niveles 6-9). Cámara nueva con el mismo
rótulo → historial desde cero; el punto conserva el suyo.

**Migración ADITIVA:** una tabla, cero columnas tocadas, **ninguna de las 102
llamadas a `prisma.asset` cambia**. Partir la tabla habría sido 76 archivos y
42 pantallas.

| | |
|---|---|
| `EquipoInstalado` | NUEVO · con índice único PARCIAL: un solo aparato puesto a la vez |
| relleno de la migración | cada sitio estrena su aparato actual, con `desdeEsEstimado` cuando la fecha no se sabía |
| `scripts/verificar-esquema.js` | NUEVO · verificador 18 — hace lo que `prisma validate` cuando no hay red |
| `scripts/verificar-migraciones.js` | aprende a tolerar índices parciales |

Cadena: esquema ✅ · relaciones ✅ (137 FK) · migraciones sin desfase ✅ ·
18 verificadores ✅ · typecheck ✅ · CI ✅.

**106-B queda pendiente a propósito:** `prisma generate` no corre en el entorno
del agente, así que el servicio y la pantalla no se pueden compilar aquí.
Un comando del usuario lo desbloquea.

---

## Bloque 106-B · Poner y quitar el aparato ✅

**Detalle completo:** `docs/BLOQUE_106B_PONER_Y_QUITAR_EL_APARATO.md`

El 106-A creó la tabla; esto la llena y la lee. Servicio, tres endpoints con
sus DTO, y el apartado «Aparato instalado» en la ficha del activo — **antes**
del historial de averías, porque lo primero que hay que saber al mirar tres
fallas seguidas es si le pasaron al mismo aparato o a tres cámaras distintas.

**Poner y quitar va con `asset.update`, no con firma de supervisor**: cambiar
la cámara es el trabajo del técnico un martes por la tarde, y exigir firma sólo
conseguiría que no se registre. CORREGIR una entrada ya cerrada sí es del
supervisor —eso reescribe el pasado— y el intento denegado también se audita.

Motivo obligatorio para desplazar al anterior, fechas futuras y cruzadas
rechazadas, retirar sin reponer, las dos escrituras en una transacción, y **ni
un `delete`**: esta tabla ES el informe de reemplazo.

16 pruebas, todas de las puertas. **Desbloquea el bloque 108.**

---

## Bloque 108 · ¿Hay que cambiar este equipo? ✅

**Detalle completo:** `docs/BLOQUE_108_HAY_QUE_CAMBIAR_ESTE_EQUIPO.md`

Las SEÑALES de reincidencia ya existían desde el bloque 78 y el informe de
ficha ya las imprimía. Lo que no existía es **el veredicto**: la frase que se
lleva a una reunión.

`veredicto-reemplazo.ts` — función pura, 10 pruebas. El ORDEN es la decisión:
(1) si fallan los vecinos, manda eso aunque haya diez órdenes, porque cambiar
la cámara tiraría una cámara buena; (2) **si las fallas son del aparato
ANTERIOR no cuentan contra el actual** —aquí paga el 106—; (3) sólo entonces se
propone el reemplazo, avisando de que si el punto ya consumió varios aparatos
el problema es del SITIO y no del modelo.

PDF con el veredicto en la primera página y los números detrás para poder
comprobarlo. **Sin costes**: no existe el campo en ningún modelo e inventarlo
para una reunión de presupuesto no se hace. El argumento que sí hay, destacado:
**los minutos que el púlpito estuvo sin vista**.

**Una sola versión, no dos:** se comprobó qué lleva dentro y no hay ni una
contraseña, ni una IP de gestión, ni un coste. El control está en quién
descarga y de qué tren.

Y otro agujero de `verificar:clases` cerrado: las clases guardadas en una tabla
(`{ clase: 'card aviso' }`) no las veía ningún barrido.

---

## Bloque 107 · Lo que salió de planta sigue contando ✅

**Detalle completo:** `docs/BLOQUE_107_LO_QUE_SALIO_DE_PLANTA.md`

Se midió primero: `GET /assets/:id/historial`, `HistorialActivo.tsx` y
`GET /assets/reincidentes` **ya existían**. Faltaban tres cosas, y son las tres
que se hicieron.

1. **`GET /assets/retirados` + pantalla «Equipos retirados».** Lo que pidió el
   usuario en vez de un botón de borrado masivo. Ficha, fecha de salida, quién
   firmó la baja (sale de la auditoría, no de un campo duplicado) y la última
   orden con su causa. Una fecha que no se sabe se marca **aproximada**. Tres
   consultas, ningún bucle, `take` 200 con su `count`. **Aquí no se borra
   nada:** la purga sigue en Limpieza con su permiso propio.

2. **El historial se abre a `activos.mirar`.** Estaba cerrado con `asset.read`,
   así que el técnico que va a intervenir no podía verlo. Se comprobó ANTES que
   la respuesta no lleva ni una credencial ni una IP de gestión.

3. **El N+1 más caro del proyecto.** `reincidentes()` llamaba a `delActivo`
   —seis consultas— dentro de un `for` con `await`: con 150 candidatos son 900
   consultas EN FILA, y se dispara al abrir «Avance del mapeo». Ahora van de
   cinco en cinco, **sin cambiar un solo resultado** (se conserva el orden de
   entrada porque el `sort` de después es estable). Sigue siendo la consulta
   más cara: arreglarla del todo pide agregados, y eso es un bloque propio.

---

## Bloque 113 · «Cómo van las OM de mi tren» — la pantalla de Producción ✅

Pedido del usuario: *«que el supervisor pueda ver cómo van las OM de ese tren»*
y *«en qué van mis técnicos, si están por acabar o de repente ni siquiera han
empezado»*.

### Lo que YA existe (medido, no supuesto)

| | |
|---|---|
| `GET /maintenance` | `@RequireAlguno('wo.read', 'om.mirar')` — Producción ya entra |
| el recorte por tren | lo hace el SERVIDOR con `filtroConAmbito` |
| rutas por id | `@AmbitoDe('workOrder')`, y responde 404, no 403 |
| `WorkOrder.progressPct` | avance declarado 0-100 |
| `WorkOrderProgress` | la SERIE: pct, motivo, nota, quién y cuándo |
| `detailedAt` | si el técnico detalló o **ni ha empezado** |

**El dato está entero y el permiso también.** Lo que falta es la PANTALLA:
`Maintenance.tsx` son 41 KB para el ingeniero —alta completa, asignar,
materiales, cerrar— y Producción sólo necesita leer.

### Lo que se construye

Una pantalla de **sólo lectura**, acotada a su tren, con el avance grande y
tres estados que se leen de un vistazo: **sin empezar · en curso · por acabar**.
Cada fila dice quién la tiene y de cuándo es el último avance.

### Y el «tiempo real», decidido

**NO se usa WebSocket.** Tres motivos, y los tres son de planta:

1. Con dos réplicas en Railway un socket exige afinidad de sesión o un bus
   (Redis): infraestructura nueva, y eso lo decide el usuario.
2. El púlpito deja la pantalla abierta ocho horas. Un socket que se cae y no
   reconecta es PEOR que un refresco: se queda congelado y nadie se entera.
3. Nadie necesita un segundo de latencia para saber cómo va una orden. Necesita
   saber que **lo que ve es de hace menos de un minuto**.

Se hace con **refresco corto y honesto**: 20-30 s, apagado mientras la pestaña
está oculta (`visibilitychange`, como el resto del sistema desde el bloque 42),
y **con la edad del dato escrita en pantalla** — `useEdadDelDato` ya lo hace en
«Mis cámaras». Con el `RitmoGuard` en 600/min, tres peticiones por minuto no
rozan el cupo.

*Si algún día hace falta empuje de verdad: **SSE antes que WebSocket** —
unidireccional, sobre HTTP, atraviesa los proxies de planta y reconecta solo.
Con dos réplicas seguiría necesitando un bus, y eso se declara antes de
empezar, no después.*

**Lo que se construyó (bloque 113):** `avance.ts` —función pura, 13 pruebas—
que traduce el avance a cinco estados, con `EN_ESPERA` mandando sobre el
porcentaje; `GET /work-orders/tablero`, endpoint propio para no arrastrar los
catorce filtros de `findAll` en un refresco de 25 s; y `TableroOm.tsx`, seis
columnas de sólo lectura con la edad del dato en segundos.

**Y el verificador que tenía un agujero:** `verificar:clases` no miraba el
primer literal de un ternario, así que dejó pasar una clase inexistente escrita
en esta misma pantalla. Cerrado y probado reintroduciendo el fallo.

---

## Bloque 115 · La respuesta que llegaba tarde ✅

**Detalle completo:** `docs/BLOQUE_115_LA_RESPUESTA_QUE_LLEGABA_TARDE.md`
**De dónde sale:** `docs/AUDITORIA_BARRIDO_2026-09-17.md`

Once efectos se relanzaban al cambiar un equipo, una orden o un texto de
búsqueda y escribían en pantalla **sin comprobar que su petición siguiera
siendo la buena**. Si la anterior llegaba después, ganaba.

El peor, `HistorialActivo`: se enseña ANTES de intervenir, así que una carrera
ahí **manda a un técnico a campo con el historial de otro equipo**. `AssetScan`
lo mismo con el QR en la mano.

No lo cazaba nada: compila, el lint está contento y en local el servidor
responde en 2 ms. **Sólo aparece con la red de planta.**

Arreglado con la guardia `let vivo` que el proyecto ya usaba, en 10 archivos.
`AuthContext` ya estaba bien con una guardia llamada `vigente`, así que el
verificador acepta los tres nombres en uso en vez de obligar a reescribirlo.

Y **`verificar:carreras`** (verificador 21 del frontend) para que no vuelva a
entrar, probado reintroduciendo el fallo. De paso: estado vacío en las tablas
de `Roles` y `Rotulado`, y la fila de `Assets` pulsable con el teclado.

---

## Lo que queda ⏳

| Bloque | Qué es | Bloqueado por |
|---|---|---|
| **109** | Campos de red del activo: prefijo `/16` `/24`, VLAN, puerta de enlace + informe de estandarización de switches | — |
| **110** | OM multiequipo: reportado ≠ intervenido | — |
| **111** | Módulo de correo (hoy cero líneas) | — |
| **112** | Pulido visual de Producción, fechas de registro en todas partes, tableros por audiencia | — |
| **114** | Reincidencia por agregados, para quitar del todo la consulta más cara | — |
| **116** | Paleta unificada: 86 colores escritos a mano en estilos en línea, con cuatro rojos distintos para decir lo mismo + verificador | — |
