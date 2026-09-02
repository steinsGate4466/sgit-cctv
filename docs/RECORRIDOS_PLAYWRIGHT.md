# Recorridos que ABREN el software

> **Esto es lo que faltaba.** Está escrito tres veces en `CLAUDE.md`, y las tres
> veces después de una exposición que salió mal.

---

## Por qué existen

Las 1.152 pruebas de este proyecto comprueban que el código está **bien
escrito**. Ninguna comprueba que **funcione**.

Es el tercer escalón de una regla que ya estaba en el archivo:

```
verificar que la copia es fiel   ≠  que el original es correcto
compilar un archivo suelto       ≠  hacer el typecheck
pasar el typecheck               ≠  QUE FUNCIONE
```

Los ocho bugs de los bloques 64 y 67 —los cuatro de la exposición delante del
ingeniero y los cuatro que encontró una desarrolladora en veinte minutos— tenían
todos lo mismo en común:

- **Ninguno se ve leyendo el código con atención normal.**
- **Los ocho se ven abriendo la pantalla.**
- **Ninguno rompe nada**, así que pasan el typecheck, el lint y los 28
  verificadores.

---

## Cómo se corren

```powershell
cd C:\Users\CRISTHIAN\Desktop\sgit-cctv\frontend
```

```powershell
npm.cmd run e2e:instalar
```

*(una sola vez: descarga el navegador, unos 150 MB)*

Después, copia `.env.e2e.ejemplo` a `.env.e2e` y rellénalo. **Necesitas el
entorno local levantado**: base de datos, backend y frontend.

```powershell
npm.cmd run e2e
```

Y para verlos correr en una ventana, paso a paso:

```powershell
npm.cmd run e2e:ui
```

---

## NO corren contra producción. Nunca.

Estos recorridos **escriben**: crean incidencias y órdenes. Y esas órdenes
entran en el cálculo del nivel de servicio y del reparto
correctivo/preventivo — los números que el ingeniero lleva al comité.

> Una prueba que falsea el indicador que se usa para decidir el presupuesto es
> peor que no tener prueba.

Por eso la configuración **se niega a arrancar** si la URL no es local:

```
Estos recorridos ESCRIBEN en la base (crean incidencias y órdenes).
No se ejecutan contra https://sgit-cctv.up.railway.app
```

Probado con las tres URL: las dos de producción se bloquean, `localhost` pasa.

---

## Los seis recorridos, y qué bug concreto caza cada uno

| # | Recorrido | El bug real que habría cazado |
|---|---|---|
| **1** | Entrar | El aviso de error que vivía **dentro** del formulario que se cerraba: la pantalla volvía atrás en silencio *(b. 64)* |
| **2** | El QR en campo | El aviso de «esta zona exige tren parado» que estaba calculado y **no se pintaba** *(b. 62-B)*. Y las fechas que se salían de su caja en iOS *(b. 70)* |
| **3** | Reportar incidencia | «Reportar avería no hace nada»: se cerraba el formulario aunque la respuesta viniera vacía *(b. 64)*. Y los botones apagados que no decían qué faltaba *(b. 67)* |
| **4** | Abrir la orden | **El peor de todos**: las OM nacían sin fecha, nunca vencían, no entraban en el backlog y el cumplimiento del preventivo mentía *(b. 64)* |
| **5** | Quién puede qué | El QR cerrado para el Jefe de Tren *(b. 68)*, el QR imprimible a medias *(b. 77)* y Producción sin poder ver sus órdenes *(b. 83)*. **Tres veces el mismo fallo** |
| **6** | Los indicadores | Los gráficos que enseñaban «value : 3» *(b. 64)*, las 21 fechas con formatos distintos y el Excel del bloque 84 |

**23 pruebas en 6 archivos**, en escritorio (1366×768, la pantalla de los
púlpitos) y el QR además en móvil (iPhone 13, porque el técnico usa su propio
teléfono).

---

## El recorrido 5 es el más importante, y necesita un segundo usuario

Recorre **todas las entradas del menú que ese usuario ve** y comprueba que cada
una **se abre**.

Es el único que caza el fallo que ya ha aparecido **tres veces**: una entrada de
menú abierta con su endpoint cerrado. Devuelve 403, la pantalla sale vacía, y
eso es indistinguible de «no hay datos». Tarda meses en verse.

**Con el Jefe de Mantenimiento no se detecta**, porque el Jefe lo ve todo. Hace
falta un usuario de perfil estrecho en `E2E_TECNICO_EMAIL`. Sin él, el recorrido
se salta y lo dice.

---

## Decisiones de diseño de las pruebas

- **Sin paralelismo.** Los seis son una historia encadenada: se reporta una
  avería, se convierte en orden y se cierra. En paralelo, el que cierra podría
  correr antes que el que abre.
- **Un reintento, y sólo en CI.** Cero convierte un parpadeo de red en una CI
  roja que nadie se cree; tres esconden un fallo que ocurre una de cada tres
  veces, que es el peor tipo.
- **Se comprueba que la cosa APARECE, no que el formulario se cerró.** El bug
  del bloque 64 era exactamente ése: el formulario se cerraba siempre, hubiera
  ido bien o mal.
- **Se vigila la consola.** Media prueba gratis: una pantalla puede pintarse
  entera y estar reventando en cada repintado.
- **Se mide el desborde de verdad**, en píxeles, no se busca una clase CSS.
- **Las credenciales salen del entorno**, nunca del repositorio.

---

## En la CI

Hay un trabajo nuevo, `recorridos`, que levanta **la pila entera** —Postgres,
backend compilado, frontend compilado y servido— y la usa como la usaría una
persona. Es el único trabajo del CI que hace eso.

Depende de `arranque`: si el backend ni levanta, estos recorridos sólo añadirían
ruido rojo sobre un fallo ya reportado más arriba.

**Se sirve el build, no el servidor de desarrollo.** El modo desarrollo no
trocea los archivos por ruta ni ejercita `lazy-con-reintento`, así que probar
ahí dejaría fuera justo la clase de fallo que se ve tras un despliegue.

---

## Lo que NO se pudo hacer aquí

**No se han ejecutado.** El entorno del agente no puede descargar el navegador
de Playwright: el dominio está bloqueado.

```
Error: Failed to download Chrome for Testing ... Download failure, code=1
```

Lo que **sí** se comprobó, y se dice tal cual:

- los 6 archivos **compilan** (`tsc` sobre `e2e/`, limpio);
- Playwright **los lee**: lista las 23 pruebas en los dos perfiles;
- la **guarda de producción funciona**, probada con las dos URL reales y con
  `localhost`.

La primera ejecución de verdad es en tu máquina. **Es normal que la primera vez
falle alguna** — no porque el software esté roto, sino porque un selector no
coincida con el texto exacto de tu pantalla. Mándame el error y lo ajusto.
