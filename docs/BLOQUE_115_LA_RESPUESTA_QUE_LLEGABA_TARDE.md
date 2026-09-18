# Bloque 115 · La respuesta que llegaba tarde

> Sale del barrido del 17/09 (`docs/AUDITORIA_BARRIDO_2026-09-17.md`). De los
> siete hallazgos, éste era el único con **riesgo operativo real**.

---

## 1 · El fallo, en una frase

Once efectos del frontend se relanzaban al cambiar algo —un equipo, una orden,
un texto de búsqueda— y escribían en la pantalla **sin comprobar que su
petición siguiera siendo la buena**. Si la anterior llegaba después, ganaba.

```tsx
useEffect(() => {
  api.get('/assets/' + assetId + '/historial')
    .then((r) => setD(r.data));      // ¿sigue siendo este equipo?
}, [assetId]);
```

## 2 · Por qué era ALTO y no una molestia de pantalla

`HistorialActivo` se enseña **antes de intervenir**, con las señales de
reincidencia, para que nadie vaya a campo a ciegas. El ingeniero da de alta una
OM y cambia el equipo en el desplegable: se lanzan dos peticiones, y si la
primera —la que ya descartó— llega la última, **la ficha dice una cámara y el
historial es de otra**.

`AssetScan` es peor, porque pasa con el QR en la mano: se escanea una cámara,
la señal de planta tarda, se escanea la siguiente, y se queda la ficha de la
primera con el código de la segunda en la dirección. Con guantes y a pleno sol
nadie comprueba eso.

> Un dato viejo que se hace pasar por el nuevo es peor que un error. Es la
> misma regla del bloque 42 sobre la edad del dato, en otro sitio.

## 3 · Por qué no lo cazaba nada

- **No es un error de tipos**: compila.
- **No es un error de lint**: la regla de dependencias está contenta.
- **No falla en pruebas**: en local el servidor responde en 2 ms y las
  peticiones nunca se adelantan.

**Sólo aparece con la red de planta**, que es justo donde no hay nadie mirando
el código.

## 4 · El arreglo

La guardia `let vivo` que este proyecto ya usaba en `Assets.tsx` y en
`BorrarDefinitivo.tsx`. React ejecuta la limpieza **antes** de relanzar el
efecto, así que la misma bandera cierra las dos puertas: el cambio de
dependencia y el desmontaje.

| Archivo | Qué se cruzaba |
|---|---|
| `components/HistorialActivo.tsx` | **el historial de otro equipo** |
| `pages/AssetScan.tsx` | la ficha del QR anterior |
| `pages/CabinetScan.tsx` | ídem con el gabinete |
| `components/DetallarOm.tsx` | la duración típica de otra OM |
| `components/OmHerramientas.tsx` | las herramientas de otra OM |
| `pages/Ipam.tsx` | el buscador de IP |
| `pages/Campanas.tsx` | por prevención: hoy la dependencia es estable |
| `MisCamaras` · `MisActivos` · `TableroOm` | por prevención, las tres iguales |

`auth/AuthContext.tsx` **ya estaba bien** desde antes, con una guardia llamada
`vigente`. Por eso el verificador acepta los tres nombres que el proyecto ya
usaba: obligar a reescribir lo que ya funciona es cómo se rompe algo al
arreglar otra cosa.

**El rebote no basta.** `Ipam` tenía 300 ms de espera antes de consultar, y aun
así: en cuanto una petición sale, seguir escribiendo lanza otra. El rebote
reduce la carrera; la guardia la cierra.

## 5 · `verificar:carreras` — verificador 21 del frontend

Marca todo `useEffect` que (1) tenga dependencias, (2) pida datos y (3) escriba
en el estado, sin guardia.

Lo que **no** mira, para no gritar de más:

- dependencias vacías — se lanza una vez, no hay dos respuestas que cruzar;
- efectos sin `api.` — un temporizador no tiene nada que cruzar;
- efectos sin `set...` — si no escribe, la respuesta tardía no cambia nada.

**Probado reintroduciendo el fallo:** quitando la guardia de `HistorialActivo`
sale con código 1 señalando archivo y línea.

## 6 · Y de paso, tres cosas pequeñas del mismo barrido

- **`Roles` y `Rotulado`** pintaban la cabecera de la tabla y ninguna fila
  cuando no había datos. Una tabla vacía sin una palabra no dice «no hay nada»:
  se lee como pantalla rota. Ahora lo dicen.
- **La fila de `Assets`** era pulsable con el ratón y no con el teclado. Lleva
  `tabIndex`, `Enter` y la clase `ta-pulsable` que el proyecto ya tenía.

## 7 · Verde

```
backend    18 verificadores VERDE · typecheck OK
frontend   21 verificadores VERDE · typecheck OK · lint 0 avisos
```
