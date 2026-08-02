# Bloque 8 · Monitoreo — montado y en espera

Estado: **todo hecho salvo encender**. Sin agentes dados de alta no llega ni
un reporte y el sistema funciona exactamente igual que hoy. El día que TI
autorice: se crea un agente, se instala un script en una máquina de planta y
empieza a llegar información. **Cero cambios de esquema, cero despliegues.**

---

## La decisión que hace que esto sea posible sin tocar el firewall

Lo natural sería que el servidor hiciera ping a las cámaras. Eso obliga a que
Railway **alcance** la red industrial: VPN, reglas de firewall, y abrir la
planta hacia internet. Que es exactamente lo que no se debe hacer — y por lo
que TI diría que no, con razón.

Aquí la conexión va siempre **de dentro hacia fuera**:

```
   [ agente, dentro de planta ]  ──  HTTPS 443 saliente  ──▶  [ Railway ]
```

- **No hace falta abrir ni un puerto** de entrada.
- La red industrial **no queda expuesta** a internet en ningún momento.
- Es tráfico de salida por 443, igual que una actualización de Windows.
- Si TI no permite salida directa, el mismo agente vale detrás del proxy
  corporativo cambiando una variable.

Es la misma forma que el bot de Telegram, y por el mismo motivo.

**Lo que hay que pedirle a TI ya no es "abridnos la red", sino "dejadnos
instalar un programa que sólo hace ping y sube resultados".** Es una
conversación mucho más corta.

---

## Lo observado va aparte de lo declarado

Son dos cosas distintas y mezclarlas sería el peor error posible:

| | Quién lo pone | Qué significa |
|---|---|---|
| `assets.status` | una **persona** | una **decisión**: "está de baja", "en mantenimiento" |
| `AssetObservation` | una **máquina** | un **hecho**: "no responde desde hace 14 minutos" |

Una cámara declarada OPERATIVO que no responde **no es una contradicción**:
es justo la información que hoy no tenemos. Si el monitoreo pisara el estado
declarado, se perdería.

`assets.status` no se toca. Ni una columna.

---

## Las tres reglas que evitan que esto se convierta en ruido

**1 · Un dato viejo es peor que no tener dato.**
Si el agente lleva dos horas caído y la pantalla sigue diciendo "responde", el
sistema **miente con cara de estar informado** — y a un dato con aspecto de
verdad la gente le hace caso. Toda observación caduca a los 15 minutos y pasa
a decir "sin comprobar desde hace X. El agente no está reportando".

**2 · No se da nada por caído al primer fallo.**
En una wifi industrial, con hornos y motores, una pérdida suelta es lo normal.
Avisar por cada una convierte el sistema en ruido, y a la tercera semana nadie
mira las alertas. Hacen falta **3 fallos seguidos** para afirmar que algo está
caído; antes de eso se dice "inestable, puede ser una pérdida puntual".

**3 · Al fallar no se pisa la última vez que se vio.**
Es el dato con el que se dice *"lleva 40 minutos caída"*. Si se machacara en
cada comprobación, siempre diría "caída desde hace 1 minuto" y no serviría
para nada.

---

## Una fila por activo, no un histórico

El histórico de pings de 2.000 cámaras cada minuto son **2,8 millones de filas
al día** y no dice nada que no diga la última observación. El histórico que de
verdad importa —cuándo se cayó y cuánto duró— son las **incidencias**, que ya
existen.

---

## Seguridad de la puerta del agente

El endpoint de ingesta va **sin sesión de usuario** —un agente no es una
persona— pero **no va abierto**:

- Se autentica con su **token propio**, comparado por hash `sha256` contra
  `monitor_agents`. En la base sólo queda el hash: quien se lleve una copia no
  obtiene con qué reportar.
- El token se muestra **una sola vez**, al crear el agente. Si se pierde, no
  se recupera: se genera otro, que es lo correcto.
- Va con **freno de intentos** (el mismo del login).
- **Tope de lote de 5.000 equipos**: sin él, un agente mal configurado —o
  alguien con el token— podría mandar un millón de filas y tumbar la base.
- El mensaje de rechazo es **el mismo** si el token no existe, está mal o el
  agente está desactivado: distinguirlos le diría a quien prueba tokens cuándo
  ha acertado con uno real.
- El agente **no da de alta activos**. Si reporta uno que no existe, se
  informa para que alguien limpie su lista, y se sigue.

Sin esto, el endpoint sería un buzón donde cualquiera podría declarar media
planta caída y provocar una salida de cuadrilla a las tres de la mañana.

---

## El agente

`agente/agente-planta.js` — **sin dependencias**. Usa el `ping` del propio
sistema operativo y el `https` que trae Node. Es deliberado: en una máquina de
planta, cada dependencia es un permiso que pedir y una cosa más que puede
romperse.

Detalles que importan en una red industrial:

- **20 pings a la vez, no todos de golpe.** Lanzar 500 pings simultáneos es
  indistinguible de un escaneo hostil y puede disparar las alarmas de red.
- **El intervalo lo manda el servidor**, no el archivo local: se cambia desde
  el sistema sin entrar a la máquina de planta.
- **Espera creciente ante fallos.** Si el servidor está caído no tiene sentido
  machacarlo cada dos minutos: se espera el doble cada vez, hasta media hora,
  y se recupera el ritmo en cuanto vuelve.
- **Modo simulación** (`--simular`): hace los pings y enseña el resultado sin
  enviar nada. Para la primera prueba delante de TI.

### Puesta en marcha, cuando haya luz verde

```
1. En el sistema:  Monitoreo → Agentes → Nuevo.  Copia el token.
2. En una máquina de planta con Node.js:

     set SGIT_URL=https://<tu-backend>.up.railway.app
     set SGIT_AGENT_TOKEN=<el token>
     node agente-planta.js --simular      ← primero en seco
     node agente-planta.js                ← ya de verdad

3. Programador de tareas de Windows, al inicio, para que arranque solo.
```

---

## Y cuando entre Zabbix

No hay que rehacer nada. `ProbeSource` ya contempla `ZABBIX`, `HIKCENTRAL` y
`MANUAL` además de `AGENTE`. Zabbix entra por la misma puerta de ingesta, con
su propio token de agente, y sus resultados se guardan en la misma tabla con
otra fuente. Lo único que cambia es quién empuja.

Lo mismo con HikCentral: cuando se integre, sus eventos de cámara caída
alimentan esta misma tabla en vez de inventar un segundo estado paralelo.
