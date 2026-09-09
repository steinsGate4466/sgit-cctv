# Bloque 100 · El candado de instancia

> **Qué cierra en una frase:** con dos réplicas en Railway, las tres tareas
> programadas del backend se ejecutaban **dos veces**, y ninguna fallaba al
> hacerlo.

---

## 1 · De dónde sale

Se midió el proyecto contra el modelo de negocio de la planta. En el apartado
de estructura salió esto:

```
src/modules/preventive/preventive.scheduler.ts        setInterval
src/modules/notificaciones/despachador.service.ts     setInterval
src/modules/notificaciones/resumen.scheduler.ts       setInterval
```

Las tres tenían guarda contra la ejecución doble. Las tres **dentro del
proceso**:

| Tarea | Su guarda | Qué es de verdad |
|---|---|---|
| Preventivo | `alreadyRanToday()` | Consulta la auditoría — pero es *comprobar y luego actuar*, y eso no es atómico |
| Despachador | `this.ocupado` | Un booleano en memoria |
| Resumen | `ultimoDiaEnviado` | Un texto en memoria |

Con **una** instancia las tres funcionan. Con **dos**, ninguna: cada proceso
tiene su propia copia de la memoria, y la comprobación del preventivo la hacen
los dos a la vez.

### Qué pasaba

- **PREVENTIVO** → las dos réplicas veían «hoy no se ha ejecutado» y las dos
  generaban el plan entero. **Órdenes duplicadas.** Dos cuadrillas al mismo
  poste, y el reparto correctivo/preventivo que va al comité contando el doble.
- **DESPACHADOR** → cada aviso de Telegram, dos veces. Su propio comentario ya
  lo decía —«dos a la vez mandarían el mismo aviso dos veces»— y sólo se
  protegía de sí mismo.
- **RESUMEN** → dos resúmenes cada mañana.

### El detalle que lo empeora

**Las dos réplicas arrancan a la vez en un despliegue.** Sus primeros disparos
(`FIRST_CHECK_MS`) caen con milisegundos de diferencia, así que el momento de
máximo riesgo es justo el momento en que se sube código.

### Y uno de los tres fallaba también con UNA instancia

`ultimoDiaEnviado` vivía en memoria. Un despliegue después de las 7 de la
mañana —que es cuando se despliega— reiniciaba el proceso, el campo volvía a
`null`, y **el resumen se mandaba otra vez ese mismo día**.

Ese fallo llevaba ahí desde que se escribió. No lo veía nada: no rompe, no sale
en rojo, y quien lo sufre concluye que el bot está mal configurado.

---

## 2 · La solución

`backend/src/common/candado-de-instancia.ts`

```ts
const r = await conCandado(this.prisma, CANDADO.PREVENTIVO, async () => {
  if (await this.alreadyRanToday()) return null;   // ← DENTRO
  return this.preventive.generateDue(...);
});
if (!r.tomado) return;   // lo está haciendo la otra réplica
```

### Por qué un candado de PostgreSQL

Porque **la base de datos es lo único que las dos instancias comparten**. Un
fichero, una variable o una marca en memoria no las ve la otra — que es
exactamente el fallo que se cierra.

### Por qué `xact` y no el candado de sesión — esto es lo importante

PostgreSQL ofrece dos familias:

```
pg_try_advisory_lock(k)        se suelta con pg_advisory_unlock(k)
                               O al cerrarse la CONEXIÓN
pg_try_advisory_xact_lock(k)   se suelta SOLO al terminar la transacción
                               — commit, rollback o caída del proceso
```

**Prisma tiene un pool de conexiones.** Dos consultas seguidas pueden viajar
por conexiones distintas. Con el candado de sesión, el `unlock` podría salir
por una conexión que no lo tiene: no suelta nada, y **el candado se queda
tomado hasta que esa conexión muera**.

Eso es un fallo **cerrado y permanente**: la tarea no vuelve a ejecutarse
nunca y nadie se entera, porque no hay error — sencillamente no pasa nada. Es
la misma familia que el selector de CSS muerto del bloque 89.

`pg_try_advisory_xact_lock` **no puede quedarse tomado**. Y va dentro de
`$transaction`, que es lo que obliga a Prisma a usar una sola conexión para
todo el bloque.

### Por qué `try_` y no el que espera

`pg_advisory_xact_lock` se queda en la cola hasta que el otro suelte. Con un
temporizador cada minuto eso acumula transacciones abiertas y se come el pool.
Aquí la respuesta correcta a «lo está haciendo el otro» es **no hacer nada y
volver en el siguiente ciclo**.

### Este falla CERRADO, y es lo contrario que los guards

Los guards de este proyecto fallan **abriendo** a propósito (bloques 12.3 y
82): son defensa en profundidad y un fallo de base de datos no puede dejar a la
planta sin sistema.

Aquí es al revés, porque las consecuencias son opuestas:

```
un guard que falla cerrado    →  la planta se queda sin sistema
un candado que falla abierto  →  órdenes y avisos duplicados
```

Y no se pierde nada: si la base no responde, la tarea tampoco podría hacer su
trabajo.

### Las claves son números fijos

Los candados consultivos comparten **un solo espacio de nombres** para toda la
base. Derivar la clave de un texto con un hash haría que dos nombres distintos
pudieran chocar, y un choque significa que **dos tareas sin relación se
bloquean entre sí**, con un síntoma —«esta tarea a veces no corre»— que no
lleva a ninguna parte.

```
PREVENTIVO        100_001
RESUMEN_DIARIO    100_002
AVISOS_SALIENTES  100_003
```

---

## 3 · La regla que hay que recordar al usarlo

> **Todo lo que haya que hacer una sola vez va DENTRO del candado, incluida la
> comprobación de «¿ya se hizo?».**

Dejar la comprobación fuera y meter sólo la escritura **no arregla nada**: las
dos instancias comprobarían a la vez, las dos verían que no se ha hecho, y
entrarían una detrás de otra. Sería el fallo original con un candado encima.

Hay una prueba que lo fija leyendo el código, y se comprobó sacando la
comprobación fuera: se cae.

---

## 4 · Los tres, uno por uno

### Preventivo — el candado envuelve el tick entero

Trabajo sólo de base de datos y una vez al día. El candado se sostiene durante
toda la generación, con un tiempo máximo de 5 minutos. Es una conexión del pool
ocupada una vez al día; se acepta y queda dicho.

### Resumen — candado **y** marcador persistido

Las dos mitades hacen falta:

- El **candado** cierra el problema entre instancias.
- El **marcador en `ConfiguracionSistema`** cierra el de una sola instancia (el
  despliegue de media mañana).

`ConfiguracionSistema` es una tabla clave/valor que ya existía: **este bloque no
necesita ninguna migración.**

### Despachador — el candado cubre *leer y reservar*; el envío queda fuera

```
DENTRO del candado:   findMany(30 pendientes)  +  updateMany(proximoIntento → +5 min)
FUERA:                las 30 llamadas a Telegram
```

**Por qué el envío no puede estar dentro:** treinta mensajes son treinta
llamadas de red. Tener una transacción de base de datos abierta mientras tanto
ata una conexión del pool al ritmo de un servidor que no controlamos, y si
Telegram se cuelga la transacción muere por tiempo. La **reserva** ya garantiza
que nadie más los toque, así que el candado no tiene que seguir puesto.

**Por qué la reserva no toca `intentos`:** reservar no es intentar. Sumarlo
gastaría uno de los cuatro reintentos por el mero hecho de haber cogido el
mensaje.

**Qué pasa si la instancia se cae a mitad del envío:** los que queden vuelven a
la cola pasados 5 minutos en lugar de al minuto siguiente. *Retrasar cinco
minutos un aviso es preferible a mandarlo dos veces* — el duplicado es lo que
enseña a silenciar el bot, y con el bot silenciado se pierde también lo
urgente.

**Limitación declarada:** con dos réplicas, las dos sondean Telegram
(`getUpdates`) y Telegram responde `409` a la segunda. No duplica nada —el
`.catch` ya lo absorbe— y la vinculación se resuelve en la vuelta siguiente.
Meterlo dentro del candado obligaría a tener una transacción abierta durante
una llamada de red, que es justo lo que se acaba de evitar.

---

## 5 · Verificador 18 · `verificar:planificadores`

El arreglo se puede deshacer sin querer: quien escriba el cuarto planificador
copiará uno de los que ya hay, y copiará el `setInterval` **sin** el candado,
porque el candado no salta a la vista.

> Una regla que hay que acordarse de cumplir es un agujero con fecha.

Comprueba cuatro cosas:

1. Todo archivo de `src/` con un `setInterval` **real** importa el candado, o
   está en `EXENTOS` con su motivo escrito.
2. Las claves de `CANDADO` son números y son **únicas**.
3. Toda `CANDADO.LOQUESEA` que se use está declarada.
4. Sigue siendo `pg_try_advisory_xact_lock` dentro de `$transaction`.

**Probado reintroduciendo el fallo en las cuatro direcciones**, y comprobando
con `diff -r` que `src/` vuelve idéntico después.

---

## 6 · Los tres tropiezos míos de este bloque

Se dejan escritos porque los tres son de la misma familia y van tres veces
seguidas.

### 6.1 · Cerré mi propio comentario antes de tiempo

En la cabecera del verificador escribí la marca de cierre de comentario **dentro
del comentario**, para explicar que hay que tenerla en cuenta. El archivo dejó
de ser válido cuatro líneas más abajo. Node lo cazó al instante. Es el bloque
18.1 con otra cara.

### 6.2 · Mi limpieza borraba justo la prueba que buscaba

La primera versión del verificador quitaba comentarios **y cadenas** para todo,
y **se dio tres falsos positivos a sí mismo en su primera ejecución**: los tres
planificadores que sí usan el candado salían como si no.

El motivo: la prueba vive dentro de una cadena.

```
import ... from '../../common/candado-de-instancia';   ← una cadena
SELECT pg_try_advisory_xact_lock(...)                  ← una plantilla
```

Son **dos preguntas distintas y necesitan dos limpiezas**:

```
¿hay un setInterval de verdad?  →  sin comentarios y SIN cadenas
¿usa el candado? ¿sigue el SQL? →  sin comentarios pero CON cadenas
```

### 6.3 · Y una prueba mía se cayó señalando un comentario correcto

`expect(fuente).not.toContain('pg_advisory_unlock')` miraba el archivo entero.
La cabecera **explica por qué no se usa `pg_advisory_unlock`**, así que la
palabra está escrita ahí — en el sitio donde se dice que no se usa. Acotada al
cuerpo de la función.

### La lección, que ya es la firma del proyecto

> **Un patrón más flojo —o más rígido— de lo necesario acaba leyendo otra
> cosa.** Van once veces. Las tres de este bloque son mías y salieron en menos
> de una hora, lo que dice algo: no es un descuido puntual, es el modo por
> defecto de equivocarse con búsquedas de texto. **Cuando un barrido da un
> resultado sorprendente, de lo primero que hay que dudar es del barrido.**

---

## 7 · Cadena de verificación

| | Resultado |
|---|---|
| `typecheck` | verde |
| Los **18** verificadores del backend | verde |
| Pruebas | **1.251 en verde** (883 en `test/`, 368 en `src/`) |
| `build` | verde, con `verificar:arranque` |
| Migraciones | **ninguna** — este bloque no toca el esquema |

**El build del frontend no se puede ejecutar aquí** (`rolldown` necesita un
binario nativo que no está en este entorno), y este bloque **no toca el
frontend**: no hay ni un archivo de `frontend/` modificado.

---

## 8 · Lo que queda anotado

- El **contador del `RitmoGuard`** y la **caché de permisos** siguen viviendo en
  memoria del proceso. Con dos réplicas, el tope efectivo de peticiones se
  duplica y un corte de acceso puede tardar hasta 15 segundos si lo atendió la
  otra instancia. Está documentado desde el bloque 12.2 y **no se cierra aquí**:
  ninguno de los dos corrompe datos, que es el criterio con el que se ordenó
  esta lista.
- Cerrarlos del todo pide un almacén compartido (Redis), y eso es una pieza de
  infraestructura nueva — decisión del usuario, no mía.
