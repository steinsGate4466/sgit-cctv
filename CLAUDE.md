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
