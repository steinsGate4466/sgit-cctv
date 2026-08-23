import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import {
  CONEXIONES_MAXIMAS,
  ESPERA_DE_CONEXION_MS,
  ESPERA_DE_CONSULTA_MS,
  describeConexion,
  opcionesDeCifrado,
  urlDeLaBase,
} from './conexion';

/**
 * LA CONEXIÓN A LA BASE — Prisma 7 (bloque 52).
 *
 * Hasta Prisma 6 esto eran cuatro líneas: heredar de `PrismaClient` y
 * conectar. Por debajo, un motor escrito en Rust abría las conexiones y
 * decidía cifrado y tiempos de espera por su cuenta.
 *
 * Prisma 7 tiró ese motor —de ahí que la imagen adelgace y el contenedor
 * arranque antes— y ahora esas decisiones son nuestras. Viven todas en
 * `conexion.ts`, con su porqué, y las comparten los tres caminos que llegan a
 * la base: la aplicación, la semilla y la demo.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private static readonly log = new Logger('BaseDeDatos');

  constructor() {
    const url = urlDeLaBase();

    super({
      adapter: new PrismaPg({
        connectionString: url,
        ssl: opcionesDeCifrado(url),
        connectionTimeoutMillis: ESPERA_DE_CONEXION_MS,
        query_timeout: ESPERA_DE_CONSULTA_MS,
        max: CONEXIONES_MAXIMAS,
      }),
    });

    /* Se registra a QUÉ base se conecta y CÓMO. Sin esto, un despliegue
       apuntando por error a la base equivocada se ve exactamente igual que uno
       correcto — hasta que alguien nota que faltan datos. Nunca lleva usuario
       ni contraseña: este registro lo lee cualquiera con acceso a Railway. */
    PrismaService.log.log(`Conectando a ${describeConexion(url)}`);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
