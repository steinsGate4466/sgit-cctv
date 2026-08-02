# SGIT-CCTV · Esqueleto de bloques

Aceros Arequipa · Planta Pisco · **Laminación: Trenes 1, 2 y 3**

Este documento es el mapa. Cada bloque se entrega con su script de PowerShell,
sus pruebas y su verificación. Un bloque no se da por cerrado hasta que está
publicado y funcionando en producción.

---

## Terminado y en producción

| Bloque | Qué resolvió |
|---|---|
| F0–F8 | Base: activos, ubicaciones, incidencias, OM, inventario, preventivo, auditoría, CI/CD |
| 2f-2 | Materiales y herramientas de la OM |
| 3A | Una sola verdad de tren y etapa (`plant-context`) + tablero de infraestructura |
| 3B-1 / 3B-2 | Estado por Tren + filtro de tren y etapa en las seis pantallas |
| 3C | Permiso de acceso al abrir la OM · OM desde tramo fuera de norma |
| 3D | Retiro de almacén desde la OM |
| 3E | Catálogos editables: causas, síntomas, acciones, motivos |
| 3F-1 / 3F-2 | Cierre y avance con catálogo · rutina preventiva por tipo de activo |
| 3G | Soltar el Excel de SAP en almacén y que se llene solo |
| 4A | El ingeniero asigna, el técnico de red detalla |
| 4B | Mi bandeja: lo que espera una decisión hoy |
| 4D-1 | Acceso con marca en celular · ajuste de pantallas hasta 320 px |

**Incidentes resueltos:** desfase de la base (30/07) · respaldos rotos (pg_dump
16 contra servidor 18.4) · redirección abierta en el acceso · expulsión inmediata
por inactividad · arranque caído por dependencia sin declarar (01/08) · historial
de migraciones perdido en la base local (02/08) · tablero en 400 por un filtro de
Prisma anidado (02/08).

Cada uno dejó una **guarda automática** que lo caza en un segundo, sin levantar
la aplicación. Están todas en `docs/INCIDENTES_Y_GUARDAS.md` y corren en la CI:

    npm run verificar:inyeccion   dependencias declaradas en su módulo
    npm run verificar:filtros     filtros de Prisma anidados por error
    npm run verificar:bd          la base real contra schema.prisma
    node scripts/historial-migraciones.js   qué migraciones cree tener la base

---

## En cola

| Bloque | Qué resuelve | Depende de |
|---|---|---|
| **4C** | Tercería: el contratista ve **sólo sus** órdenes | Permisos por ámbito |
| **4E** | Producción ve el estado de **su** tren | Mismo motor que 4C |
| **4F-1** | **Bot de Telegram: avisa a quien tiene que actuar** | Nada. Se puede hacer ya |
| **4F-2** | Resumen de turno para Producción, un mensaje al día | 4E |
| **4D-2** | Rediseño de tableros · carga por página (bajar los 887 kB) | Que dejen de cambiar los campos |
| **3G-bis** | Mapeo manual de columnas del Excel de SAP | El exporte real del ingeniero |
| 5 | QR de gabinete | — |
| 6 | Mapa de canales del NVR | — |
| 7 | Topología de red | — |
| 8 | Ping a NVR y cámaras | Salida desde Railway a la red de planta |
| 9 | Campañas de mapeo | — |

**4C y 4E van juntos**: comparten el mismo motor de permisos por ámbito.
**4F-1 ya no depende de ellos** (ver abajo el porqué): si sólo reciben el
ingeniero y el técnico de red, no hace falta el motor de ámbito. Se puede
adelantar en cuanto TI autorice Telegram.

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
