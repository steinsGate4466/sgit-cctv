# Bloque 109 · La red del equipo, sin duplicar un solo campo

> *«No sólo la IP: también la máscara, el prefijo, /16, /24.»*

---

## 1 · Se pidió un campo. Se entregó un cálculo. Por qué

La primera idea era añadir `prefijo`, `mascara`, `vlan` y `gateway` al activo.
Se descartó **después de mirar qué hay ya en la base**:

```prisma
model Subred { cidr, vlan, gateway, dns1, dns2, dhcpDesde, dhcpHasta, tren }
```

Todo eso ya está declarado **una vez, por subred**, desde el módulo de IPAM. Y
`red.ts` ya tenía `analizar(cidr)`, `dentroDe(ip, cidr)` y `enPoolDhcp(...)`.

Copiarlo al activo habría creado cuatro campos capaces de **contradecir** a la
subred a la que la IP pertenece de verdad. El día que no coincidan, nadie sabe
cuál creerse — y en planta eso es salir a campo con una máscara equivocada.

> Es la regla fundacional del proyecto: **lo que se puede calcular no se
> guarda.** La IP del equipo más las subredes declaradas dan el prefijo, la
> máscara, la VLAN y la puerta de enlace sin margen de error.

**Y se gana algo que el campo suelto no daba:** cuando la IP no cae en ninguna
subred declarada, eso se ve. Con un campo de texto, una IP huérfana traería su
máscara escrita a mano y parecería correcta.

---

## 2 · Las tres decisiones que están probadas

### El /24 gana al /16

Con las dos subredes declaradas, una IP `10.20.4.31` pertenece a las dos. La
respuesta correcta es **la más específica**. Ordenarlo al revés daría la máscara
del /16 y el equipo no llegaría a su puerta de enlace.

### No se inventa una máscara

Si la IP no cae en ninguna subred declarada, **no** se devuelve «/24
probablemente». Se devuelve que no se sabe y qué hacer: declararla en IPAM. Un
/24 supuesto sobre una red que en realidad es /22 hace perder una mañana.

Hay una prueba que comprueba que la respuesta **no contiene ningún `255.255`**
en ese caso.

### Una subred desactivada ya no manda

Sólo se consultan las activas. Si alguien la retiró, no puede seguir explicando
la máscara de un equipo.

---

## 3 · Los dos avisos que valen una mañana

**Estática dentro del pool del DHCP.** El servidor puede entregar esa misma IP
a otro equipo la semana que viene y los dos se quedan sin red. El aviso existía
sólo en la pantalla de IPAM, que casi nadie abre; ahora sale **con el equipo
delante**, que es cuando sirve.

**La VLAN del equipo no coincide con la de su subred.** Si no cuadran, una de
las dos está mal y el equipo no pasa tráfico.

---

## 4 · Y funciona con los tres tipos de equipo

La IP vive en tres sitios distintos según qué sea el activo: `camera.ipAddress`,
`switchDev.mgmtIp`, `nvr.nicPrimary`. Mirando sólo el primero, media planta
habría salido «sin IP».

`red.read` y no `activos.mirar`: aquí se enseña direccionamiento, el mismo
criterio que ya usa `network.controller.ts`.

---

## 5 · Verde

```
backend    18 verificadores VERDE · typecheck OK · 10 pruebas nuevas
frontend   21 verificadores VERDE · typecheck OK · lint 0 avisos
```

**Sin migración y sin `prisma generate`:** no se tocó el esquema, que es
exactamente el punto del bloque.
