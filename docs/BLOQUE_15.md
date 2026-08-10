# Bloque 15 — Limpieza de datos y «¿desde qué PC?»

**10/08/2026** · SGIT-CCTV · Aceros Arequipa, Planta Pisco, Laminación

Dos cosas que pediste juntas y que resultan ser la misma conversación:
**quién puede borrar** y **desde dónde se hizo cada cosa**.

---

## 15-A · Borrado definitivo — la decisión de diseño

### Son DOS operaciones, no una

| | **Dar de baja** (ya existía) | **Borrar definitivamente** (nuevo) |
|---|---|---|
| Qué es | El equipo existió y salió de planta | El registro **nunca debió existir** |
| Ejemplo | Cámara AA-CAM-014, quemada, retirada | `ewaeweaw`, un duplicado, un código mal tecleado |
| Qué pasa | Sale de los listados, **conserva su historial** | Desaparece de la base, con todo lo que cuelgue |
| Se deshace | Sí | **No** |

Confundirlas es el error caro. Purgar un equipo real borra el historial que
costó meses juntar; dar de baja un registro de pruebas deja basura para
siempre en la lista de «activos en BAJA».

### La regla que separa las dos sin preguntarle a nadie

> **Si el registro tiene rastro de trabajo REAL, no se purga.**

Una orden **cerrada** lleva firma de quien la cerró, materiales retirados del
almacén y a veces un informe en PDF. Eso es un documento con valor de
auditoría. Basura de pruebas nunca tiene órdenes cerradas — por eso esta
regla funciona sola, sin que nadie tenga que juzgar caso por caso.

Lo mismo con las personas: quien **firmó** algo (cerró una orden, autorizó un
trabajo en altura) se **desactiva**, no se borra. Borrarla dejaría documentos
firmados por nadie.

### Las dos llaves

1. El **permiso** (`asset.delete` / `user.manage` / `audit.read`) — lo revisa el guard.
2. El **rol** debe ser **Jefe de Mantenimiento** — lo revisa el servicio.

Un permiso se puede marcar por error al crear un rol. El cargo, no.

### El freno contra el clic

Antes de borrar hay que **escribir el código del activo** (o el correo del
usuario) a mano. Un `confirm()` del navegador se acepta por reflejo; escribir
el código obliga a **mirar cuál** se está borrando. Es exactamente el error
que se quiere evitar: la fila de al lado.

### Detalles que conviene no deshacer

| Decisión | Motivo |
|---|---|
| **Se audita ANTES de borrar** | Si se anotara después y el borrado fallara a medias, quedaría un registro diciendo que se borró algo que sigue ahí |
| **La cascada la hace PostgreSQL** | Las claves foráneas ya declaran `ON DELETE CASCADE`. Borrar a mano tabla por tabla olvidaría alguna el día que se añada una relación |
| **La vista previa cuenta antes de enseñar el botón** | La decisión se toma viendo el precio, no después |
| **La auditoría necesita 90 días de antigüedad** | Poder borrar lo de esta semana convertiría la auditoría en un adorno |
| **Los registros `PURGE_*` nunca se borran** | Esa cadena no se rompe, ni con la propia purga de auditoría |
| **No se borra al único Jefe activo** | Dejaría el sistema sin nadie que pueda administrarlo, y sólo se sale entrando a la base a mano |

### Dónde está

- **Activos → abrir un equipo → 🧹 Borrar definitivamente** (sólo lo ve el Jefe)
- **Sistema → Limpieza de datos** — tres pestañas: activos sospechosos, usuarios, auditoría antigua

La pestaña de **activos sospechosos** lista sólo los que **no tienen ninguna
orden ni incidencia**, ordenados por señales: sin ubicación, sin historial,
código fuera del patrón `AA-XXX-…`. Es una **pista para ordenar la lista**,
no un juicio.

---

## 15-B · IP, MAC y «desde qué PC»

### Lo primero, porque si no habría que inventarlo

> **Un servidor web no puede ver la MAC del cliente. Nunca.**

La MAC es de **capa 2** y muere en el primer salto. Lo que llega al servidor
es la MAC del último router del camino — en planta, la del gateway, **la
misma para todo el mundo**. En Railway, la del balanceador. Cualquier
software que diga «detecté la MAC del usuario» desde un navegador está
mintiendo o está leyendo un dato inútil.

### Entonces, ¿cómo se contesta «desde qué PC»?

Con **tres datos que sí existen**, y cada uno tapa el agujero del anterior:

**1. La IP de origen.** La da la red. Sola dice poco: en planta todos salen
por la misma IP pública. Dentro de la red sí distingue.

**2. El registro de EQUIPOS CONOCIDOS** *(pantalla nueva)*. Una tabla que
mantiene el técnico de redes:

```
10.20.3.14  =  PC Púlpito Tren 2   ·  00:1A:2B:3C:4D:5E  ·  Turno A
```

**La MAC entra AQUÍ, A MANO**, sacada de donde vive de verdad: la reserva
DHCP del router, `show mac address-table` en el switch, o `ipconfig /all` en
el propio equipo. No se detecta: **se declara**. Y por eso es editable desde
la pantalla, como todo lo de planta.

Con esto, la auditoría deja de decir `10.20.3.14` y pasa a decir
**«PC del púlpito del Tren 2»**. Esa es toda la diferencia entre un dato y
una respuesta.

**3. El identificador de aparato.** Un número aleatorio que el navegador
guarda y manda en cada petición (`X-Dispositivo`). Sobrevive al cambio de IP
—un celular que salta de wifi a datos sigue siendo el mismo aparato— y
contesta *«¿fue el mismo aparato de siempre?»*, que es la pregunta real
cuando algo huele mal.

> **No es una medida de seguridad.** Se borra limpiando el navegador y se
> puede falsificar. Es una **pista de auditoría**, y así está tratada en el
> servidor. La vinculación de aparato que sí bloquea es el bloque 13.1.

### La lista de trabajo

La pantalla de Equipos enseña arriba **las IP que han entrado al sistema y no
están registradas**, con cuántos accesos llevan. Se pulsa una y se registra.
Mientras estén ahí, la auditoría sólo puede decir el número.

### Qué se guarda en cada línea de auditoría

| Campo | Qué es |
|---|---|
| `ip` | Ya normalizada (sin el `::ffff:`, sin la cadena de proxies) |
| `dispositivo` | «Chrome en Windows» — el `User-Agent` resumido |
| `dispositivoId` | El identificador de aparato |
| `origen` | **El nombre del equipo, copiado** |

`origen` se **copia, no se enlaza**, y eso es deliberado: si mañana se
renombra el equipo o se quita del registro, el histórico tiene que seguir
diciendo lo que decía. Una auditoría que cambia de contenido porque alguien
editó otra tabla no es una auditoría.

### Rendimiento

La traducción IP → nombre se **cachea un minuto en memoria**. La auditoría
escribe en **cada** petición del sistema; consultar la tabla cada vez añadiría
una consulta a todo lo que pasa. El registro cambia dos veces al mes.

---

## 15-C · Pulido visual

Todo **CSS aditivo**. Si algo se ve raro, se borra el bloque del final de
`styles.css` y el sistema vuelve a como estaba.

- **El botón que borra parece distinto.** Rojo lleno, el único de todo el
  sistema. «Dar de baja» y «Borrar definitivamente» ya no se confunden.
- **Avisos unificados** (`.aviso-ok`, `.aviso-error`) — cada pantalla se
  inventaba el suyo.
- **Tablas**: filas más altas (pulgar con guante), cabecera pegada arriba al
  desplazarse, fila bajo el cursor claramente marcada.
- **Formularios**: 42 px de alto mínimo, foco muy visible, la ayuda debajo
  del campo y no en un `title` que en el celular no se ve.
- **En el celular** el botón de borrar ocupa la fila entera: no se pulsa por
  rozar el de al lado.

---

## Archivos

```
backend/src/common/origen.ts                         (nuevo)
backend/src/modules/purga/purga.service.ts           (nuevo)
backend/src/modules/purga/purga.controller.ts        (nuevo)
backend/src/modules/purga/purga.module.ts            (nuevo)
backend/src/modules/purga/dto/purga.dto.ts           (nuevo)
backend/src/modules/equipos/equipos.service.ts       (nuevo)
backend/src/modules/equipos/equipos.controller.ts    (nuevo)
backend/src/modules/equipos/equipos.module.ts        (nuevo)
backend/src/modules/equipos/dto/equipo.dto.ts        (nuevo)
backend/prisma/migrations/20260814000000_equipos_conocidos/migration.sql (nuevo)
backend/test/purga.spec.ts                           (nuevo)
backend/prisma/schema.prisma                         (+2 columnas en audit_logs y sesiones, +1 modelo)
backend/src/app.module.ts · main.ts
backend/src/modules/audit/audit.service.ts · audit.interceptor.ts
backend/src/modules/auth/auth.controller.ts · auth.service.ts

frontend/src/pages/Limpieza.tsx                      (nuevo)
frontend/src/pages/Equipos.tsx                       (nuevo)
frontend/src/components/BorrarDefinitivo.tsx         (nuevo)
frontend/src/pages/Assets.tsx · Audit.tsx
frontend/src/components/Layout.tsx · Iconos.tsx
frontend/src/App.tsx · api/client.ts · styles.css
```

## Endpoints

```
GET    /purga/candidatos          (asset.delete + rol Jefe)
GET    /purga/activo/:id          (asset.delete)
POST   /purga/activo/:id          (asset.delete + rol Jefe)
GET    /purga/usuario/:id         (user.manage)
POST   /purga/usuario/:id         (user.manage + rol Jefe)
GET    /purga/auditoria?antesDe=  (audit.read)
POST   /purga/auditoria           (audit.read + rol Jefe)

GET    /equipos?q=                (asset.read)
GET    /equipos/sin-registrar     (asset.read)
POST   /equipos                   (asset.update)
PATCH  /equipos/:id               (asset.update)
DELETE /equipos/:id               (asset.update)
```

Los permisos de `equipos` se apoyan en los de activos a propósito: **esto ES
inventario de infraestructura** y lo mantiene la misma persona. Un permiso
nuevo obliga a una migración y a que alguien se acuerde de asignarlo — y el
día que se olvide, la pantalla no la ve nadie.

## Migración

`20260814000000_equipos_conocidos` — **aditiva pura**: una tabla nueva y
cinco columnas que admiten `NULL`. No toca ni una fila existente.

---

# Bloque 15.1 — Purgar órdenes de mantenimiento

Añadido a petición: *«también se debe poder borrar OM ya que hay que purgar el
sistema»*.

## Tres frenos, cada uno por una razón distinta

### 1 · Una orden CERRADA no se borra

Lleva **firma electrónica** de quien la cerró, causa, síntoma y acción. Es el
documento que responde *«¿qué se hizo aquel día?»*. Si sólo estorba en la
lista, se filtra por estado.

### 2 · Si salió material del almacén, tampoco

Éste es el freno que **no es obvio**, y por eso está explicado en el código:

> El retiro de almacén escribió un **movimiento de stock**. Ese movimiento vive
> en la tabla del almacén y **no cuelga de la orden**. Borrar la orden se lleva
> la línea de material —que es el hilo que explica el movimiento— pero **el
> movimiento se queda**. El almacén acaba diciendo «salieron 3 conectores» y ya
> nadie sabe para qué.

Y sobre todo: **borrar el papel no devuelve los repuestos a la estantería.**
Si de verdad hay que anular ese trabajo, primero se **devuelve el material**
desde el módulo de almacén —que escribe su movimiento de devolución— y
entonces la orden queda limpia y se puede borrar.

Ojo al matiz: material **solicitado y nunca retirado** no bloquea. Pedir no es
sacar; el almacén no se movió.

### 3 · Hay que escribir el código (`OT-2026-0099`)

Igual que con los activos: contra el clic en la fila de al lado.

## Lo que NO se borra — y la pantalla lo dice

| Sobrevive | Por qué |
|---|---|
| **Los activos levantados** en una orden de MAPEO | La relación es opcional: PostgreSQL sólo pone el enlace a nulo. Los equipos existen en la planta exista o no el papeleo |
| **Las inspecciones de grúa** | Igual: quedan sin orden asociada, no se van |
| **Las fotos en MinIO** | Se borra la fila que las nombra, no el archivo. Borrar objetos de un bucket desde una operación de base de datos falla a medias y deja el sistema peor |

Si nadie avisa de esto, alguien va a creer que borró 12 cámaras y va a entrar
en pánico. Por eso el diálogo lo enseña en un recuadro aparte.

## Órdenes candidatas a basura

El criterio **no** es «está abierta» — hay órdenes legítimas esperando una
parada de tren desde hace un mes, y sacarlas aquí sería invitar a borrar
trabajo pendiente.

El criterio es **no le ha pasado nada nunca**: sin avance, sin material, sin
fotos, sin checklist, `progressPct = 0`. Un papel en blanco.

Sobre esas se ordenan las señales: sin equipo, sin técnico, sin descripción,
más de 30 días sin tocar, cancelada.

## Permiso

Se usa **`wo.approve`**, no un `wo.delete` nuevo. Ese permiso ya está
reservado al Jefe de Mantenimiento en la semilla; crear uno nuevo obliga a
sembrarlo y a que alguien se acuerde de asignarlo — y el día que se olvide, el
botón no lo ve nadie y parece que el módulo está roto.

Encima, el servicio vuelve a exigir el **rol**. Las dos llaves de siempre.

## Dónde está

- **Órdenes (OM) → botón 🧹** en cada fila que no esté cerrada (sólo el Jefe)
- **Sistema → Limpieza de datos → pestaña «Órdenes sin usar»**

## Endpoints

```
GET  /purga/candidatos-om   (wo.approve)
GET  /purga/om/:id          (wo.approve)
POST /purga/om/:id          (wo.approve + rol Jefe)
```

`PURGE_WORKORDER` se suma a la lista de acciones que **la purga de auditoría
nunca borra**.

## Sin migración

Cero cambios de esquema. Todo se apoya en las claves foráneas que ya existen.
