# Bloque 101 · El techo que se dice

> **Qué cierra en una frase:** el Excel de exportación se traía **todas las
> órdenes y todas las incidencias que existen** a memoria, sin `where` y sin
> `take`. Ahora tiene techo — y **dice que lo tiene**, dentro del propio
> archivo.

---

## 1 · Mi propio informe estaba mal enfocado, y eso es lo primero

En la auditoría anterior medí esto y lo reporté así:

```
231 llamadas a findMany · 183 SIN take
→ «hay que ponerle tope a las 183»
```

**Poner `take` a las 183 habría sido el peor arreglo posible.** Al mirarlas una
por una salieron **tres familias que se tratan al revés**:

### Familia 1 · Tablas que NO crecen con el uso — no se tocan

Roles (11), permisos (~60), etapas, catálogos, ubicaciones, gabinetes, subredes,
hojas de ruta (una por tipo de equipo), colores de cable, modelos de equipo.

Crecen con el tamaño de la **planta**, no con los años. La pregunta que las
separa es una: *¿esta tabla es más grande dentro de tres años aunque la planta
sea exactamente igual?* Si no, un tope no gana nada y sí puede **esconder una
fila**, que es peor que ser lento.

### Familia 2 · CÁLCULOS — un `take` aquí hace que el número MIENTA

El estado derivado de un activo, el MTTR, el cumplimiento del preventivo, el
backlog, el reparto correctivo/preventivo, la cobertura por zona, las cámaras
caídas, los candidatos a purga.

> Un cumplimiento calculado sobre «las primeras mil órdenes» **no es un
> cumplimiento**: es una cifra inventada con pinta de medida. Y va a un comité.

Éstas se acotan por **FECHA** —que es lo que ya hacen— nunca por cantidad.
Quedan declaradas exentas, **con su motivo escrito**, y es para siempre.

Un tope en `camaras-caidas.service.ts` sería el ejemplo perfecto de arreglo
peor que el problema: **escondería cámaras caídas**, que es el único resultado
inaceptable de esa pantalla.

### Familia 3 · Listas y archivos que lee una persona — aquí sí hay techo

Y aquí estaba el caso real.

---

## 2 · La bomba: la exportación no tenía `where` NI `take`

```ts
// ANTES
const filas = await this.prisma.workOrder.findMany({
  select: { … },
  orderBy: { createdAt: 'desc' },
});          // ← ni where, ni take. TODAS las órdenes que existen.
```

Lo mismo en `hojaIncidencias`. Y el libro **se arma entero en memoria** antes de
enviarse — por eso estas rutas ya llevaban `RITMO_PESADO` desde el bloque 12.2.

**Con la planta arrancando son cuatrocientas filas y no se nota.** Con tres años
de operación son decenas de miles, y el proceso se cae —o se queda sin
memoria— en **UNA sola petición**: justo la que el `RitmoGuard` no puede
frenar, porque es una y no cien.

Era la segunda mitad del hallazgo S-03 de la auditoría OWASP, que decía
«`/exportacion/todo` genera el libro en memoria». Se cerró el límite de
peticiones y **no se cerró el tamaño del libro.**

---

## 3 · La regla, y es lo único que hay que recordar de este bloque

> ## Un recorte que no se dice es una mentira.
>
> Un Excel con las últimas veinte mil órdenes **entregado como «todas las
> órdenes»** es PEOR que un Excel lento: quien lo abre cuenta filas, saca un
> total y lo lleva a una reunión. **Nadie va a sospechar de un archivo que no se
> queja.**

Así que el tope nunca va solo. Va con tres cosas:

```
take: TOPE_FILAS_EXCEL      cuántas se traen
workOrder.count()           cuántas HAY
avisoDeRecorte(...)         una frase, DENTRO del archivo
```

**El `count` es la pieza que hace posible decir la verdad.** Sin él, veinte mil
filas de veinte mil que hay y veinte mil de doscientas mil **se ven exactamente
igual**. Es una consulta barata —la base no mueve las filas, sólo las cuenta— y
va en paralelo con la otra.

Es la misma decisión que el paginador de Activos del bloque 81 («filtrando por
letra, el paginador cuenta lo de esta página, y se dice en pantalla») y que el
NVR del bloque 5 que no declara canales («si no se sabe, no se inventa»).

---

## 4 · Dónde va el aviso, y las tres decisiones

### En la HOJA, al final

```
ATENCIÓN · Esta hoja está RECORTADA: contiene 20,000 órdenes de 53,400 que
hay en el sistema (faltan 33,400). Se conservaron LAS MÁS RECIENTES. Para el
histórico completo, pídelo por periodos a quien mantiene el sistema.
```

**Al final y no arriba**, y no es comodidad: arriba rompería el `autoFilter` y
el panel congelado —la primera fila de datos tiene que seguir siendo la fila 2 o
los filtros de Excel dejan de funcionar, y una hoja con los filtros rotos se
abandona—. Y el final es donde llega quien pulsa `Ctrl+Fin` para ver «cuántas
filas hay», que es exactamente la persona a la que hay que avisar.

Tres cosas en cómo está escrito:

- **Dice los DOS números.** «Recortado» a secas no permite saber si falta una
  fila o el 90 % del histórico, y esa diferencia decide si el archivo sirve.
- **Dice QUÉ se conservó**, no sólo qué falta. Son las **más recientes**, y eso
  cambia cómo se lee la hoja: quien busca lo de este mes lo tiene todo.
- **Dice qué hacer.** Sin eso es un reproche, no un aviso — misma regla que el
  cumplimiento normativo del bloque 78, donde cada hallazgo dice dónde se
  arregla.

### Y en la PORTADA del libro completo

```
HOJAS RECORTADAS: no todo el histórico entra en un Excel.
· La hoja «Órdenes» está recortada a las 20,000 más recientes de 53,400.
```

Porque **quien abre el libro por la portada y no baja a la hoja de Órdenes no
vería el aviso nunca**. Una advertencia a la que hay que llegar no es una
advertencia (bloque 62, el aviso del QR).

Eso obligó a cambiar el orden de `exportarTodo()`: **las hojas se arman ANTES
de escribir la portada**, porque la portada tiene que poder hablar de ellas.

Y sólo sale **si hay algo que decir**. Un «no hay hojas recortadas» fijo se deja
de leer, y entonces no sirve el día que sí las hay (regla de los verificadores
desde el bloque 9).

---

## 5 · Por qué 20.000

**No es «todas»** porque el libro se arma entero en memoria: veinte mil filas
por doce columnas son unos pocos megabytes; doscientas mil son un proceso caído.

**No es mil** porque tiene que caber la operación de varios años — el caso de
uso real es llevarse el histórico a una reunión. Un tope tan bajo que se alcance
el primer año convierte el aviso de recorte en **ruido permanente**, y un aviso
permanente se deja de leer.

**No se edita desde la interfaz**, y es la única excepción a la regla de «todo
lo de planta es editable»: esto **no es un dato de planta**, es un límite de
memoria del servidor. Si algún día hace falta el histórico completo, la
respuesta correcta NO es subir el número — es exportar por periodos.

---

## 6 · Verificador 19 · `verificar:topes`

Comprueba cuatro cosas:

1. Todo `findMany` sobre una tabla de la lista `CRECEN` (25 tablas) tiene
   `take`, o está declarado con **categoría y motivo**.
2. **El número de consultas de cada exención cuadra.** Una exención no es barra
   libre para el archivo: si alguien añade un `findMany` sin tope al amparo de
   una exención vieja, la cuenta no da y falla.
3. **La categoría DEUDA sólo puede ENCOGER.** Si la lista declara más deuda de
   la que existe, también falla — sin esa mitad la deuda se «arregla» en el
   papel. Es el diseño de `verificar:dto` del bloque 85.
4. La exportación sigue teniendo tope **y sigue diciéndolo**: `count`,
   `medirRecorte`, `avisoDeRecorte` y `lineaDePortada`.

### El reparto que deja medido

| Categoría | Consultas | Qué significa |
|---|---|---|
| **CALCULO** | 22 | Un tope las haría mentir. Exentas para siempre. |
| **HIJO** | 16 | Acotadas por su registro padre (las fotos de UN activo, los materiales de UNA orden). |
| **DEUDA** | 4 | Pantalla sin techo. Sólo puede encoger. |

### La deuda declarada, con nombre y motivo

Tres sitios, y **no se cierran en este bloque a propósito**:

- `access.service.ts::accessRequest` — `findAll` alimenta la pantalla de
  permisos de acceso, que **no tiene paginador ni total**: devuelve un array
  plano y la pantalla pinta lo que llegue. Poner un tope aquí sin decirlo sería
  el recorte silencioso que este bloque cierra; **decirlo exige cambiar la forma
  de la respuesta y las DOS llamadas de `Access.tsx`**, con su `catch(() => [])`
  incluido. Eso es un bloque propio, no una nota al pie de éste.
- `campanas.service.ts::campanaMapeo` — la lista de campañas. Crece despacio,
  pero crece.
- `procedimientos.service.ts::mejoraProcedimiento` — las mejoras propuestas por
  los técnicos.

> **Media puerta es peor que ninguna.** Capar una pantalla sin que la pantalla
> lo diga es exactamente la mentira que este bloque existe para prevenir, así
> que o se hace entero o se declara. Se declara.

**Probado reintroduciendo el fallo en SEIS direcciones**, y con `diff -r` para
comprobar que `src/` vuelve idéntico:

1. quitando el `take` de la exportación
2. quitando el `count`
3. quitando la llamada al aviso de la hoja
4. dejando en la lista una deuda que ya no existe
5. añadiendo un `findMany` sin tope en un archivo **ya exento**
6. y con todo puesto, verde

---

## 7 · Un fallo mío al probarlo, y es de la familia de siempre

La comprobación 4 buscaba `avisoDeRecorte` en el archivo. **Quité la llamada y
el verificador siguió en VERDE**, porque el nombre seguía en la línea del
`import`.

> Un verificador que se conforma con que algo esté **importado** no comprueba
> que se **use**. Es el «modelo + endpoint ≠ función» de este proyecto aplicado
> a una función.

Corregido a buscar `avisoDeRecorte(` **con paréntesis**. Y lo cazó la prueba
número 3, o sea: **se encontró probando el verificador, no leyéndolo.**

Van doce veces con la misma firma.

---

## 8 · Las pruebas ABREN el archivo

12 pruebas. Las cuatro que importan **arman el libro con 20.000 filas, lo
escriben a un búfer y lo vuelven a abrir con ExcelJS** para leer las celdas.
Tardan tres segundos porque hacen trabajo de verdad.

Es la lección de los bloques 84 y 95: *un `addRow` con la clave equivocada
escribe celdas vacías y pasa el typecheck tan contento.*

Y hay una prueba para el caso contrario, que es igual de importante: **cuando NO
se recortó, no lleva ningún aviso.**

Probado quitando el aviso del servicio: la prueba se cae señalando exactamente
eso.

---

## 9 · Cadena de verificación

| | Resultado |
|---|---|
| `typecheck` | verde |
| Los **19** verificadores del backend | verde |
| Pruebas | **1.263 en verde** (1.251 de antes + 12 nuevas) |
| `build` | verde |
| Migraciones | **ninguna** |
| Frontend | **sin tocar** |

---

## 10 · Lo que queda anotado

- **Las tres de DEUDA**, arriba, con su motivo. El verificador las vigila y la
  lista sólo puede encoger.
- **La familia 1 no se toca nunca**, y queda escrito por qué: un tope sobre una
  tabla que no crece sólo puede esconder una fila.
- El `RitmoGuard` y la caché de permisos siguen en memoria del proceso (bloque
  100, apartado 8). Sin cambios.
