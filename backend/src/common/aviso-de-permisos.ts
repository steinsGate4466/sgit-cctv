/* =============================================================================
   «LE CAMBIARON LOS PERMISOS» LLEGA A TODAS LAS INSTANCIAS — bloque 174
   -----------------------------------------------------------------------------
   DEUDA QUE CIERRA (bloque 82 y 100): `AccesoVigenteGuard` guarda 15 s en
   memoria si el acceso de cada persona sigue vigente. Al cortar a alguien se
   borra esa memoria… EN LA INSTANCIA QUE ATENDIÓ EL CORTE. Con dos réplicas, la
   otra seguía dejándole pasar hasta 15 segundos.

   SIN REDIS: PostgreSQL ya trae un aviso entre conexiones, LISTEN/NOTIFY.
     · Quien corta, cambia un rol o desactiva a alguien hace
         SELECT pg_notify('sgit_permisos', '<userId>' | '*')
     · Cada instancia escucha ese canal con UNA conexión propia y, al oírlo,
       borra a esa persona (o todo, con '*') de su memoria.

   Si la escucha se cae, se reintenta sola cada 10 s. Mientras tanto queda el
   techo de 15 s de la caché, que es lo que había antes: nunca peor que antes.
============================================================================= */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AccesoVigenteGuard } from './guards/acceso-vigente.guard';
import { opcionesDeCifrado, urlDeLaBase } from '../prisma/conexion';

// `require` y no `import * as`: un espacio de nombres no se puede construir (bloque 3).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require('pg');

export const CANAL_PERMISOS = 'sgit_permisos';

interface BaseParaAvisar {
  $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown>;
}

/**
 * Avisa a TODAS las instancias de que los permisos de `quien` cambiaron
 * (`'*'` = todos, p. ej. al tocar un rol). La propia instancia se limpia ya.
 */
export async function avisarCambioDePermisos(base: BaseParaAvisar | null | undefined, quien: string) {
  if (quien === '*') AccesoVigenteGuard.olvidarTodo();
  else AccesoVigenteGuard.olvidar(quien);
  if (!base) return;
  await base.$executeRaw`SELECT pg_notify(${CANAL_PERMISOS}, ${quien})`.catch(() => null);
}

/** Lo que hace una instancia al oír el aviso. Puro, para poder probarlo. */
export function alOirAviso(payload: string | undefined | null) {
  if (!payload) return;
  if (payload === '*') AccesoVigenteGuard.olvidarTodo();
  else AccesoVigenteGuard.olvidar(payload);
}

@Injectable()
export class AvisoDePermisosService implements OnModuleInit, OnModuleDestroy {
  private static readonly log = new Logger('AvisoDePermisos');
  private cliente: any = null;
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private cerrando = false;

  onModuleInit() {
    // En las pruebas no hay base: no se escucha nada.
    if (process.env.NODE_ENV === 'test' || !process.env.DATABASE_URL) return;
    void this.escuchar();
  }

  async onModuleDestroy() {
    this.cerrando = true;
    if (this.reintento) clearTimeout(this.reintento);
    await this.cliente?.end().catch(() => null);
  }

  private async escuchar() {
    try {
      const url = urlDeLaBase();
      const c = new Client({ connectionString: url, ssl: opcionesDeCifrado(url) });
      c.on('notification', (m: { channel: string; payload?: string }) => {
        if (m.channel === CANAL_PERMISOS) alOirAviso(m.payload);
      });
      c.on('error', () => this.programarReintento());
      c.on('end', () => this.programarReintento());
      await c.connect();
      await c.query(`LISTEN ${CANAL_PERMISOS}`);
      this.cliente = c;
    } catch (e: any) {
      AvisoDePermisosService.log.warn(`No se pudo escuchar los cambios de permisos (${e?.message || e}). Se reintenta.`);
      this.programarReintento();
    }
  }

  private programarReintento() {
    if (this.cerrando || this.reintento) return;
    this.cliente = null;
    this.reintento = setTimeout(() => { this.reintento = null; void this.escuchar(); }, 10_000);
  }
}
