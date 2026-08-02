#!/usr/bin/env node
/**
 * ============================================================================
 *  AGENTE DE PLANTA — SGIT-CCTV
 *  Aceros Arequipa · Planta Pisco · Laminación
 * ============================================================================
 *
 *  QUÉ HACE
 *  Vive DENTRO de la red de planta. Cada pocos minutos:
 *    1. Le pide al servidor la lista de equipos a comprobar.
 *    2. Hace ping a cada uno.
 *    3. Le devuelve los resultados.
 *
 *  POR QUÉ ASÍ, Y NO AL REVÉS
 *  Lo natural sería que el servidor hiciera ping a las cámaras. Eso obliga a
 *  que Railway ALCANCE la red industrial: VPN, reglas de firewall y abrir la
 *  planta hacia internet. Que es exactamente lo que no se debe hacer.
 *
 *  Aquí la conexión va SIEMPRE de dentro hacia fuera:
 *
 *      [ esta máquina, en planta ] --- HTTPS 443 saliente ---> [ Railway ]
 *
 *    · No hace falta abrir NI UN PUERTO de entrada.
 *    · La red industrial no queda expuesta en ningún momento.
 *    · Es tráfico de salida por 443, como cualquier actualización de Windows.
 *
 *  NO NECESITA INSTALAR NADA. Sólo Node.js. Sin dependencias externas: usa
 *  el ping del propio sistema operativo y el https que trae Node. Eso es
 *  deliberado — en una máquina de planta, cada dependencia es un permiso que
 *  pedir y una cosa más que puede romperse.
 *
 * ----------------------------------------------------------------------------
 *  CÓMO SE PONE EN MARCHA (el día que TI autorice)
 *
 *   1. En el sistema: Monitoreo → Agentes → Nuevo. Copia el token.
 *   2. En una máquina de planta con Node.js instalado:
 *
 *        set SGIT_URL=https://TU-BACKEND.up.railway.app
 *        set SGIT_AGENT_TOKEN=<el token que copiaste>
 *        node agente-planta.js
 *
 *   3. Para que arranque solo: Programador de tareas de Windows, al inicio.
 *
 *  PRUEBA EN SECO (no manda nada, sólo enseña lo que haría):
 *        node agente-planta.js --simular
 * ----------------------------------------------------------------------------
 */

const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const { URL } = require('url');

const CONFIG = {
  url: process.env.SGIT_URL || '',
  token: process.env.SGIT_AGENT_TOKEN || '',
  // El intervalo lo manda el SERVIDOR: así se cambia desde el sistema y no
  // hay que entrar a la máquina de planta a tocar nada.
  intervaloSeg: 120,
  // Cuántos pings a la vez. En una red industrial, lanzar 500 pings de golpe
  // es indistinguible de un escaneo hostil y puede disparar alarmas de red.
  enParalelo: 20,
  timeoutMs: 2000,
};

const SIMULAR = process.argv.includes('--simular');
const esWindows = process.platform === 'win32';

function log(msg) {
  console.log(`[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${msg}`);
}

/** Ping con la herramienta del sistema. Sin dependencias, sin permisos raros. */
function ping(ip) {
  return new Promise((resolve) => {
    const args = esWindows
      ? ['-n', '1', '-w', String(CONFIG.timeoutMs), ip]
      : ['-c', '1', '-W', String(Math.ceil(CONFIG.timeoutMs / 1000)), ip];
    const inicio = Date.now();
    execFile('ping', args, { timeout: CONFIG.timeoutMs + 1000 }, (err, stdout) => {
      if (err) return resolve({ responde: false, latencyMs: null });
      // Se lee la latencia que informa el propio ping; si no se puede leer,
      // se usa el tiempo medido, que incluye el arranque del proceso y por
      // eso es peor dato. Mejor el del ping cuando esté.
      const m = /(?:tiempo|time)[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i.exec(stdout || '');
      const lat = m ? Math.round(parseFloat(m[1].replace(',', '.'))) : Date.now() - inicio;
      resolve({ responde: true, latencyMs: lat });
    });
  });
}

/** Petición al servidor. Acepta http para pruebas locales. */
function pedir(ruta, metodo, cuerpo) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(ruta, CONFIG.url);
    } catch {
      return reject(new Error(`SGIT_URL no es una dirección válida: "${CONFIG.url}"`));
    }
    const lib = u.protocol === 'http:' ? http : https;
    const datos = cuerpo ? JSON.stringify(cuerpo) : null;
    const req = lib.request(
      u,
      {
        method: metodo,
        headers: {
          'x-agent-token': CONFIG.token,
          'Content-Type': 'application/json',
          ...(datos ? { 'Content-Length': Buffer.byteLength(datos) } : {}),
        },
        timeout: 30000,
      },
      (res) => {
        let txt = '';
        res.on('data', (d) => (txt += d));
        res.on('end', () => {
          if (res.statusCode === 401) {
            return reject(new Error('Token rechazado. Revisa SGIT_AGENT_TOKEN, o si el agente sigue activo en el sistema.'));
          }
          if ((res.statusCode || 0) >= 400) {
            return reject(new Error(`El servidor respondió ${res.statusCode}: ${txt.slice(0, 200)}`));
          }
          try { resolve(JSON.parse(txt)); } catch { reject(new Error('El servidor devolvió algo que no es JSON.')); }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('El servidor no respondió en 30 segundos.')));
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

/** Lanza los pings de N en N. */
async function sondearTodos(equipos) {
  const salida = [];
  for (let i = 0; i < equipos.length; i += CONFIG.enParalelo) {
    const tanda = equipos.slice(i, i + CONFIG.enParalelo);
    const res = await Promise.all(tanda.map((e) => ping(e.ipAddress)));
    tanda.forEach((e, k) => salida.push({ assetId: e.id, ...res[k] }));
  }
  return salida;
}

async function unaVuelta() {
  const lista = await pedir('/api/v1/monitoreo/agente/lista', 'GET');
  const equipos = (lista.equipos || []).filter((e) => e.ipAddress);
  if (lista.intervaloSeg) CONFIG.intervaloSeg = lista.intervaloSeg;

  if (equipos.length === 0) {
    log('El servidor no tiene equipos con IP registrada. Nada que comprobar.');
    return;
  }

  log(`Comprobando ${equipos.length} equipo(s)…`);
  const resultados = await sondearTodos(equipos);
  const caidos = resultados.filter((r) => !r.responde).length;

  if (SIMULAR) {
    log(`SIMULACIÓN — no se envía nada. Responden ${resultados.length - caidos}, no responden ${caidos}.`);
    resultados.filter((r) => !r.responde).slice(0, 10).forEach((r) => {
      const e = equipos.find((x) => x.id === r.assetId);
      log(`   no responde: ${e?.assetCode} (${e?.ipAddress})`);
    });
    return;
  }

  const r = await pedir('/api/v1/monitoreo/agente/reporte', 'POST', { equipos: resultados });
  log(`Enviado: ${r.guardados} guardado(s), ${caidos} sin responder.`);
  if (r.desconocidos?.length) {
    log(`   Aviso: ${r.desconocidos.length} equipo(s) de la lista ya no existen en el sistema.`);
  }
}

async function principal() {
  if (!CONFIG.url || !CONFIG.token) {
    console.error('\nFaltan datos de configuración.\n');
    console.error('  set SGIT_URL=https://tu-backend.up.railway.app');
    console.error('  set SGIT_AGENT_TOKEN=<token del agente>\n');
    console.error('El token se saca del sistema: Monitoreo > Agentes > Nuevo.\n');
    process.exit(1);
  }
  log(`Agente en marcha contra ${CONFIG.url}${SIMULAR ? ' (SIMULACIÓN)' : ''}`);

  // Bucle con espera creciente ante fallos. Si el servidor está caído, no
  // tiene sentido machacarlo cada dos minutos: se espera más cada vez, hasta
  // media hora. Y en cuanto vuelve, se recupera el ritmo normal.
  let fallosSeguidos = 0;
  for (;;) {
    try {
      await unaVuelta();
      fallosSeguidos = 0;
    } catch (e) {
      fallosSeguidos++;
      log(`ERROR: ${e.message}`);
      if (fallosSeguidos === 1) log('   Se reintenta. Si persiste, revisa la conexión de salida a internet.');
    }
    const espera = fallosSeguidos
      ? Math.min(CONFIG.intervaloSeg * Math.pow(2, fallosSeguidos), 1800)
      : CONFIG.intervaloSeg;
    if (SIMULAR) return;   // en simulación se hace una vuelta y se sale
    await new Promise((r) => setTimeout(r, espera * 1000));
  }
}

principal().catch((e) => {
  console.error('Error irrecuperable:', e.message);
  process.exit(1);
});
