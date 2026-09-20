# Bloque 122 · Capacidad de red

> *«Cuando ellos quieren realizar algo, necesitan la información primero de
> cómo está la infraestructura, para poder validar si es apto o no apto.»*

---

## 1 · La pregunta que nadie podía contestar

**«Quieren cuatro cámaras nuevas en el lecho de enfriamiento. ¿Hay puertos?
¿Hay PoE? ¿O hay que comprar un switch antes?»**

Hasta hoy eso se contestaba yendo al gabinete con una linterna.

**Y el dato estaba entero en la base desde hace meses.** `SwitchPort` guarda el
número de puerto, si da PoE y a qué equipo está conectado. Un puerto libre es
una fila con `connectedAssetId` vacío. **Nadie lo preguntaba.**

## 2 · La segunda pregunta, la de los proyectos

*«¿Cómo proponemos cámaras con inteligencia artificial si no sabemos qué modelo
tenemos en planta?»*

Tampoco tenía respuesta: el campo `model` existe en cada activo y **nadie lo
agrupaba**. La segunda pestaña cuenta el parque por tipo, marca y modelo, con
el más antiguo de cada grupo.

Sin esa tabla no se puede proponer una renovación ni justificar una
reinversión. Con ella, *«tenemos 47 cámaras y 31 son del mismo modelo de 2019»*
pasa a ser una frase con un dato detrás.

---

## 3 · La decisión que evita comprar de más

**«Sin declarar» no es «lleno».**

Un switch que no declara sus puertos **no sale como «0 libres»**. Sale aparte, y
la pantalla lo dice con todas las letras:

> Cero libres significa **compra un switch**.
> Sin declarar significa **ve y mídelo**.

Confundirlos hace comprar equipo que no hace falta. Por eso el titular avisa
primero de **cuántos switches impiden contestar la pregunta**, antes de dar
ningún número de puertos: un «hay 40 libres» calculado sobre la mitad del
parque es peor que no dar número.

**El presupuesto PoE tampoco se estima.** O está declarado o se dice que no se
sabe: uno supuesto es cómo se quema una fuente.

**Y se distingue lo declarado de lo mapeado.** Un switch puede decir 24 puertos
y tener 18 filas: esos 6 son lo que nadie ha mapeado todavía, y salen en su
propia columna en vez de disimularse.

---

## 4 · Dónde vive, y con qué llave

En **Dependencias**, que es donde vive la infraestructura, y abre la sección
porque es la pregunta que se hace **antes** de instalar nada.

`red.read` **o** `infra.read` **o** `asset.read`. No es sólo de TI: **quien
decide con este informe es Mantenimiento**, que es quien contesta si la
instalación se puede hacer. No lleva ni una credencial ni una IP de gestión —
son cuentas de puertos.

El recorte por tren lo pone el servicio con `filtroConAmbito`, como siempre.

---

## 5 · Verde

```
backend    18 verificadores VERDE · typecheck OK
frontend   26 verificadores VERDE · typecheck OK · lint 0 avisos
menú       50 entradas, 54 pantallas — ninguna huérfana
```
