# Bloque 108 · ¿Hay que cambiar este equipo?

> *«Cuando son muy reincidentes en el tema de incidencias, por ejemplo OM
> correctivas y tal, para poder hacer un análisis y cambiar ese equipo.»*

---

## 1 · Lo primero: qué había ya

Se midió antes de escribir, como en el 107. **Buena parte estaba hecha:**

| Pieza | Estado |
|---|---|
| Motor de reincidencia (`reincidencia.ts`, bloque 78) | **Ya estaba**: 5 señales con umbrales y severidad |
| `GET /assets/reincidentes` | **Ya estaba** |
| El informe de ficha ya imprimía las señales | **Ya estaba** |
| **El veredicto** — qué se hace con el equipo | **No existía** |

> Un informe que enumera síntomas y no concluye nada obliga a que quien lo lee
> lo interprete, y entonces cada uno concluye una cosa distinta.

Eso es lo que se construyó.

---

## 2 · `veredicto-reemplazo.ts` — el orden ES la decisión

**1 · ¿Fallan también los vecinos?** Va PRIMERO y gana aunque haya diez
órdenes. Si los equipos que cuelgan de la misma antena o del mismo switch
también fallan, el problema no está aquí: cambiar esta cámara **tira una cámara
buena** y el fallo sigue.

**2 · ¿Las fallas son del aparato puesto, o del anterior?** **Aquí paga el
bloque 106.** Antes de separar sitio y aparato, las averías de la cámara vieja
seguían contando contra la nueva, y el informe habría pedido cambiar una cámara
puesta hace tres semanas. Ahora se cuentan sólo las correctivas posteriores a
la instalación del aparato actual.

**3 · Sólo entonces** se propone el reemplazo. Y si el punto ya se ha comido
varios aparatos, el informe lo dice: *«si el siguiente vuelve a fallar, el
problema es del SITIO —montaje, alimentación, vibración, ambiente— y no del
modelo»*.

Cinco veredictos, **10 pruebas**, una por cada puerta.

---

## 3 · El PDF

`GET /assets/:id/informe-reemplazo`. No describe el equipo: **contesta una
pregunta**, y el veredicto va en la primera página, en un recuadro de color. Si
la conclusión estuviera al final, el informe funcionaría como un expediente que
nadie termina.

Detrás van los números con los que se contestó, para que quien firme pueda
**comprobarlo en lugar de creerse una frase**: correctivas del aparato frente a
las del punto, umbral, órdenes en ventana, cierres sin falla encontrada,
incidencias, señales con su sugerencia, causas ordenadas y los aparatos que ya
pasaron por ahí con su motivo de salida.

### Por qué no lleva costes

En este sistema **no hay precio de los equipos**: no existe el campo, en ningún
modelo. Poner una cifra «razonable» en un documento que va a una reunión de
presupuesto sería inventar un dato de planta.

El argumento económico que sí tenemos es mejor que un precio inventado, y va
destacado en rojo: **los minutos que el púlpito estuvo sin vista** por culpa de
ese punto. Eso es tiempo de producción a ciegas, y lo entiende cualquiera sin
saber de cámaras.

### Por qué NO hay dos versiones

Estaba previsto uno «de supervisor» y otro «de técnico sin datos sensibles». Al
escribirlo se comprobó qué lleva dentro: órdenes, causas, minutos sin visión,
aparatos. **Ni una contraseña, ni una IP de gestión, ni un coste. No hay nada
que quitar.**

Hacer dos versiones iguales habría dado la falsa impresión de que la del
técnico está recortada — y el día que alguien añadiera un dato sensible, lo
pondría en «la completa» pensando que la otra se recorta sola. Una sola
versión, y el control donde tiene que estar: en **quién** descarga y **de qué
tren**, que lo pone `@AmbitoDe`.

---

## 4 · El aviso va antes que el botón

`ReemplazoDelActivo.tsx`, arriba del todo en la ficha. **Nadie descarga un
informe de un equipo que cree que está bien**, así que el veredicto se ve en
pantalla y el PDF es para llevárselo.

Y cuando no hay motivo, **el recuadro no sale**. Un aviso que aparece siempre
deja de ser un aviso a la semana.

---

## 5 · Otro agujero del verificador de clases, y cerrado

El recuadro guardaba su clase en una tabla:

```tsx
const TONO = { MIRAR_AGUAS_ARRIBA: { clase: 'aviso' } };
<div className={'card ' + tono.clase} />
```

`verificar:clases` dio **verde** y `.card.aviso` no existía: el recuadro habría
salido sin el borde ámbar. Es el mismo fallo del bloque 113 entrando por otra
puerta — el literal no está dentro de un `className={...}`, así que ningún
barrido lo veía.

**Cerrado con una señal estrecha:** el literal es el valor de una clave que se
llama `clase`, `className` o `cls`. Un texto guardado bajo ese nombre es una
clase; no hay ambigüedad.

**Y una limitación que queda escrita, porque fingir que no está es peor:** el
verificador lee nombres de clase sueltos, no selectores compuestos. `aviso` ya
existía como `.zona-chip.aviso`, así que lo daba por definido aunque
`.card.aviso` no existiera. Lo pilló una comprobación a mano. Está anotado en
`styles.css`, junto a la regla nueva.

---

## 6 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 10 pruebas nuevas (26 en assets)
frontend   21 verificadores VERDE · typecheck OK · lint 0 avisos
```
