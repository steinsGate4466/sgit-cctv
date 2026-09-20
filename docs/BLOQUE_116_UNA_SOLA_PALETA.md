# Bloque 116 · Una sola paleta

> Sale del barrido del 17/09 (`docs/AUDITORIA_BARRIDO_2026-09-17.md`), hallazgo
> 3. Era el único MEDIO que quedaba abierto.

---

## 1 · Lo que había

**136 colores escritos a mano, en 45 tonos distintos**, repartidos por los
estilos en línea de 39 archivos.

Entre ellos **seis rojos para decir exactamente lo mismo** — `#991b1b`,
`#8c1414`, `#b91c1c`, `#b3261e`, `#dc2626`, `#c0392b` — y **cinco ámbares**.

Cuatro consecuencias, ninguna de gusto:

1. **El mismo estado se veía de dos colores** según la pantalla. «Crítico» en
   Activos y «crítico» en Grabadores no eran el mismo rojo.
2. **Cambiar la paleta era imposible**: 136 sitios a mano, y el que se olvide
   se queda con el color viejo para siempre.
3. **Un modo oscuro para el púlpito de noche, impensable.** Ese turno existe.
4. **En una exposición resta.** Parece hecho por dos personas distintas.

`verificar:clases` no lo cazaba porque **no son clases**: son estilos en línea,
y ese verificador compara nombres de clase contra la hoja.

---

## 2 · Por qué `--ok`, `--warn` y `--crit` no bastaban

Ya existían. Pero daban **un solo tono cada uno**, el del trazo. Un aviso
necesita tres —texto, fondo y borde— y al no tenerlos, cada pantalla se
inventaba los suyos. Por eso salieron cinco ámbares: no era desidia, era un
hueco en la paleta.

Ahora están los tres, con nombre, una sola vez:

```
--crit-texto / --crit-fondo / --crit-borde
--warn-texto / --warn-fondo / --warn-borde
--ok-texto   / --ok-fondo   / --ok-borde
--info / --info-texto / --info-fondo / --info-borde
```

**El azul informativo es nuevo y está separado a propósito:** no es un estado
de planta —no dice si algo va bien o mal—, marca lo que el sistema explica o
propone. Mezclarlo con el verde haría que una sugerencia se leyera como «esto
está correcto».

**136 sustituciones, 0 colores sin mapear.**

---

## 3 · `verificar:paleta` — verificador 22 del frontend

Ninguna propiedad de color de un estilo en línea puede llevar un `#rrggbb`. Y
además comprueba que **la variable citada exista**: un `var(--crit-text)` mal
escrito no da error en ninguna parte — simplemente no pinta.

Lo que no mira, para no gritar de más:

- `styles.css`, que es donde los colores deben estar escritos;
- los colores que vienen del **servidor** (el `hex` de la norma de rotulado):
  son un dato de planta, no una decisión de diseño. Un cable amarillo es
  amarillo y la paleta de la aplicación no manda sobre eso;
- `rgba(...)` en sombras.

**Probado reintroduciendo el fallo.**

---

## 4 · Y encontró dos bugs de paso

La comprobación de variables inexistentes, escrita casi de propina, encontró
**dos bordes que llevaban tiempo sin pintarse**:

| Sitio | Qué pasaba |
|---|---|
| `pages/Roles.tsx:345` | `var(--linea)` — esa variable **no existe**. La línea separadora entre roles nunca se dibujó |
| `pages/Assets.tsx:895` | `var(--line, var(--border))` — pintaba por el respaldo, pero el respaldo **escondía** una variable inventada |

Nadie lo habría visto nunca: el navegador ignora una variable que no existe, no
hay error en consola, el build pasa y las pruebas pasan. **Exactamente el mismo
fallo silencioso que persigue `verificar:clases`, en otra forma.**

Los dos apuntan ahora a `var(--border)`.

---

## 5 · Verde

```
frontend   22 verificadores VERDE · typecheck OK · lint 0 avisos
```

Con esto queda **cerrado el último hallazgo abierto** de la auditoría del
17/09, y el modo oscuro del púlpito pasa de «impensable» a «redefinir catorce
variables».
