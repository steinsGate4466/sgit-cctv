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
