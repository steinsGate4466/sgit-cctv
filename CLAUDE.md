# SGIT-CCTV — Modelo de trabajo

> **LÉEME ANTES DE ESCRIBIR UNA SOLA LÍNEA.**
> Este archivo existe porque cada punto de aquí abajo nació de un error real
> que ya costó tiempo. No son preferencias de estilo: son reglas compradas
> con horas perdidas.

---

## 0. El proyecto en una frase

ERP de infraestructura CCTV y red para **Aceros Arequipa, Planta Pisco**,
acotado a **LAMINACIÓN (Trenes 1, 2 y 3)**.

**Ruta del proyecto en el equipo del usuario:**
`C:\Users\CRISTHIAN\Desktop\sgit-cctv` — *el Escritorio, no Descargas, no
"RUTA\DE\TU\PROYECTO".* Los scripts que se entreguen deben ir solos ahí.

---

## 1. Reglas del usuario — no negociables

| Regla | Por qué |
|---|---|
| **Los commits los escribe ÉL** | Es su punto de control para revisar antes de que algo entre. Ningún script debe ejecutar `git commit` ni `git push`. Se entrega verde y él decide. |
| **Nunca inventar datos de planta** | Etapas, causas, síntomas, rutinas y capacidades salen de la planta. Si el dato no está, se avisa — no se rellena con un valor "razonable". |
| **Todo lo de planta, editable desde la interfaz** | Si hay que tocar código para cambiar una causa de falla, está mal hecho. |
| **No borrar archivos que puedan servir** | Aunque parezcan basura. |
| **Nunca `npm audit fix --force`** | Ni subidas de versión mayores a mitad de proyecto. |
| **Los scripts se descargan a `$env:USERPROFILE\Downloads`** | Nunca referenciar rutas internas del entorno de trabajo del agente. |
| **SIEMPRE escribir los comandos completos** | Nunca «el comando de siempre» ni «como antes». Se escriben enteros: el de ejecutar el script Y los de git, cada vez. Se lo he tenido que pedir dos veces. |
| **Secretos: jamás en el chat ni en capturas** | Token de Telegram, `JWT_SECRET`, cadenas de conexión. |

### Formato de entrega obligatorio

Cada entrega lleva, en este orden:

1. **Qué hace y para qué** — en castellano, sin jerga.
2. **TODOS los comandos**, completos, sin `RUTA\DE\TU\...`.
3. **Errores anticipados**, ya resueltos.
4. **Siguiente paso.**
5. **El esqueleto de bloques** con su estado.
6. **Reportar absolutamente todo**, incluidos los propios fallos.
7. **Consultar antes de actuar** cuando la decisión sea suya.

### PowerShell — dos cosas que siempre fallan

- **`npm.cmd`, nunca `npm`**: la ExecutionPolicy bloquea `npm.ps1`.
- **`git --no-pager diff --stat`, nunca `git diff` a secas.** El paginador se
  traga los comandos que vengan pegados detrás: pasó con `add`, `commit` y
  `push`, y el usuario creyó que había subido cuando no había subido nada.
  Los comandos de git se entregan **de uno en uno**, no en bloque.
- **La ExecutionPolicy también bloquea los `.ps1` sueltos.** Por eso cada
  script se entrega con un `.bat` al lado:
  `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0<script>.ps1"`.
  Eso salta el bloqueo **sólo para ese proceso**, sin cambiar la política del
  equipo.

---

## 2. Arquitectura

```
backend/    NestJS + TypeScript + Prisma 5.22 + PostgreSQL 18.4
frontend/   React + Vite (SPA, sin framework de servidor)
             · React.lazy por ruta + un solo <Suspense>
             · ErrorBoundary en dos niveles (ver §5)
Railway     backend + Postgres + despliegue continuo desde GitHub
MinIO       fotos e informes
```

### Dos ideas que sostienen todo el sistema

**1. El árbol de planta manda.**
`Planta → LAMINACIÓN → Tren → Etapa → Zona → Gabinete → Equipo`.
El tren, la etapa, la criticidad y el intervalo preventivo de un activo **se
deducen de dónde cuelga** (`common/plant-context.ts`). No se escriben a mano.
Escribir el tren en el activo fue un error que ya hubo que deshacer.

**2. Lo que se puede calcular no se guarda.**
El grafo de red se arma en cada consulta (`network.service.ts`). El estado
efectivo de un activo se deriva (`common/asset-status.ts`). Guardar una copia
significa mantener dos verdades, y la segunda siempre se queda vieja.

---

## 3. Trampas del stack — cada una ya mordió

### Prisma / PostgreSQL

- Los valores de un `enum` **sólo se pueden AÑADIR**, nunca renombrar ni quitar.
- **Una migración aplicada es INMUTABLE.** Se corrige con otra migración nueva.
- El nombre de la carpeta de migración **debe ordenar después** de la última:
  Prisma las aplica por orden alfabético.
- Prisma escribe **un solo `ALTER TABLE`** con muchos `ADD COLUMN` separados
  por comas. Un verificador que busque un `ADD COLUMN` por línea da falsos
  positivos (ya pasó: 22 de golpe).
- Prisma **siempre** emite `ON DELETE ... ON UPDATE ...` en las claves foráneas.
  Si la migración escrita a mano no lo pone, la CI detecta desfase.
- Los nombres de índice incluyen **todas** las columnas.
- Prisma **no sabe expresar índices GIN**. Si se crea uno en SQL, hay que
  documentarlo o la comprobación de desfase falla.
- **Si se crea un índice en SQL, hay que declararlo con `@@index`.** Este error
  se cometió dos veces (la segunda con `work_orders`).
- **`: any` en un filtro desactiva la comprobación** que detecta filtros
  anidados. Un `const x: any = { in: [...] }` dentro de un `notIn` produjo un
  400 en el tablero.
- **`Asset` NO tiene campo `name`.** Tiene `model`. Un `select` con un campo
  inexistente invalida el tipo del resultado ENTERO y TypeScript acaba
  señalando media docena de sitios correctos.

### TypeScript / NestJS

- `import * as X` con `esModuleInterop` da un **espacio de nombres, no una
  clase**: `new X()` compila y revienta al ejecutarse. Usar `require()`.
  (Pasó con PDFDocument y las etiquetas de gabinete.)
- **Toda clase inyectada por constructor debe estar en `providers` de su
  módulo.** Faltó `BandejaService` y tiró producción al arrancar.
- En un controlador, **las rutas literales van ANTES que los parámetros**:
  `@Get('traducir')` antes de `@Get(':id')`, o Nest lee "traducir" como un id.

### Trampas de producto — funciones a medio terminar

Antes de dar por hecho que algo «existe», comprobar que tiene **puerta de
entrada**. Este proyecto tuvo dos casos idénticos:

- **El mapa de la red** llevaba semanas construido con su análisis de impacto,
  y **no había pantalla para declarar qué está conectado con qué**. Salía como
  cajas sueltas y parecía roto. (Cerrado en 12.1.)
- **`Document`**: existe el modelo y existen los permisos `document.read` y
  `document.manage`, pero el módulo es un cascarón vacío. El ingeniero puede
  otorgar un permiso que no hace nada. **Sigue abierto.**

La regla: *modelo + endpoint ≠ función*. Sin pantalla, no existe.

### Frontend

- **Los permisos viajan dentro del token de sesión.** Cambiar un rol no surte
  efecto hasta que el usuario **cierra sesión y vuelve a entrar**. Explica el
  90 % de los "no me sale el menú".
- Cada despliegue **renombra los archivos de cada pantalla** (`Assets-a3f9.js`).
  Una pestaña abierta desde antes pide un archivo que ya no existe. Por eso
  existe `lazy-con-reintento.ts`.
- Hay **92 `catch(() => [])`** que convierten un fallo en "no hay datos". El
  aviso central de `api/client.ts` lo compensa, pero la deuda sigue ahí.

---

## 4. Verificadores — `npm run verificar`

Cada uno nació de un fallo concreto. **Corren en la CI y antes de cada push.**

| Script | Qué caza | De dónde salió |
|---|---|---|
| `verificar:inyeccion` | Clase inyectada sin declarar en su módulo | Caída de producción 01/08 |
| `verificar:filtros` | Filtros de Prisma anidados por error | Tablero en 400 |
| `verificar:campos` | Campo inexistente en un `select` | El `name` del bloque 6 |
| `verificar:migraciones` | Esquema contra migraciones, sin base de datos | Desfase repetido en la CI |
| `verificar:constructores` | `new X()` sobre un espacio de nombres | Etiquetas de gabinete |
| `verificar:bd` | La base real contra `schema.prisma` | Desfase de la base local |

### Regla de oro al escribir un verificador

**Se prueba SIEMPRE contra el código real antes de darlo por bueno, y se
comprueba que caza el error para el que se hizo** (reintroduciéndolo a
propósito). Cuatro de los verificadores dieron falsos positivos en su primera
versión. Un verificador que se equivoca es peor que no tenerlo: enseña al
equipo a ignorarlo.

Causas conocidas de falso positivo, ya resueltas:
- Buscar dentro de comentarios y de cadenas de texto.
- Suponer un `ADD COLUMN` por línea.
- Olvidar los agregados de Prisma (`_count`, `_avg`, `_sum`, `_min`, `_max`),
  que son válidos en un `select` y no son campos.

---

## 5. Decisiones tomadas — no deshacer sin motivo

| Decisión | Motivo |
|---|---|
| El impacto de red se mide como **pérdida de alcance al grabador**, no contando vecinos | Es lo que hace que un anillo de fibra bien montado dé impacto CERO, que es la respuesta correcta |
| Si un NVR **no declara** cuántos canales tiene, **no se inventa** | Diría "quedan 9 libres" sin saberlo y alguien planificaría cámaras sobre esa suposición |
| El mapa se pinta **siempre**, aunque esté vacío, explicando qué falta | Esconder el bloque hizo que la función pareciera inexistente |
| `ErrorBoundary` en **dos** niveles, con `key` por ruta | Uno alrededor del contenido (el menú sobrevive) y otro alrededor de todo. La `key` evita que el error se quede pegado al navegar |
| Al enlazar cámaras sólo se ofrecen las **del mismo tren** que el grabador | Una cámara del Tren 1 no se graba en el NVR del Tren 3 |
| Síntoma, causa y acción salen de **catálogo**, no de texto libre | Con texto libre no se puede contar después qué falla más |

---

## 6. Estado — agosto 2026

**28 módulos · 30 pantallas · 22 migraciones · 375 pruebas · 6 verificadores.**
16.788 líneas de backend · 13.499 de frontend · 214 endpoints · 52 modelos.

### Pendiente, por orden

1. **Ventanas de parada (F8-F/G/H)** — *bloqueado por una decisión del
   ingeniero*: ¿de dónde salen las paradas de tren, manual, Producción o SAP?
   No existe el modelo `StopWindow`. **No implementar sin esa respuesta.**
2. **5b** — que el QR abra una OM de un toque.
3. **Bloque 9** — campañas de mapeo (repartir zonas, medir avance).
4. **Ámbito en las rutas por identificador** — hoy un usuario del Tren 2 puede
   pedir la foto de un equipo del Tren 1.
5. **Módulo de documentos** — cerrar el permiso huérfano.
6. **3G-bis** — mapeo de columnas del Excel de SAP. Espera un export real.

### Hallazgos de seguridad abiertos (auditoría OWASP 2025, 04/08)

| | Riesgo | Estado |
|---|---|---|
| **S-01** | **`JWT_SECRET` filtrado sin rotar.** Con él se puede FIRMAR un token con permisos de administrador. No hace falta usuario ni contraseña | 🔴 **Abierto** |
| **S-02** | Ámbito no aplicado en rutas por identificador (OWASP A01) | 🟠 Abierto |
| **S-03** | Sin límite de peticiones fuera de login/usuarios/monitoreo. `/exportacion/todo` genera el libro en memoria | 🟠 Abierto |
| **S-04** | Al desactivar un usuario, su token vive hasta 15 min. La estrategia JWT no consulta la base | 🟡 Conocido |
| **S-05** | 26 `@Body() dto: any` | 🟡 Abierto |
| **S-06** | CI no revisa dependencias. `exceljs` arrastró `glob@7`, `rimraf@2`, `fstream` | 🟡 Abierto |
| **S-07** | Falta CSP | 🟡 Abierto |

**Procedimiento correcto hoy para dar de baja a alguien:** desactivar **y**
cerrar todas sus sesiones. Si la salida fue conflictiva, rotar `JWT_SECRET`.

### Deuda técnica conocida

- 50 `catch(() => [])`.
- 26 `@Body() dto: any`.
- NestJS 11 sin actualizar (a propósito: no se sube versión mayor a mitad).
- Restauración del respaldo **nunca probada**.

---

## 7. Cómo se entrega

1. Escribir el código en el proyecto.
2. Correr `npm run verificar`, `npm test`, `npm run build` (backend) y
   `typecheck` + `build` (frontend).
3. Empaquetar en un `.ps1` **con base64** (evita todo el infierno de comillas
   de PowerShell) + un `.bat` al lado.
4. El script: se va solo al Escritorio, escribe, verifica, compila **y PARA**.
   **Nunca toca git.**
5. Comprobar el equilibrio de paréntesis del `.ps1` **ignorando las líneas de
   comentario** — contarlas dio un falso −3.
6. Documentar el bloque en `docs/` y actualizar `docs/ESQUELETO_DE_BLOQUES.md`.

---

## 8. Lo que se ha aprendido a base de meterse la pata

- **Verificar que la copia es fiel no es verificar que el original es correcto.**
  (Se copió un módulo bien y el módulo estaba mal: cayó producción.)
- **Un mensaje de error no es un diagnóstico.** De "el esquema existe" se
  dedujo "las migraciones están aplicadas". Faltaban 21 tablas.
- **Compilar un archivo suelto no es `npm run typecheck`.** Comprobado
  reintroduciendo un error a propósito: no lo detectó.
- **Esconder algo vacío es peor que enseñarlo vacío.** Sin datos, "vacío" y
  "no existe" son indistinguibles para quien mira.
- **Cuando el usuario dice que algo no aparece, lo primero es la sesión**, no
  el despliegue.

---

## 9. Bloque 15 — lo que se aprendió aquí

### La MAC del cliente no existe para un servidor web

Se va a volver a preguntar, así que queda escrito:

> La dirección MAC es de **capa 2** y muere en el primer salto. Al servidor le
> llega la MAC del último router — en planta, la del gateway, **la misma para
> todos**. Ningún navegador la expone, ninguna cabecera la trae.

Lo que sí se puede, y es lo que se hizo:

1. **IP** normalizada (`src/common/origen.ts`, una sola función para todo el
   sistema — dos normalizaciones distintas hacen que un filtro por origen no
   encuentre la mitad de las líneas).
2. **Registro de equipos conocidos** — la MAC se **declara a mano**, sacada de
   la reserva DHCP o de la tabla MAC del switch. Editable desde la UI.
3. **Identificador de aparato** (`X-Dispositivo`) — pista de auditoría, **no**
   medida de seguridad: se borra limpiando el navegador. Está dicho así en el
   código para que nadie lo confunda con un control de acceso.

### Borrar: dos operaciones, no una

**BAJA** (soft, conserva historial) ≠ **PURGA** (hard, el registro nunca debió
existir). La regla que las separa sin preguntar a nadie:

> **Si hay una orden CERRADA, no se purga.** Una orden cerrada lleva firma y
> materiales retirados. La basura de pruebas nunca tiene órdenes cerradas.

Mismo criterio con personas: quien firmó algo se **desactiva**, nunca se
borra, o quedan documentos firmados por nadie.

### Reglas nuevas que no se deshacen

- **Dos llaves para lo irreversible:** el guard revisa el **permiso**, el
  servicio revisa el **rol** (`Jefe de Mantenimiento`). Un permiso se marca
  por error al crear un rol; el cargo no.
- **Confirmación escrita a mano**, no `confirm()`. Escribir el código obliga a
  mirar cuál se borra. El error real es la fila de al lado.
- **Se audita ANTES de borrar.** Si se anotara después y el borrado fallara a
  medias, quedaría un registro diciendo que se borró algo que sigue ahí.
- **La cascada la hace PostgreSQL**, no código a mano: una relación añadida
  más adelante se olvidaría.
- **La auditoría se copia, no se enlaza.** `origen` guarda el *nombre* del
  equipo de ese día. Una auditoría que cambia porque alguien editó otra tabla
  no es una auditoría.
- **La purga de auditoría exige 90 días** y **nunca borra los `PURGE_*`**.
- **Nunca se borra al único Jefe de Mantenimiento activo.**

### Detalle de rendimiento que se repite

La auditoría escribe en **cada petición**. Todo lo que se le cuelgue encima
—como traducir la IP a nombre de equipo— tiene que ir **cacheado en memoria**
(un minuto) y **dentro de la promesa**, nunca antes: la respuesta al usuario
ya se fue.

### El script de entrega cambió de forma

De `.ps1` con base64 se pasó a **ZIP con carpeta `archivos/` + `APLICAR.bat`**.
Motivo: 29 archivos en base64 dentro de un `.ps1` es un archivo de miles de
líneas imposible de revisar. El `.ps1` ahora:

1. Comprueba que el proyecto está en el Escritorio.
2. **Comprueba que los paquetes ANTERIORES están aplicados** y para si no
   (si no, el build falla con errores que mienten y se pierde media hora).
3. **Respalda lo que va a pisar** en `_respaldo-antes-<bloque>-<fecha>`.
4. Copia, regenera Prisma, verifica, compila, prueba.
5. **Para. Imprime los comandos de git uno a uno. No toca git.**

### Bloque 15.1 — purga de OM, y dos errores míos que costaron un commit sucio

**El freno del almacén.** Una OM de la que salió material **no se purga**. El
retiro escribió un `StockMovement` que **no cuelga de la orden**: borrar la
orden se lleva la línea de material y deja el movimiento sin explicación. Y
borrar el papel no devuelve los repuestos. Primero se devuelve el material por
el módulo de almacén; después la orden queda limpia.

**Lo que sobrevive hay que decirlo en pantalla.** Al purgar una orden de MAPEO,
los activos levantados **no se borran** (relación opcional → `SET NULL`). Si
no se avisa, alguien cree que borró 12 cámaras.

**Error mío 1 — el respaldo acabó dentro del repositorio.** El `.gitignore`
tenía `_respaldo_*/` y yo nombré la carpeta `_respaldo-antes-...` con guión.
No coincidía. Se comitearon 14 archivos duplicados.
**Regla: el respaldo del script va FUERA del proyecto**, al Escritorio. Lo que
está fuera del repositorio no se puede comitear por accidente, y no depende de
que un patrón del `.gitignore` esté bien escrito.

**Error mío 2 — `npx` en la consola normal.** El script funciona porque corre
con `-ExecutionPolicy Bypass`; la consola del usuario no. `npx` es un `.ps1` y
lo bloquea la política.
**Regla: los comandos que se le pasan al usuario para pegar en SU consola usan
`npx.cmd`, nunca `npx`.**

---

## 10. Bloque 16 — paradas e instalaciones

### DESBLOQUEADO: de dónde salen las paradas

**MANUALES.** Producción avisa —radio, WhatsApp, de boca— y **la hora se mueve,
muchas veces a última hora**. No hay integración con SAP ni con Producción.

Dos decisiones que salen de ahí y no se deshacen:

1. **`inicioPrevisto` ≠ `inicioReal`.** Un diseño ingenuo guarda «hora de la
   parada» y la sobrescribe: entonces la desviación desaparece. Restar los dos
   ES el dato.
2. **Cada movimiento de hora se guarda, con motivo OBLIGATORIO.** Sin registro,
   cuando la ventana se mueve tres veces y el trabajo no se hace, parece culpa
   de mantenimiento.

**No se valida que la hora sea futura**, a propósito: media planta se entera
cuando ya empezó. Un formulario que rechaza la realidad se deja de usar.

### Instalaciones: el formulario cambia según el sitio

`requisitos-sitio.ts` es **la fuente de verdad** y la usan los dos lados: el
frontend para enseñar campos, el servicio para exigirlos. Si se duplicaran, un
día el formulario pediría algo que el servidor no valida — o al revés, que es
peor: el técnico no puede guardar y no sabe por qué.

Hay una prueba que verifica que **todo campo obligatorio esté entre los
visibles** de su perfil. Ese es el fallo exacto que caza.

Otras reglas del módulo:

- **Se puede guardar a medias.** El técnico está en el sitio con guantes. Sólo
  al cerrar la visita se exige lo del perfil.
- **`false` es una respuesta, `''` no.** «No necesita manlift» tiene que dejar
  cerrar la visita. La comprobación es contra `null | undefined | ''`, nunca
  contra falsy.
- **No se aprueba sin visita.** Aprobar sin medir es firmar sin saber si son 20
  metros de cable o 200.
- **Al cerrar NACE EL ACTIVO**, en la misma transacción que el cambio de
  estado. Si se crearan por separado y fallara la segunda, mañana alguien
  vuelve a ejecutar y el equipo sale duplicado.
- Lo medido en la visita (`referenciaSitio`, `ambiente`) **viaja a la ficha del
  activo**: ese conocimiento se pierde si sólo vive en la instalación.

### De la auditoría QA

- Los 8 «await olvidados» eran `$transaction([...])` — recibe promesas SIN
  resolver a propósito — o fuego-y-olvido con `.catch()`. **Antes de reportar
  un await que falta, mirar si está dentro de una transacción.**
- El `ValidationPipe` corre con `whitelist` **y** `forbidNonWhitelisted`, así
  que `data: {...dto}` es seguro **si hay clase DTO**. Con `@Body(): any` no
  hay metadatos y no valida nada: ahí sí es un agujero.
- Sigue abierto el único hallazgo rojo: **41 rutas `:id` sin ámbito de tren**
  (OWASP A01). Es el bloque 12.3.

### Bloque 16.1 — el fallo que se me escapó, y el verificador 8

**Qué pasó.** Declaré en `Instalacion`:

```
workOrderId  String?
workOrder    WorkOrder? @relation(fields: [workOrderId], references: [id])
```

y me olvidé de `instalaciones Instalacion[]` en `WorkOrder`. **Prisma exige el
campo en LOS DOS modelos**, aunque sólo uno lleve la clave foránea.

Puse el lado inverso en `Location` y en `Asset`, y me salté `WorkOrder`. Los
verificadores no lo miraban, así que el paquete salió «verificado» y reventó
con **P1012 en el paso 5**, en la máquina del usuario, con los 22 archivos ya
escritos.

**Lo que importa no es el error: es CUÁNDO apareció.** Por eso existe ahora
`scripts/verificar-relaciones.js` (verificador 8). Recorre cada campo con
`@relation(fields: [...])` y comprueba que el modelo apuntado tenga la vuelta,
emparejando por nombre de relación cuando lo hay. Probado reintroduciendo el
bug a propósito: sale código 1 y dice qué línea falta y dónde ponerla.

**Regla que queda: `npx prisma generate` NO se puede correr aquí** (el espejo
del sandbox no tiene el binario), así que toda validación del esquema tiene
que ser un verificador de texto. Cada vez que Prisma falle con un error que un
verificador podría haber cazado, se escribe el verificador antes de reenviar.

**Y sobre P3005 al migrar en local:** ya pasó una vez y la causa fue distinta.
Antes de tocar nada, `npx.cmd prisma migrate status` — dice si falta la tabla
`_prisma_migrations` (hay que hacer baseline) o si simplemente hay migraciones
pendientes. **Nunca `migrate reset` contra una base con datos.**

### Bloque 16.2 — dos errores más, y el verificador 9

**`Asset` no tiene campo `environment`.** Escribí `environment: i.ambiente` al
crear el activo desde una instalación. El ambiente **se deduce del árbol de
ubicaciones**, igual que el tren y la criticidad. Copiarlo al activo habría
creado una segunda verdad que se desincroniza el día que alguien corrija la
etapa. TS2353.

**`_count` NO es opción de primer nivel.** Va dentro de `select` o de
`include`. Suelto, TypeScript lo tipa como `never` y revientan de golpe todas
las llamadas que lo usan — cinco, con un mensaje que no menciona `_count`
hasta la tercera línea. **Excepciones donde SÍ va arriba:** primer argumento
de `groupBy`/`aggregate`/`count`, y dentro de `orderBy:`/`having:`.

Los dos los caza ahora `scripts/verificar-escrituras.js` (verificador 9).

#### Lo que costó escribirlo bien, y por qué importa

La primera versión usaba expresiones regulares con una ventana de 3.000
caracteres: **45 falsos positivos**. Se comía el `data:` de la llamada
siguiente, leía claves de objetos anidados y confundía `null` con un campo.

**Un verificador que grita cuando no pasa nada se ignora a la semana**, y
entonces no sirve el día que grita de verdad. Ya pasó con `_count` en el
verificador 6. La versión buena:

1. **Limpia** cadenas, plantillas y comentarios antes de contar llaves.
2. Localiza el paréntesis de la llamada y **recorre contando llaves**; sólo
   mira claves a **un nivel exacto** de profundidad.
3. Para `_count` mira **el objeto donde está escrito**, no la llamada —
   porque el caso real viajaba en un `...spread`:
   `private incluir = { _count: ... }` y luego `findMany({ ...this.incluir })`.
   Desde la llamada es invisible.
4. **Probado reintroduciendo los dos bugs**: los caza y sale con código 1.

**Regla de proceso:** cada vez que Prisma o TypeScript fallen en la máquina
del usuario con algo que un verificador de texto podría haber visto, se
escribe el verificador **antes** de reenviar el paquete. Y se prueba
reintroduciendo el fallo, no sólo comprobando que pasa en verde.

### Bloque 12.3 — ámbito por identificador (el último agujero rojo)

**Cerrado.** 116 rutas con parámetro: 66 con `@AmbitoDe(...)`, 50 con
`@SinAmbito()` y su motivo escrito al lado, **0 sin declarar**.

**Decorador y no guard adivino.** Un guard que deduce el modelo de la URL
funciona hasta la primera ruta que no siga el patrón, y entonces **falla
abriendo**. Un fallo de seguridad silencioso es el peor tipo.

**404 y no 403.** Un 403 confirma que el registro existe: con eso se recorren
identificadores y se dibuja el inventario del vecino sin leer un campo.

**Las tres reglas que evitan romper trabajo legítimo** (cerrar de más se nota
tarde, cuando alguien está en planta y no puede abrir su orden):

1. Ámbito vacío = todos los trenes. Hoy **todos** lo tienen vacío, así que no
   cambia el comportamiento de nadie. Camino rápido: ni consulta la entidad.
2. Registro **sin ubicación pasa** — STOCK, mapeo sin equipo. Bloquearlo
   dejaría el almacén invisible.
3. **Si la comprobación falla, pasa.** Defensa en profundidad, no única capa.
   Este guard no puede tumbar el sistema.

**Orden de los guards:** Ritmo → Jwt → Permissions → **Ambito, el último**.
Preguntar «¿es de tu tren?» antes de saber quién eres es trabajo tirado.

**Verificador 10** (`verificar-ambito.js`): un decorador que hay que acordarse
de poner es un agujero con fecha. Ahora el olvido es un fallo de la entrega.
Probado quitando uno a propósito.

**21 pruebas, y siempre las DOS:** el propio pasa y el ajeno no. Sólo con la
primera se puede tener un guard que deja pasar todo; sólo con la segunda, uno
que no deja pasar nada.

### Bloque 16.3 — el nombre del índice, y por qué llegó a la CI

**El fallo.** Escribí a mano `CREATE INDEX "ventanas_parada_inicioPrev_idx"`,
abreviando el campo. **Prisma nombra SIEMPRE `<tabla>_<campos>_idx` con el
nombre COMPLETO**: `ventanas_parada_inicioPrevisto_idx`.

A PostgreSQL el nombre le da igual, pero el día que alguien corra
`prisma migrate dev`, Prisma cree que falta el índice, **lo vuelve a crear**, y
quedan dos índices iguales sobre la misma columna. Cada escritura paga los dos.

**Se arregla con una migración NUEVA, no editando la anterior.** La de antes ya
se aplicó —local y Railway— y una migración aplicada es inmutable. El SQL es
idempotente (`ALTER INDEX IF EXISTS ... RENAME` + `CREATE INDEX IF NOT EXISTS`)
para que valga tanto en una base que ya lo tiene como en una nueva.

#### Por qué se me escapó, que es lo que de verdad importa

`verificar-migraciones.js` lo habría cazado. **No lo cazó aquí porque a mi copia
del repositorio le falta la carpeta del baseline**, y el script salía por la
puerta de «falta historial» —código 2— ANTES de mirar los índices. El fallo no
dependía del historial para nada, y viajó hasta GitHub.

**Arreglado:** cuando falta historial, el script sigue comparando los índices,
pero **sólo de las tablas cuyo `CREATE TABLE` sí ha leído**. Sin ese filtro
salían 27 avisos falsos (los índices del baseline) y el útil quedaba enterrado
— que es exactamente cómo muere un verificador.

**Regla de proceso, la tercera vez que aparece la misma:** un verificador que
no puede correr aquí es un verificador que no existe. Si sale con código 2 por
falta de datos, hay que ver **qué parte SÍ se podía comprobar** y comprobarla,
en vez de callarse entero.

**Y la regla de contenido:** los índices escritos a mano en SQL llevan el
nombre **exacto** que generaría Prisma. Nada de abreviar el campo.

### Bloque 17.1 — `const x = []` es `never[]`

Un array literal vacío **sin anotar** lo infiere TypeScript como `never[]`. El
primer `push` falla con:

    Argument of type '{...cuarenta campos...}' is not assignable to
    parameter of type 'never'

...que **no menciona el array por ningún lado**. Cuesta más leer el error que
arreglarlo, y sólo aparece al compilar — o sea, en la máquina del usuario.

**Siempre `const x: any[] = []`.** Añadido al verificador de constructores
(que es el de trampas de TypeScript), y sólo avisa si al array se le hace
`push` después: un array vacío que nadie toca es inofensivo. Probado
reintroduciendo el fallo.

### Bloque 18.1 — `re.sub` interpreta los escapes del reemplazo

**El fallo.** Generé `Equipos.tsx` con `re.sub` de Python y el texto de
reemplazo llevaba `\n`. **`re.sub` procesa los escapes del reemplazo**, así
que ese `\n` se convirtió en un **salto de línea real** dentro de una cadena
de comillas simples. En JavaScript eso no existe: `Unterminated string
literal` en el build, en la máquina del usuario, tras 19 archivos escritos y
8 verificadores en verde.

**Regla: para sustituir texto en archivos se usa `str.replace`, NUNCA
`re.sub`,** salvo que se necesite de verdad una expresión regular — y
entonces el reemplazo va con `re.escape` o como función.

#### El verificador, y por qué la primera versión no valía

Escribí uno que contaba comillas por línea. **5 falsos positivos** al primer
intento, todos legítimos: `http://` dentro de una cadena parecía un
comentario, texto JSX repartido en dos líneas, expresiones regulares con
comillas dentro.

La versión buena **no adivina**: le pasa cada archivo a **esbuild**, el mismo
analizador que usa Vite. Si esbuild lo acepta, es válido. Si no, dice la línea
exacta. Y si esbuild no está disponible, **sale en verde** en vez de romper:
un verificador que revienta por una dependencia acaba borrado del script.

Probado reintroduciendo el fallo exacto.

**Y lo más útil de todo esto:** ahora sí se puede comprobar la sintaxis del
frontend desde aquí. Antes el único filtro era el build en la máquina del
usuario, y por eso los errores de sintaxis siempre llegaban a él.

### Bloque 21 — cerrar lo que estaba a medias, antes de añadir nada

El usuario pidió módulos nuevos y a mitad se corrigió: **«empieza primero
terminando el software»**. Tenía razón, y la auditoría lo confirmó.

**Cómo se buscó lo incompleto, que es lo reutilizable de esto:** en vez de ir
por intuición, se comparó cada uno de los **298 endpoints** contra todo el
código del frontend. Salieron 31 sin usar. Descontando falsos positivos
—rutas construidas con plantilla, y las del agente de monitoreo, que no las
llama el navegador— quedaron **cuatro huecos reales**:

| Hueco | Qué pasaba |
|---|---|
| `POST /electricidad/mediciones` | **El peor, y mío.** El tablero enseñaba los puntos calientes de termografía y **no había forma de cargarlos**. Un indicador que nadie puede alimentar siempre dice cero, y a la tercera vez que se mira vacío se deja de mirar |
| `GET /auth/sesiones` + `cerrar-todas` | El botón de «me robaron el teléfono» estaba **construido y apagado**: revoca de verdad en el servidor, y no había pantalla para usarlo |
| `GET /inventory/for-asset/:id` | Qué repuestos sirven para este equipo. Se pregunta **con el equipo delante**, así que va en la ficha del activo, no en Almacén |
| `GET /paradas/proximas` | Se calculaba y no se enseñaba. Es la pregunta de la mañana: «¿cuándo puedo tocar la línea?» |

**La regla que ya estaba escrita y volvió a fallar:** *modelo + endpoint ≠
función. Sin pantalla, no existe.* Ahora hay una forma barata de comprobarlo
—el barrido de endpoints contra el frontend— y conviene repetirla cada dos o
tres bloques.

### Lo visual al crecer: el problema cambia de eje

Con 38 entradas el plegado por secciones ya no basta. **El problema deja de
ser el alto y pasa a ser el ancho**: la barra se come 240 px de una pantalla
de 1366 —la de los púlpitos— y las tablas salen con scroll horizontal.

- **Barra estrecha a 60 px**, que se despliega al pasar el ratón. Estrecharla
  no cuesta nada porque no se pierde acceso.
- **«Lo último»**: de 38 pantallas cada persona usa cinco. Las últimas
  visitadas suben arriba. Se ajusta solo a cada uno, sin configurar nada.

---

## 11. Bloque 62 — el QR que avisa, y dos agujeros de permisos

### 62-B · El dato más caro estaba calculado y sin enseñar

Desde el bloque 28 el sistema sabe **cómo se interviene cada zona** —en marcha,
con permiso eléctrico, con permiso de altura, o con el tren parado—, lo deriva
del ambiente y lo firma una persona con nombre y fecha.

Y `assets.service.findOne` **no copiaba esos cinco campos a `asset.planta`**. El
técnico escaneaba el QR de pie delante de la cámara y la pantalla le contaba la
marca, el modelo y la IP, pero **no que ahí abajo pasa barra caliente**.

Es el mismo error del mapa de red y del módulo de documentos, ya escrito aquí:
*modelo + cálculo ≠ función. Sin pantalla, no existe.* Sólo que esta vez lo que
no existía era una advertencia de seguridad.

**Tres reglas del aviso, y no se aflojan:**

- **Va arriba del todo**, por encima incluso de «ya hay trabajo abierto». Si el
  técnico lee una sola línea de esa pantalla, tiene que ser ésta.
- **Se pinta `intervencionAplica`, nunca la propuesta.** Sin firma vale
  `EXIGE_PARADA`. Y si la ficha no trae el dato, se pinta el caso más
  restrictivo: falla hacia el lado seguro.
- **No hay variante verde.** Ni el caso más suave celebra nada. Un verde de
  «todo correcto» en una pantalla de seguridad se aprende a ignorar en una
  semana, y entonces ya no protege el día que importa.

### 62-A · Producción veía el plano eléctrico de toda la planta

**El usuario lo vio en pantalla**, no un verificador: entró con su cuenta de
Producción y le salía INFRAESTRUCTURA entera —Cableado, Electricidad,
Grabadores, Mapa de red, Direccionamiento IP, Puntos críticos—.

**Causa raíz: había DOS roles para el MISMO puesto.** `Jefe de Producción` en la
semilla y `Jefe de línea (Producción)` en las plantillas de la interfaz. Nadie
lo notó porque los dos funcionaban.

Hasta que la migración del bloque 55 repartió los permisos nuevos comparando
contra literales:

```sql
WHERE r."name" NOT IN ('Jefe de Producción', 'Jefe de Tren')
```

Excluyó a uno; el usuario real tenía el otro. **La migración escrita para CERRAR
el agujero fue la que lo abrió.**

#### La regla que queda

> **Una migración reparte permisos por lo que el rol PUEDE HACER, nunca por cómo
> se llama.** El nombre se edita desde la interfaz: es un dato de usuario. Y
> cuando no coincide, el SQL **no falla, no hace nada**. Falla ABRIENDO, que es
> el peor modo de fallar.

La corrección (`20260902000000_reparto_infra_red_por_capacidad`) conserva
`infra.read` y `red.read` sólo en los roles que ya tienen `asset.create`,
`asset.update`, `asset.delete` o `location.manage`. **No hay un solo nombre de
rol en ese archivo.** Probado contra las 11 plantillas: acierta a los tres que
deben conservarlo y no toca a los otros ocho.

#### Verificador 11 — `verificar:sql-roles`

Ya existía `verificar-roles`, nacido de este mismo error, que prohíbe los
literales de rol en TypeScript. **No miraba SQL**, y por ahí entró.

El nuevo distingue dos cosas, que es lo que le costó estar bien:

1. **Rol fantasma** (error siempre): literal que no existe ni en la semilla ni
   en las plantillas.
2. **Comparación por nombre en migración NUEVA** (error a partir del corte). Las
   anteriores están aplicadas y son inmutables: quedan como deuda declarada.

Hay una tabla `RENOMBRADOS` para que un nombre viejo en una migración vieja sea
historia y no rojo eterno. **Un verificador que no se puede poner en verde se
desactiva.**

*Dos falsos positivos en la primera versión, los dos por la expresión regular:
`'Jefe de Mantenimiento': PERMISSIONS` no lleva corchete, y el catálogo de
permisos también usa la clave `nombre:`.*

### Los dos cargos del tren

Decidido por el usuario: **el Jefe de Tren manda**; el **Jefe de línea le cubre**
cuando no está.

> **Ven lo mismo, decide uno solo.** Cubrir a ciegas no es cubrir, así que la
> lectura es idéntica. La única diferencia es `zona.criticidad`: declarar una
> zona vital reordena las prioridades del tren entero, y eso no rota con el
> turno.

Una diferencia de un permiso se explica en una frase; una de seis nadie sabe
justificarla seis meses después. Hay dos pruebas que fijan la diferencia
**exacta y en los dos sentidos**.

`Jefe de Tren` tampoco tenía plantilla: existía en la semilla y no se podía
crear otro desde la interfaz. Ya la tiene.

### Tres defectos que salieron de rebote

- **`soloMira()` no reconocía la familia `*.mirar`.** Sólo miraba el sufijo
  `.read`, así que contaba `om.mirar` como escritura y la pantalla de Roles
  marcaba «no es de sólo consulta» a un Jefe de Tren que no modifica nada. Un
  aviso que miente enseña a desconfiar de todos los avisos. **Se arregló la
  función, no la prueba.**
- **El verificador de coherencia me cazó a mí.** Puse `asset.read` y `wo.read`
  en los dos cargos «porque hacen falta para el QR». Tenía razón él: abren
  INFRAESTRUCTURA y Mantenimiento enteros, que es justo lo que se cerraba. Se
  quitaron. **A un verificador propio se le hace caso o se borra; lo que no se
  puede es discutirle y dejarlo puesto.**
- **`.tsbuildinfo` sin ignorar.** `tsc -b` deja una caché con rutas absolutas de
  la máquina. Añadido al `.gitignore`.

### Y una falsa alarma que conviene recordar

Cinco archivos salían como modificados —cuatro migraciones y `RESPALDO_BD.ps1`—
y **el contenido era idéntico**: sólo cambiaba el fin de línea (CRLF ↔ LF) por
mezclar Windows con el entorno del agente. Importa porque **Prisma guarda un
checksum de cada migración**: si esos archivos entran cambiados al repositorio,
el despliegue muere con «migration was modified after it was applied».

**Antes de dar la alarma por una migración modificada, comparar sin los `\r`.**

### 62-A · El QR deja de ser una pantalla para LEER

Tres botones que no existían, y todos por el mismo motivo: el dato estaba y
no había forma de actuar sobre él desde donde se está trabajando.

**1. Anotar el avance de la orden.** El QR enseñaba «OM-42 abierta — limpieza»
y ahí se acababa: para decir que la había hecho había que bajar a la oficina y
buscarla entre trescientas. Se apunta en un papel, y el papel se pierde.

**2. Reportar avería.** El botón existía y hacía `nav('/incidents?nuevo=1')`:
te SACABA del QR justo después de haber escaneado para no tener que buscar el
equipo. Ahora el parte se rellena ahí, con el equipo ya puesto.

**3. `id` en la ficha.** El `select` de `workOrders` no traía el identificador,
así que la ficha listaba órdenes sobre las que era imposible actuar.

#### Dos formularios, uno por oficio

Decisión del usuario: *«lo más probable es que el incidente lo hagan en
púlpito, así que el formulario para ellos es distinto: se autocompleta. Si es
un técnico, ahí sí tiene que ser más complejo.»*

- **Producción** mira un monitor y sabe UNA cosa: que no está viendo. Su
  formulario es un botón (`ReportarCaida`, bloque 51-B). **Pedirle la
  categoría es pedirle que adivine, y una categoría adivinada ensucia para
  siempre la estadística de qué falla más.**
- **El técnico** está con la tapa abierta y sí distingue óptica sucia de cable
  cortado. Suyo es `ReportarAveria`, con catálogo de cinco motivos.

**El reparto va por CAPACIDAD:** el detallado exige además `wo.update`, que
Producción no tiene. Ni un nombre de rol.

#### La deducción que pidió ya estaba, a medias

*«Si se va UNA cámara lo más probable es que haya perdido energía; si se van
TODAS de golpe, que haya caído el switch.»* Eso es exactamente el veredicto
`LOCAL` / `COMPARTIDO` de `arranque-de-diagnostico.ts`. Lo que faltaba era la
primera mitad: en `LOCAL` decía «revisa este equipo y su tramo», que es cierto
pero no dice por dónde. Ahora manda **empezar por la corriente**, porque se
comprueba en un minuto desde el gabinete y el cable exige subir.

#### Quién puede qué — y esto no se afloja «porque en campo hay prisa»

| Acción | Permiso | Quién |
|---|---|---|
| Anotar avance | `wo.update` | Técnico |
| Abrir la orden | `wo.update` | Técnico |
| **Cerrar la orden** | **`wo.approve`** | **Sólo el Jefe de Mantenimiento** |

Cada avance guarda `reportedById` **y** pasa por auditoría. Y se dice en
pantalla **antes** de pulsar: *«queda con tu nombre y la hora; la cierra el
Jefe»*. Un sistema que audita en silencio se siente como una trampa; uno que
lo avisa por delante se usa con confianza.

**`test/qr-en-campo.spec.ts`** fija las ocho reglas leyendo el CÓDIGO, no el
comportamiento — el fallo típico no es escribir mal el permiso, es quitarlo
«un momento para probar». Probado aflojando el cierre a `wo.update`: se cae.

#### Dos verificadores míos me cazaron a mí, otra vez

- **`verificar:etiquetas`**: puse un `<textarea>` sin `<label>` que lo envuelva.
  Con guantes, que tocar el texto enfoque el campo es la diferencia entre
  escribir la nota y no escribirla.
- **La prueba de jerga de redes**: escribí «ha perdido el PoE». La lista
  prohibida incluye `poe`, y con razón: eso lo lee quien esté delante del
  equipo. Se dice igual sin siglas — «la corriente que le llega por el cable
  de red»— y se entiende mejor.

**A un verificador propio se le hace caso o se borra.** Discutirle y dejarlo
puesto es la peor de las tres opciones.

---

## 12. Bloque 64 — la exposición que salió mal, y lo que me faltaba a mí

### El fallo de método, antes que los bugs

937 pruebas en verde y el usuario expuso el software delante de un ingeniero
con **cuatro bugs de bulto**. Los dos hechos son ciertos a la vez, y ésa es la
lección:

> **Mis 937 pruebas NO ABREN EL SOFTWARE.** Comprueban que el código está bien
> escrito. Ninguna comprueba que funcione. Compilar, pasar el typecheck y tener
> los verificadores en verde no es haber probado nada.

Es el tercer escalón de una regla que ya estaba escrita en este archivo:
*verificar que la copia es fiel no es verificar que el original es correcto* ·
*compilar un archivo suelto no es hacer el typecheck* · **y pasar el typecheck
no es que funcione.**

Y lo peor: se entregaron comandos de git con «todo verificado» delante.

### Los cuatro bugs, y qué tenían en común

| Bug | Causa |
|---|---|
| **Te echa mientras trabajas** | `mousemove` no estaba en las señales de actividad. Y una vez salía el aviso, el registrador **ignoraba a propósito** que siguieras trabajando |
| **Las OM nacen sin fecha** | `scheduledDate` era opcional en los dos formularios y **no existía** en el del QR |
| **Reportar avería «no hace nada»** | Se cerraba el formulario aunque la respuesta viniera vacía, y el aviso de error vive DENTRO de ese formulario: al cerrarlo se volvía invisible |
| **«value : 3» en los gráficos** | Cinco `<Tooltip>` sin `formatter`: enseñaban el nombre interno de la columna |

**Lo que comparten:** ninguno se ve leyendo el código con atención normal. Los
cuatro se ven **abriendo la pantalla**. Y ninguno rompe nada — por eso pasan
todos los filtros.

### La cadena que rompía la fecha vacía

```
OM sin fecha → sale «—» → nunca vence → no entra en el backlog
             → el % de cumplimiento del preventivo miente
             → y con él el reparto correctivo/preventivo/predictivo
```

**Toda orden abierta desde el QR nacía muerta para los indicadores.** El valor
por defecto ahora es HOY, no vacío: abrir una orden significa intervenir ahora.
`null` no es ningún dato; «hoy» sí lo es.

### Regla nueva: el aviso de error NO puede vivir dentro de lo que se cierra

Tres formularios lo hacían. Al enviar, se cerraba el bloque **y con él el sitio
donde se pinta el error**. Si fallaba, el usuario veía la pantalla volver atrás
en silencio y concluía —con razón— que el software no funciona.

> **Sólo se cierra un formulario cuando hay algo que enseñar.** Y si la
> respuesta llega vacía, se dice: «el servidor respondió pero no confirmó;
> comprueba antes de repetir». Nunca se asume que salió bien.

Y el mensaje del servidor va **por delante** de `e.message`: «Request failed
with status code 400» no le sirve a nadie subido a un poste con guantes.

### Tres verificadores nuevos (12, 13 y 14 del frontend)

| Verificador | Qué caza |
|---|---|
| `verificar:fechas` | Cualquier `new Date(x).toLocale…` fuera de `src/fechas.ts` |
| `verificar:graficos` | `<Tooltip>` de recharts sin `formatter` |
| `verificar:sesion` | Que nadie quite `mousemove`, ni devuelva el `if (avisando) return` |

Los tres **probados reintroduciendo el bug exacto**. El de fechas encontró
**6 sitios más** que el barrido inicial no vio —tenían guarda, pero cada uno
con su formato—: 21 fechas unificadas en total.

### Y una cosa que hice bien, por una vez

Un cuarto barrido —«llamadas del frontend sin ruta en el backend»— dio **31
resultados y los 31 eran falsos positivos míos**. Se descartó en vez de
entregarlo.

*Un verificador que se equivoca es peor que no tenerlo.* Vale también para un
informe.

### Lo que queda pendiente y no se olvida

- **Playwright**: recorridos que ABREN el software. Sin esto, todo lo anterior
  se repite. Es lo siguiente.
- **128 `catch` que convierten un fallo en «no hay datos»** en 42 archivos.
  Cuando el usuario ve «data muerta», puede que el dato exista y la petición
  esté fallando en silencio.
- **21 acciones que guardan sin confirmar** nada en pantalla.
- Y el ciclo del ingeniero: **ABC con método → frecuencia**, hojas de ruta,
  el reparto correctivo/preventivo/predictivo, y el menú ordenado por el ciclo.

---

## 13. Bloque 67 — lo que encontró una desarrolladora en veinte minutos

El usuario pasó el software a una amiga desarrolladora. Ella lo abrió, lo usó
y sacó en un rato lo que 942 pruebas en verde no habían visto. Otra vez la
misma lección, ya escrita dos veces aquí: **pasar el typecheck no es que
funcione, y mis pruebas no abren el software.**

### El buscador no buscaba hasta que pulsabas

`useBusquedaEnVivo.ts`. Se busca mientras se escribe, con **350 ms** de
espera. Tres detalles que no son adorno:

1. **No se busca al montar la pantalla** — la primera carga ya la hace la
   propia pantalla, y disparar aquí también son dos consultas iguales al
   entrar, con la segunda pisando a la primera.
2. **Un solo carácter no se busca** (mínimo 2). Devuelve media base. Borrar
   del todo SÍ busca: es «quítame el filtro».
3. **El botón «Buscar» se queda.** Quien teclea un código completo lo pulsa
   por costumbre; quitarlo obliga a esperar sin saber si el sistema entendió.

Y `buscar` va en una `ref`: en estas pantallas `load` se recrea en cada
repintado, y sin eso el temporizador se reiniciaba y no llegaba a cumplirse
NUNCA. Ése era el fallo real, no el retardo.

### El botón apagado, que es el hallazgo de fondo

**80 botones se apagan solos.** En 32 el apagado no es «estoy guardando» sino
que **falta un dato**, y ninguno decía cuál.

> Un `disabled` de verdad no se puede pulsar, no se puede enfocar con el
> teclado y **no dispara ningún evento**. No hay forma de preguntarle por
> qué. El usuario ve el botón muerto, mira el formulario, no encuentra la
> diferencia y concluye —con toda la razón— que el software está roto.

En un formulario de cuatro campos se adivina. En el de instalaciones, que
cambia según el sitio, el campo que falta puede estar tres pantallazos más
arriba.

**La decisión: si falta un dato, el botón SE QUEDA VIVO** (`BotonConMotivo`).
Se puede pulsar, no envía nada, y dice qué falta justo debajo. Si está
guardando, ENTONCES SÍ se apaga: ahí el apagado es correcto, la razón es
evidente y dura un segundo.

- **`aria-disabled` sí, `disabled` no.** Le dice al lector de pantalla que la
  acción no está disponible sin sacar el botón del recorrido del teclado ni
  matar el `onClick`. Es exactamente el caso para el que existe.
- **El motivo no se enseña hasta que se pulsa.** Pintar «falta el nombre» al
  abrir un formulario vacío es regañar a alguien por no haber empezado.
- **El motivo se borra solo cuando ya no falta.** Si se quedara, seguiría
  diciendo «falta el nombre» con el nombre escrito — y un aviso que miente
  enseña a ignorar todos los avisos.
- **Ámbar, no rojo.** Un campo sin rellenar no es un error. El rojo se
  reserva para lo que ya falló.

**Excepción deliberada:** los tres botones de lo irreversible en Limpieza
siguen APAGADOS. La frase escrita a mano es la fricción que obliga a mirar
QUÉ se borra (bloque 15). Lo que les faltaba no era poder pulsarlos: era un
`title` diciendo qué frase se espera.

### «Request failed with status code 400»

Ése era el texto que veía el usuario. El mensaje útil —el que escribió el
servidor— viajaba en `response.data.message` y se tiraba a la basura en unos
sitios, y en otros el respaldo era un «No se pudo guardar.» que no dice si el
problema es tuyo, del permiso o de la red.

`avisos.ts`, una sola función, **50 sitios**. El orden es siempre: lo que dijo
el SERVIDOR primero, `e.message` de axios sólo como último recurso. Y los
cuatro casos que llegan con el cuerpo vacío se traducen:

| | Qué se dice |
|---|---|
| 401 | tu sesión caducó, vuelve a entrar |
| 403 | no tienes permiso PARA ESTA ACCIÓN (distinto de «no hay datos») |
| 404 | esto ya no existe, alguien lo borró; recarga |
| sin respuesta | **no llegó al servidor, NO se guardó, puedes repetirlo** |

El último importa más de lo que parece. Cuando la red se cae a mitad de un
guardado la duda es «¿se guardó o no?», y sin respuesta la gente repite. Decir
«no llegó» evita el peor desenlace, que es guardar dos veces.

### Verificador 14 (frontend) — `verificar:botones`

Distinguir «apagado porque falta un dato» de «apagado porque está guardando»
con una expresión regular es imposible: el indicador se llama `ocupado`,
`guardando`, `saving` o `enviando` según el archivo.

**Así que no se intenta.** Se busca una señal que no admite discusión: que la
condición de `disabled` **compruebe el CONTENIDO de un campo** —`.trim()`,
`.length`, `.includes(`—. Un «estoy guardando» nunca llama a `.trim()`.

Eso deja fuera casos legítimos (`!elegida`, `!medio`). **A propósito:
prefiero que se me escapen tres antes que inventarme uno.** Un verificador
que grita cuando no pasa nada se ignora a la semana, y entonces no sirve el
día que grita de verdad.

Probado reintroduciendo el fallo: sale código 1 con archivo y línea. Encontró
4 reales a la primera y **cero falsos positivos**.

### Y `verificar:cascada` me volvió a cazar

Puse `color` y `gap` en `.sidebar .brand` al convertir el logotipo en botón, y
más abajo ya había otra regla con valores distintos que ganaba igual. Mis dos
líneas eran código muerto. **A un verificador propio se le hace caso o se
borra.**

---

## 14. Bloque 68 — quién reporta, quién abre orden, y el QR que estaba cerrado

### El bug que encontré buscando otra cosa

El usuario pidió acotar quién genera incidencias y OM desde el QR. Al medirlo
salió algo que nadie había visto **porque no rompe nada**: devuelve 403 y la
pantalla sale vacía.

> **Ni el Jefe de Tren, ni el Jefe de línea, ni el Operador de Púlpito podían
> abrir el QR.** `GET /assets/:id` exigía `asset.read` y ninguno lo tiene.

Y el botón de «reportar cámara caída» del púlpito **vive dentro de esa
pantalla**: el bloque 51-B entero estaba muerto para la única persona para la
que se escribió.

Lo peor es que el comentario del catálogo decía, literal, que los dos jefes
llevaban `asset.read` «y no es negociable, sin él no se puede escanear el QR».
El comentario decía una cosa y la lista de permisos decía otra. Se quitó en el
bloque 62-A porque `verificar:coherencia` lo marcó —con razón, `asset.read`
abre el módulo entero— y **nadie corrigió el comentario ni buscó la
alternativa**.

**Regla que queda:** cuando un verificador obliga a quitar un permiso, hay que
preguntarse **qué deja de funcionar**. Quitarlo y seguir es cambiar un agujero
de seguridad por una función muerta, y la función muerta tarda meses en verse.

**Arreglo:** `@RequireAlguno('asset.read', 'activos.mirar')` en las DOS
llamadas de la pantalla (`/assets/:id` y `/activos/:id/campo`). Quien tiene
`activos.mirar` ya recibe los equipos de su tren en lista; abrir la ficha de
uno no le da nada nuevo. Y las dos puertas que protegen de verdad siguen
puestas: `@AmbitoDe('asset')` limita a su tren, y las credenciales se filtran
aparte con `credential.read`.

*Si una de las dos llamadas se abre y la otra no, el QR sale a medias — que es
peor que no salir, porque parece que funciona.*

### El reparto, por capacidad y sin un solo nombre de rol

**REGLA 1 · Abre una OM quien supervisa el mantenimiento de su tren** →
capacidad `om.mirar`, que sólo tienen los dos cargos del tren.

**REGLA 2 · Reporta una avería quien mira las cámaras o quien toca el
equipo** → conserva `incident.create` quien tenga `activos.mirar`, `om.mirar`
o `asset.update`. La tercería lo pierde: ejecuta órdenes asignadas y lo que
encuentre lo cuenta con `wo.report`, dentro de la orden, que es donde queda
atado al trabajo y a quien lo contrató.

Se escribe como **«quién lo conserva»** y no como «a quién se le quita», y eso
importa: un rol que se cree mañana y no tenga ninguna de las tres capacidades
tampoco debería reportar. Enumerar a quién se le quita arregla el presente;
describir quién lo conserva describe la regla.

**ABRIR NO ES CERRAR.** Una orden de más se ve en la lista y se anula. Una
orden CERRADA de más lleva firma y materiales retirados: afirma que un trabajo
se hizo. `wo.approve` no se movió, y hay cuatro comprobaciones que lo fijan.

### El púlpito casi se queda sin su única función

El usuario eligió primero «sólo los tres cargos», lo que dejaba al Operador de
Púlpito con dos permisos de mirar y ninguna escritura. Se le señaló antes de
escribir la migración —que es **inmutable**— y rectificó.

**Regla de proceso:** cuando una decisión del usuario deja un rol o una función
sin sentido, se dice ANTES de escribir la migración, no después. Deshacer una
migración aplicada cuesta otra migración.

Queda fijado por una prueba, no por la memoria: `el Operador de Púlpito
conserva su única escritura`.

### `occurredAt` — cuándo se cayó no es cuándo se reportó

Una cámara que se apaga a las 3 de la madrugada y se reporta a las 8 cargaba
cinco horas al MTTR en las que nadie podía hacer nada. Con las dos fechas se
separan dos problemas que tienen dos dueños:

    occurredAt → reportedAt  =  DEMORA EN AVISAR  (detección)
    reportedAt → resolvedAt  =  MTTR              (mantenimiento)

- **Opcional a propósito.** La mayoría de las veces no se sabe, y un campo
  obligatorio que no se sabe se rellena con cualquier cosa — peor que vacío,
  porque un dato inventado no se distingue de uno medido.
- **El futuro se rechaza**, con mensaje. Guardarlo daría un MTTR negativo que
  rompe el informe del mes sin que nadie sepa por qué.
- **Margen de un minuto**: el reloj del móvil del técnico y el del servidor no
  van sincronizados al segundo, y sin margen «ahora mismo» se rechazaría a
  veces sí y a veces no — la peor clase de fallo, el que no se reproduce.
- **No se rellena el histórico.** Poner `occurredAt = reportedAt` en lo viejo
  diría que todo se reportó en el instante en que ocurrió. `NULL` dice la
  verdad: no se sabe.
- **En la lista sólo se pinta cuando existe.** Una línea «ocurrió: —» en todas
  las filas es ruido que esconde las pocas que sí lo traen.
- **El botón del púlpito NO lo pide.** Su formulario es un botón; añadirle un
  calendario es deshacer el bloque 62-A.

### Dos cosas del método

- **`npx prisma generate` no puede correr aquí** (el dominio de binarios está
  bloqueado). Como `src/generated/` está en el `.gitignore`, se parchea el
  cliente en la copia del agente para poder hacer el typecheck de verdad. En
  la máquina del usuario se regenera y se pisa. Lo que no vale es entregar sin
  typecheck diciendo «se arreglará al generar».
- **`plantillas-rol.spec.ts` me cazó** al añadir `wo.create`. Es la tercera vez
  que esa prueba se cae, y las tres a propósito: fija el reparto de poder del
  tren. Se actualizó **escribiendo la decisión nueva**, no ensanchando el
  array en silencio.

---

## 15. Bloque 69 — el menú por oficio, y el QR que era un callejón

### «Saber más del equipo» llevaba a una lista

El botón del QR hacía `nav('/assets?search=CODIGO')`: una tabla filtrada. El
técnico escanea **precisamente para no tener que buscar el equipo** entre
cientos, y acababa delante de una lista teniendo que pulsar la fila otra vez.

Ahora `?activo=<id>` abre la ficha de ESE equipo. Tres detalles:

- El efecto que la abre depende **sólo del identificador**. Si se relanzara en
  cada repintado, cerrar la ficha la volvería a abrir y no habría salida.
- **Va con las dos llaves.** Quien tiene `activos.mirar` y no `asset.read` no
  puede entrar a Activos: a ése se le manda a «Mis activos», su pantalla
  equivalente. Enseñar un botón que va a dar 403 es peor que no enseñarlo.
- Se añadió la **salida a la lista general**, que es otra pregunta distinta —
  «¿qué más hay por aquí?». Sin ella el QR era un callejón sin salida y había
  que volver con el botón del navegador.

### El menú: 44 entradas agrupadas por módulo

Palabras del usuario: *«los módulos están hechos mierda»*. Tenía razón. El
menú se había agrupado por el módulo del que salía cada pantalla, que es una
división que sólo tiene sentido para quien escribió el código:

- **«Infraestructura» tenía VEINTE entradas.** Ahí convivía el
  direccionamiento IP —que se mira una vez al mes— con las Instalaciones, que
  se rellenan en planta con guantes.
- **«Almacén» tenía UNA.** Una sección de un elemento no es una sección: es
  una línea con un título encima.
- **El Dashboard estaba pegado a «Mi bandeja».** Son dos cosas distintas: la
  bandeja es trabajo que hay que vaciar hoy; el tablero es si vamos mejorando.

**El criterio nuevo es uno solo: ¿quién abre esto y en qué momento?**

| Sección | Qué contesta |
|---|---|
| *(sin título)* | Lo mío: lo primero al llegar, sea cual sea tu puesto |
| **Producción** | Mirar la línea: qué se ve y qué no |
| **Gestión del mantenimiento** | El trabajo: qué hay que hacer, con qué y cuándo |
| **Trabajo en campo** | Lo que se rellena delante del equipo |
| **Qué hay en planta** | El inventario: dónde está cada cosa |
| **Red y energía** | Cómo está unido y de qué se alimenta |
| **Indicadores** | Si vamos mejorando o empeorando |
| **Sistema** | Quién entra y qué hizo |

**Órdenes e Inventario van JUNTOS**, y no es una concesión: una orden sin
repuesto no se cierra, y un repuesto sin orden no se retira. Tenerlos en dos
secciones obligaba a saltar de una a otra para responder una sola pregunta.

**Ocho secciones no marean porque casi nadie ve ocho.** Una sección sin
elementos visibles no se pinta, y los permisos hacen el recorte solos: cada
persona ve dos o tres. Lo que sí mareaba eran siete secciones de dos entradas.

### Verificador 15 — `verificar:menu`

Mover 44 entradas a mano es exactamente la tarea donde se cae una, y **una
entrada que se cae no rompe nada**: la ruta existe, la pantalla funciona, y
sencillamente no hay forma de llegar. Es la misma regla de siempre con otras
palabras: *ruta + pantalla ≠ función. Sin entrada en el menú, no existe.*

Comprueba tres cosas: que toda ruta de `App.tsx` tenga entrada (salvo las
exentas, **cada una con su motivo escrito**); que toda entrada esté en la
lista `rutas` de su sección —que es lo que abre la sección al navegar a ella—;
y que no sobre ninguna ruta declarada, porque abriría la sección equivocada.

**Falso positivo propio, cazado y corregido:** troceaba por `titulo:` desde
`const secciones`, así que la declaración de tipo —`{ titulo: string; … }`—
contaba como una sección más, vacía. Informaba de 9 secciones donde hay 8.
Una sección fantasma en el informe es un verificador que miente.

Probado reintroduciendo los dos fallos: borrar una entrada y quitar una ruta
de su lista. Los dos salen con código 1 diciendo cuál y dónde.

---

## 16. Bloque 70 — el desmarcado, y una lección sobre escuchar

### Entendí mal la pregunta, y eso costó una entrega entera

El usuario preguntó por qué al marcar una opción se desmarcaba la anterior. Yo
respondí que eso era el comportamiento correcto de un campo de una sola
elección —y lo es— y me puse a mejorar la accesibilidad de los radios.

**No era eso.** Lo que él veía era: *marco un motivo, me voy a escribir el
detalle, y la marca se cae sola.* Otro problema, y ése sí un fallo.

**Regla que queda: cuando el usuario describe un fallo, reproducir la
SECUENCIA que él describe antes de decir si es correcto o no.** Yo contesté
sobre «marcar dos seguidas» cuando él hablaba de «marcar y luego escribir».
Las dos frases se parecen y describen cosas distintas.

### El descarte que sí sirvió

`grep setMotivo` → dos sitios: el `onClick` y el reinicio tras enviar. Ninguno
se dispara al escribir. Y el usuario confirmó que **el texto NO se pierde**.

> Si dos estados viven en el mismo componente y uno sobrevive y el otro no,
> **no puede ser un remontaje**. Es un problema de PINTADO, no de estado.

Eso descarta media docena de hipótesis de un golpe, y es la clase de deducción
que hay que hacer ANTES de tocar código.

### El sospechoso: `display: flex` sobre un `<fieldset>`

`.av-motivos` era un `<fieldset>` con `display: flex`. El `<fieldset>` arrastra
un modo de dibujado propio heredado de los formularios de los 90, y Safari en
iOS es donde peor lo lleva. El fieldset se queda —agrupa y da nombre al grupo
para el lector de pantalla— pero **el reparto en filas lo hace un `<div>` de
dentro**, que es el arreglo estándar.

**No está confirmado que sea la causa**, y así está escrito en el código. Lo
que sí hace es quitar el único elemento raro de ese dibujado.

### Lo que de verdad cierra el problema: el resumen

Con cinco pastillas y el teclado abierto, las de arriba se van detrás de la
barra del navegador. **El resumen de lo marcado va justo encima del botón** y
se lee sin subir.

Y convierte un fallo irreproducible en uno diagnosticable:

- pastillas apagadas + resumen lleno → es de pintado
- resumen también vacío → es de estado

Un fallo que no se puede reproducir no se arregla; lo primero es hacer que
hable.

### Varios motivos en una incidencia

Petición del usuario: *«que se pueda seleccionar más de una opción, así ya no
se acumula tanto»*. Correcto, y el motivo es de planta: una cámara con el
cable cortado está **además** sin alimentación. Son dos hechos de la MISMA
avería, y obligar a elegir uno hacía que se abrieran dos incidencias — el
recuento del mes decía dos donde hubo una.

**Pero `category` sigue siendo UNO.** Los demás van en `categoriasExtra`.
Motivo: el reparto de «qué falla más» se cuenta sobre `category`; si una
incidencia contara en tres, los porcentajes pasarían del 100 % y el gráfico
—el que justifica el presupuesto— dejaría de significar nada.

El **primero que se marca es el principal**, y se enseña su número en la
pastilla. Sin enseñarlo, nadie sabe que el orden importa.

### «Incidencia», no «avería»

El módulo se llama Incidencias, la lista se llama Incidencias y el permiso es
`incident.create`. Que la pantalla de campo lo llamara «avería» obligaba a
traducir entre lo que se rellena y dónde aparece después.

### Las fechas se salían de su caja

En iOS un `date` o `datetime-local` **no es una caja de texto**: Safari le pone
su dibujado nativo, con su tipografía, centrado y un ancho mínimo propio que
**ignora el `width: 100%`**. Por eso en el escritorio se veía bien y en el
teléfono desbordaba.

`appearance: none` + **`min-width: 0`**, que es la línea que de verdad lo mete
en la caja. Y `font-size: 16px` no es estética: por debajo de 16, Safari hace
zoom al enfocar y descoloca la pantalla entera.

**Aplicado a TODOS los campos de fecha de la aplicación.** Arreglar el que se
vio y dejar los otros treinta es garantizar que el siguiente salga en la
siguiente exposición.

---

## 17. Bloque 72 — la bandeja deja de ser del Jefe

### Lo que estaba mal, y por qué no se veía

El usuario habló de «la bandeja del técnico» como si existiera. No existía:

- **`bandeja(userId)` recibía el identificador y NO LO USABA** en ninguna de sus
  ocho consultas. Era una bandeja global: el técnico veía exactamente lo mismo
  que el Jefe.
- **Las incidencias sólo entraban si eran ALTA o CRÍTICA.** Las suyas eran
  MEDIA, así que **no salían en ningún sitio**. Quien las reportó creía que
  estaban en la cola de alguien, y no lo estaban.

Ninguna de las dos rompe nada. No las ve el compilador, no las ve el lint y no
las ven 953 pruebas. Se ven preguntándose «¿y esto dónde sale?».

### Las decisiones, y por qué cada una

**DOS CUBOS DE INCIDENCIAS, no uno.** Si las cuatro críticas del mes se pintan
entre cuarenta de prioridad media, dejan de verse. Separarlas es lo que impide
que la lista larga tape a la corta.

**Y «lo demás» se escribe con `notIn`, no enumerando.** Si mañana se añade una
prioridad al enum, cae sola en el cubo correcto. Con una lista escrita a mano,
la prioridad nueva no saldría en ningún sitio — que es exactamente el fallo
que este bloque viene a cerrar.

**SÓLO LO QUE NO TIENE ORDEN** (`workOrders: { none: {} }`). Una incidencia con
orden abierta ya está en marcha y sale más arriba, en «sin detallar».
Repetirla haría que la bandeja pareciese el doble de llena de lo que está, que
es la forma más rápida de que se deje de mirar.

**SE ORDENA POR PERSONA, NO SE FILTRA.** Esconderle a un técnico lo que no es
suyo le quitaría de la vista la orden que le van a asignar en diez minutos y
la que abandonó el compañero que se fue de turno. En una cuadrilla de cuatro,
eso es peor que el problema que resuelve. Lo suyo sube arriba y va marcado.

**CON NOMBRE Y CON HORA.** Sin el nombre, la bandeja dice que hay un problema
pero no a quién preguntar, y el ingeniero acaba llamando por radio para
averiguar quién puso el parte.

### Las mejoras de los técnicos, en la bandeja

Siguen la MISMA secuencia que una incidencia: alguien de campo ve algo, lo
dice, y alguien decide. La diferencia es que una incidencia es algo roto y una
mejora es algo mejorable — **pero las dos se mueren igual si nadie las mira**.

Van con nombre, y eso no es un adorno: una propuesta sin nombre no se puede
agradecer ni preguntar, y **a la tercera que se queda sin respuesta el técnico
deja de proponer**. Ése es el circuito que hay que mantener vivo.

### «Sin orden no se interviene»

Palabras del usuario, y describen para qué existe el módulo: *«una incidencia
que sólo se queda en incidencia no se podrá intervenir»*, y la otra mitad, que
es la que le da sentido: *«un técnico que no puede asignar OM no significa que
se quede de brazos cruzados; debe reportar para que se haga una OM lo más
pronto posible»*.

Sin decirlo en pantalla pasan las dos cosas malas: quien reporta cree que ya
pidió el trabajo, y quien mira la lista no sabe que le toca convertirla. El
texto **cambia según lo que cada uno pueda hacer**.

### La OM del QR nacía suelta

No mandaba `incidentId`. El campo existía en el servidor y no se usaba desde
ahí, así que la incidencia y la orden vivían separadas y **no había MTTR** — el
MTTR es restar la hora del reporte de la del cierre, y sin enlace no se sabe
qué cierre corresponde a qué reporte.

Ahora se ata a la incidencia viva más reciente del equipo, **y se dice en
pantalla a cuál antes de pulsar**. El enlace automático y callado sería un
cambio invisible: si se ata a la equivocada, nadie tendría cómo notarlo.

### Dos verificadores míos me cazaron, otra vez

- **`verificar:densidad`**: mi aviso de «sin orden no se interviene» subió
  Incidencias de 180 a 217 palabras. Tenía razón — es una lista de trabajo, no
  un manual. Reescrito en una línea.
- **`verificar:constructores`**: dejé un `as any` en el array de estados. Un
  `as any` apaga la comprobación que avisa cuando un valor no existe en el
  enum. Tipado como `IncidentStatus[]` y `Priority[]`.

**Y la prueba nueva se cayó al refactorizar**, porque comprobaba el literal
`['ALTA','CRITICA']` en vez de la regla. Se corrigió la PRUEBA para que mire
la constante y sus dos usos: una prueba que se rompe al reordenar el código
sin cambiar el comportamiento acaba borrada.

---

## 18. Bloque 73 — criticidad A/B/C POR DISPOSITIVO

### La corrección del usuario, y por qué importa

Yo propuse la criticidad por ZONA. Él corrigió: **por DISPOSITIVO**, porque es
para **gestión de mantenimiento** — la pregunta es «¿cada cuánto subo a revisar
ESTE aparato?», no «¿qué tan importante es este sitio?».

Y **la zona no desaparece**: sigue diciendo cuánto importa ver ahí. Son dos
afirmaciones distintas, de dos áreas distintas:

| | Quién lo dice | Qué contesta |
|---|---|---|
| Criticidad de ZONA | Producción | Cuánto importa ver ahí |
| Letra A/B/C del EQUIPO | Mantenimiento | Cada cuánto se revisa |

### La regla que las une

> El equipo hereda la exigencia del LUGAR, **repartida entre cuántos equipos
> cubren ese lugar**.

Zona crítica con UNA cámara → esa cámara es A. La misma zona con tres → cada
una baja, porque hay respaldo. Es la «flexibilidad operacional» del método
CTR, y en CCTV es literal.

### El método: CTR (Criticidad Total por Riesgo)

    CRITICIDAD = FRECUENCIA de falla × CONSECUENCIA

    CONSECUENCIA = (Impacto operacional × Falta de respaldo)
                 + Seguridad de personas
                 + Dificultad de reparación

**Se multiplica, no se suma**, y ésa es la decisión de fondo. Sumando, una
zona muy importante daría A aunque el equipo lleve cinco años sin fallar — y
se estaría subiendo a revisar algo que no lo necesita, que es el desperdicio
que el método viene a evitar. Hay una prueba que lo fija en los dos sentidos.

### La regla del SOPORTE — los equipos que no vigilan nada

Un switch o un grabador no ven ninguna zona. Con la regla de arriba a secas
saldrían C, que es al revés de la realidad: si cae el grabador se pierden las
dieciséis cámaras que cuelgan de él.

> **Un equipo de soporte hereda LA PEOR letra de todo lo que depende de él.**

Y se resuelve **antes** que nada, no después: si se dejara para el final habría
que declararle a un switch «qué pasa si dejas de ver», que no tiene respuesta.

**La cantidad NO sube la letra.** Dieciséis cámaras C siguen dando C: perder
dieciséis cosas que no importaban sigue sin importar. La cantidad se dice en
el porqué, no en la letra.

### Dos reglas que no se aflojan

1. **La seguridad no se promedia.** Si vigila un sitio donde una persona puede
   resultar herida, **es A** — aunque el impacto operacional sea 1, haya nueve
   cámaras de respaldo y no haya fallado nunca. Hay una prueba que sube los
   cortes a 9999 y la letra sigue siendo A: la regla no depende del puntaje.
   El puntaje **se sigue enseñando**, para que se vea que la regla se saltó a
   propósito y no que el sistema no calculó nada.

2. **Sin datos, nunca C.** Un equipo sin clasificar es `SIN_CLASIFICAR` y sale
   en pendientes. Ponerlo en C haría que cuatrocientas cámaras sin revisar
   parecieran poco importantes, y nadie las revisaría nunca.

### Cómo se junta con el ambiente, que ya existía

**Manda el que más exige:** se toma el MENOR entre los días que pide la letra
y los que pide el ambiente.

    Cámara A en púlpito climatizado : letra 30 · ambiente 90 →  30 días
    Cámara C en calor radiante      : letra 90 · ambiente 30 →  30 días

Ninguna de las dos razones se pierde y no hay que discutir cuál pesa más — que
es una discusión sin respuesta buena. Y **sin letra manda el ambiente**, que
es lo que permite encender el módulo sin haber clasificado ni un equipo.

### Qué se guarda y qué se calcula

Regla de siempre: *lo que se puede calcular, no se guarda*.

- **SE GUARDA** sólo lo que declara una persona: impacto operacional y si
  vigila un riesgo para personas.
- **SE CALCULA** en cada consulta: respaldo, dificultad de acceso, frecuencia
  de fallas, la letra y el porqué.

Guardar la letra sería mantener dos verdades, y la segunda se queda vieja el
día que alguien añada una cámara a la zona.

### Los números son de la planta

Los cortes de A/B/C y los días de cada letra van **como parámetro**, no
escritos en el cálculo. `PARAMETROS_PROPUESTOS` es sólo el punto de partida
para que el módulo arranque el primer día, y está marcado como tal. Hay una
prueba que cambia los cortes y comprueba que la letra cambia **sin tocar
código**.

---

## 19. Bloque 74 — un cable NO es un activo

### Lo que el usuario tuvo que repetirme tres veces

> «El cableado no es un activo. Un cableado NO ES UN ACTIVO. La fibra es lo
> que conecta y hace posible la comunicación.»

Y tenía razón **contra el código**: `FIBER` estaba en la lista de tipos que se
ofrecen al dar de alta un equipo, en **Activos** y en **Instalaciones**. Se
podía crear una fibra como si fuera un aparato, con ficha, QR e historial.

### La regla, que es la 1 del estándar

    UN ACTIVO se mantiene, se avería y se reemplaza por otro igual: tiene
    marca, modelo y serie, se le hace rutina y se pide como repuesto con
    código.

    UN CABLE es lo que CONECTA dos activos. Se compra por metro, no tiene
    serie y no se le hace mantenimiento. Va en «Conexiones».

Cuando un tramo se corta, **la orden NO se abre sobre el cable**: se abre
sobre el equipo que se quedó sin comunicación, y el diagnóstico dice que fue
el tramo. Que es como se trabaja en planta.

### Por qué se prohíbe el uso en vez de borrar el valor

Los valores de un enum de PostgreSQL **sólo se pueden AÑADIR**. Está escrito
en este archivo desde el principio. Si hubiera un solo activo cargado como
fibra, quitarlo del enum rompería la tabla.

Así que se retira de donde se CREA y el valor sigue existiendo para que los
registros viejos no se caigan. **Verificador 12 del backend**
(`verificar:cable`) impide que alguien lo vuelva a ofrecer. Probado
reintroduciendo el fallo: sale con código 1, archivo y línea.

Detalle del verificador: **no barre todo el proyecto**. `FIBER` es legítimo en
las tablas de traducción —hay que poder pintar «Fibra» si existe un registro
viejo— y marcarlas sería un falso positivo. Se vigilan sólo los dos sitios
donde se ELIGE el tipo al crear. Y si un archivo no aparece, **avisa en vez de
dar luz verde**: un verificador que no encuentra lo que vigila es un
verificador apagado.

### La cadena de la planta, escrita de una vez

    220 V (tablero + circuito)  →  SWITCH PoE  →  cámaras · antenas · NVR

- Una cámara se cae → se pierde **una** vista.
- El switch PoE se cae → se pierden **todas** las que cuelgan de él.
- El circuito se cae → se pierden **todos** los switches del tablero.

Por eso el switch no es un aparato más: **es donde una falla se multiplica**.

### La criticidad SUBE por esa cadena

> Un equipo que no vigila nada hereda la PEOR letra de todo lo que depende de
> él.

Switch ← la peor de sus cámaras. Tablero ← la peor de sus switches. Fuente PoE
y UPS ← la peor de lo que alimentan.

**La cantidad no sube la letra**: dieciséis cámaras C siguen dando C.

### El estándar queda escrito en `docs/ESTANDAR_ACTIVOS.md`

Siete reglas: qué es un activo, la cadena de dependencia, cómo sube la
criticidad, el método CTR, cómo la letra decide el mantenimiento, las tres
ramas del software y el rotulado. **Es la norma del proyecto**: lo que no la
cumpla está mal.

---

## 20. Bloque 75 — Hojas de Ruta, y el menú en tres puertas

### Lo que cierra

El preventivo sabía **cuándo** tocar cada equipo. No sabía **qué hacer**. El
técnico recibía «toca revisar AA-CAM-T1-001» y el detalle vivía en un Excel en
el PC de alguien.

El usuario entregó su Excel real de SAP con **cinco hojas ya hechas**: Cámara,
Antena, Switch PoE, Gabinete y PC. **No hay ni un paso inventado** —
`hojas-de-arranque.ts` es copia literal de su archivo.

### UNA HOJA POR TIPO DE EQUIPO, confirmado por él

Una sola sirve para las cuatrocientas cámaras. Por eso `tipoEquipo` es ÚNICO:
dos hojas para las cámaras significa que nadie sabe cuál es la buena. Si fuera
por equipo habría que escribir los mismos catorce pasos cuatrocientas veces, y
el día que cambie uno, corregirlo cuatrocientas.

La pantalla enseña **cuántos equipos usa cada hoja**. Es lo que hace entender
que tocar ese documento afecta a cuatrocientas intervenciones, no a una.

### El límite de 40 caracteres — el corazón del módulo

Su Excel lleva una columna que cuenta los caracteres. No es manía: **SAP corta
ese campo en 40, y si UNA línea se pasa la carga se rechaza ENTERA** — no la
línea, la carga. Y el mensaje de SAP no dice cuál fue.

Se valida en tres sitios, a propósito:

1. **En la pantalla, en vivo**, con el contador junto al campo. Corregir una
   frase recién escrita cuesta un segundo; corregir setenta al final, media
   mañana.
2. **Al guardar, en el servidor.** El navegador no es de fiar.
3. **En una prueba** que recorre las cinco hojas de arranque.

### Decisiones del modelo

- **La clave de control se DEDUCE, no se pide.** Sin suboperación es la
  operación principal (`PM01`); con ella es un paso (`PM04`). Pedirla sería
  dejar que alguien la ponga al revés.
- **Los pasos se borran y se reescriben dentro de una transacción.** Es más
  simple que casar cuáles cambiaron, y no hay ningún instante en que la hoja
  exista sin sus pasos — un documento vacío diría que no hay que hacer nada.
- **De diez en diez**, como en SAP: deja hueco para meter un paso entre dos sin
  renumerar la hoja entera.
- **Al reordenar se RENUMERA.** Si no, arrastrar una fila cambiaría la pantalla
  y no el documento, y en SAP saldría en el orden viejo.
- **`frecuenciaDias` se deriva, y si no se entiende queda `null`.** La hoja
  vale igual como documento; sólo no se programa sola. Inventar 30 días haría
  que el sistema generara órdenes con una frecuencia que nadie pidió.
- **El material se guarda como TEXTO** y el enlace al almacén es opcional: la
  hoja es un documento y tiene que poder nombrar algo que aún no está de alta.

### Quién puede qué

    LEER      wo.read     — el técnico consulta los pasos antes de subir
    ESCRIBIR  wo.approve  — SÓLO el Jefe de Mantenimiento

No es `wo.update` a propósito: quitar un paso de seguridad de aquí no afecta a
una orden, afecta a **todas las que se hagan de ahora en adelante**.

### Una hoja nueva nace segura

Las cinco del ingeniero empiezan igual —EPP, LOTO, ausencia de tensión— y
terminan documentando. Por eso una hoja nueva **ya viene con esos pasos
puestos**: quien la crea no tiene que acordarse del bloqueo de energía, y sobre
todo no puede olvidarse. Hay una prueba que lo fija.

### El menú, en TRES puertas

Palabras del usuario: *«sectorizamos tres ramas principales: GESTIÓN para los
ingenieros, PRODUCCIÓN para los de púlpito y jefes, y la parte TÉCNICA que son
los obreros que están en campo y llenan los datos»*.

| Puerta | Qué contesta |
|---|---|
| *(sin título)* | Lo mío al llegar |
| **Producción** | ¿Qué se ve y qué no? |
| **Gestión del mantenimiento** | ¿Qué hay que hacer, con qué y cuándo? |
| **Trabajo en campo** | ¿Qué hay ahí y cómo está conectado? |
| **Sistema** | Administración |

**Conexiones vive en CAMPO**, y ahí está el cable: no es un activo, es lo que
une dos activos, y quien lo declara es el técnico que lo ve.

### Del método, dos cosas

- **`prisma generate` no corre aquí.** Para los CAMPOS nuevos bastaba duplicar
  líneas del cliente generado; para MODELOS enteros ese truco **rompió el
  cliente**. Lo correcto —y lo que queda escrito— es **añadir a mano los tres
  accesores** en `internal/class.ts`, que son tres líneas. `PrismaClient` es un
  ALIAS de tipo, no una interfaz, así que `declare module` no sirve.
- Cuando el parche rompió el cliente, se pudo deshacer exacto porque la
  transformación sólo INSERTABA líneas con nombres que antes no existían:
  borrar toda línea con esos nombres lo devolvió a su estado. **Un parche
  reversible por construcción vale mucho más que uno cuidadoso.**

---

## 21. Bloque 76 — la criticidad ENCHUFADA, y el cálculo que llevaba tres bloques muerto

### Lo que pasó, y es un fallo de método mío

El usuario lo dijo así: **«la criticidad debe salir en ACTIVO y también en la
parte de GESTIÓN»**. Tenía razón contra el código.

`criticidad-abc.ts` se escribió en el bloque 73 con 26 pruebas en verde. En el
bloque 76 se midió:

    grep -rl "criticidad-abc" backend/src frontend/src
    → backend/src/common/criticidad-abc.spec.ts

**Sólo lo llamaba su propia prueba.** Ni una pantalla, ni un endpoint, ni un
servicio. Y yo lo di por hecho en el informe de pendientes como si existiera.

Es la misma regla que ya está escrita cuatro veces en este archivo —el mapa de
red, el módulo de documentos, el aviso del QR, el barrido de endpoints del
bloque 21— y esta vez la rompí yo mismo:

> **Cálculo + pruebas en verde ≠ función.** Un archivo que sólo importa su
> propio `.spec` no está enchufado a nada, y no hay verificador que lo vea
> porque *compila, pasa el lint y pasa las pruebas*.

Se caza en una línea: `grep -rl <archivo>` y mirar si aparece algo que no sea
su prueba. Conviene repetirlo cada dos o tres bloques, igual que el barrido de
endpoints del bloque 21.

### La pieza que faltaba estaba EN MEDIO

No faltaba la pantalla: faltaba **quién le da los cinco factores al cálculo**.
Eso es `common/criticidad-datos.ts`, y sin él no había pantalla posible porque
no había nada que pintar.

**De los cinco factores, el sistema ya tenía CUATRO:**

| Factor | De dónde sale, sin preguntar nada |
|---|---|
| Impacto operacional | `Location.criticidadProduccion` — lo declaró Producción en el bloque 26 |
| Respaldo | cuántas cámaras más cuelgan de la misma ubicación |
| Dificultad de acceso | `Asset.medioAcceso` — declarado en el bloque 41 |
| Frecuencia de falla | incidencias del equipo en 12 meses |
| Soporte | puertos del switch, grabador de la cámara, componentes, tablero |

**Sólo hacía falta declarar UNO: el riesgo para personas.**

> Un formulario que pide un dato que el sistema ya tiene se rellena mal, porque
> quien lo rellena sabe que es redundante. Y si se pregunta dos veces lo mismo
> con otras palabras, se obtienen dos respuestas distintas y a los tres meses
> nadie sabe cuál mirar.

### El riesgo para personas va en la ZONA, no en la cámara

El peligro lo tiene el SITIO: la barra caliente, el paso de grúa, el foso.
Declararlo cámara por cámara es escribir cuatrocientas veces el mismo dato y
que a la número treinta ya no coincida con la número tres.

**Pero el activo puede anularlo**, porque el caso real existe: dos cámaras en
la misma zona, una mirando el paso de grúa y otra un pasillo. Sin la anulación
habría que elegir entre subir de más toda la zona o dejar sin proteger la que
lo necesita.

`NULL` significa **«vale lo de la zona»**, no «no». Por eso `declarar()`
distingue entre «no vino en la petición» y «vino como `null`»: si se trataran
igual, un impacto puesto por error se quedaría para siempre. Es el mismo
cuidado del bloque 16 — *`false` es una respuesta, `''` no*.

### Lo que se guarda y lo que no

**No se guarda la letra.** Se recalcula en cada consulta. Guardarla sería
mantener dos verdades, y la segunda se queda vieja el día que alguien añada una
cámara a la zona. Hay una prueba que lo fija leyendo el código.

**Los números SÍ se guardan**, en `parametros_criticidad`, fila única. Los
cortes y los días son un dato de planta y todo lo de planta se edita desde la
interfaz. **La migración no inserta ninguna fila a propósito**: mientras no
exista, se usan los PROPUESTOS del código y la pantalla lo dice con esas
palabras. Insertarlos los convertiría en una decisión que nadie tomó.

Y se validan dos cosas que no son burocracia:

- `corteA <= corteB` dejaría la letra B **sin ningún puntaje posible**: la
  planta entera repartida entre A y C, el sistema funcionando y las cifras
  basura.
- `diasA > diasC` diría que lo más crítico se revisa menos a menudo, que es al
  revés de para qué existe el módulo.

### La cascada, y las dos guardas de ciclo

Tablero ← switch ← cámaras. Se resuelve con memoria y **con guarda de ciclo en
los dos sitios**: en las dependencias y en el árbol de ubicaciones. Si alguien
declara desde la pantalla que A cuelga de B y B de A, sin guarda la recursión
no termina y **la pantalla nunca responde**. Un fallo de datos no puede dejar
la pantalla en blanco.

**Un switch SIN NADA ENCHUFADO no se trata como soporte.** Si se tratara,
quedaría en `SIN_CLASIFICAR` para siempre cuando lo que pasa es que aún no se
ha declarado qué tiene conectado. Cae por el camino normal y sale como
pendiente, que es la verdad.

**El alimentado vía PoE no cuenta dos veces en el tablero.** Esa cámara cuelga
del switch y el switch ya cuelga del tablero. No cambiaría la letra —se toma la
peor— pero inflaría el «de él dependen 40 equipos», y una cifra inflada es una
cifra en la que se deja de confiar.

### Los permisos, y la lección del bloque 68 aplicada por delante

    MIRAR      asset.read  O  activos.mirar
    DECLARAR   asset.update       — lo dice quien está delante del equipo
    LOS NÚMEROS wo.approve        — reordena el trabajo de la planta ENTERA

Cerrar la lectura sólo con `asset.read` dejaría al Jefe de Tren sin poder ver
cada cuánto se revisa su propio equipo. **Es exactamente lo que pasó con el QR
en el 68 y esta vez se puso desde el principio.** Probado quitándolo: las dos
pruebas se caen.

### Dos verificadores míos me cazaron otra vez

- **`verificar:clases`**: usé `crit-${letra}`, que genera clases que no existen
  en la hoja de estilos, y `.tabla-tarjetas`, que tampoco existe. La clase
  dinámica se quitó entera: **el color viene del dato y va en línea**. Tenerlo
  además en el CSS serían dos reglas para lo mismo y una ganaría en silencio,
  que es lo que cazó `verificar:cascada` en el 67.
- **`verificar:textos`**: 127 caracteres en un párrafo de ayuda. Reescrito en
  una línea.

### Del método

- **El parche del cliente de Prisma ahora es un script**
  (`scripts/parche-cliente-prisma-b76.js`), con su `--deshacer`. Es reversible
  **por construcción**: sólo inserta líneas y todas contienen un nombre que
  antes no existía, así que deshacerlo es borrar toda línea con esos nombres.
  Es la lección del bloque 75 convertida en herramienta.
- **El build del frontend NO se puede correr aquí**: `rolldown` necesita un
  binario nativo que no está en este entorno. Lo que sí corre y se corrió:
  `typecheck`, `lint` y los 15 verificadores —incluido el de formato, que pasa
  cada archivo por **esbuild**, el mismo analizador que usa Vite—. Se dice tal
  cual y no se escribe «build verde».

---

## 22. Bloque 77 — la auditoría, y tres escrituras que fallaban en silencio

### Los cuatro barridos, que es lo reutilizable

Se buscaron bugs de forma sistemática en vez de por intuición. Los cuatro se
pueden repetir cada dos o tres bloques y están descritos en
`docs/AUDITORIA_BLOQUE_77.md`:

| Barrido | Qué caza | Resultado |
|---|---|---|
| **A1** · archivos que sólo importa su `.spec` | Código construido y no enchufado | 1 (`colores-de-cable.ts`) |
| **A2** · endpoints sin llamada en el frontend | Funciones sin puerta de entrada | 43, de los que ~10 son huecos reales |
| **B** · escrituras que no confirman nada | Botones que se sienten rotos | 4 bugs reales |
| **D** · permiso de la pantalla vs. permiso de sus llamadas | Pantallas que salen vacías | 0 automáticos, 1 conocido |

**A2 requiere normalizar el frontend antes de comparar.** La primera versión dio
70 resultados y la mitad eran falsos positivos: las rutas se construyen
concatenando (`'/assets/' + id + '/status'`), así que en el texto no aparece
`/assets/x/status` sino comillas y un `+` en medio. Sustituyendo `' + loQueSea
+ '` y `${...}` por un comodín, bajó a 43.

### El patrón que hay que perseguir: `.catch(() => {})`

Los tres bugs graves eran el mismo:

**1. La contraseña del equipo se perdía en silencio.** Al dar de alta un activo,
si el guardado de la credencial fallaba, el activo se creaba, la pantalla decía
«guardado» y la contraseña no estaba en ningún sitio. Nadie se enteraba hasta
que alguien iba a conectarse a la cámara.

**2. Borrar una credencial que no se borraba.** El peor, y **no es un fallo de
comodidad, es de seguridad**: se da de baja a un contratista, se borran sus
accesos, el borrado falla, y la contraseña sigue guardada creyendo todos que no.

**3. Borrar una foto que no se borraba.** Se recarga la lista, la foto sigue, se
vuelve a pulsar, sigue. Es literalmente cómo se aprende que un software no
funciona.

> **Regla: un `.catch(() => {})` sobre una ESCRITURA es siempre un bug.** Sobre
> una lectura es deuda —el bloque queda vacío—; sobre una escritura es una
> mentira: la pantalla afirma que algo pasó y no pasó.

Detalle que lo delata: en Inventario, el botón de *vincular* sí avisaba y el de
*desvincular*, justo debajo, no. Cuando dos acciones gemelas se comportan
distinto, una de las dos está mal.

### Callar un verificador es peor que ignorarlo

`<Campo>` ponía el `<label>` **al lado** del control, no envolviéndolo, así que
el navegador no los asociaba: tocar la etiqueta no enfocaba el campo, y con
guantes eso es la diferencia entre rellenarlo y no.

`verificar:etiquetas` se quejaba con razón. Y en **ocho campos** alguien lo calló
con `aria-label="&nbsp;"` — una etiqueta que no dice NADA, que el lector de
pantalla lee como un espacio en blanco.

**Se arregló en el componente**, no campo por campo, y los ocho postizos se
borraron. Al verificador se le enseñó a reconocer `<Campo>` **exigiendo que
traiga su `etiqueta=`**: un `<Campo>` sin etiqueta sigue siendo un fallo.

**Y el verificador me cazó a mí otra vez:** la primera versión de esa excepción
miraba una ventana de 400 caracteres y **no cazaba el fallo** — la ventana se
comía el `<Campo>` siguiente y encontraba SU etiqueta. Es el mismo error de las
ventanas de 3.000 caracteres del verificador 9. Corregido a mirar sólo hasta el
`>` que cierra la etiqueta de apertura, y **probado reintroduciendo el fallo**.

### Una etiqueta que MIENTE es peor que ninguna

El desplegable de *gabinete* llevaba `aria-label="Elegir tablero eléctrico"` —
el nombre del campo de al lado. Quien no ve la pantalla elegía el campo
equivocado **sin ninguna pista de que se estaba equivocando**.

### El QR imprimible: medio agujero cerrado es un agujero

El bloque 68 abrió la FICHA con `@RequireAlguno` y se dejó fuera la ETIQUETA
(`/assets/:id/qr` y `/assets/qr/sheet`). Un Jefe de Tren no podía imprimir el
rótulo de su propio equipo — y el rótulo es lo que hay que pegar para que la
ficha se pueda escanear. **Una sin la otra no sirve de nada.**

> Cuando se abra un permiso en una ruta, buscar **todas** las rutas de esa misma
> función. Cerrar la mitad deja algo que parece que funciona y no funciona.

### Y un error mío de 24 horas

El bloque 76 dejó `PUT /criticidad/zona/:id` **escrito y sin pantalla**, y la
pantalla de Criticidad prometía en su cabecera *«se declara la zona una vez y se
clasifican todas sus cámaras de golpe»*.

**Prometer en pantalla algo que no se puede hacer es peor que no tenerlo.** El
usuario lo busca, no lo encuentra, y deja de fiarse del resto de lo que lee.

Cerrado: Ubicaciones → la zona → «Seguridad de las personas». Tres estados —sí,
no, sin declarar— porque con un booleano «sin declarar» y «no» serían el mismo
valor y un sitio peligroso sin revisar parecería seguro.

### Error de método: inserté código en el componente equivocado

Al añadir la sección de seguridad usé como ancla `<Seccion titulo="La firma">`
y ese texto aparecía en DOS componentes del mismo archivo. El bloque acabó
dentro de `FirmaIntervencion` en vez de `EditorZona`. Lo cazó el typecheck
—`Cannot find name 'riesgo'`— pero podría no haberlo cazado si los dos
componentes hubieran tenido variables con el mismo nombre.

**Regla: antes de insertar por ancla, comprobar que el ancla es ÚNICA en el
archivo.** Un `grep -c` cuesta un segundo.

### `verificar:densidad` me cazó, y el arreglo correcto no fue subir el tope

La sección nueva dejó Zonas en 197 palabras con tope 195. Recorté tres veces
las `ayuda=` y el número **no se movía**: el verificador cuenta el texto ENTRE
etiquetas JSX, no los atributos. Leer cómo cuenta antes de recortar habría
ahorrado tres intentos.

Se recortó donde sobraba sabor y no información —una explicación de tres líneas
sobre por qué Alta y Crítica exigen motivo, cuando el formulario ya lo impide y
lo dice al pulsar—. **Subir la línea base habría sido la salida fácil y falsa.**

---

## 23. Bloque 78 — el ciclo del ingeniero, entero

### La corrección del usuario sobre el permiso, y por qué tenía razón

> «Sólo el jefe de mantenimiento pueda alterar eso y todos los demás puedan
> verlo en el campo de activos y donde aparezca el activo en sí.»

Yo había puesto `asset.update` razonando que lo declara quien está delante del
equipo. **El DATO sí es de campo; la CONSECUENCIA no.** Marcar «hay que parar
la línea» convierte esa cámara en A y pasa a revisarse cada 30 días en vez de
cada 90: eso reordena el plan de mantenimiento de la planta.

Y `asset.update` lo tienen CUATRO roles, dos de ellos técnicos. Se midió antes
de responder, no de memoria.

> **La regla: el permiso no lo decide la dificultad de la acción, lo decide lo
> que la acción AFIRMA.** Es lo mismo que hace que cerrar una orden sea
> `wo.approve` y no `wo.update`.

**Cerrar la escritura no cierra la lectura.** La letra se ve ahora en la ficha,
en la lista de Activos, en «Mis activos» y en el QR — y a quien no puede
declararla se le dice quién sí, porque un formulario que no está y no se
explica parece una función que falta.

### El evento de falla: por qué el MTTR mentía

    03:00  la cámara se apaga
    08:00  el púlpito lo ve al entrar de turno   ← 5 h de DETECCIÓN
    10:00  el técnico sube                        ← 2 h de ORGANIZACIÓN
    11:00  vuelve a funcionar                     ← 1 h de REPARACIÓN

El MTTR viejo —de orden abierta a orden cerrada— decía **8 horas** y le cargaba
a mantenimiento 7 que no son suyas. `FailureEvent` separa los tres tramos, cada
uno con su dueño.

**Es una tabla APARTE de la orden**, y no unos campos más, porque una avería y
una orden no son lo mismo: una avería puede necesitar dos órdenes, una orden
puede no venir de ninguna avería, y una avería puede resolverse sin orden.

**Y NO ES UN FORMULARIO NUEVO.** El evento nace solo al reportar la incidencia,
`repairStartedAt` se marca con el primer avance de la orden y `restoredAt` con
la firma de resolución. Un formulario que alguien tenga que acordarse de abrir
no se abre, y entonces el indicador queda peor que antes: con huecos y con
pinta de estar completo.

**Lo estimado se dice.** Cuando nadie sabe la hora real de la caída se usa la
del reporte y se marca `ocurrioEsEstimado`. Esos eventos **quedan fuera del
tramo de detección**: con `occurredAt = detectedAt` saldría cero y diría que
nos enteramos al instante, que es justo la mentira que el módulo viene a
quitar.

**El histórico NO se rellena.** Fabricar un evento por cada incidencia cerrada
daría `occurredAt = reportedAt` en el 100 % de los casos. Una serie que empieza
es honesta; una serie inventada no.

### La programación: tres cosas que había que casar

    CUÁNDO TOCA  ×  QUÉ HACER  ×  CUÁNDO SE PUEDE ENTRAR

Faltaba la tercera, y sin ella una orden de una zona que exige tren parado
**nacía imposible**: vencía, entraba en el backlog, hundía el cumplimiento, y
nadie podía haberla hecho.

- **El intervalo lo manda el que MÁS exige** entre la letra, el ambiente y el
  plan. No se promedian: un promedio no lo defiende nadie. En empate gana la
  LETRA, porque es el criterio que se puede explicar en pantalla.
- **Lo vencido conserva su fecha original.** Reprogramarlo para hoy haría que
  el cumplimiento dijera que va a tiempo con tres semanas de retraso. La deuda
  se ve o no se paga.
- **Si exige parada y no hay ventana, se genera IGUAL** y se avisa aparte. No
  generarla la sacaría del backlog: un trabajo que nadie puede hacer tampoco lo
  vería nadie.
- **La orden nace con los pasos de su hoja de ruta COPIADOS**, no enlazados. Si
  mañana cambia la hoja, las órdenes ya emitidas no pueden cambiar solas —
  quedarían firmadas diciendo que se pidió algo que no se pidió.

#### El fallo que se me escapó al escribirlo, y lo caza una prueba

La ventana guarda el enum `TREN_1`; el árbol de planta da `AASA-PISCO-T1`.

    'TREN_1'.includes('T1')   →   FALSO

Comparar por texto —que es lo primero que sale— hacía que **ninguna orden
encontrara su ventana**. Y no rompía nada: todas salían «esperando parada»,
que es un resultado plausible. **Ése es el tipo de fallo que se queda meses.**
Se compara por el NÚMERO, que es lo único que las dos formas comparten.

### Cumplimiento normativo: la lista, no el porcentaje

Contesta «si mañana viene una auditoría, ¿qué NO vamos a poder enseñar?». No
mide si el trabajo se hizo —eso es el cumplimiento del preventivo—: mide si
está **documentado** como el propio sistema exige.

**Las seis reglas salen de obligaciones que este proyecto YA declaró**, cada una
en su bloque. No se inventa ninguna: un requisito que el sistema no pide daría
un indicador imposible de poner en verde, y eso se deja de mirar.

- **Se devuelven sólo las que se INCUMPLEN.** Una lista donde el 80 % dice
  «bien» esconde las que dicen «mal».
- **Cada hallazgo dice DÓNDE se arregla.** Sin eso es un reproche, no una tarea.
- **Lo peor primero por PROPORCIÓN**, no por número: cinco de cinco es más
  grave que cincuenta de cuatrocientas.
- **Una regla sin nadie a quien aplicarle NO cuenta como cumplida.** Contarla
  inflaría el porcentaje con reglas que no se han probado — la forma más fácil
  de que un indicador diga que todo va bien sin haber mirado nada.

### Dos reglas de método que se repitieron

**La prueba se actualiza escribiendo la decisión nueva.** `criticidad-quien-
puede.spec.ts` fijaba `asset.update` y se cayó al cerrarlo. Se cambió a
`wo.approve` **y se añadió que NO acepte el viejo**: un patrón que acepte los
dos deja de fijar nada.

**Cuando se abre un permiso, hay que mirar qué OTRA cosa deja de funcionar.**
El editor de zonas tenía `zona.criticidad` y la sección de seguridad nueva
exige `wo.approve`: sin una guarda, un Supervisor TI habría rellenado el
formulario entero, la primera llamada saldría bien y la segunda daría 403 —
guardado a medias con un error que no explica qué parte se guardó.

---

## 24. Bloque 80 — cinco correcciones del usuario sobre la hoja del ingeniero

### La hoja, leída de verdad

Hasta este bloque yo trabajaba de memoria sobre «los cuatro indicadores». El
usuario mandó la foto del papel y decía otra cosa:

```
② Criticidad de ACTIVOS        ③ Planeamiento de Mant.
   A → MP? (fre 1)                ↳ Hojas Ruta
   B → MP? (fre 2)
   C → MP? (fre 3)             ⑤ Reunión
                                  40 CORREC │ 30 PREV      →   (meta)
④ Ejecución                            30 PRED
   KPIs (Backlog)
   % cumplim MP
   Nivel de servicio
   Cumplim. de Normativa
```

**Regla que queda: cuando el usuario diga que hay una imagen, buscarla antes de
responder.** Yo había implementado el nivel de servicio como disponibilidad de
cámaras sin haberla mirado.

### 1 · Fuera el PREDICTIVO

> «¿Qué se va a predecir con las cámaras o los switch?»

Tiene razón de planta. El predictivo tiene sentido donde hay desgaste medible
—vibración de un rodamiento, análisis de aceite, termografía de un motor—. Una
cámara **da imagen o no la da**. Lo que aquí llamábamos predictivo era
DETECCIÓN TEMPRANA, y eso ya lo hace el módulo de monitoreo.

**El valor del enum NO se borra** (regla de siempre: un enum sólo admite
AÑADIR, y hay órdenes viejas cargadas así). Se retira del reparto y de la
entrada de menú, y las predictivas viejas salen en `otros`, junto a mejora y
mapeo, para que el total siga cuadrando con la lista de Órdenes.

### 2 · Se llama CRITICIDAD DE ACTIVOS

En la hoja pone «② Criticidad de activos». «De mantenimiento» sonaba a escala
interna del área, y no lo es: **es una propiedad del equipo** que además decide
cada cuánto se le hace mantenimiento.

### 3 · Producción no ve la gestión, y el motivo era un permiso compartido

> «Producción no tiene que ver toda la parte de gestión, sólo para agendar OM y
> verificar almacén.»

La causa: el Jefe de línea y el Jefe de Tren tienen `dashboard.read` —lo
necesitan para SU tablero, «Estado por Tren»— y ese mismo permiso les abría el
Dashboard del ingeniero, los Indicadores y Exportar.

**La capacidad que separa es `wo.read`**: quien gestiona órdenes es quien mira
los indicadores de esas órdenes. Ni un nombre de rol.

Y al revés: **el almacén se ABRIÓ** a `om.mirar` porque él lo pidió. En lectura,
y en el endpoint TAMBIÉN — abrir sólo la entrada del menú habría dejado la
pantalla cargando y saliendo vacía con un 403, que es el fallo del bloque 68.

> Cuando se abre una entrada de menú, se abre su endpoint en la misma entrega.
> Media puerta es peor que ninguna: parece que funciona.

### 4 · Lo irreversible estaba en la primera línea de la ficha

«Dar de baja» y «Eliminar definitivamente» iban en la misma fila que «Código
QR». **Lo primero que se veía al abrir una cámara era el botón de borrarla.**

Bajan al final, en su propia zona roja con título. El objetivo no es que sea
difícil pulsarlos: es que no se pulsen POR INERCIA buscando otra cosa. La
confirmación escrita a mano sigue puesta — son dos barreras, y la primera es
haber tenido que leer la ficha entera para llegar.

### 5 · El Dashboard tenía DOCE indicadores

> «Quita todo eso innecesario, sólo deja análisis.»

Estaban DUPLICADOS: el cumplimiento del preventivo y las OM vencidas viven en
Indicadores, la salud de la visión en «Estado por Tren», los activos totales en
Activos. Doce números repartidos entre cuatro pantallas hacen que no se mire
ninguno.

Se quedan **cuatro**, con un criterio único: **que se pueda hacer algo con
ellos hoy**. Los cuatro llevan a una pantalla donde actuar; los ocho que se
fueron sólo describían.

Y el **quesito del reparto** pasa a ser el primer panel de Análisis: es el
único que contesta «¿apagamos incendios o nos adelantamos?». Los otros tres
describen el inventario.

### Del método

`verificar:densidad` me cazó TRES veces en este bloque —Indicadores, Assets y
Zonas— y las tres tenía razón: cada función nueva trae su párrafo explicativo y
la pantalla engorda sin que se note. El arreglo fue siempre el mismo: **recortar
donde sobra sabor, no donde hay información**. Subir la línea base no se hizo
ni una vez.

---

## 25. Bloque 81 — Estructura de activos

### Se llamaba «Activos Tecnológicos»

En la hoja del ingeniero es el paso ① y se llama **«Estructura de activos»**. El
nombre importa porque describe qué hay que hacer con la pantalla: no mirar una
lista, sino ver **cómo está repartida la planta**.

### El reparto por criticidad, arriba y filtrando

Cuatro tarjetas —A, B, C y sin clasificar— con el recuento de **TODA la
planta**, no de la página. Un recuento por página sería un número que cambia al
pasar de hoja, y eso destruye la confianza en la cifra.

Al pulsarlas filtran. Y **los pendientes no se esconden**: van con su color de
aviso porque son lo único accionable de las cuatro — una letra no se «arregla»,
un pendiente sí.

### La letra no es una columna, y eso tiene consecuencias

Se recalcula en cada consulta, así que **ni el `where` ni el `orderBy` de
Prisma pueden con ella**: el filtro y el orden se aplican sobre la página ya
enriquecida.

Consecuencia: **filtrando por letra, el paginador cuenta lo de esa página**, no
la tabla entera. Se dice en pantalla, porque callarlo haría leer «8 de letra A»
creyendo que son los 8 de la planta. El total real viaja aparte, en `reparto`.

### El orden por defecto es POR CRITICIDAD

Es la pregunta con la que se abre la pantalla —«¿qué es lo importante?»— y una
lista alfabética de cuatrocientas filas no la contesta.

**Los SIN CLASIFICAR van SEGUNDOS**, justo detrás de las A. Al final de
cuatrocientas filas no los ve nadie.

### La fecha de actualización, sin romper la tabla

El usuario la pidió al costado. Añadirla a secas dejaba **doce columnas**, y en
la pantalla del púlpito (1366 px) eso obliga a desplazarse de lado para leer
una fila.

Así que en vez de añadir, **se agrupó lo que va junto**:

- el tipo baja debajo del código
- el tren y la etapa bajan debajo de la ubicación

Quedan las mismas once columnas, con la fecha dentro y sin desplazamiento. La
fecha pasa por `fechaTabla` como todas las del sistema — lo vigila
`verificar:fechas`, para que no haya tres formatos distintos.

### Sobre las dependencias

El usuario pidió una rama «Dependencias» con la estructura de red. **Ya existe**
y no hay que construirla: `De qué depende` (bloque 47) y `Mapa de red` (bloque
48) están en «Trabajo en campo». Cuando se haga será agruparlas bajo ese
nombre, no escribirlas de cero.

---

## 26. Bloque 82 — cortar el acceso de inmediato

### El agujero, y lo encontró el usuario

> «Imagina que nos hackeen, podemos quitarle el acceso rápidamente.»

**Y NO SE PODÍA.** `jwt.strategy.ts` valida la FIRMA del token y ya: no
consultaba la base para nada. Los permisos viajan dentro del token, que dura 15
minutos. Consecuencia real:

- **desactivar a alguien no le cortaba el acceso** — seguía entrando;
- quitarle un rol tampoco: mantenía sus permisos viejos;
- una sesión robada valía quince minutos.

Estaba escrito en este archivo desde el bloque 15 como «S-04, conocido y
aceptado». No era aceptable.

### La solución: un contador por usuario

El token lleva `pv`. En cada petición se compara con `users.permisosVersion`.
Subir el contador mata TODOS sus tokens a la vez.

**Por qué un contador y no `updatedAt`:** `updatedAt` cambia con cualquier
edición. Corregirle el apellido a alguien le tumbaría la sesión en mitad de una
orden, sin motivo, y a la tercera vez el software se percibe como inestable.
El contador sube SÓLO cuando cambia lo que la persona puede hacer.

### Las dos reglas que evitan tumbar la planta

1. **Un token SIN contador PASA.** Los vivos el día del despliegue se emitieron
   antes de que esto existiera. Rechazarlos echaría a todo el mundo a la vez,
   en mitad de un turno. Es una ventana de un cuarto de hora, UNA vez.
2. **Si la base no responde, PASA.** Defensa en profundidad, no única capa: el
   token sigue firmado y sin caducar. Un fallo de base de datos no puede dejar
   a la planta sin sistema. Misma decisión que el guard de ámbito del 12.3.

### Caché de 15 segundos, y por qué el corte es instantáneo igual

Sin caché sería una consulta a la base EN CADA PETICIÓN. Con 15 segundos el
techo del retraso son 15 segundos — frente a 15 minutos.

Pero `cortarAcceso` **borra la caché a mano**, así que en la práctica el corte
se nota en la siguiente petición. Los 15 segundos sólo aplican si corren varias
instancias y el corte lo atendió otra.

### Cortar hace TRES cosas, y las tres juntas

    1. Sube el contador   → sus tokens de acceso dejan de valer
    2. Revoca sus sesiones → no puede renovar con el token de refresco
    3. Borra la caché      → el corte es inmediato

**Hacer sólo una deja media puerta abierta.** Subir el contador sin revocar
sesiones permitiría renovar; revocar sin subir el contador dejaría vivo el
token de acceso quince minutos.

**Cortar NO desactiva al usuario, a propósito.** Cortar una sesión sospechosa
es urgente y reversible; dar de baja a una persona es administrativo. Juntarlas
obligaría a elegir entre no cortar o cortar de más.

### «Quién está dentro»

La otra mitad: cortar sin ver es disparar a ciegas. La pantalla enseña quién,
desde qué IP y aparato, desde cuándo y su última actividad.

- **Una sesión VIVA de un usuario DESACTIVADO se pinta en rojo y sube al
  titular.** Es la única fila del sistema que lo hace: significa que alguien
  dado de baja sigue dentro, que es exactamente el agujero que esto cierra.
- **El punto verde** = usada en los últimos diez minutos. Separa «está
  trabajando» de «se dejó la pestaña abierta el martes», y esa distinción es lo
  que decide a quién cortar.
- **Se refresca sola cada 30 segundos.** Es la única pantalla que lo hace: se
  abre justo cuando algo está pasando.
- **El motivo del corte se escribe** y queda en la auditoría. «Se le cortó el
  acceso» sin motivo no explica nada tres semanas después.

### DOS ERRORES MÍOS EN EL PARCHE DEL CLIENTE DE PRISMA

**1. Un patrón demasiado permisivo rompió `User.ts`.** El parche copiaba toda
línea que contuviera el campo de origen EN CUALQUIER POSICIÓN. Con `active`
eso incluyó una línea de `UserOmit` donde el campo aparece dentro de una unión
de literales de texto. Duplicarla rompió el archivo con veinte errores de
sintaxis que **no mencionaban `active` por ningún lado**.

Corregido a exigir que el campo sea una CLAVE al principio de línea. Es el
mismo error de las ventanas anchas del verificador 9.

**2. El `deshacer` borró código legítimo de Prisma.** La lista de nombres a
borrar llevaba `parametrosCriticidad` —un MODELO— y el cliente generado ya lo
conocía: `User.ts` tenía su propio bloque `User$parametrosCriticidadArgs`. El
deshacer se lo llevó por delante y hubo que reconstruirlo a mano.

> **REGLA: un parche reversible por construcción sólo es seguro si los nombres
> que introduce NO EXISTÍAN ANTES en los archivos que toca.** Con los CAMPOS se
> cumple —son nuevos—. Con los MODELOS no, porque Prisma los usa en las
> relaciones de otros modelos.

Ahora los nombres de modelo se deshacen SÓLO en `class.ts`, que es el único
archivo donde el parche los escribe.

### Y una ventana ancha más, esta vez en una prueba

`corte-de-acceso.spec.ts` miraba «los primeros 1.200 caracteres» del método y
la ventana se comía el SIGUIENTE, que sí lleva `active: false`. La prueba de
«cortar no desactiva» fallaba señalando código que no era el suyo.

**Tercera vez que el mismo fallo aparece con otra cara.** Se acota al método
buscando el siguiente `async`, no a un número de caracteres.

---

## 27. Bloque 83 — lo que yo mismo había roto

### 83-A · Producción podía abrir una orden y no podía ver NINGUNA

Palabras del usuario: *«con el apartado de Producción ellos SÍ deben ver cierta
parte de gestión para poder enviar las OM o incidencias»*.

Y tenía razón contra el código, **y el código lo había escrito yo en el bloque
80**. Allí cerré la gestión entera con `wo.read` para sacar a Producción de los
indicadores del ingeniero —eso estaba bien— y de paso me llevé por delante la
lista de órdenes y las ventanas de parada.

Resultado: el Jefe de Tren tenía `wo.create`, abría una orden desde el QR, y
**no podía verla nunca más**. Pedir un trabajo y no poder comprobar jamás si
alguien lo cogió es exactamente cómo se deja de usar un sistema y se vuelve a
la radio.

**Es la TERCERA vez que aparece el mismo patrón** —el QR del bloque 68, el QR
imprimible del 77 y ahora esto—, y las tres veces la causa fue idéntica:

> **Cerrar un permiso sin preguntarse QUÉ DEJA DE FUNCIONAR.** Cambiar un
> agujero de seguridad por una función muerta no es un arreglo, y la función
> muerta tarda meses en verse porque no rompe nada: devuelve 403 y la pantalla
> sale vacía.

#### Lo que se reabre, y lo que NO

    LEER órdenes y paradas   wo.read  O  om.mirar      ← se reabre
    ESCRIBIR una orden       wo.update                  ← no se movió
    CERRAR una orden         wo.approve                 ← no se movió
    APUNTAR / MOVER parada   wo.update                  ← no se movió

`om.mirar` significa «supervisa el mantenimiento de su tren» (bloque 68, regla
1). Ni un nombre de rol. Y **`wo.read` sigue cerrado**: es lo que abre el
Dashboard del ingeniero, los Indicadores y Exportar, que es de lo que el bloque
80 les sacó con razón.

#### Las CUATRO lecturas de paradas, no tres

La pantalla llama a `/paradas`, `/paradas/proximas`, `/paradas/fiabilidad` y
`/paradas/:id`. Abrir tres de cuatro deja un bloque en blanco que parece un
fallo del software. **Media puerta es peor que ninguna.** Hay una prueba que
recorre las cuatro, y se comprobó cerrando `fiabilidad` a propósito: se cae.

`fiabilidad` no es un indicador de mantenimiento: mide cuánto se MUEVEN las
ventanas respecto a lo anunciado. Es la desviación de Producción sobre su
propio aviso, así que si es de alguien, es suya.

**El Operador de Púlpito no gana nada.** Su perfil es el más estrecho a
propósito: mira un monitor y avisa. Hay una prueba que lo fija.

### 83-B · El estado que «no se actualizaba» no era un bug

El usuario lo reportó así: *«eso del estado es grave, ¿cómo es que funciona esa
lógica si aquí se supone que se actualizó?»*.

El estado se DERIVA desde el bloque F5, y **una orden abierta lo fija en
MANTENIMIENTO por diseño**: el equipo puede estar reparado, pero mientras la
orden siga abierta el sistema dice —con razón— que hay trabajo en curso.

El fallo era otro, y es el de siempre en este archivo con otra cara:

> **Un cálculo correcto que no se explica es indistinguible de un fallo.**

El técnico ponía el activo en OPERATIVO, recargaba, seguía leyendo «En
mantenimiento», y lo único que había en pantalla era un gris de nota al pie que
decía «calculado en vivo desde sus OM/incidencias abiertas». No decía CUÁL. Con
eso, la conclusión razonable es que el software no guarda.

**No se tocó el cálculo. Se dice quién lo retiene, con su código y su enlace**,
para poder ir a cerrarla. `porQueEseEstado` viaja DENTRO de la ficha, no en un
endpoint aparte: separarlos garantizaría que algún día alguien pinte el estado
sin el motivo.

#### Tres decisiones del motivo

- **Mismo orden de precedencia que el estado**, no uno propio. BAJA/STOCK →
  ORDEN → INCIDENCIA. Dos criterios paralelos acaban discrepando, y una
  pantalla que enseña un estado y al lado un motivo que no le corresponde es
  peor que no enseñar el motivo: el usuario ya no sabe cuál creerse.
- **La orden MÁS ANTIGUA**, no la más reciente. Si un equipo arrastra dos
  abiertas, la vieja es la que lleva semanas falseando el estado.
- **Entre incidencias gana la de MAYOR prioridad.** Con la primera a secas, un
  equipo con una avería crítica y una menor anterior explicaría su
  FUERA_SERVICIO citando la menor — el motivo diría lo contrario que el estado.
- **Ámbar, no rojo.** No es un error, es una explicación. El rojo se reserva
  para lo que ya falló (misma decisión que los botones del bloque 67).

### 83-C · «Trabajo en campo» pasa a llamarse «Gestión técnica»

Decisión del usuario. El nombre viejo describía DÓNDE se está; el nuevo
describe QUÉ se hace. Y dentro no sólo se rellena con guantes: también se
consulta la red, la energía y la calidad de las fichas, que es trabajo de mesa.
«Campo» dejaba fuera la mitad de lo que hay en la sección.

### Del método

**Un tropiezo de los de siempre:** escribí `orderBy: { createdAt: 'asc' }` para
las incidencias. **`Incident` no tiene `createdAt`, tiene `reportedAt`.** Lo
cazó el typecheck. Es el mismo error del `name` del bloque 6 y del
`environment` del 16.2: dar por hecho que un modelo tiene un campo porque el de
al lado lo tiene.

**Y una prueba mía me falló por la misma causa de siempre:** buscaba
`porIncidencia.get` y encontraba la del bucle que ARMA el mapa, no la del bucle
de precedencia. Salía antes que la orden y la prueba fallaba señalando código
correcto. Corregida a buscar `.get(a.id)`, con el argumento.

**Cuarta vez que el mismo fallo aparece con otra cara** —verificador 9, el de
etiquetas, la prueba del bloque 82 y ésta—: *un patrón más flojo de lo
necesario acaba leyendo otra cosa*.

---

## 28. Bloque 84 — el tablero que se entiende de un vistazo

### La flecha, que es todo el bloque

Palabras del usuario: *«lo necesito más bonito, más llamativo y entendible, sin
muchas letras. Guíate de dashboards que hay en internet, Excels, macros, Power
BI y toda esa mierda»*.

Lo que hace que un tablero se entienda de un vistazo **no es el color: es que
cada número traiga al lado si va mejor o peor que antes.** «MTTR 4,2 h» no dice
nada a quien lo mira por primera vez. «4,2 h ▼ 1,1 mejor» se entiende sin saber
qué es el MTTR.

**Tres reglas de la comparación, y ninguna es de adorno:**

1. **El periodo anterior es EXACTAMENTE igual de largo**, pegado al actual.
   Comparar 90 días contra «el mes pasado» daría siempre peor al que más días
   tiene, y la flecha mentiría en todos los casos.
2. **Cada indicador declara HACIA DÓNDE es mejor.** El MTTR baja y es buena
   noticia; la disponibilidad baja y es mala. Un tablero que pinte de verde
   todo lo que sube **enseña a leerlo al revés**, y ése es el error que hace
   que un indicador acabe justificando lo contrario de lo que mide. Hay una
   prueba que aplica el MISMO movimiento a los dos sentidos y exige veredictos
   opuestos.
3. **Sin dato antes, NO hay flecha.** Un mes sin órdenes daría «+100 %» contra
   cero, que es una cifra inventada. Es la regla de siempre: sin datos, nunca
   un número.

**Y el ruido no es una noticia.** Un cambio del 0,3 % no es una mejora ni un
empeoramiento. Con flecha, el tablero parecería moverse todos los días sin que
pase nada, y a la semana se deja de mirar. El margen se mide en **proporción**,
no en unidades: 0,1 sobre un MTTR de 2 h importa; 0,1 sobre un 99 % de
disponibilidad no.

**El veredicto viaja RESUELTO desde el servidor.** Si lo decidiera cada
pantalla, dos que enseñaran el mismo número podrían pintarlo de colores
distintos.

**Y se dice el tamaño de la muestra anterior.** Con quince órdenes detrás, una
flecha verde no significa nada — y estos números van a un comité.

### La explicación se va al tooltip

Cada tarjeta llevaba su párrafo en gris debajo. Con ocho tarjetas eso son ocho
párrafos: la pantalla se leía como un manual y el número —lo único que se mira
en una reunión— quedaba pequeño entre texto. La explicación se conserva ENTERA
en el `title` de la tarjeta, así que sigue estando para quien la necesite; sólo
deja de competir con el dato.

`title` en la TARJETA y no en un iconito: el objetivo es leerla pasando el
ratón por encima, no acertándole a un símbolo de doce píxeles con guantes.

### El Excel, y por qué Excel y no Power BI

La planta **ya trabaja en Excel**: el ingeniero entregó sus hojas de ruta en un
.xlsx de SAP y el comité se prepara pegando tablas en un correo. Un `.pbix`
exigiría licencia, y **Power BI abre un .xlsx sin problema** — el Excel sirve
para los dos caminos y el .pbix sólo para uno.

Cinco hojas: Resumen (con la comparación dentro), Reparto, Backlog, Equipos que
más fallan y Cumplimiento normativo.

- **No recalcula NADA.** Pide el mismo `tablero()` que la pantalla, con los
  mismos parámetros. Si tuviera su propio cálculo, un día el número de la
  pantalla y el del archivo dejarían de coincidir y el ingeniero llevaría al
  comité el que no toca sin saberlo.
- **`null` se escribe «sin datos», nunca 0.** Un cero en una celda de Excel se
  suma, se promedia y acaba en un gráfico diciendo que la disponibilidad fue
  del 0 %.
- **El mismo permiso que la pantalla** (`dashboard.read`): el archivo enseña lo
  que la pantalla ya enseña. Y `RITMO_PESADO`, porque el libro se arma entero
  en memoria — mismo motivo que el hallazgo S-03.

**Probado de verdad**, armando el libro con datos y volviéndolo a leer con
ExcelJS. No basta con que compile: un `addRow` con la clave equivocada escribe
celdas vacías y pasa el typecheck.

### La rama Dependencias

Petición del usuario. **No se construyó nada nuevo**: las ocho pantallas ya
existían, repartidas dentro de una «Gestión técnica» que tenía DIECISÉIS
entradas — el direccionamiento IP, que se mira una vez al mes, conviviendo con
las Instalaciones, que se rellenan en planta con guantes. Es el mismo problema
que el bloque 69 arregló con «Infraestructura», reaparecido por acumulación.

El criterio que las une cabe en una frase: **qué cuelga de qué, y qué se cae si
esto se cae.** Cableado y Electricidad entran porque la corriente ES una
dependencia —y la primera que se comprueba, según `arranque-de-diagnostico.ts`—;
separar «la red» de «la energía» obligaría a saltar entre dos secciones para
seguir UNA cadena.

**«De qué depende» NO se movió aquí, y es deliberado.** Se queda en Producción
porque la pregunta que contesta —«¿qué dejo de ver si se cae esto?»— es de
Producción, y quien la hace es el Jefe de Tren, que tiene `om.mirar` y no
`red.read`. Traerla aquí le dejaría una sección de un solo elemento, que es
justo lo que el bloque 69 quitó.

### Los botones encajonados — ocho píxeles

Palabras del usuario: *«arregla ese botón y todos los botones encajonados
perfectamente»*. El fallo era de una línea:

    .btn-mini    { min-height: 34px; }
    .btn-primary { min-height: 42px; }

En cualquier barra donde convivan los dos —la ficha del activo, la cabecera de
casi todas las pantallas— eso se ve como una fila que no cuadra. Y el
comentario de esa sección llevaba desde el bloque 37 diciendo «44 px es el
mínimo cómodo» mientras el código ponía 34 en escritorio y 42 en móvil: **tres
números para una sola decisión.**

**Una variable, una altura.** `--alto-boton`, 38 px en escritorio y 44 en móvil
—que es el número que el propio comentario llevaba declarando—.

#### Verificador 16, y las DOS veces que me cazó a mí mismo

`verificar:botones-alto` exige que las familias declaren su altura con
`var(--alto-boton)` y no con un número a mano.

**Primera versión, primer fallo:** buscaba `--alto-boton:` en cualquier parte
del archivo. Al borrar la declaración de escritorio, la del bloque móvil seguía
ahí y **daba VERDE** — mientras en escritorio el `var()` no resolvía y los
botones se quedaban sin altura mínima. Verde justo en el caso peor.

**Segundo fallo, al arreglar el primero:** conté la profundidad de llaves pero
admití `<= 1`, y dentro de una `@media` la profundidad al empezar la línea vale
exactamente 1. Seguía pasando. Con `=== 0` ya lo caza.

> **Dos veces seguidas el mismo error: ser más permisivo de lo necesario.** Es
> el que lleva apareciendo desde el verificador 9, y aquí además convertía el
> verificador en una mentira — que es peor que no tenerlo.

Probado con los tres casos: altura a mano en cada familia, y variable fuera de
sitio.

### `verificar:densidad` tenía DOS fallos, uno en cada dirección

Me marcó **once tarjetas de indicador donde hay una**. El patrón era `\bkpi\b`,
y `\b` casa también con el guion: contaba `kpi-num`, `kpi-tit`, `kpi-delta`…
como si cada una fuera una tarjeta.

Y tenía el fallo simétrico, que es el que de verdad importaba: el trozo
`[^"'}]*` no puede cruzar una comilla, así que `className={'kpi ' + cls}` —la
forma que usan Bandeja, Dashboard, Inventario y cuatro más— **no se contaba
nunca**. O sea: contaba de más donde no había e ignoraba justo las pantallas
que sí acumulan tarjetas.

Corregido, Bandeja pasa de 0 a 1 y Zonas de 2 a 3 —las que se ignoraban— y
desaparecen los prefijos.

**Lo de las palabras sí era mío**, y se recortó donde sobraba sabor: se fue la
frase «los números que se llevan a un comité», que es una declaración de
intenciones; se quedó la regla del «sin datos», que explica algo que se ve en
pantalla. **Subir la línea base no se hizo.**

---

## 29. Bloque 85 — lo que faltaba en la arquitectura

Cuatro huecos estructurales, no funciones. El usuario los eligió después de
una auditoría medida, no supuesta.

### 1 · Playwright — las pruebas que ABREN el software

Está escrito **tres veces** en este archivo y las tres después de una
exposición que salió mal:

> Las 1.152 pruebas de este proyecto NO ABREN EL SOFTWARE. Comprueban que el
> código está bien escrito. Ninguna comprueba que funcione.

**23 recorridos en 6 archivos**, en 1366×768 —la pantalla de los púlpitos— y
el QR además en móvil, porque el técnico usa su propio teléfono y la mitad de
los fallos visuales de este proyecto sólo se ven ahí.

Cada uno caza un bug que YA PASÓ: el aviso que vivía dentro del formulario que
se cerraba (b. 64), las OM que nacían sin fecha (b. 64), el QR cerrado para el
Jefe de Tren (b. 68), los botones apagados que no decían qué faltaba (b. 67).

**NO CORREN CONTRA PRODUCCIÓN, y hay una guarda que lo impide.** Estos
recorridos escriben: crean incidencias y órdenes, y esas órdenes entran en el
nivel de servicio y en el reparto correctivo/preventivo. *Una prueba que falsea
el indicador que se lleva al comité es peor que no tener prueba.* Probado con
las dos URL reales: se bloquean.

**El recorrido 5 es el importante.** Recorre TODAS las entradas del menú que un
usuario ve y comprueba que cada una se abre. Es el único que caza el fallo que
ha aparecido tres veces —bloques 68, 77 y 83—: entrada de menú abierta con su
endpoint cerrado. **Con el Jefe no se detecta, porque el Jefe lo ve todo.**

**No se han podido ejecutar aquí**: el entorno del agente no puede descargar el
navegador. Lo que sí se comprobó: compilan, Playwright lista las 23, y la
guarda funciona. Se dice tal cual.

### 2 · La CI ya puede fallar por vulnerabilidades

Había `continue-on-error: true` **Y** `|| true` en la misma línea, en dos
sitios. **Dos formas de callarse.** La CI miraba las 10 vulnerabilidades y
pasaba en verde siempre.

> Un control que nunca puede fallar no es un control. Es la misma regla que ya
> vale aquí para los verificadores: uno que no se puede poner en rojo se
> desactiva.

**Se cerraron las 5 altas sin subir NI UNA versión mayor de las directas.** La
herramienta proponía BAJAR prisma 7→6, exceljs 4→3 y minio a un major
anterior; eso no se hace. `overrides` fija la versión PARCHEADA de la
transitiva y deja la directa donde estaba. **0 vulnerabilidades, 0
dependencias directas tocadas.**

#### El override que hubo que retirar, y por qué es la lección

`decode-uri-component@0.5.0` es la única versión que cierra su advertencia. **Y
es sólo ESM.** `query-string@7` —dentro de `minio`— es CommonJS y lo carga con
`require()`:

    require('minio')  →  ERR_PACKAGE_PATH_NOT_EXPORTED

**Habría tumbado el arranque en producción**, porque MinIO es lo que guarda las
fotos y los informes. No lo cazó el typecheck: lo cazó una prueba al fallar
cargando el módulo.

> **Un `override` es un cambio de dependencia como otro cualquiera y se prueba
> como tal.** Correr las pruebas y el `require()` real antes de darlo por
> bueno. Cerrar una advertencia rompiendo el arranque no es un arreglo.

Queda como deuda declarada en `docs/DEPENDENCIAS.md`, con su motivo y su
condición de revisión. **Lo que no se hace es volver a poner un `|| true`.**

### 3 · Los `catch` que silencian — el número mentía

Se contaban 114. Medidos por tipo:

| | |
|---|---|
| **ESCRITURAS silenciadas** | **1**, y es el `logout`: fuego y olvido a propósito |
| LECTURAS silenciadas | 103 |

**Las escrituras ya se habían arreglado en el bloque 77.** Y las lecturas están
cubiertas por el aviso central de `api/client.ts`, que anuncia el fallo de red,
el 500 y el 403 — los tres casos en los que una lista vacía miente.

> Reescribir 103 sitios de lectura habría sido mucho ruido y riesgo de
> regresión para un beneficio que **ya estaba entregado en otro sitio**.

Lo que faltaba era impedir la regresión: `verificar:catch` (verificador 17)
prohíbe que una ESCRITURA se trague el error. Probado reintroduciendo dos de
los tres bugs reales del bloque 77.

**Falso positivo mío, cazado al probarlo contra el código real:** marcaba
`const ok = await api.post(...).catch(() => false)` en Assets, que está BIEN —
ese `false` se usa para juntar las fotos fallidas y avisar al final. La señal
que separa los dos casos: **si el valor se asigna o se devuelve, alguien lo va
a mirar.** Quinta vez que un patrón más flojo de lo necesario acaba leyendo
otra cosa.

### 4 · Los `@Body() dto: any` — congelados y drenando

Con `@Body() dto: any` el `ValidationPipe` **no valida nada**: corre con
`whitelist` y `forbidNonWhitelisted`, que es lo correcto, pero esas opciones
actúan sobre los metadatos de una clase DTO. Sin clase no hay metadatos.

**Escribir 54 clases de golpe es la clase de cambio que rompe producción sin
que nadie lo vea**: con `forbidNonWhitelisted`, un DTO al que se le olvide un
campo rechaza peticiones válidas con un 400 y el formulario deja de guardar sin
decir por qué.

Así que: **cerrados los de seguridad** —auth, users y roles: reparten poder y
cortan accesos— y el resto congelado en `verificar:dto` (verificador 13 del
backend), con una lista que **sólo puede encoger**.

La segunda mitad del verificador es la que importa: **si la lista declara más
de los que quedan, también falla**. Sin eso, la deuda se «arregla» en el papel
y nadie se entera.

#### El verificador me corrigió la medición

Yo había contado 53 con un `grep`. Él encontró **54**: mi patrón usaba
`[a-zA-Z]*` para el nombre del parámetro y no casaba `_b`, con guion bajo.

> **Una medición a ojo se equivoca; un verificador no.** Van 45.

### Decisión de arquitectura que NO se tomó

**El monolito no se parte.** 353 endpoints y 78 modelos en una app NestJS es
normal a esta escala, y microservicios aquí sólo añadirían latencia y
despliegues que se caen a medias. La separación ya existe donde importa: por
módulos, con el árbol de planta como única fuente de verdad.

---

## 30. Bloque 86 — cambiar un rol no llegaba a quien ya estaba dentro

### Lo encontró el usuario, y era grave

> «Cuando actualizamos los roles, el rol Jefe de línea o cosas así **no se
> actualizan para usuarios ya creados**. Eso me preocupa bastante.»

Tenía razón. Los permisos viajan DENTRO del token de sesión y
`PermissionsGuard` los lee de ahí, no de la base. El bloque 82 creó el contador
`permisosVersion` justo para poder matar los tokens de golpe... pero se cableó
**sólo a los cambios del USUARIO** —rol, baja, contraseña—. **Editar el ROL no
lo tocaba.** `roles.service.ts` no mencionaba `permisosVersion` ni una vez.

**Y fallaba ABIERTO.** Se le quitaba un permiso a «Jefe de línea» y las cinco
personas con ese rol seguían teniéndolo — el backend lo aceptaba, porque el
token decía que sí. El ingeniero se quedaba creyendo que el cambio estaba
aplicado.

> Es el peor modo de fallar de un control de acceso: en silencio, y con quien
> hizo el cambio convencido de que funcionó.

### Eran TRES piezas, y las tres hacen falta

| | Qué faltaba | Qué arregla |
|---|---|---|
| **1** | Al guardar el rol, subir `permisosVersion` de todos sus usuarios | Invalida los tokens en la siguiente petición |
| **2** | `/auth/me` devolvía `...delToken`: los permisos del día que entró | El menú al RECARGAR la página |
| **3** | La renovación guardaba `sgit_token` y tiraba el `user` que venía con él | El menú SIN recargar |

Con una sola no basta. La 1 sin la 3 deja al servidor aplicando lo nuevo y a la
pantalla enseñando lo viejo: opciones que dan 403 al pulsarlas, y opciones
nuevas que no aparecen nunca. **Las dos caras confunden igual.**

### Decisiones del arreglo

- **El contador va DENTRO de la misma transacción** que los permisos. Si se
  guardaran los permisos y fallara el contador, el rol quedaría cambiado y la
  gente seguiría con los de antes — el bug original, sólo que además invisible.
- **NO se les cierra la sesión.** Cambiar un permiso no es dar de baja a nadie:
  el token de refresco sigue valiendo y la renovación es transparente. Revocar
  las sesiones echaría a cinco personas de la aplicación por haber tocado una
  casilla.
- **Se vacía la caché del guard entera**, no usuario por usuario: un cambio de
  rol afecta a todos los suyos y aquí no se sabe cuántos son sin otra consulta.
- **Si `/auth/me` no puede leer el rol, deja los permisos del token.** Un menú
  en blanco por un fallo de lectura es peor que uno algo desfasado — el
  servidor sigue decidiendo de verdad en cada petición.

Probado reintroduciendo los dos bugs por separado: los caza.

### De la auditoría de este bloque

**29 verificadores en verde y cero código muerto.** Los barridos que no cubren:

- **Menú contra el permiso real de cada endpoint.** Salieron 21; separando GET
  de PATCH —juntarlos daba 36 falsos— y filtrando por qué ROL cae de verdad,
  quedó **uno**: «Equipos conocidos» pedía `asset.read` en el menú y
  `user.manage` en el endpoint. **Diez roles** la veían vacía. Se cerró el
  menú, no se abrió el endpoint: cerrar no le quita nada a nadie, y abrir datos
  de auditoría es decisión del usuario.
- **13 escrituras sin confirmar nada** (acotando a la función, no a una
  ventana: de 46 aparentes quedan 13).
- **`Riesgo.tsx` con 12 columnas** — el tope del proyecto es 8.

### Y cuatro fallos míos en los recorridos de Playwright

Escribí los selectores **de memoria en vez de mirar la pantalla**:

| Lo que escribí | Lo que dice la pantalla |
|---|---|
| «Nueva orden / Crear / Generar» | **«Alta completa»** y **«Crear OM»** |
| «Guardar / Crear» | **«Crear incidencia»** |
| `input[type=date]` de la página | Agarraba el del **filtro «Desde»** |
| `E2E_ACTIVO` obligatoria | En la CI no existe: reventaba antes de empezar |

Ahora todo va acotado al `.modal` y los ocho textos están contrastados uno por
uno contra el código. Y si `E2E_ACTIVO` no está, **se le pregunta a la
aplicación** por el primer activo: no se inventa un código de planta.

**Dos fallos de configuración de la CI, también míos:** faltaba `CORS_ORIGIN`
—el guard de `main.ts` aborta a propósito sin él— y `cache-dependency-path`,
porque `setup-node` busca el lock en la raíz y aquí hay dos.

---

## 31. Bloque 87 — ni a medias ni dos veces

Tres barridos nuevos, y los tres buscan la misma familia de fallo: **el que no
rompe nada**. No hay error, no hay pantalla en rojo, y el dato queda mal para
siempre.

### A · Una escritura que se parte por la mitad

Barrido: métodos de servicio que escriben en **dos o más tablas sin
`$transaction`**. Salieron cinco. Tres son deliberados y están documentados
—el `failureEvent` que se crea con `.catch(() => null)` a propósito, porque
perder el aviso por no poder escribir un indicador sería cambiar lo urgente por
lo importante—. **Dos eran bugs:**

**`assets.remove`** — daba de baja el activo y luego apagaba su plan
preventivo, en dos llamadas sueltas. Si la segunda fallaba, el activo quedaba
DE BAJA y **su plan seguía generando órdenes para un equipo que ya no existe**.
Esas órdenes vencen, entran en el backlog y hunden el cumplimiento del
preventivo.

> Nadie relaciona jamás «el cumplimiento bajó» con «hace tres meses una baja
> falló a medias». Es la definición de un dato que se corrompe en silencio.

**`users.deactivate`** — desactivaba y luego revocaba sesiones. Hoy no se
colaría por defensa en profundidad —el contador de permisos ya subió, y la
renovación comprueba `active`—, pero eso es tener el corte sujeto por una sola
capa **sin saberlo**. Cuando la seguridad depende de que la otra mitad falle de
la forma correcta, deja de ser una decisión y pasa a ser suerte.

### B · Una escritura que se dispara dos veces

Barrido: botones **sin `disabled`** cuyo manejador escribe. El peor:

**`generarOrden` en Instalaciones CREA UNA ORDEN DE TRABAJO** y no tenía
ninguna guarda. Dos clics seguidos —que en una tablet con la wifi de la nave es
lo normal cuando la primera pulsación parece no responder— son **dos órdenes
para la misma instalación**. Y eso no es un registro duplicado que se borra: es
una cuadrilla que sube dos veces al mismo poste, y dos órdenes contando en el
nivel de servicio y en el reparto correctivo/preventivo.

Lo delató que **`cerrarInstalacion`, treinta líneas más abajo, SÍ tenía la
guarda**. Es la regla del bloque 77: *cuando dos funciones hermanas del mismo
archivo se comportan distinto, una de las dos está mal.*

**Dos frenos, no uno:** `if (guardando) return` **y** `disabled`. El estado se
lee al instante; el `disabled` tarda un ciclo de repintado, y en ese hueco cabe
el segundo clic.

### C · Trazabilidad: limpia

El interceptor de auditoría es **global** y registra por método HTTP. Lo único
que se excluye son cinco rutas que «ya registran su propia auditoría firmada»
—y ahí está el riesgo: si una dejara de hacerlo, esa escritura no dejaría
rastro EN ABSOLUTO—. Se comprobaron las cinco: `createSigned`, `closeSigned`,
`resolveSigned`, la edición firmada y la de red. **Las cinco auditan.**

### Y dos falsos positivos míos, cazados antes de entregar

- **`Riesgo.tsx` con 12 columnas** era mentira: tiene **dos `<tr>`
  alternativos** dentro del mismo `<thead>`, de 6 columnas cada uno. Mi barrido
  sumó los dos y sólo se pinta uno.
- El barrido de doble envío dio **65 hallazgos** con una ventana de 5 líneas,
  porque cogía el manejador del botón de al lado. Acotado **a la etiqueta del
  botón**, quedan 34, y de ésos los que duelen son tres.

> **Séptima vez que un patrón más flojo de lo necesario acaba leyendo otra
> cosa.** Ya es la firma del proyecto: cuando un barrido da muchos resultados,
> lo primero que hay que dudar es del barrido.

---

## 32. Bloque 88 — los recorridos encontraron su primer bug de verdad

Primera ejecución completa en la CI: **23 pruebas, 9 en verde, 12 rojas.** Y el
reparto de culpas es lo interesante.

### EL BUG REAL: la OM sigue naciendo sin fecha

`<input value="" type="date" aria-label="Fecha programada"/>`

**Es el bug del bloque 64, que seguía vivo.** Allí se arregló el formulario del
QR y **los otros dos se quedaron fuera**: «Alta completa» en Órdenes y
`AsignarOm`. La cadena está escrita en este archivo desde entonces:

    OM sin fecha → sale «—» → nunca vence → no entra en el backlog
                 → el % de cumplimiento del preventivo miente
                 → y con él el reparto correctivo/preventivo

Nadie lo había visto en cuatro bloques de auditorías, verificadores y barridos.
**Lo cazó abrir la pantalla**, que es exactamente para lo que se escribieron los
recorridos. Sin ellos seguiría ahí.

`hoyParaInput()` ya existía —lo puso el propio bloque 64—; sólo había que
llamarlo.

### Los otros once eran míos, y en cuatro sabores

**1 · `table.tabla` no existe.** Las tablas del proyecto son `<table>` a secas.
Mi selector no encontraba nada NUNCA, y eso disfrazaba tres cosas de bugs del
software: «la tabla de Activos salió vacía» y «la lista no creció». No estaban
vacías: yo miraba donde no había nada.

**2 · Webkit sin instalar.** El perfil `movil` usa `devices['iPhone 13']`, que
corre sobre WEBKIT, y la CI sólo instalaba chromium. Cuatro pruebas fallando con
«Executable doesn't exist» — que parece un fallo de la prueba y es un fallo del
`playwright install`. Y webkit es justo el que hace falta: **las fechas que se
salían de su caja (bloque 70) se veían bien en Chrome.**

**3 · Mi prueba prohibía un dato correcto.** Exigía que no hubiera ningún
«0 %». Pero en una base recién sembrada no se cumple ninguna regla de
normativa, y ese 0 % **es la respuesta exacta**. `cumplimiento.ts` ya distingue
los dos casos y devuelve `null` cuando no hay reglas aplicables.

> **La regla no es «nunca un cero»: es «nunca un número inventado».**

Reescrita para comprobar la promesa de verdad: que un hueco se dice «Sin datos»
y que ninguna tarjeta se queda muda.

**4 · Y una prueba mía que MENTÍA.** Al caerse el backend a mitad de la tanda,
mi `entrar()` leía el aviso rojo del formulario y reportaba **«Credenciales
incorrectas. Te quedan 4 intento(s)»** — con las credenciales correctas. Ese
texto lo compone el frontend cuando la llamada no sale bien, sin distinguir un
401 de un servidor que no está.

Me hizo perder un rato buscando un problema de contraseñas inexistente. Es
exactamente el fallo que este proyecto persigue en su propio software —*un
aviso que miente enseña a desconfiar de todos los avisos*— y lo tenía yo en la
herramienta de diagnóstico. Ahora mira el CÓDIGO de la respuesta y separa «el
backend no está» de «la contraseña está mal» de «es el límite de peticiones».

### La lección, y es la del proyecto entero

> **Nueve de doce fallos eran del andamio, no del software. Y el que sí era del
> software llevaba cuatro bloques escondido.** Una herramienta nueva empieza
> dando más ruido que señal; el error sería apagarla en la segunda vuelta,
> porque la señal que trae —cuando llega— es la que no trae ninguna otra.

---

## 33. Bloque 89 — de doce rojos a dos, y el freno que NO se toca

Segunda ejecución: **17 en verde, 2 rojos, 4 saltadas.** Y el bug real del
bloque anterior —la OM naciendo sin fecha— **ya pasa**.

Los dos que quedaban eran míos otra vez, y uno enseña algo.

### El 429, y por qué el arreglo NO es bajar el límite

```
El login devolvió 429.
{"message":"Demasiados intentos. Espera 10 minuto(s) y vuelve a probar."}
```

Mi primera versión hacía login **en cada prueba**. Con 23 pruebas más los
reintentos son más de treinta intentos desde la misma IP en dos minutos, y el
`FrenoGuard` los corta.

> **El freno está BIEN y no se toca.** Es la defensa contra fuerza bruta del
> bloque 67 y protege el login de la planta. Bajarlo, o excluir la IP de la CI,
> sería apagar un control real para que pase una prueba — que es exactamente lo
> que este proyecto lleva 89 bloques sin hacer.

Lo que estaba mal era la prueba. **Una persona tampoco vuelve a escribir su
contraseña en cada pantalla.** Ahora se entra UNA vez en un proyecto `setup`,
se guarda la sesión y las demás la reutilizan: de 25 logins a 4.

**Y el recorrido 1 sigue entrando a mano**, en su propio proyecto sin sesión
previa: ahí lo que se prueba ES el login.

### La orden que «no aparecía en la lista»

El formulario exige **«Zona a levantar»** y yo sólo rellenaba la actividad. El
`required` del navegador bloqueaba el envío: **la petición no salía**, y la
prueba fallaba veinte segundos después con «no aparece en la lista» — un
mensaje que apunta a la lista cuando el problema estaba en el formulario.

Un recorrido tiene que rellenar lo que rellena una persona. Y ahora escucha la
respuesta: si falta otro campo, lo dice.

### `__dirname` no existe en un módulo ES

Al escribir el `setup` puse `path.join(__dirname, ...)`. Playwright carga estos
archivos como ESM y revienta **al cargar**, así que no falla una prueba: **no
se lista ninguna**. `Total: 0 tests in 0 files`, que es un error mucho más
confuso que el que lo causa.

### Lo que llevamos aprendido de los recorridos

| Ejecución | Verde | Rojo | De quién eran los fallos |
|---|---|---|---|
| 1ª | 9 | 12 | 11 del andamio, **1 del software** |
| 2ª | 17 | 2 | 2 del andamio |
| 3ª | 16 | 2 | 1 del andamio, **1 visual de móvil sin diagnosticar** |
| 4ª | 17 | 2 | los 2 del andamio — y el informe de desborde MENTÍA |
| 5ª | 19 | 1 | **el único rojo era un bug REAL del teléfono** |

**El único bug del software que salió llevaba cuatro bloques escondido** y no
lo vio ninguna de las 1.165 pruebas ni ninguno de los 29 verificadores. Ésa es
la señal que no trae ninguna otra herramienta, y por eso el ruido de las dos
primeras vueltas valía la pena.

### Tercera vuelta — el `select` que no era, y el desborde que no hablaba

**`modal.locator('select').first()` NO es la zona: es el TIPO.** Arreglé el
fallo anterior escribiendo un selector todavía más flojo, y encima parecía
correcto porque el formulario se rellenaba. Lo que hacía era **cambiar el tipo
de la orden** y seguir sin rellenar el obligatorio.

Y el obligatorio **depende del tipo**: con `PREVENTIVO` —el que trae por
defecto— es **Activo**; sólo con `MAPEO` es «Zona a levantar». Ahora se apunta
**por etiqueta**, que es lo que ve la persona, y no se toca el tipo.

> **Octava vez que un patrón más flojo de lo necesario acaba leyendo otra
> cosa.** Y la primera en que el patrón flojo era el arreglo del anterior.

### La carrera del `/` al `/dashboard`

Tres pruebas de móvil se caían con:

    Navigation to "/assets" is interrupted by another navigation to "/dashboard"

`entrar()` hacía `goto('/')` y volvía en cuanto veía el menú; la redirección de
React Router llegaba **después**, y pisaba el `goto` siguiente. En escritorio no
pasaba y en el teléfono sí, porque todo va un poco más lento: una carrera, o
sea el fallo que a veces sale y a veces no. Ahora se espera a que la URL deje
de ser `/`.

### El desborde de 56 px: la prueba ahora dice QUIÉN

En el teléfono, `/assets` se sale 56 px a lo ancho —en escritorio, cero—. Mi
prueba decía sólo *«la pantalla se sale 56px»*, y con eso no se arregla nada:
hay que ir a buscar a mano cuál de los cuarenta bloques es.

**Es el mismo defecto que este proyecto persigue en su propio software** —un
aviso que no dice qué hacer— y lo tenía yo en la herramienta de diagnóstico.

Ahora nombra los elementos culpables, con su etiqueta y sus clases, saltándose
dos casos que no son fallo: el hijo de un padre que ya desborda —si no, salen
tres líneas por un solo fallo— y los contenedores con `overflow-x: auto`, que
se desplazan a propósito (las tablas viven dentro de `.card`).

**No lo he arreglado a ciegas.** No puedo abrir un navegador en este entorno, y
un arreglo de maquetación sin medir es adivinar. La siguiente vuelta de la CI
dirá el elemento exacto. Es la regla del bloque 70: *un fallo que no se puede
reproducir no se arregla; lo primero es hacer que hable.*

### Cuarta vuelta — el nombre de un `<select>` no es su etiqueta

`getByLabel('Activo', { exact: true })` **no encuentra nada**, y el motivo hay
que dejarlo escrito porque volverá a pasar:

```html
<label>Activo <select>…</select></label>
```

El control va DENTRO de su etiqueta, y **el nombre accesible de un `<select>`
incluye el texto de la opción elegida**. Ese campo no se llama «Activo»: se
llama «Activo — selecciona —». Con `exact` no casa nunca; sin `exact` casaría
con cualquier etiqueta que contenga la palabra.

Lo que no se equivoca: apuntar al `<label>` que EMPIEZA por «Activo» y bajar al
`<select>` de dentro. Con un `<input>` no pasa —no aporta texto—, y por eso
`getByLabel(/Actividad/)` sí funcionaba dos líneas más abajo.

**Y el error ahora distingue 0 de 1:** cero opciones es que la prueba no
encontró el campo; una sola es el «— selecciona —» y significa que NO HAY
EQUIPOS, que sí sería un fallo del software. Antes los dos casos daban el
mismo mensaje y me mandaron a buscar al sitio equivocado.

### El informe de desborde acusaba al menú, y eran seis falsos

La CI devolvió esto:

    Se sale 56px en movil. Culpables:
        - <a> se sale 54px    - <a> se sale 182px    - <a> se sale 331px …

**Ninguno lo era.** El menú del teléfono es una tira con `overflow-x: auto`: se
desplaza sola y no empuja la página. Mi comprobación de «el padre ya desborda»
miraba **un solo nivel**, y el padre de esos enlaces —`.nav-group`— lleva
`display: contents`, que **no tiene caja**: su rectángulo mide cero, así que la
comprobación no saltaba jamás.

Y como el informe se cortaba en seis, **esos seis falsos ocuparon todas las
plazas y el culpable de verdad no llegó a salir**. Un informe que llena sus
renglones con ruido es un informe apagado — la misma regla que vale para los
verificadores desde el bloque 9.

Ahora se recorre **toda la línea de padres** buscando un contenedor que se
desplace a propósito. El 56 px sigue ahí y sigue en rojo: es un fallo visual
real del teléfono, y la próxima vuelta dirá de quién es.

### Entrar tiene MÁS de un salto

`Navigation to "/assets" is interrupted by another navigation to "/dashboard"`

Esperar a que la URL dejara de ser `/` no bastó. Al entrar, la pantalla pide el
perfil y los permisos, y **cuando esas respuestas vuelven la aplicación se
recoloca otra vez**. Ahora se espera además a que la red se calle
(`networkidle`), que es lo único que cubre los saltos que dependen de una
respuesta.

### Quinta vuelta — el selector que llevaba veintidós bloques sin hacer nada

Con el informe ya limpio, la CI dijo el culpable en una línea:

    Se sale 56px en movil. Culpables:
        - <div class="user"> se sale 56px

Y en `styles.css`, dentro del bloque de móvil:

```css
.topbar .user > div:first-child { display: none; }  /* nombre: ocupa demasiado */
```

**Esa regla no hacía nada desde el bloque 67.** Allí el nombre dejó de ser un
`<div>` y pasó a ser un `<button class="user-boton">` —para que se pudiera
pulsar e ir a «Mi cuenta»— y **nadie actualizó el selector**.

> **Un selector de CSS que deja de casar no avisa.** No rompe, no sale en
> consola, no lo ve el compilador ni el lint. La regla simplemente deja de
> aplicarse, y lo que se ve es una pantalla algo peor que nadie sabe explicar.

Consecuencia: el nombre completo más el cargo más «Mi PIN» más «Salir» no caben
en 390 px, y **la pantalla ENTERA se desplazaba 56 px de lado** en el teléfono.
En el PC no se ve. El técnico usa su teléfono.

**Se oculta el TEXTO, no el botón.** El avatar sigue llevando a «Mi cuenta»:
esconder el botón entero devolvería el problema del bloque 67 —la gente pulsa
su nombre esperando ir a su cuenta— justo donde más se usa.

#### Lo que esto demuestra sobre los recorridos

Este bug sobrevivió a **1.165 pruebas, 29 verificadores y cuatro auditorías**.
Ninguna herramienta que lee código podía verlo: el CSS era válido, el
componente correcto, el selector sintácticamente impecable. Sólo se ve
**abriendo la pantalla en un teléfono**.

Es el segundo bug real que sacan los recorridos —el primero fue la OM naciendo
sin fecha— y los dos llevaban meses escondidos.

### Y el recorrido 5 llevaba desde el bloque 85 sin correr NUNCA

    - [escritorio] 5 · El perfil estrecho ve lo suyo, y lo ve ENTERO   SKIPPED

`test.skip(!process.env.E2E_TECNICO_EMAIL, …)`, y la CI **sólo sembraba al
admin**. O sea: la prueba más valiosa de las veinticuatro —la única que caza el
fallo que este proyecto ha tenido TRES veces, *entrada de menú abierta con su
endpoint cerrado* (bloques 68, 77 y 83)— se saltaba en todas las ejecuciones.

> **Una prueba que siempre se salta no es una prueba: es una línea gris que da
> tranquilidad sin comprobar nada.** Es la misma familia que el `|| true` del
> `npm audit` (bloque 85) y que los verificadores que no se pueden poner en
> rojo. Un control que nunca puede fallar no es un control.

**Con el Jefe no se detecta**, porque el Jefe lo ve todo. Hacía falta un perfil
estrecho de verdad.

La semilla crea ahora uno **sólo si `SEED_ESTRECHO_EMAIL` y su contraseña están
puestas**. En Railway no lo están, así que **en producción esta parte no hace
nada** — mismo patrón que `ADMIN_EMAIL`, que lleva ahí desde el principio.

Se usa **`Jefe de Tren`** y no `Técnico`: es el cargo al que le pasaron los tres
fallos —no podía abrir el QR (68), ni imprimir la etiqueta (77), ni ver la orden
que él mismo había abierto (83)—.

---

## 34. Bloque 90 — la pantalla de Roles no guardaba

### `property nombre should not exist`

Palabras del usuario: *«cuando cambio sale esta huevonada»*. Y tenía razón en
las dos cosas: el mensaje es ruido, y detrás había un fallo real.

`Roles.tsx` mandaba **el mismo cuerpo** al alta y a la edición:

```ts
const cuerpo = { nombre, descripcion, permisos };
if (nuevo) await api.post('/roles-admin', cuerpo);
else       await api.patch('/roles-admin/' + id, cuerpo);
```

El alta sí lleva nombre; la edición no. Y **el formulario ya lo sabía**: el
campo del nombre sólo se pinta con `edita.nuevo`. Lo que se enviaba era el
nombre que el rol ya tenía.

**Antes del bloque 85 ese campo de más se ignoraba en silencio** —`actualizar()`
sólo lee `descripcion` y `permisos`—. Al escribir el DTO, el `ValidationPipe`
corre con `forbidNonWhitelisted` —que es lo correcto— y ese campo pasó de
sobrar a **rechazar la petición entera**.

> **El DTO no creó el desajuste: lo destapó.** Pero dejó sin guardar la
> pantalla que reparte el poder de la planta, que es lo peor que podía tocar.

Y es **exactamente el riesgo que yo mismo escribí en el bloque 85**: *«con
`forbidNonWhitelisted`, un DTO al que se le olvide un campo rechaza peticiones
válidas con un 400 y el formulario deja de guardar sin decir por qué»*. Lo
escribí, lo cerré en tres módulos, y me pasó igual en el cuarto.

### El mensaje: nunca es culpa del usuario

Ese texto lo genera la librería de validación. Está en inglés, habla de
«propiedades», y **no hay nada que el usuario pueda corregir**: el campo que
sobra ni siquiera se le pide.

`avisos.ts` lo traduce ahora, y **va por delante del mensaje del servidor** —la
única excepción a la regla del bloque 67, porque este mensaje no lo escribió
nadie pensando en quien lo lee—:

> Fallo del software: el formulario envió un dato que el servidor no espera
> («nombre»). No es culpa tuya y no lo puedes corregir desde aquí; avisa a
> quien mantiene el sistema.

Se conserva el nombre del campo: es lo único que sirve para arreglarlo.

### Recorrido 7 — la pantalla de Roles guarda de verdad

No lo vio **nada**: ni el typecheck (los dos lados compilan), ni el lint, ni
los 30 verificadores, ni las 797 pruebas. El DTO es correcto, el servicio es
correcto y el formulario es correcto. Lo que estaba mal era **el ENCAJE entre
dos piezas que nadie prueba juntas**.

Es la tercera vez que un recorrido de Playwright caza algo que sólo se ve
abriendo la pantalla —la OM sin fecha (b88) y el desborde del teléfono (b89)
fueron las otras dos—.

**Se guarda sin cambiar nada, a propósito.** Lo que se prueba es que el cuerpo
que manda el formulario lo ACEPTA el endpoint. Tocar permisos aquí metería las
guardas de negocio —«no te quites a ti mismo `user.manage`»— y entonces un
fallo legítimo del guard parecería un fallo del encaje: dos cosas distintas con
el mismo rojo.

### Y el rol desfasado, que es de dónde salió todo

El usuario entró como Jefe de línea (Producción) y **no le salía el botón de
abrir una OM**. Medido: su rol lleva `wo.read` —el permiso ancho— y no
`om.mirar`, así que la migración del bloque 68, que reparte `wo.create` a quien
tenga `om.mirar`, **no lo alcanzó**. Falló CERRANDO: veía todas las pantallas
de mantenimiento y no podía abrir ni una orden.

Y al revés: con `wo.read` estaba viendo el Dashboard del ingeniero,
Indicadores, Exportar, Hojas de ruta, Preventivo y Correctivo — justo lo que el
bloque 80-C le quitó a Producción.

> **Las plantillas sólo se aplican AL CREAR un rol.** A los ya creados no les
> llega nada, así que un rol viejo deriva de su plantilla en silencio: no lo ve
> el compilador, ni las pruebas, ni los verificadores. Igual que el selector de
> CSS del bloque 89.

Se corrige desde la interfaz —es un dato de planta— y no con una migración:
`wo.read` lo tienen también Supervisor TI, Técnico, Técnico de Red y Consultor
Externo, y repartir `wo.create` por esa capacidad le daría al **Consultor
Externo** la facultad de abrir órdenes. La regla del bloque 68 está bien; lo
que estaba mal era el rol.

### Idea anotada, NO implementada

Petición del usuario, con su matiz: *«sería más fácil si desde aquí [Usuarios]
se puede editar eso y no desde Roles y permisos, porque afectas en general...
pero creo que eso está mal ya que se podría quitar, todo debe estar mega
auditado»*. Y él mismo cerró: *«no me hagas caso, no toques eso, tenlo como
idea»*.

Queda escrito con lo medido, para cuando se retome:

- **Editar permisos por PERSONA rompe el modelo entero.** Todo el reparto va
  por capacidad de rol (`@RequirePermissions`, `@RequireAlguno`, las
  migraciones sin nombres de rol). Con excepciones por usuario, la pregunta
  «¿quién puede cerrar una orden?» deja de tener respuesta corta.
- **Auditado ya está:** el interceptor de auditoría es global por método HTTP y
  Roles no está en las cinco rutas exentas. Cada `PATCH /roles-admin/:id` deja
  su registro con quién, cuándo y desde dónde.
- **Lo que sí falta es AVISAR DEL ALCANCE.** El modal no dice a cuántas
  personas afecta el cambio. «12 permisos marcados» no es lo mismo que «12
  permisos · afecta a 5 personas de este rol».

---

## 35. Bloque 91 — la pantalla de Órdenes, ordenada

### El botón que flotaba en mitad de la pantalla

Palabras del usuario: *«mira ese botón de asignar trabajo qué hace ahí»*. Y era
un fallo de una línea:

```
justify-content: space-between   con TRES hijos
   [ título ]        [ + Asignar trabajo ]        [ Alta completa ]
                       ↑ el del medio se va al CENTRO
```

Con `space-between` sólo puede haber **DOS** bloques: lo de la izquierda y lo
de la derecha. Los dos botones van dentro de un `<div>`. Es la misma trampa que
volverá el día que alguien añada un tercer elemento a una cabecera.

### «No entiendo» — dos botones que no se explican

Son dos actos distintos y el módulo entero depende de ello (bloque 4A):

    + Asignar trabajo  →  cuatro campos. El técnico la DETALLA después.
                          Por eso existen el filtro «Solo sin detallar»
                          y el botón «Detallar».
    Alta completa      →  el formulario entero, cuando ya se sabe todo.

Se conservan los dos —quitar el rápido obligaría al ingeniero a rellenar quince
campos para pedir un trabajo que aún no sabe cómo se hace— pero **ahora cada
uno dice para qué es** al pasar el ratón. Dos botones que crean lo mismo y se
llaman distinto obligan a adivinar, y quien adivina elige mal la mitad de las
veces.

La ayuda va en el `title` y no en la pantalla, a propósito: `verificar:densidad`
mide las palabras de la pantalla, y esto es ayuda, no contenido.

### Nueve columnas partían las palabras

En la pantalla del púlpito (1366 px) el tipo salía como **«Preventi/vo»** y el
código también. Una tabla que parte las palabras se lee mal aunque tenga todos
los datos.

**No se quitó nada: se agrupó**, igual que el bloque 81 con Activos.

    CÓDIGO          ACTIVIDAD          ESTADO · AVANCE · ACTIVO · PROGRAMADA
    OM-2026-0002    Corrección de…
    Correctivo      Tren 1 — Púlpito
    ◦ INC-2026-0002

De nueve columnas a **siete**, y queda hueco para el solicitante en ese mismo
sitio.

### Ocho botones en una fila

Eso era lo que de verdad descuadraba la tabla. Dos cambios:

- **Las acciones se envuelven** (`flex-wrap` + `gap`) en vez de `nowrap` con
  ocho `marginLeft: 4` escritos a mano — que además no separaban el primero
  del segundo.
- **«Eliminar» sale de la fila.** Es la decisión del bloque 80-D otra vez: *lo
  irreversible no va donde se pulsa por inercia*. Con ocho botones, el rojo
  estaba a cuatro píxeles de «Informe», y el error real no es pulsar el botón
  equivocado: **es pulsarlo en la FILA de al lado.**

No se pierde nada: la purga de órdenes vive en **Limpieza de datos** desde el
bloque 15.1, que es la pantalla hecha para esto, con su lista de candidatos, su
frase escrita a mano y el freno del almacén.

**Y el diálogo se fue con su botón.** Dejarlo puesto sin nada que lo abriera
sería código muerto — justo lo que persigue el barrido A: un bloque que nadie
llama compila, pasa el lint y no existe.
