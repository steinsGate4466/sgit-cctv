# Configuración del entorno de desarrollo — SGIT-CCTV

Cómo comprobar que tu computadora (Windows 10/11) tiene todo lo necesario para ejecutar
F0. Ejecuta cada comando en **PowerShell** o en la terminal de **WSL2** y compara con la
columna "esperado".

---

## 1. Docker

```powershell
docker --version
docker compose version
```

| Comando | Qué significa el resultado | Recomendado | Posibles problemas |
|---|---|---|---|
| `docker --version` | Versión del motor Docker instalado. Ej: `Docker version 27.x`. | 24.x o superior | Si dice "command not found": Docker Desktop no está instalado o no está en el PATH. |
| `docker compose version` | Versión del plugin Compose v2 (nota: sin guion). Ej: `Docker Compose version v2.29`. | v2.20+ | Si falla pero `docker-compose` (con guion) sí funciona, tienes Compose v1 (antiguo): actualiza Docker Desktop. |

> Docker Desktop debe estar **abierto y corriendo** (icono de la ballena activo) y con el
> backend **WSL2** habilitado en *Settings → General → Use WSL 2 based engine*.

---

## 2. WSL2

```powershell
wsl --version
wsl --status
```

| Comando | Qué significa | Recomendado | Problemas |
|---|---|---|---|
| `wsl --version` | Versión del subsistema Linux. Debe mostrar `WSL version 2.x` y `Kernel`. | WSL 2 | Si dice "opción no reconocida": WSL está desactualizado → `wsl --update`. |
| `wsl --status` | Distribución por defecto y versión (debe decir *Default Version: 2*). | Versión 2 | Si la distro está en versión 1, conviértela: `wsl --set-version <distro> 2`. |

> WSL2 es la capa Linux que Docker Desktop usa por debajo. Sin WSL2 en versión 2,
> los contenedores no rinden bien o no arrancan.

---

## 3. Node.js y npm

```powershell
node -v
npm -v
```

| Comando | Qué significa | Recomendado | Problemas |
|---|---|---|---|
| `node -v` | Versión de Node.js. Ej: `v20.17.0`. | **Node 20 LTS** (coincide con el Dockerfile) | Node 18 podría funcionar; evita versiones impares/no-LTS. Con Node 22 puede haber avisos. |
| `npm -v` | Versión de npm (viene con Node). Ej: `10.x`. | 10.x | Si `npm` falla pero `node` funciona, reinstala Node desde nodejs.org. |

> Node solo es necesario si vas a ejecutar el backend **fuera** de Docker (desarrollo con
> recarga). Si usas solo contenedores, Node va dentro de la imagen.

---

## 4. Git

```powershell
git --version
```

| Comando | Qué significa | Recomendado | Problemas |
|---|---|---|---|
| `git --version` | Versión de Git. Ej: `git version 2.45`. | 2.4x+ | Si falla: instala desde git-scm.com. En Windows, marca "Add to PATH" durante la instalación. |

---

## 5. VS Code (recomendado)

Extensiones sugeridas: **Prisma**, **ESLint**, **Docker**, **WSL** (para abrir el proyecto
dentro de WSL2). Verifica con:
```powershell
code --version
```

---

## 6. Resumen: entorno mínimo

| Herramienta | Versión mínima | Estado ideal |
|---|---|---|
| Docker Desktop | 24.x (Compose v2.20+) | corriendo con backend WSL2 |
| WSL | 2.x (Default Version 2) | actualizado |
| Node.js | 20 LTS | instalado (para dev local) |
| Git | 2.4x | en PATH |
| VS Code | reciente | con extensiones Prisma/Docker |

Si todos los comandos responden con versiones iguales o superiores a las recomendadas,
tu entorno está listo para la **Parte 2** (preparación del proyecto).
