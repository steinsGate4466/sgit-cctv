# Bloque 103 · El tren que no viajaba, y el login que culpaba a la contraseña

**Los dos los encontró el usuario abriendo el software.** Ninguno rompe nada:
no hay pantalla en rojo, no hay error en consola, no los ve el compilador.
Los dos MIENTEN en pantalla, que es la familia de fallo que este proyecto
persigue desde el bloque 64.

---

## 103-A · Elegías el Tren 2 y te llevaba al Tren 1

### Lo que pasaba

En «Por tren» se elige el Tren 2, se pulsa **«Qué está fallando»**, y «Mis
cámaras» se abre en el **Tren 1**.

### Eran DOS fallos encadenados

**1 · El enlace no llevaba el tren.**

```tsx
<Link className="btn-mini" to="/mis-camaras">      // ← sin el tren
```

Y la pantalla de destino arranca así:

```ts
if (t.length) setCode(t[0].code);                   // ← el PRIMERO de la lista
```

O sea: siempre el Tren 1. **Y no rompe nada** — enseña un tren de verdad, con
datos de verdad, con su pestaña marcada. Por eso sobrevivió a 1.270 pruebas,
20 verificadores, cinco auditorías y siete recorridos de Playwright.

**2 · Cada pantalla llamaba «tren» a una cosa distinta.**

| Pantalla | Qué guarda | Ejemplo |
|---|---|---|
| `PorTren.tsx` | la **sigla** | `T2` |
| `MisCamaras.tsx` · `MisActivos.tsx` | el **código del árbol** | `AASA-PISCO-T2` |

Pasar el valor de una a otra sin normalizar habría cerrado el síntoma **y
dejado el mecanismo intacto para la siguiente pantalla**. Es el patrón del
bloque 96 con otra cara: dos sitios que dicen lo mismo y nada les obliga a
coincidir.

### El arreglo va en el mecanismo, no en el enlace

`src/trenes.ts` — **NUEVO**. Un solo sitio que dice qué es un tren y cómo se
comparan dos. Replica la regla que el backend fijó en el bloque 42
(`common/ambito-usuario.ts`, función `alcanza`):

- acepta `T2` contra `AASA-PISCO-T2` en cualquier orden;
- **no compara por subcadena suelta**: con `includes('T1')` el Tren 1
  alcanzaría también a un futuro Tren 10;
- vacío nunca alcanza a nada — un dato que falta no es un permiso.

### «De qué depende» NO lleva el tren, y es deliberado

Esa pantalla pide `/network/dependencias` de la planta entera y **no tiene
pestañas de tren**. Pasarle un `?tren=` que ignora sería media puerta: parece
que funciona y no funciona. Es el fallo de los bloques 68, 77 y 83.

**Queda declarado como pendiente, no disimulado.**

### Detalle que no es de adorno

El tren de la dirección se lee **una vez, al montar** (`useState(() => …)`).
Releerlo en cada repintado haría que cambiar de pestaña dentro de «Mis cámaras»
volviera a saltar al tren del enlace, y no habría forma de moverse. Es la misma
trampa del efecto que se relanza del bloque 69.

---

## 103-B · Sin red, el login decía «contraseña incorrecta»

### Lo que pasaba

Con el equipo sin conexión:

> **Credenciales incorrectas. Te quedan 4 intento(s).**

...con la contraseña bien escrita.

Cuando axios no recibe respuesta, `err.response` es `undefined`. El código leía
un mensaje vacío, no casaba con «bloqueado», y caía en la rama de credenciales.

### Dos daños, y el segundo es el peor

1. **Miente sobre la causa.** Manda a revisar la contraseña cuando lo que hay
   que revisar es el cable.
2. **GASTA un intento que el servidor nunca recibió.** El contador baja solo, y
   quien lo ve cree que está a punto de quedarse fuera.

### Y lo que de verdad duele

`avisos.ts` distingue este caso **desde el bloque 67**, con este texto exacto:

> *sin respuesta → no llegó al servidor, NO se guardó*

**El login era el único sitio que no lo usaba.** Y el bloque 88 encontró
literalmente este mensaje —«Credenciales incorrectas. Te quedan 4 intento(s)»
con las credenciales correctas—, lo diagnosticó bien… y lo arregló **en el
andamio de Playwright, no en la pantalla que lo originaba**.

> Cuando un aviso falso aparece en una herramienta de diagnóstico, hay que
> preguntarse de dónde sale el texto. Si lo compone la pantalla, la pantalla
> tiene el mismo fallo.

### Ahora sólo el 401 gasta intento

| Respuesta | Qué se dice | ¿Gasta intento? |
|---|---|---|
| **sin respuesta** | no llegó al servidor, no se gastó ningún intento | **no** |
| mensaje con «bloqueado» | lo que diga el servidor | no |
| **401** | credenciales incorrectas, te quedan N | **sí** |
| 429 · 500 · 502 | lo que diga el servidor | no |

El 429 del freno de fuerza bruta y el 500 de un despliegue a medias **no dicen
nada sobre la contraseña**, así que no pueden gastar intentos.

---

## Piezas

| | |
|---|---|
| `frontend/src/trenes.ts` | **NUEVO** · qué es un tren y cómo se comparan dos |
| `frontend/src/pages/PorTren.tsx` | los enlaces llevan `?tren=`; el de dependencias no, con su motivo |
| `frontend/src/pages/MisCamaras.tsx` | resuelve el tren pedido con `elegirTren()` |
| `frontend/src/pages/MisActivos.tsx` | igual |
| `frontend/src/pages/Login.tsx` | «sin respuesta» antes de tocar el contador; sólo el 401 gasta |
| `frontend/scripts/verificar-trenes.cjs` | **NUEVO** · verificador 19 del frontend |
| `frontend/scripts/verificar-login-red.cjs` | **NUEVO** · verificador 20 del frontend |
| `frontend/package.json` | los dos nuevos, dentro del agregado |

**Migraciones: ninguna. Backend: sin tocar.**

## Los verificadores, probados reintroduciendo el fallo

En **cuatro direcciones**, y las cuatro salen en rojo con archivo y motivo:

1. quitar el `?tren=` del enlace;
2. volver a `setCode(t[0].code)`;
3. comparar por subcadena en `mismoTren()`;
4. quitar la guarda `if (!err?.response)` del login.

## Cadena

    typecheck        OK
    lint             OK  ·  0 avisos (el tope es 0 desde el bloque 93)
    20 verificadores OK
    build            NO SE PUDO CORRER en el entorno Linux

**Y el motivo del build se dice, no se disimula:** `node_modules/@rolldown/`
sólo contiene `binding-win32-x64-msvc`. Las dependencias están instaladas para
Windows, así que el binario nativo de rolldown no carga bajo Linux. **No se
ejecutó `npm ci` a propósito**: reinstalarlas aquí cambiaría ese binario por el
de Linux y rompería el build en la máquina del usuario. El build lo corre él.

## Anotado, no cerrado

- **«De qué depende» no filtra por tren.** Necesita que
  `/network/dependencias` acepte el ámbito y que la pantalla tenga pestañas.
- **La pantalla de Usuarios no avisa de que un usuario sin tren asignado ve la
  planta entera** — y para un rol sectorizado la tabla dice «Todos» cuando el
  servidor resuelve `NINGUNO`, o sea que **no ve nada y la pantalla afirma lo
  contrario**. Viene del bloque 102. Es el candidato al 104.
