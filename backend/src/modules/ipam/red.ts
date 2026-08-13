/**
 * ARITMÉTICA DE REDES — sin dependencias
 * =============================================================================
 * Todo lo que hace falta para responder «¿qué IP le pongo?»: pasar una IP a
 * número, saber si cae dentro de una subred, y recorrer el rango útil.
 *
 * ESTÁ ESCRITO A MANO Y NO CON UNA LIBRERÍA a propósito. Son cuarenta líneas
 * de aritmética que no cambian desde 1981, y una dependencia más en
 * `package.json` es una dependencia más que vigilar, actualizar y auditar.
 * El proyecto ya arrastra `glob@7` y `rimraf@2` por culpa de `exceljs`.
 *
 * Sólo IPv4. En planta no hay IPv6 y fingir que se soporta sería peor que
 * decirlo.
 */

/** `10.20.4.14` -> 169083918. Devuelve null si no es una IPv4 válida. */
export function aNumero(ip: string): number | null {
  const p = String(ip || '').trim().split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const t of p) {
    if (!/^\d{1,3}$/.test(t)) return null;
    const v = Number(t);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function aTexto(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export interface Rango {
  red: number;
  broadcast: number;
  mascara: number;
  /** Primera y última IP asignable a un equipo. */
  primera: number;
  ultima: number;
  /** Cuántas direcciones se pueden usar. */
  utiles: number;
}

/**
 * Descompone `10.20.4.0/24`.
 *
 * OJO CON /31 Y /32: no tienen red ni broadcast reservados. Un /31 son dos
 * direcciones útiles (enlaces punto a punto) y un /32 es una sola. Tratarlos
 * con la fórmula general daría «-2 direcciones útiles», que es absurdo y
 * rompe cualquier cálculo de ocupación.
 */
export function analizar(cidr: string): Rango | null {
  const [dir, bitsTxt] = String(cidr || '').trim().split('/');
  const base = aNumero(dir);
  const bits = Number(bitsTxt);
  if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;

  const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const red = (base & mascara) >>> 0;
  const broadcast = (red | (~mascara >>> 0)) >>> 0;

  if (bits === 32) return { red, broadcast: red, mascara, primera: red, ultima: red, utiles: 1 };
  if (bits === 31) return { red, broadcast, mascara, primera: red, ultima: broadcast, utiles: 2 };

  return {
    red, broadcast, mascara,
    primera: red + 1,
    ultima: broadcast - 1,
    utiles: broadcast - red - 1,
  };
}

export function dentroDe(ip: string, cidr: string): boolean {
  const n = aNumero(ip);
  const r = analizar(cidr);
  if (n === null || !r) return false;
  return n >= r.red && n <= r.broadcast;
}

/** ¿Está esta IP dentro del rango que reparte el DHCP? */
export function enPoolDhcp(ip: string, desde?: string | null, hasta?: string | null): boolean {
  const n = aNumero(ip);
  const a = desde ? aNumero(desde) : null;
  const b = hasta ? aNumero(hasta) : null;
  if (n === null || a === null || b === null) return false;
  return n >= Math.min(a, b) && n <= Math.max(a, b);
}
