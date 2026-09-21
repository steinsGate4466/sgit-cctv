# Bloque 112 · De cuándo son estos datos

> *«En cada dashboard siempre tiene que haber un apartado de fecha en la que se
> actualizó.»* — pedido tres veces a lo largo del proyecto.

---

## 1 · La medida

De las **56 pantallas, 7** lo enseñaban. Las otras **49** dejaban creer que lo
que se ve es de ahora mismo.

No es presentación. En el púlpito de Laminación la pantalla lleva ocho horas
abierta: el jefe de turno la mira de pasada, ve todo en verde, y **está leyendo
la madrugada**. La pantalla no parece rota — parece tranquila. Ése es el fallo
mudo que el bloque 42 arregló para una pantalla y que se quedó sin arreglar en
las otras 49.

---

## 2 · Por qué NO se hizo pantalla por pantalla

La forma evidente era añadir `cargadoEn` a las 49: estado, marca al recibir,
línea en el título. **Tres ediciones por pantalla, 147 sitios donde
equivocarse.** Y la que se olvide queda igual que antes sin que nadie lo note,
porque **la ausencia de un aviso no se ve**.

Se hizo en tres piezas, una sola vez:

| Pieza | Qué hace |
|---|---|
| `api/client.ts` | Toda respuesta buena de un **GET** deja su hora |
| `components/FechaDelDato.tsx` | La lee, la escribe y la hace envejecer sola |
| `components/Layout.tsx` | La pinta pegada al título, en todas las pantallas |

Las 56 quedan cubiertas de golpe, y **una pantalla nueva nace cubierta** sin
que su autor tenga que acordarse de nada.

---

## 3 · Las tres decisiones finas

### Sólo los GET

Un `POST` que guarda algo **no refresca lo que se ve**. Contarlo pondría el
contador a cero enseñando datos viejos: justo la mentira que esto viene a
quitar.

### Se reinicia al cambiar de ruta

Sin eso, una pantalla que todavía no ha respondido **heredaría la hora de la
anterior** y diría «hace 3 s» sobre una tabla vacía. Es la misma mentira con
otra cara, y es la pieza que hay que vigilar: si se cae, no se nota nunca.

### Dice un hecho, no una garantía

«Datos hace X» y no «todo actualizado». Afirma **cuándo llegó la última
respuesta buena**; no afirma que todos los paneles sean de esa hora, porque si
uno falló el suyo es más viejo. Un hecho comprobable en lugar de una promesa
que no se puede cumplir.

Y el número avanza solo cada 30 s: un «hace 2 min» congelado en 2 durante media
hora es el mismo engaño otra vez.

### El ámbar tarda en encenderse

A los **10 minutos**, no a los dos. Si se encendiera a los dos estaría
encendido siempre, y un aviso que está siempre encendido no avisa de nada.

---

## 4 · Las 7 que ya lo tenían se quedan como están

`MisCamaras`, `MisActivos`, `TableroOm` y compañía siguen con su propia línea.
No es duplicado inútil: **la suya es más precisa** — habla de la carga de *esa*
pantalla, y en el tablero de OM va en segundos porque refresca cada 25. La de
la cabecera es el suelo común; la suya, el detalle.

---

## 5 · `verificar:fecha-dato` — verificador 23 del frontend

Comprueba las tres piezas, porque basta que se caiga una para que las 56
vuelvan a callar. **Probado reintroduciendo el fallo en las tres.**

No exige nada pantalla por pantalla: la cabecera las cubre, y pedir dos veces
lo mismo llenaría el informe de ruido.

---

## 6 · Verde

```
frontend   23 verificadores VERDE · typecheck OK · lint 0 avisos
```
