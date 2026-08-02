import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { evaluar, siguienteEstado, textoTiempo } from './frescura';

/**
 * MONITOREO — ESTADO OBSERVADO (bloque 8).
 *
 * ============================================================
 *  LA DECISIÓN QUE HACE QUE ESTO SEA POSIBLE SIN TOCAR EL FIREWALL
 * ============================================================
 *
 * Lo natural sería que el servidor hiciera ping a las cámaras. Eso exige que
 * Railway ALCANCE la red industrial: una VPN, reglas de firewall, y una
 * conversación con TI que puede tardar meses — y con razón, porque abrir la
 * red de planta a internet es exactamente lo que no se debe hacer.
 *
 * Aquí se hace al revés: **el agente vive DENTRO de planta y EMPUJA**.
 *
 *      [ agente en planta ]  --- HTTPS 443 saliente --->  [ Railway ]
 *
 * Consecuencias, y son grandes:
 *   · No hace falta abrir NI UN PUERTO de entrada.
 *   · La red industrial no queda expuesta a internet en ningún momento.
 *   · Es tráfico de salida por 443, igual que cualquier actualización.
 *   · Si TI dice que no a la salida directa, el mismo agente vale detrás de
 *     un proxy corporativo cambiando una variable.
 *
 * Es la misma forma que el bot de Telegram, y por el mismo motivo.
 *
 * ESTADO HOY: montado y en espera. Sin agentes dados de alta no llega ni un
 * reporte, y el sistema funciona exactamente igual que ahora. El día que TI
 * autorice: se da de alta un agente, se instala el script y empieza a
 * llegar información. Cero cambios de esquema y cero despliegues.
 */
@Injectable()
export class MonitoreoService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- AGENTES

  /**
   * Da de alta un agente y devuelve su token EN CLARO UNA SOLA VEZ.
   * En la base sólo queda el hash: si alguien se lleva una copia de la base
   * no obtiene con qué reportar. Y si se pierde el token, no se recupera —
   * se genera otro, que es lo correcto.
   */
  async crearAgente(nombre: string) {
    const name = (nombre || '').trim();
    if (name.length < 3) throw new BadRequestException('Ponle un nombre al agente (mínimo 3 letras).');

    const repetido = await this.prisma.monitorAgent.findUnique({ where: { name } });
    if (repetido) throw new BadRequestException(`Ya hay un agente llamado "${name}".`);

    const token = randomBytes(32).toString('hex');
    await this.prisma.monitorAgent.create({
      data: { name, tokenHash: this.hash(token) },
    });
    return {
      name,
      token,
      aviso: 'Guarda este token ahora: no se vuelve a mostrar. Va en el archivo de configuración del agente, en planta.',
    };
  }

  async listarAgentes() {
    const agentes = await this.prisma.monitorAgent.findMany({ orderBy: { name: 'asc' } });
    const ahora = Date.now();
    return agentes.map((a) => ({
      id: a.id,
      name: a.name,
      active: a.active,
      lastIp: a.lastIp,
      lastReportAt: a.lastReportAt,
      // Un agente que no reporta es tan grave como una cámara caída: deja de
      // haber información y nadie se entera, porque no hay nada que mirar.
      silencioso: !a.lastReportAt || ahora - new Date(a.lastReportAt).getTime() > 15 * 60_000,
      desde: a.lastReportAt
        ? textoTiempo(Math.floor((ahora - new Date(a.lastReportAt).getTime()) / 60000))
        : 'nunca',
    }));
  }

  // ---------------------------------------------------------------- INGESTA

  /**
   * Recibe el lote de comprobaciones del agente.
   *
   * Va sin sesión de usuario a propósito —un agente no es una persona— pero
   * NO va abierto: se autentica con su token. Sin esto sería un buzón donde
   * cualquiera podría declarar media planta caída y provocar una salida de
   * cuadrilla a las tres de la mañana.
   */
  async recibirReporte(token: string | undefined, ip: string, lote: any) {
    const agente = await this.autenticar(token);

    const items: any[] = Array.isArray(lote?.equipos) ? lote.equipos : [];
    if (items.length === 0) throw new BadRequestException('El reporte viene vacío.');
    // Tope de lote: sin él, un agente mal configurado —o alguien con el
    // token— podría mandar un millón de filas y tumbar la base.
    if (items.length > 5000) throw new BadRequestException('Lote demasiado grande (máximo 5000).');

    const ids = items.map((i) => String(i.assetId || '')).filter(Boolean);
    const existen = new Set(
      (await this.prisma.asset.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true },
      })).map((a) => a.id),
    );

    const previas = new Map(
      (await this.prisma.assetObservation.findMany({ where: { assetId: { in: [...existen] } } }))
        .map((o) => [o.assetId, o]),
    );

    const ahora = new Date();
    const desconocidos: string[] = [];
    const escrituras: any[] = [];

    for (const it of items) {
      const id = String(it.assetId || '');
      if (!existen.has(id)) {
        // No se crea nada: el agente no da de alta activos. Se informa para
        // que alguien limpie su lista, y se sigue.
        if (id) desconocidos.push(id);
        continue;
      }
      const s = siguienteEstado(
        previas.get(id) as any,
        { responde: !!it.responde, latencyMs: typeof it.latencyMs === 'number' ? it.latencyMs : null },
        ahora,
      );
      escrituras.push(
        this.prisma.assetObservation.upsert({
          where: { assetId: id },
          create: { assetId: id, source: 'AGENTE', ...s },
          update: { source: 'AGENTE', ...s },
        }),
      );
    }

    // NO se hace `await` DENTRO del bucle.
    //
    // La primera versión de esto guardaba una a una: con 2.000 cámaras son
    // 2.000 viajes de ida y vuelta a la base. A 20 ms cada uno son 40
    // segundos por reporte, y el agente reporta cada dos minutos: los
    // reportes se irían amontonando hasta que el servidor no diera más.
    //
    // En tandas de 500 y en una transacción, Prisma las manda juntas: son
    // cuatro viajes en lugar de dos mil. Se trocea porque una transacción de
    // 5.000 sentencias sostiene bloqueos demasiado tiempo y frena al resto.
    const TANDA = 500;
    for (let i = 0; i < escrituras.length; i += TANDA) {
      await this.prisma.$transaction(escrituras.slice(i, i + TANDA));
    }
    const guardados = escrituras.length;

    await this.prisma.monitorAgent.update({
      where: { id: agente.id },
      data: { lastReportAt: ahora, lastIp: ip?.slice(0, 60) || null },
    });

    return { ok: true, guardados, desconocidos: desconocidos.slice(0, 20), recibidos: items.length };
  }

  /** Lo que el agente tiene que comprobar: IP de cada equipo vivo. */
  async listaParaSondear(token: string | undefined) {
    await this.autenticar(token);
    const activos = await this.prisma.asset.findMany({
      where: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] }, ipAddress: { not: null } },
      select: { id: true, assetCode: true, ipAddress: true, type: true },
      orderBy: { assetCode: 'asc' },
    });
    return {
      equipos: activos,
      // El agente respeta lo que le diga el servidor. Así el intervalo se
      // cambia desde aquí y no hay que entrar a la máquina de planta.
      intervaloSeg: Number(process.env.MONITOR_INTERVALO_SEG || 120),
      generado: new Date().toISOString(),
    };
  }

  // ----------------------------------------------------------------- LECTURA

  /** Estado observado de un conjunto de activos, ya interpretado. */
  async estadoDe(assetIds: string[]) {
    if (!assetIds.length) return {};
    const obs = await this.prisma.assetObservation.findMany({
      where: { assetId: { in: assetIds } },
    });
    const ahora = Date.now();
    const salida: Record<string, ReturnType<typeof evaluar>> = {};
    for (const id of assetIds) {
      salida[id] = evaluar(obs.find((o) => o.assetId === id) as any, ahora);
    }
    return salida;
  }

  /** Resumen para el tablero: cuántos responden, cuántos no, cuántos sin dato. */
  async resumen() {
    const [obs, totalActivos, agentes] = await Promise.all([
      this.prisma.assetObservation.findMany(),
      this.prisma.asset.count({ where: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] } } }),
      this.prisma.monitorAgent.count({ where: { active: true } }),
    ]);
    const ahora = Date.now();
    const cuenta = { RESPONDE: 0, CAIDO: 0, INESTABLE: 0, SIN_DATO: 0 };
    for (const o of obs) cuenta[evaluar(o as any, ahora).estado]++;
    // Los que ni siquiera tienen fila cuentan como sin dato: si no, el
    // porcentaje de "responde" saldría calculado sobre los pocos que sí se
    // comprueban y daría una tranquilidad falsa.
    cuenta.SIN_DATO += Math.max(totalActivos - obs.length, 0);

    return {
      ...cuenta,
      totalActivos,
      agentesActivos: agentes,
      // Si no hay agentes, se dice claramente en vez de enseñar ceros que
      // parecerían "todo bien".
      monitoreoActivo: agentes > 0,
      generado: new Date().toISOString(),
    };
  }

  // ----------------------------------------------------------------- PRIVADO

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async autenticar(token: string | undefined) {
    if (!token || token.length < 32) throw new UnauthorizedException('Agente no autorizado.');
    const agente = await this.prisma.monitorAgent.findFirst({
      where: { tokenHash: this.hash(token), active: true },
    });
    // El mensaje es el mismo si el token no existe, si está mal o si el
    // agente está desactivado: distinguirlos le diría a quien prueba tokens
    // cuándo ha acertado con uno que existe.
    if (!agente) throw new UnauthorizedException('Agente no autorizado.');
    return agente;
  }
}
