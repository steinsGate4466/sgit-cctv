# Criticidad de equipos — recapitulación y propuesta

**Aceros Arequipa · Planta Pisco · LAMINACIÓN**
Documento para revisar CON EL INGENIERO **antes** de programar nada.

---

## 1. Para qué sirve esto

Para responder una sola pregunta:

> **¿Cada cuánto hay que hacerle mantenimiento a esta cámara?**

Hoy esa respuesta la da el software mirando **el ambiente** donde está la
cámara. El ingeniero quiere que la dé mirando **lo crítica que es**.

Son dos cosas distintas y hay que juntarlas.

---

## 2. Lo que YA está hecho

### a) Cada equipo tiene una criticidad

Cuatro niveles: **BAJA · MEDIA · ALTA · CRÍTICA**.

**No se escribe en el equipo: se hereda de la zona donde está.** Si alguien
declara que el lecho de enfriamiento del Tren 2 es zona CRÍTICA, todas las
cámaras que cuelgan de ahí son CRÍTICAS. Si mañana se corrige la zona, se
corrigen solas.

### b) Cada equipo tiene un intervalo de mantenimiento

Sale **del ambiente**, porque es el ambiente lo que rompe el equipo:

| Ambiente | Cada cuánto |
|---|---|
| Calor radiante | 30 días |
| Vapor de agua | 30 días |
| Polvo metálico | 45 días |
| Intemperie salina | 45 días |
| Interferencia eléctrica alta | 60 días |
| Climatizado (púlpito) | 90 días |
| *Sin ambiente declarado* | 60 días |

### c) **EL PROBLEMA: las dos cosas no se hablan**

> Una cámara **CRÍTICA** dentro de un púlpito climatizado se limpia
> **cada 90 días**, exactamente igual que una de criticidad BAJA.

La criticidad hoy sirve para **ordenar la cola de trabajo** (qué se atiende
primero cuando algo se cae), pero **no toca la frecuencia del preventivo**.

Eso es justo lo que el ingeniero quiere cerrar.

---

## 3. Lo que pide el ingeniero

De su hoja escrita a mano:

```
② Criticidad de activos  →  A · B · C
③ La criticidad decide la frecuencia:
      A  →  MP frecuencia 1
      B  →  MP frecuencia 2
      C  →  MP frecuencia 3
```

Y lo más importante, y es lo que hoy no se puede hacer:

> **Tiene que poder explicar POR QUÉ una cámara es A.**
> Un número sin método no se defiende delante de nadie.

---

## 4. El método propuesto — CTR

**Criticidad Total por Riesgo.** Es el método estándar en industria pesada, y
se sostiene delante de un ingeniero porque es el que se usa en minería,
petróleo y siderurgia.

La idea es de sentido común:

```
CRITICIDAD  =  FRECUENCIA con que falla  ×  CONSECUENCIA de que falle
```

Algo que falla mucho pero no le importa a nadie **no es crítico**. Algo que
casi nunca falla pero cuando falla para el tren, **sí lo es**.

### Cómo se calcula la CONSECUENCIA, adaptado a cámaras

Una cámara no para la línea por sí sola: lo que se pierde es **la capacidad de
VER**. Así que la consecuencia se arma con cuatro cosas:

```
CONSECUENCIA = (Impacto en producción × Falta de respaldo)
             + Impacto en seguridad de personas
             + Dificultad de repararla
```

| Factor | Qué se pregunta | Quién lo contesta |
|---|---|---|
| **Impacto en producción** | Si nadie ve esta zona, ¿se para el tren, se baja el ritmo, o se opera igual? | **Producción** |
| **Falta de respaldo** | ¿Otra cámara ve lo mismo, o esta es la única? | **El sistema** (ya lo calcula) |
| **Seguridad de personas** | ¿Vigila algo que puede lastimar a alguien? Barra caliente, grúa, tránsito | **SSOMA / el ingeniero** |
| **Dificultad de reparar** | ¿Se llega a pie, con escalera, con manlift, o hace falta parar el tren? | **El sistema** (ya lo tiene) |

Y la **frecuencia de falla** sale sola: **cuántas veces cayó en los últimos 12
meses**. El sistema ya guarda ese historial.

### De número a letra

| Puntaje | Letra | Qué significa |
|---|---|---|
| Alto | **A** | No puede quedarse ciega. Se revisa seguido |
| Medio | **B** | Importante, pero aguanta |
| Bajo | **C** | Si falla, se atiende cuando toque |

---

## 5. Cómo se junta con el ambiente (lo que ya existe)

**No se tira lo que hay.** El ambiente sigue mandando en lo suyo: el calor del
horno destruye sellos aunque la cámara sea C.

**La regla: manda el que más exige.**

```
Intervalo final = EL MENOR de:
    · el que pide la LETRA (A/B/C)
    · el que pide el AMBIENTE
```

Ejemplos:

| Caso | Letra dice | Ambiente dice | Queda en |
|---|---|---|---|
| Cámara A en púlpito climatizado | 30 d | 90 d | **30 días** |
| Cámara C en zona de calor radiante | 90 d | 30 d | **30 días** |
| Cámara A en calor radiante | 30 d | 30 d | **30 días** |
| Cámara C en púlpito | 90 d | 90 d | **90 días** |

Así ninguna de las dos razones se pierde, y no hay que discutir cuál pesa más.

---

## 6. Lo que TIENE QUE DECIDIR LA PLANTA

**Esto no lo invento yo.** Son los valores que hacen que el método diga la
verdad de Pisco y no la de un libro.

### 6.1 Los anclajes de cada factor

Hay que poner, en palabras de planta, qué significa cada nivel. Ejemplo de
cómo debería quedar el impacto en producción — **los textos los pone el
ingeniero**:

| Nivel | Qué significa en Laminación Pisco |
|---|---|
| 4 | *(por definir)* — ¿el púlpito no puede operar y hay que parar? |
| 3 | *(por definir)* — ¿se baja el ritmo o se opera con vigía? |
| 2 | *(por definir)* |
| 1 | *(por definir)* — ¿no afecta la operación? |

Lo mismo para seguridad y para dificultad de reparación.

### 6.2 Dónde cortan las letras

¿A partir de qué puntaje algo es A? ¿Y B? Eso lo decide el ingeniero mirando
**cuántos equipos quiere en cada grupo**. Lo normal es que A sea pocos: si
todo es A, nada es A.

### 6.3 Las frecuencias

¿A = 30 días? ¿B = 60? ¿C = 90? **Esos números los pone Mantenimiento**, no yo.

---

## 7. Dos reglas que propongo y que defendería

1. **La seguridad de personas no se promedia.**
   Si una cámara vigila una zona donde alguien puede lastimarse, **es A**
   aunque produzca poco. No se negocia con un puntaje: se salta la fórmula.

2. **Sin datos, nunca cero.**
   Un equipo sin clasificar **no es C**. Queda marcado como *«sin clasificar»*
   y sale en una lista de pendientes. Ponerlo en C por defecto haría que 400
   cámaras sin revisar parecieran poco importantes.

---

## 8. Qué se construye, en orden

| # | Qué | Quién lo alimenta |
|---|---|---|
| 1 | Pantalla donde el ingeniero **define los anclajes y los cortes** | Él, una vez |
| 2 | Pantalla para **puntuar equipos** (producción + seguridad) | Producción y SSOMA |
| 3 | El sistema calcula **frecuencia de falla y respaldo** solo | Automático |
| 4 | Se calcula la **letra A/B/C** y se enseña **por qué** | Automático |
| 5 | La letra **cambia el intervalo** del preventivo | Automático |
| 6 | **Informe imprimible** de la clasificación, para la auditoría | Automático |

**Todo editable desde la interfaz.** Si mañana cambia un criterio, se cambia
en pantalla — no se toca código. Es la regla de siempre del proyecto.

---

## 9. Lo que necesito antes de escribir una línea

1. **¿La letra se pone al EQUIPO o a la ZONA?**
   Hoy la criticidad se hereda de la zona. Si el ABC va por equipo, se rompe
   ese modelo y hay que decidirlo ahora, no después.

2. **¿Existe ya una clasificación de zonas de Producción para Laminación**, o
   se levanta desde cero con el ingeniero?

3. **¿SSOMA tiene identificadas las zonas de riesgo para personas?**

4. **¿Qué frecuencias quiere para A, B y C?**

Sin lo 1 no empiezo: es la decisión que condiciona todo el modelo de datos, y
un modelo de datos equivocado cuesta una migración por cada corrección.

---

## Fuentes del método

- [Métodos de Análisis de Criticidad y Jerarquización de Activos](https://www.researchgate.net/publication/342926771_Metodos_de_Analisis_de_Criticidad_y_Jerarquizacion_de_Activos)
- [Análisis de Criticidad Integral de Activos — Predictiva21](https://predictiva21.com/analisis-criticidad-integral-activos)
- [Análisis de criticidad de equipos: cómo realizarlo — Tractian](https://tractian.com/es/blog/analisis-de-criticidad-de-equipos-como-realizarlo)
- [La gestión del mantenimiento acorde a la criticidad de los activos — Redalyc](https://www.redalyc.org/journal/1815/181574886002/)
