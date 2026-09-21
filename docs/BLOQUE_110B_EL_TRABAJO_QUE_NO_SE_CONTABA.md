# Bloque 110-B · El trabajo que no se contaba

> Cierra el bloque que el 110-A dejó a medias. Desbloqueado por el
> `prisma generate` del usuario.

---

## 1 · Qué se puede hacer ahora que antes no

El técnico llega a la cámara 45 y descubre que además hay que tocar el switch.
Hasta hoy sus opciones eran **abrir otra orden** o **no registrarlo** — y se
registraba lo segundo.

De ahí salían los indicadores bajos. Ahora lo añade a la misma orden y la orden
cuenta lo que de verdad se tocó.

---

## 2 · La cifra corregida, en el tablero

```
Órdenes abiertas        →  unidad de GESTIÓN   (una parada, un permiso, un cierre)
Equipos en trabajo      →  unidad de TRABAJO   (par orden-equipo intervenido)
```

**Las dos conviven a propósito.** Enseñar sólo la segunda haría creer que se
abrieron cuarenta órdenes; enseñar sólo la primera es lo que veníamos haciendo
mal. El recuadro nuevo lleva las dos: *«38 · 12 órdenes abiertas los cubren»*.

Una sola consulta con `distinct` sobre `(workOrderId, assetId)`: no hace falta
traer las filas, sólo contar los pares.

---

## 3 · Reportado y tocado, separados en pantalla

| Lo que pasa | Qué significa |
|---|---|
| Reportado **sin tocar** | Deuda con Producción: su cámara puede seguir mal |
| Tocado **sin reportar** | Lo que el técnico encontró por su cuenta |

El booleano `scopeChanged` de antes no distinguía las dos, y son **dos
conversaciones distintas con Producción**. La pantalla avisa con todas las
letras cuando queda algo reportado sin tocar.

---

## 4 · Las puertas

**Sobre una orden cerrada no se apunta nada.** No es rigidez: una orden cerrada
ya entró en los indicadores del mes. Añadirle un equipo después cambiaría una
cifra que alguien ya leyó en una reunión, sin que nadie se entere. Para
corregirla se reabre —que deja rastro— o se abre otra orden.

**Tope de 200 equipos por orden**, con un mensaje que explica por qué: una
orden que toca doscientos equipos no se puede cerrar ni medir; conviene
partirla.

**Volver a apuntar el mismo equipo actualiza, no duplica.** El índice único lo
garantizaba igual, pero es mejor que lo resuelva el servicio a que el técnico
se lleve un error de base de datos por pulsar dos veces.

**Quitar una fila es la única excepción de borrado del proyecto.** Una fila
apuntada por error no es historia: es ruido que ensucia la cuenta de
intervenciones. Por eso la auditoría guarda **qué** se quitó — el hecho
sobrevive aunque la fila no.

---

## 5 · Quién puede

Apuntar va con `wo.update`, el mismo permiso con el que el técnico ya detalla
la orden. Es la regla que quedó escrita en el bloque 106-B:

> **Registrar lo que acaba de pasar** → el permiso de quien lo hace.
> **Reescribir lo que ya está escrito** → el supervisor.

Aquí no se reescribe nada: se añade. Leer va con `wo.read` u `om.mirar`, porque
Producción tiene que poder ver qué se tocó de verdad en lo que pidió.

---

## 6 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 29 pruebas del área
frontend   24 verificadores VERDE · typecheck OK · lint 0 avisos
```
