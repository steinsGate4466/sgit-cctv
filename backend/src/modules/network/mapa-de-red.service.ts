import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolverContextoDePlanta } from '../../common/plant-context';
import { computeEffectiveStatuses } from '../../common/asset-status';
import { alcanza, ambitoDelUsuario } from '../../common/ambito-usuario';
import {
  segmentoDe, fronteraDe, revisarSegmentos, resumirSegmentos,
  NOMBRE_SEGMENTO, Segmento, SubredRegistrada, EquipoParaRevision,
} from './segmentos';

/**
 * MAPA DE RED — la vista sintetizada, bloque 48.
 *
 * =============================================================================
 *  POR QUÉ HAY DOS MÓDULOS Y NO UNO
 * =============================================================================
 *  «Activos» REGISTRA: se entra equipo por equipo, se rellena la ficha, se
 *  guarda. Es el sitio donde vive el dato y donde se corrige.
 *
 *  «Mapa de red» LEE: no tiene un solo formulario. Agrupa lo que ya está
 *  registrado y contesta de un vistazo lo que hoy sólo sabe quien cableó la
 *  planta: qué hay dentro de este tablero, en qué red está, y qué cámaras
 *  cuelgan de ahí.
 *
 *  Podrían ser la misma pantalla con pestañas, y sería peor: la pantalla de
 *  registro necesita ser exhaustiva y la de lectura necesita ser corta. Meter
 *  las dos intenciones en un sitio produce una pantalla que no sirve para
 *  ninguna de las dos cosas.
 *
 * =============================================================================
 *  LA UNIDAD DE AGRUPACIÓN ES EL SITIO FÍSICO, NO EL SWITCH
 * =============================================================================
 *  Se agrupa por GABINETE o TABLERO, no por equipo, porque es la caja que el
 *  técnico abre. Y la distinción entre las dos importa de verdad:
 *
 *    GABINETE -> rack de comunicaciones. Se abre y se trabaja.
 *    TABLERO  -> tablero ELÉCTRICO, con su supresor de pico colgando directo
 *                de los 220 V. Abrirlo exige bloqueo eléctrico (LOTO).
 *
 *  Por eso el tablero se marca en rojo en la cabecera del grupo: quien va a
 *  abrirlo tiene que saberlo antes de subir, no al llegar.
 */
@Injectable()
export class MapaDeRedService {
  constructor(private readonly prisma: PrismaService) {}

  async mapa(userId?: string | null, tren?: string | null) {
    const [activos, subredes, puertos, camaras] = await Promise.all([
      this.prisma.asset.findMany({
        where: { deletedAt: null, status: { notIn: ['BAJA', 'STOCK'] } },
        select: {
          id: true, assetCode: true, type: true, status: true, brand: true,
          model: true, ipAddress: true, referencePlace: true, locationId: true,
          cabinetId: true, tableroId: true,
          cabinet: { select: { id: true, code: true, name: true } },
          tableroMontaje: { select: { id: true, codigo: true, nombre: true, tipo: true } },
          switchDev: {
            select: { portCount: true, poePorts: true, poeBudgetW: true,
              mgmtIp: true, vendor: true, switchRole: true },
          },
          nvr: { select: { nicPrimary: true, nicSecondary: true, channels: true } },
        },
      }),
      this.prisma.subred.findMany({
        select: { cidr: true, nombre: true, proposito: true, vlan: true },
      }),
      this.prisma.switchPort.findMany({
        where: { connectedAssetId: { not: null } },
        select: { switchId: true, connectedAssetId: true, portNumber: true, poe: true },
      }),
      this.prisma.assetCamera.findMany({
        select: { assetId: true, nvrId: true, ipAddress: true },
      }),
    ]);

    const ctx = await resolverContextoDePlanta(this.prisma, activos as any);
    const estados = await computeEffectiveStatuses(this.prisma, activos as any);
    const ambito = await ambitoDelUsuario(this.prisma, userId);
    const filtro = tren ? tren.toUpperCase() : null;

    const subs: SubredRegistrada[] = subredes.map((s) => ({
      cidr: s.cidr, nombre: s.nombre, proposito: String(s.proposito), vlan: s.vlan,
    }));

    /* La IP buena de una cámara está en su extensión, no en el activo. Se
       prefiere la de la extensión y se cae al campo general sólo si falta:
       es el mismo orden de fiabilidad que usa el mapa de topología. */
    const ipDeCamara = new Map(camaras.map((c) => [c.assetId, c.ipAddress]));
    const ipDe = (a: any): string | null =>
      (a.type === 'CAMERA' ? ipDeCamara.get(a.id) : null)
      || a.ipAddress || a.switchDev?.mgmtIp || a.nvr?.nicPrimary || null;

    // Qué cuelga de cada switch, por puerto.
    const colgadoDe = new Map<string, { id: string; puerto: number; poe: boolean }[]>();
    for (const p of puertos) {
      if (!p.connectedAssetId) continue;
      const l = colgadoDe.get(p.switchId) ?? [];
      l.push({ id: p.connectedAssetId, puerto: p.portNumber, poe: p.poe });
      colgadoDe.set(p.switchId, l);
    }
    const porId = new Map(activos.map((a) => [a.id, a]));

    const enriquecido = (a: any) => {
      const ip = ipDe(a);
      const { segmento, subred } = segmentoDe(ip, subs);
      return {
        id: a.id,
        codigo: a.assetCode,
        tipo: a.type as string,
        estado: (estados[a.id] ?? a.status) as string,
        marca: [a.brand, a.model].filter(Boolean).join(' ') || null,
        lugar: a.referencePlace,
        tren: ctx[a.id]?.trenCode ?? null,
        ip,
        segmento,
        segmentoNombre: NOMBRE_SEGMENTO[segmento as Segmento],
        subred: subred?.nombre ?? null,
      };
    };

    /* --------------------------------------------------------------------
       AGRUPACIÓN POR CAJA FÍSICA.
       Los equipos sin gabinete ni tablero van a un grupo «en campo», que no
       es un cajón de sastre: es información. Un switch a la intemperie sin
       caja declarada es exactamente lo que hay que ir a mirar.
       -------------------------------------------------------------------- */
    type Grupo = {
      id: string; codigo: string; nombre: string;
      clase: 'GABINETE' | 'TABLERO' | 'CAMPO';
      tipoTablero: string | null;
      /** Sólo los tableros: abrirlos exige bloqueo eléctrico. */
      exigeBloqueo: boolean;
      tren: string | null;
      equipos: any[];
    };
    const grupos = new Map<string, Grupo>();

    for (const a of activos) {
      let clave: string; let g: Omit<Grupo, 'equipos'>;
      if (a.tableroMontaje) {
        clave = 'T:' + a.tableroMontaje.id;
        g = { id: a.tableroMontaje.id, codigo: a.tableroMontaje.codigo,
              nombre: a.tableroMontaje.nombre, clase: 'TABLERO',
              tipoTablero: String(a.tableroMontaje.tipo), exigeBloqueo: true,
              tren: ctx[a.id]?.trenCode ?? null };
      } else if (a.cabinet) {
        clave = 'G:' + a.cabinet.id;
        g = { id: a.cabinet.id, codigo: a.cabinet.code, nombre: a.cabinet.name,
              clase: 'GABINETE', tipoTablero: null, exigeBloqueo: false,
              tren: ctx[a.id]?.trenCode ?? null };
      } else {
        // Sólo equipos de red sueltos: una cámara en un poste no es un «grupo».
        if (!['SWITCH', 'NVR', 'ROUTER', 'FIREWALL', 'SERVER'].includes(a.type)) continue;
        clave = 'C:' + (ctx[a.id]?.trenCode ?? 'SIN-TREN');
        g = { id: clave, codigo: 'En campo', nombre: 'Equipos sin caja declarada',
              clase: 'CAMPO', tipoTablero: null, exigeBloqueo: false,
              tren: ctx[a.id]?.trenCode ?? null };
      }
      if (!grupos.has(clave)) grupos.set(clave, { ...g, equipos: [] });
      grupos.get(clave)!.equipos.push(a);
    }

    // --------------------------------------------------------- salida
    const salida = [...grupos.values()].map((g) => {
      const equipos = g.equipos.map((a) => {
        const base = enriquecido(a);
        if (a.type !== 'SWITCH' && a.type !== 'NVR') return base;

        const hijos = (colgadoDe.get(a.id) ?? [])
          .map((c) => ({ ...c, act: porId.get(c.id) }))
          .filter((c) => c.act)
          .map((c) => ({ ...enriquecido(c.act), puerto: c.puerto, poe: c.poe }))
          .sort((x, y) => x.puerto - y.puerto);

        const camarasColgadas = hijos.filter((h) => h.tipo === 'CAMERA');
        const puertosPoe = a.switchDev?.poePorts ?? null;
        const ocupadosPoe = hijos.filter((h) => h.poe).length;

        return {
          ...base,
          esNodo: true,
          vendor: a.switchDev?.vendor ?? null,
          rol: a.switchDev?.switchRole ?? null,
          puertos: a.switchDev?.portCount ?? null,
          puertosPoe,
          ocupadosPoe,
          /* Se avisa al 90 %, no al 100 %: enterarse de que no hay puertos
             cuando ya estás arriba con la cámara nueva en la mano no sirve. */
          poeAlLimite: puertosPoe != null && ocupadosPoe >= puertosPoe * 0.9,
          frontera: a.type === 'NVR'
            ? fronteraDe({ id: a.id, codigo: a.assetCode, tipo: a.type,
                ip: a.ipAddress, nicPrimary: a.nvr?.nicPrimary,
                nicSecondary: a.nvr?.nicSecondary }, subs)
            : null,
          camaras: camarasColgadas,
          otros: hijos.filter((h) => h.tipo !== 'CAMERA'),
        };
      });

      const camaras = equipos.reduce((n, e: any) => n + (e.camaras?.length ?? 0), 0);
      return {
        ...g,
        equipos,
        totalEquipos: equipos.length,
        totalCamaras: camaras,
        /* Un grupo «duele» si algo suyo no está operativo. Es lo que decide
           que salga arriba y abierto en la pantalla. */
        conProblema: equipos.some((e: any) => e.estado !== 'OPERATIVO'),
      };
    });

    /* El ámbito recorta DESPUÉS de calcular, igual que en el resto del
       sistema: un grupo se ve si el usuario alcanza su tren o el de alguno de
       sus equipos. El switch del núcleo no es de ningún tren y es justo el que
       explica por qué te quedaste sin ver. */
    const visible = (g: any) => {
      const trenes = [g.tren, ...g.equipos.map((e: any) => e.tren)];
      if (!trenes.some((t) => alcanza(ambito, t))) return false;
      if (filtro && !trenes.some((t) => t === filtro)) return false;
      return true;
    };

    const hallazgos = revisarSegmentos(
      activos
        .filter((a) => ['CAMERA', 'SWITCH', 'NVR', 'ROUTER', 'FIREWALL'].includes(a.type))
        .map((a): EquipoParaRevision => ({
          id: a.id, codigo: a.assetCode, tipo: a.type as string, ip: ipDe(a),
          marca: [a.brand, a.switchDev?.vendor].filter(Boolean).join(' ') || null,
          enTablero: !!a.tableroId,
          nicPrimary: a.nvr?.nicPrimary, nicSecondary: a.nvr?.nicSecondary,
        })),
      subs,
    );

    const grupos_ = salida.filter(visible).sort((a, b) => {
      if (a.conProblema !== b.conProblema) return a.conProblema ? -1 : 1;
      if (b.totalCamaras !== a.totalCamaras) return b.totalCamaras - a.totalCamaras;
      return a.codigo.localeCompare(b.codigo, 'es');
    });

    return {
      grupos: grupos_,
      redes: subs.map((s) => ({
        cidr: s.cidr, nombre: s.nombre,
        segmento: segmentoDe(s.cidr.split('/')[0], subs).segmento,
        vlan: s.vlan ?? null,
      })),
      hallazgos: hallazgos.filter((h) => {
        if (!h.equipoId) return true;
        const a = porId.get(h.equipoId);
        return a ? alcanza(ambito, ctx[a.id]?.trenCode ?? null) : true;
      }),
      titular: resumirSegmentos(hallazgos),
      motivoAmbito: ambito.motivo,
      generado: new Date().toISOString(),
    };
  }
}
