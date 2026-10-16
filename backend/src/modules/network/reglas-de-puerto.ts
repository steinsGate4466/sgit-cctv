/* =============================================================================
   REGLAS DE UN PUERTO DE SWITCH — bloque 173
   -----------------------------------------------------------------------------
   El usuario: «en el switch no se está guardando qué puertos se ha
   seleccionado». Se guardaba —el servidor respondía 201— y la pantalla leía
   `x.número` (con tilde) donde el servidor manda `numero`: la rejilla nunca
   encontraba el puerto y lo pintaba libre. Ése era el fallo.

   Al revisar el puerto entero salieron más huecos, y son de red, no de
   pantalla. Las reglas viven aquí, puras, para poder probarlas sin base:

   · VLAN 1–4094. 802.1Q usa 12 bits: 0 y 4095 están reservados. Un «VLAN 5000»
     guardado es un dato que no existe en ningún switch del mundo.
   · PoE: si la ficha dice cuántos puertos dan corriente, no se pueden marcar
     más. Es la misma regla que el número de puerto contra la capacidad.
   · Qué se puede enchufar: un gabinete, un tablero, una pantalla o una fuente
     no van a un puerto de red. Ofrecerlos es invitar a un dato falso.
   · Qué es un ENLACE: enchufar un switch, router o firewall a un puerto es un
     tramo entre equipos de red (subida/troncal), no un equipo final. Se dice
     así en pantalla, porque cambia lo que se revisa cuando cae.
============================================================================= */
import { BadRequestException } from '@nestjs/common';

/** Tipos que NO tienen puerto de red: estructura, energía y pantallas. */
export const NO_VAN_A_UN_PUERTO = ['CABINET', 'TABLERO_ELECTRICO', 'PSU', 'PANTALLA'];

/** Equipos de red: enchufados a un puerto, ese puerto es un enlace entre equipos. */
export const EQUIPOS_DE_RED = ['SWITCH', 'ROUTER', 'FIREWALL'];

/** Equipos que suelen comer del PoE del puerto (cámara IP, antena). */
export const COMEN_POE = ['CAMERA', 'WIRELESS', 'PHONE'];

export const VLAN_MIN = 1;
export const VLAN_MAX = 4094;

/** VLAN válida o null. Lanza un mensaje que dice el rango. */
export function vlanValida(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < VLAN_MIN || n > VLAN_MAX) {
    throw new BadRequestException(
      `La VLAN tiene que ser un número entre ${VLAN_MIN} y ${VLAN_MAX} (802.1Q). «${String(v)}» no existe en ningún switch.`,
    );
  }
  return n;
}

export function puedeIrAUnPuerto(tipo: string | null | undefined): boolean {
  return !!tipo && !NO_VAN_A_UN_PUERTO.includes(tipo);
}

/** ¿Este puerto es un enlace entre equipos de red (subida / troncal)? */
export function esEnlace(tipo: string | null | undefined): boolean {
  return !!tipo && EQUIPOS_DE_RED.includes(tipo);
}

/**
 * PoE: cuántos puertos quedarían marcados si este se marca, contra los que
 * declara la ficha. `poePorts` null = no se sabe → no se frena (no se inventa
 * un límite).
 */
export function exigirPoeDisponible(opts: {
  marcarPoe: boolean;
  poeMarcadosEnOtros: number;
  poePorts: number | null | undefined;
  switchCode: string;
}) {
  const { marcarPoe, poeMarcadosEnOtros, poePorts, switchCode } = opts;
  if (!marcarPoe || poePorts == null) return;
  if (poeMarcadosEnOtros + 1 > poePorts) {
    throw new BadRequestException(
      poePorts === 0
        ? `La ficha de ${switchCode} dice que no tiene puertos PoE. Si los tiene, corrige primero la ficha.`
        : `La ficha de ${switchCode} dice ${poePorts} puertos PoE y ya hay ${poeMarcadosEnOtros} marcados. ` +
          'Si tiene más, corrige primero la ficha.',
    );
  }
}

/**
 * Aviso de un puerto ocupado, en palabras de planta. null = nada que decir.
 * No bloquea: la cámara puede comer de un inyector o de una fuente aparte.
 */
export function avisoDelPuerto(p: { poe: boolean; tipoEquipo: string | null }): string | null {
  if (!p.tipoEquipo) return null;
  if (COMEN_POE.includes(p.tipoEquipo) && !p.poe && p.tipoEquipo !== 'PHONE') {
    return 'Este puerto no da corriente: el equipo necesita inyector o fuente aparte.';
  }
  return null;
}

/** Capacidad declarable desde Conexiones: el número de puertos y los PoE. */
export function validarCapacidad(opts: {
  puertos: unknown; poe: unknown; mayorRegistrado: number;
}): { portCount: number; poePorts: number | null } {
  const portCount = Number(opts.puertos);
  if (!Number.isInteger(portCount) || portCount < 1 || portCount > 96) {
    throw new BadRequestException('Un switch tiene entre 1 y 96 puertos. Mira la etiqueta del frontal.');
  }
  if (portCount < opts.mayorRegistrado) {
    throw new BadRequestException(
      `Ya hay algo registrado en el puerto ${opts.mayorRegistrado}: el switch no puede tener ${portCount} puertos.`,
    );
  }
  let poePorts: number | null = null;
  if (opts.poe !== undefined && opts.poe !== null && opts.poe !== '') {
    poePorts = Number(opts.poe);
    if (!Number.isInteger(poePorts) || poePorts < 0 || poePorts > portCount) {
      throw new BadRequestException(`Los puertos PoE van de 0 a ${portCount}.`);
    }
  }
  return { portCount, poePorts };
}
