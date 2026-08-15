# SGIT-CCTV — Informe técnico del código

**Aceros Arequipa · Planta Pisco · Laminación (Trenes 1, 2 y 3)**
Fecha: 15 de agosto de 2026 · Bloques 33 a 36

---

## 1. Qué es este documento

Un estado del código escrito para que lo lea alguien de TI que no lo escribió:
qué hay, cómo está construido, qué se comprueba solo, qué está pendiente y qué
decisiones se tomaron a propósito.

No es un manual de uso. Es lo que se enseña cuando preguntan «¿esto quién lo
mantiene y cómo sé que funciona?».

---

## 2. Tamaño y forma

| | |
|---|---|
| Backend (código) | 240 archivos · 27 129 líneas TypeScript |
| Backend (pruebas) | 43 archivos · 6 169 líneas |
| Frontend | 88 archivos · 21 910 líneas |
| Hoja de estilos | 2 143 líneas, un solo archivo |
| Modelos de datos | 71 modelos · 52 enumerados |
| Migraciones | 33, versionadas y aplicadas en orden |
| Endpoints | 320 |
| Pantallas | 44 · 35 componentes compartidos |
| Permisos | 39 en catálogo · 7 roles base |
| Pruebas automáticas | **660 en 43 suites** |
| Verificadores propios | **15** (12 backend · 3 frontend) |

**Proporción de pruebas: una línea de prueba por cada 4,4 de código.** No es
cobertura de líneas —esa métrica premia probar lo fácil—. Las pruebas están
concentradas donde una equivocación cuesta datos o seguridad: permisos,
borrados, cálculo de estado, intervenibilidad, impacto eléctrico.

---

## 3. Arquitectura, y las tres decisiones que la sostienen

### 3.1 Pila

**Backend** — NestJS 10 sobre Node 22, Prisma 5.22, PostgreSQL 18.
**Frontend** — React 18 con Vite 5, SPA pura sin renderizado en servidor.
**Despliegue** — Railway, imágenes Docker multietapa. MinIO para archivos.
**Integración continua** — GitHub Actions, tres trabajos en paralelo.

### 3.2 Decisión 1 — Los datos derivados NO se guardan

Tren, etapa, ambiente, criticidad, intervalo preventivo, intervenibilidad y
estado efectivo **se calculan recorriendo el árbol de ubicaciones** en cada
consulta. No hay una columna `tren` en la tabla de activos.

Guardarlos sería más rápido. También significaría que mover una cámara de zona
deja su criticidad antigua pegada hasta que alguien se acuerde de
actualizarla — y nadie se acuerda. Un dato guardado que debería derivarse es un
dato que va a estar mal, y lo peor es que va a parecer correcto.

El coste está medido y controlado: el contexto de planta se resuelve en UNA
consulta por petición (`resolverContextoDePlanta`), no una por activo.

### 3.3 Decisión 2 — «Sin datos» nunca es «bien»

Atraviesa todo el sistema:

- El MTBF exige **dos** fallos. Con uno no hay intervalo que medir, y devuelve
  `null`, no un número inventado.
- La cobertura de una zona sin cámaras cargadas devuelve `null`, no `0 %`. Cero
  por ciento diría que la planta está ciega; cien por cien, que está entera.
  Las dos serían mentira.
- Un equipo sin fecha de instalación sale como **SIN DATOS**, no como bajo
  riesgo. Con su propio color gris —ni verde ni rojo— y su propia tarea.

Un tablero donde la mitad está en verde por estar vacío se enseña una vez en
una reunión y nadie vuelve a mirarlo.

### 3.4 Decisión 3 — El control de acceso se expresa con permisos, nunca con nombres de rol

Cerrado en el **bloque 34** y ahora vigilado por el CI. Ver §5.

---

## 4. Los 15 verificadores: qué comprueban y por qué existen

Ninguno es de estilo. **Cada uno nació de un fallo real que ni el compilador ni
las pruebas vieron.** Son la parte del proyecto que más difícil sería
reconstruir, porque cada uno codifica una lección.

| Verificador | El fallo que lo trajo |
|---|---|
| Inyección de dependencias | 01/08: el arranque cayó en producción. Compilaba y las pruebas pasaban: es un dato de tiempo de ejecución |
| Filtros de Prisma | 02/08: 400 en el tablero. La constante estaba anotada `: any`, que apaga justo la comprobación que lo caza |
| Campos de Prisma | 200 bloques `select`; un campo inexistente revienta en la consulta, no al compilar |
| Migraciones (sin base de datos) | Se editó el esquema sin crear la migración. Comprueba **en ambos sentidos** |
| Constructores | `new X()` sobre un módulo importado con `import *`. Compila y revienta al pulsar el botón |
| Roles y permisos | Encontró **11 desfases**, entre ellos que la semilla revocaba permisos en cada ejecución |
| Node con soporte | Node 20 murió el 30/04/2026 y el proyecto siguió tres meses y medio encima sin parches. Una versión sin soporte no se rompe: sigue funcionando igual |
| Despliegue (Dockerfile) | El contenedor arrancaba con `prisma db push`, que **puede eliminar columnas**. Llevaba meses |
| Ámbito por tren | Un `@SinAmbito()` robado de otra ruta al insertar una nueva (OWASP A01) |
| Cascada CSS | Propiedades declaradas dos veces con valores distintos |
| Foco | El cursor saltaba al primer campo con cada tecla. Lo encontró el usuario después de semanas |
| **Diálogos del navegador** | Bloque 35. Ver §6 |

### Dos lecciones que los verificadores se enseñaron entre ellos

**Los comentarios no son código.** El verificador de roles denunció como deuda
viva la frase de un comentario que explicaba cómo se había quitado esa misma
deuda. Y una explicación con comillas dentro del array `PERMISSIONS` se
convirtió en un permiso inventado que salió en tres secciones del informe.

Un verificador que castiga documentar el porqué acaba enseñando a no
documentarlo. Ahora ambos quitan los comentarios antes de buscar, y el
verificador de diálogos nació ya con esa regla.

**Cada verificador nuevo se prueba reintroduciendo el fallo.** No basta con que
dé verde: hay que ver que se pone rojo cuando debe. Los tres verificadores de
estos bloques se probaron así.

---

## 5. Bloque 34 — La segunda llave del borrado definitivo

### El problema

El borrado definitivo siempre pidió **dos llaves**: un permiso amplio
(`asset.delete` / `wo.approve`) y, además, ser «Jefe de Mantenimiento». La idea
es correcta —un permiso amplio se otorga por error al armar un rol, y esto no
tiene vuelta atrás—.

El problema era **cómo** estaba escrita la segunda llave: la cadena de texto
`'Jefe de Mantenimiento'` repetida a mano en **cinco archivos** entre backend y
frontend.

El nombre de un rol se edita desde la propia pantalla de Roles. Cambiarlo a
«Jefe de Mantto.» no habría dado ningún error:

- los botones desaparecen de la pantalla,
- el servidor empieza a rechazar a todo el mundo, incluida la persona que acaba
  de renombrarlo,
- y al revés: un rol nuevo con ese nombre exacto **hereda la llave** sin que
  nadie se la conceda.

Ninguno de los tres casos produce un mensaje de error que alguien pueda buscar.

### La solución

Permiso nuevo **`purga.definitiva`**, en el catálogo, visible y concedible
desde la pantalla de Roles.

### El segundo fallo, que apareció al arreglar el primero

La regla de «no borres al último administrador» contaba **cuántos usuarios
tienen ese rol**. La pregunta correcta nunca fue esa, sino **cuánta gente puede
dar de alta a otra**. Un rol nuevo llamado «Administrador TI» con `user.manage`
administra igual, y el conteo viejo no lo veía.

Ahora cuenta por permiso.

### La migración, probada contra PostgreSQL real

Cuatro escenarios, cada uno ejecutado **dos veces** para comprobar
idempotencia:

| Escenario | Resultado esperado | Resultado |
|---|---|---|
| Base nueva y vacía | Pasa sin conceder (de eso se encarga la semilla) | OK |
| Pisco tal como está hoy | La llave va al Jefe de Mantenimiento | OK |
| El rol **ya renombrado** | La llave va igual | OK |
| Nadie administra | **Falla a propósito** | OK |

El permiso **no se concede por nombre de rol** —sería repetir el error dentro
de la migración—, sino **por lo que el rol ya puede hacer**: quien tiene
`asset.delete` + `user.manage` + `role.manage` ya ejercía ese poder. Se le da
nombre propio, no poder nuevo.

> **Fallo propio detectado y corregido antes de entregar.** La primera versión
> abortaba si nadie tenía la llave, a secas. En una base nueva las migraciones
> corren **antes** de la semilla, así que la tabla de roles está vacía: esa
> versión habría tumbado el primer despliegue y el trabajo `migraciones` del
> CI. Lo cazó el escenario 1.

### El verificador, endurecido

La sección F pasó de **aviso a error**. Estuvo como aviso desde el bloque 12 y
sirvió para lo que sirven los avisos: se leyó una vez y se dejó ahí.

---

## 6. Bloque 35 — Fuera las 117 ventanas del navegador

### Qué había

117 llamadas a `window.confirm`, `window.alert` y `window.prompt` repartidas
por 35 archivos. Funcionan. Y traen cuatro problemas concretos en planta:

1. **Llevan la dirección del servidor en el título.** Chrome escribe
   «`...up.railway.app` dice:» encima de cada mensaje. En una demo ante
   Producción, lo primero que se lee no es la pregunta.
2. **No distinguen gravedad.** «¿Eliminar esta foto?» y «vas a borrar 43
   registros y no se recuperan» se ven exactamente igual.
3. **Bloquean el hilo.** Con una petición en curso, la pantalla se congela y el
   técnico vuelve a pulsar.
4. **El navegador puede apagarlas.** Chrome ofrece «impedir que esta página cree
   más diálogos» tras varios seguidos. Si alguien la marca, `confirm()`
   **devuelve `false` sin preguntar**. El botón deja de funcionar y no hay
   ningún error. Este es el que de verdad preocupa.

### Cómo se hizo

Un proveedor (`Dialogos.tsx`) que expone tres funciones **que devuelven
promesas**:

```ts
if (!(await confirmar({ titulo, mensaje, peligro: true }))) return;
```

**Por qué promesa y no estado de React.** Lo natural sería `useState` y partir
cada acción en dos mitades. Eso obliga a reescribir 117 llamadas cortando
funciones por la mitad, y cada corte es una ocasión de perder una validación.
`window.confirm` es síncrono: el código dice «pregunta, y si dice que no, sal».
Esa forma es la correcta y se conserva. El cambio en cada sitio es de una
línea, y el orden de las comprobaciones se queda donde estaba.

**Los valores de cancelación imitan al nativo** —`false`, `null`, `undefined`—
porque las 117 llamadas que se sustituyen comprueban justo eso.

### Lo que hace y el nativo no

- Distingue peligro de pregunta normal: franja y botón rojos, y **no se cierra
  al pulsar el fondo** (un clic despistado no debe contar como respuesta a algo
  que no se deshace).
- Puede exigir **escribir una palabra** para confirmar.
- **Atrapa el foco.** Sin esto, un Tab se va a los botones de detrás: con
  teclado se puede pulsar «Eliminar» de la fila de al lado creyendo que se está
  respondiendo a la pregunta.
- Devuelve el foco al botón de origen al cerrar. `role="alertdialog"`,
  `aria-modal`.
- **Una cola, no una sola ranura.** Dos avisos seguidos —al subir varios
  archivos y fallar dos— ya no se pisan.
- Campos a 16 px: por debajo de eso, Safari en iOS hace zoom al enfocar y
  descoloca la pantalla.
- En móvil los botones se apilan y **el principal va arriba**, bajo el pulgar.

### Cómo se verificó la migración

TypeScript fue la red de seguridad, y funcionó: la transformación mecánica dejó
**12 errores de compilación**, todos del mismo tipo —`await` dentro de una
función que no era `async`—. Cada uno se revisó y corrigió a mano.

Dos casos no eran mecánicos y se rehicieron: `pedirTexto` recibía dos argumentos
sueltos al estilo de `window.prompt` y ahora recibe un objeto con título,
mensaje y valor inicial separados.

**Un falso positivo propio, registrado por honestidad:** la auditoría marcó
`cola-offline.ts` por usar `avisar` sin el hook. Es una función local que existe
desde antes, notifica a los suscriptores de la cola sin conexión y sólo comparte
el nombre. El archivo nunca se tocó.

**Estado final: 0 ventanas del navegador, 0 errores de tipos, compila.**

---

## 7. Bloque 36 — Dos cálculos que no tenían pantalla

Auditoría de endpoints contra rutas del frontend: **tres controladores sin
uso**. `health` es correcto (lo consulta el orquestador). Los otros dos eran
trabajo terminado e invisible.

> **Un cálculo sin pantalla, para la planta, no existe.**

### 7.1 Riesgo — «¿qué se va a romper y no vamos a poder arreglar?»

El backend del bloque 32 lo calculaba desde hacía semanas. Dos exposiciones
distintas, dos pestañas:

- **Almacén** — el repuesto que sostiene una zona vital y no está en stock. El
  equipo anda; el día que falle no hay con qué.
- **Equipos** — el modelo sin recambio en el mercado o sin soporte del
  fabricante. No se arregla comprando una pieza: se planifica un cambio de
  modelo con meses.

Detalles de diseño:

- **Las tarjetas de indicador son filtros.** Es la diferencia entre un tablero
  que se mira y uno que se usa: se lee «3 críticos» y se pulsa para tenerlos
  delante. Son `<button>` de verdad, así que funcionan con teclado.
- **Las dos peticiones se protegen por separado.** Un jefe de línea tiene
  `asset.read` pero no `inventory.read`: con un solo `catch` alrededor de ambas,
  ese 403 dejaría también la pestaña de equipos vacía y la pantalla parecería
  rota.
- **El umbral de años lo pone la planta**, no el código: una cámara en el horno
  envejece distinto que una en el púlpito.
- **El titular y el «por qué» los redacta el backend**, en la misma regla que
  decide el nivel. Si los escribiera la pantalla, el texto y el color podrían
  acabar contando cosas distintas.
- La lista de **modelos sin ficha** es la tarea concreta: no «revisa el
  inventario», sino «averigua estos seis».

### 7.2 Estándar de rotulado (ANSI/TIA-606-C)

En un rack conviven cables de varios contratistas y de varias épocas. Cuando
cada uno rotula a su manera, para saber a dónde va un cable hay que **tirar de
él** — y así es como se cae una zona.

La norma dice **dos cosas distintas**, y una auditoría las distingue:

- **El identificador es obligatorio.** Único, jerárquico, presente en el cable,
  el puerto y el registro.
- **El color es recomendado.** Lo exigible es que exista un estándar interno,
  escrito y aplicado en toda la instalación. Un color a medias es **peor que
  ninguno**: enseña a desconfiar del rótulo.

La pantalla tiene generador, revisor y el código de color con **el origen de
cada decisión** (norma o criterio interno). El rojo de la red de proceso es
criterio interno y el más importante de la planta: marca la red que no se toca
sin coordinar con Producción.

Un estándar en un PDF se consulta el primer mes. Con el generador al lado de la
tabla, el técnico escribe tipo, tren y zona y sale el código exacto: no hay que
interpretar la fórmula, y por tanto no hay dos personas que la interpreten
distinto.

**Todo el cálculo está en el backend, con pruebas.** La pantalla no valida nada
por su cuenta: si tuviera su propia copia de la fórmula, empezarían a discrepar
y ganaría la equivocada, que es la que la gente tiene delante.

---

## 8. Seguridad y dependencias

### Estado hoy

| | Críticas | Altas | Moderadas | Bajas |
|---|---|---|---|---|
| Backend | 0 | **0** | 7 | 2 |
| Frontend | 0 | **1** | 3 | 0 |

Punto de partida: **13 altas**.

### Lo que se cerró y por qué importaba

| Librería | Dónde vive | Riesgo |
|---|---|---|
| `multer` 2.0.2 → 2.2.0 | recibe las fotos que suben los técnicos | alcanzable desde una petición HTTP |
| `body-parser` 1.20.4 → 1.20.6 | **cada POST** | con un límite inválido desactivaba en silencio el control de tamaño |
| `qs` 6.14.2 → 6.15.3 | **cada `?filtro=`** | caída remota provocable |
| `ajv` 8.12.0 → 8.20.0 | validación | ReDoS |
| `postcss` 8.5.20 → 8.5.26 | compilación | lectura de archivos arbitrarios |

**Ni un solo `npm audit fix --force`.** Todo son *overrides* de versión menor o
de parche, verificados con las 660 pruebas.

> **Error propio, documentado porque la lección importa.** El primer intento usó
> `js-yaml ^4.1.1` y `nanoid ^3.3.8`. Los dos **caían dentro del rango
> vulnerable**. El override se aplicaba, `npm install` decía «cambiado» y no
> arreglaba nada. **Es peor equivocarse así que no hacerlo: el informe sale en
> verde.** Se corrigió leyendo el rango exacto de cada aviso.

### Lo que queda, con su motivo

- **NestJS 10** (7 moderadas) — el parche está en 11.1.18. Salto mayor de
  framework, con guards y Express 5 por medio. Es un bloque propio.
- **`react-router-dom`** — «redirección abierta que lleva a XSS», y **sí viaja
  al navegador**. No existe parche en la 6.x. Se revisó si nos alcanza: el único
  destino que viene de fuera es el retorno tras iniciar sesión, y ahí ya hay una
  **lista blanca** que exige una sola barra inicial y **rechaza la barra
  invertida** — el vector exacto del aviso. El segundo aviso es de hidratación
  SSR; esto es una SPA (se buscó `hydrateRoot` y `StaticRouter`: no hay). *Se
  tapó de paso un hueco menor: la tira «Lo último» salía de `localStorage` sin
  filtrar contra las rutas reales.*
- **`file-type` y `uuid`** — se verificó que **no llamamos el código
  vulnerable**: no se usa `FileTypeValidator` ni `ParseFilePipe`, y de `uuid`
  sólo la v4 sin buffer.
- **`webpack`, `@nestjs/cli`** — del CLI. Desde el Dockerfile nuevo **ni
  siquiera viajan en la imagen**.
- **`vite`** — compilador. El navegador recibe JavaScript ya compilado.

### Contenedor (bloque 33)

Cinco correcciones, la primera podía costar datos de planta:

1. **`prisma db push` → `prisma migrate deploy`.** `db push` no aplica
   migraciones: sincroniza el esquema y **puede eliminar columnas**. Prisma lo
   documenta como herramienta de prototipado. Con la base vacía nunca pasó nada.
   El comentario del archivo decía «aplica las migraciones versionadas» y el
   comando decía otra cosa.
2. **La semilla ya no corre en cada arranque.** Estaba con `|| true`, que se
   tragaba cualquier fallo.
3. **`npm install` → `npm ci`.** Dos despliegues del mismo commit llevaban
   librerías distintas.
4. **`npm prune --omit=dev`.** No recompila los binarios nativos (argon2, el
   motor de Prisma); reinstalarlos exigiría traer el compilador a la imagen.
5. **No corre como root, y hay HEALTHCHECK.**

---

## 9. Lo que falta

### Código

| Qué | Por qué importa |
|---|---|
| Prueba de integración en CI | Hoy el CI compila y prueba unidades. **Nadie comprueba que la aplicación arranca de verdad** — y ese fue el fallo del 01/08. Levantar Postgres, aplicar las 33 migraciones, arrancar y pegarle a `/health` |
| Pantalla de procedimientos | El backend existe; sólo se consume desde el QR del equipo |
| NestJS 10 → 11 | Cierra las 7 moderadas restantes |

### Acciones de TI, fuera del código

1. **Activar PITR en Railway antes de cargar datos reales**, y ensayar una
   restauración. Un respaldo que nunca se restauró no es un respaldo.
2. **Rotar la contraseña de PostgreSQL.**
3. **`CREDENTIAL_ENC_KEY`** — el backend se niega a arrancar en producción sin
   ella.
4. **Token de Telegram** — el registro dice «Avisos apagados (sin token)». No
   falla, pero hoy nadie recibe nada.
5. **Bucket externo (R2) y secretos en GitHub.**

### Acción de Producción

Declarar **2–3 zonas vitales**. Sin eso, «Mi cobertura» y la mitad de Riesgo
salen vacías, y una pantalla vacía en una demo parece una pantalla rota.

### Acción de administración

Tras desplegar el bloque 34, comprobar en Roles que el Jefe de Mantenimiento
tiene marcado **«Borrar definitivamente (sin vuelta atrás)»**. Si la migración
no encontró a quién concedérselo, el despliegue habrá fallado con el mensaje
explicando por qué — que es lo que se busca.

---

## 10. Cómo se comprueba todo esto

```
cd backend
npm ci
npm run verificar        # los 12 verificadores del backend
npm run build
npm test                 # 660 pruebas

cd ../frontend
npm ci
npm run typecheck
npm run lint
npm run verificar:dialogos
npm run verificar:foco
npm run build
```

El CI de GitHub Actions ejecuta todo esto en cada push, en tres trabajos
paralelos, más un cuarto que levanta un PostgreSQL 18 —la misma versión mayor
que producción— y aplica las 33 migraciones sobre una base limpia.

---

## 11. Resumen para quien lea sólo esto

El sistema **no se defiende diciendo que funciona.** Se defiende diciendo qué se
comprueba solo y qué no.

Lo que se comprueba solo: 660 pruebas y 15 verificadores, cada uno nacido de un
fallo real que ni el compilador ni las pruebas habían visto.

Lo que no: que la aplicación arranque contra una base real. Ese hueco está
identificado y es el siguiente en la lista.

Los fallos propios que aparecieron durante estos bloques —un override dentro del
rango vulnerable, una migración que habría tumbado el primer despliegue, un
verificador que se denunciaba a sí mismo— están escritos aquí con nombre y
apellido. No porque quede bien, sino porque **la clase de fallo que persigue
este proyecto es la que no avisa**, y esconder los propios sería practicar
exactamente lo que se intenta evitar.
