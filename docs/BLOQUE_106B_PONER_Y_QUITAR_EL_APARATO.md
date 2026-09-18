# Bloque 106-B · Poner y quitar el aparato

> *«Imagínate que yo cambio la cámara y le pongo el mismo ID... tiene que ser
> de cero.»*

El 106-A creó la tabla. **Esto es lo que la llena y lo que la lee.**

---

## 1 · Qué cierra

Hasta el 106-A, `Asset` era dos cosas a la vez: el **sitio** (la cámara del
lecho de enfriamiento, columna 14) y el **aparato** (marca, modelo, serie,
firmware). Al cambiar la cámara y ponerle la misma etiqueta:

- las tres averías del aparato viejo quedaban colgando del nuevo;
- la vida útil se contaba desde la instalación del **primero**;
- y el informe de reemplazo no se podía escribir, porque el dato de qué se
  sustituyó y cuándo no existía en ninguna parte.

---

## 2 · Quién puede, y por qué NO es el supervisor

Retirar un aparato y poner otro **no es dar de baja el activo**: el sitio sigue
ahí, con su etiqueta, su criticidad y su historial. Es el trabajo normal del
técnico un martes por la tarde, con la cámara nueva en la mano.

> Pedirle firma de supervisor para eso tendría un único efecto real: **que no se
> registre**. Cambiaría la cámara igual y el dato se perdería — y un dato que no
> se registra es peor que un permiso flojo.

Así que va con `asset.update`, el mismo permiso con el que ya edita la ficha.

**Lo que sí es del supervisor** es CORREGIR una entrada ya cerrada, porque eso
reescribe el pasado. Se comprueba leyendo el cargo **de la base, no del token**
(las dos llaves, bloque 68): a quien se lo quitaron esta mañana no le vale la
sesión de ayer. Y el **intento denegado también se audita** — un registro que
sólo guarda lo que salió bien no sirve para investigar nada.

---

## 3 · Las puertas, y por qué cada una está

| Puerta | Por qué |
|---|---|
| Al menos marca, modelo, serie o firmware | Una fila con los cuatro vacíos no dice «hay una cámara puesta»: dice que alguien pulsó un botón |
| **Motivo obligatorio** al desplazar al anterior | «Se cambió la cámara» sin motivo no explica nada seis meses después, y es justo lo que hay que leer para decidir si el modelo aguanta en esa zona |
| Fecha futura rechazada | El reloj del móvil del técnico puede ir adelantado, y una instalación fechada mañana rompe la vida útil sin que nadie lo vea |
| El nuevo no puede entrar antes de que existiera el viejo | Con las fechas cruzadas el historial se lee al revés y nadie lo nota |
| Retirar **sin reponer** existe | Pasa: se llevan la cámara al taller y el sitio queda vacío una semana. Si la única forma de cerrar el anterior fuera instalando otro, el técnico **inventaría un aparato** — y ese invento se quedaría para siempre |

### Las dos escrituras van juntas o no va ninguna

Cerrar el viejo y abrir el nuevo describen **un solo hecho**: se cambió la
cámara. Si la segunda fallara, el sitio quedaría con dos aparatos abiertos o con
ninguno. La base lo rechaza igual —el índice único parcial del 106-A sólo admite
una fila con `hasta` vacío por sitio— pero es mejor que lo impida la transacción
a que lo impida un error de Postgres que nadie sabe leer.

Misma regla del almacén (37-C), del rol (86) y de la baja (87).

### Nada se borra. Nunca.

No hay un solo `delete` en este servicio. Retirar **cierra** la fila con su
fecha y su motivo. Aquí pesa el doble: **esta tabla es el informe de reemplazo**.

---

## 4 · La pantalla

`AparatoInstalado.tsx`, dentro de la ficha del activo y **antes** del historial
de averías. El orden importa: lo primero que hay que saber al mirar tres fallas
seguidas es si le pasaron al **mismo aparato** o a tres cámaras distintas.

Enseña lo que hay puesto, los anteriores con **por qué salió cada uno**, y la
cifra que hasta hoy no se podía escribir: *«se cambió 3 veces»*.

Las fechas estimadas —las que salieron del traspaso del 106-A, tomadas del alta
del sitio porque la real no existía— **se marcan como estimadas** en la ficha y
con un asterisco en la tabla. Un dato estimado que no se distingue de uno medido
envenena cualquier cálculo de vida útil.

Mirar lo puede quien tenga `activos.mirar`: no hay ni una credencial en la
respuesta.

---

## 5 · Lo que enseñó el verificador de DTO

Los tres endpoints nacieron con `@Body() body: any`. `verificar:dto` los cazó al
instante: *«hay 3, el tope declarado es 0»*. Con `any` el `ValidationPipe` **no
valida nada** — sin clase DTO no hay metadatos que aplicar.

Se escribieron las tres clases mirando **qué lee el servicio**, no lo que
parezca. Y con topes de longitud, que no son decoración: `serie` y `firmware`
llegan de un teclado en planta, con guantes, y sin tope un dedo apoyado en una
tecla mete diez mil caracteres en una columna que luego se enseña en una tabla.

Las **fechas no se pueden corregir** desde `CorregirAparatoDto`, a propósito:
mover un `desde` reordena el historial y puede solapar dos aparatos en el mismo
sitio. Si hace falta, será su bloque con su comprobación de solapes.

---

## 6 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 16 pruebas nuevas
frontend   21 verificadores VERDE · typecheck OK · lint 0 avisos
```

Las 16 pruebas son de **las puertas**, no del camino feliz: cada una existe
porque sin ella el registro deja de servir para lo que se creó.

**Esto desbloquea el bloque 108** — el informe de reemplazo y el de migración.
