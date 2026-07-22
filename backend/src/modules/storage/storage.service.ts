import { Injectable, OnModuleInit } from '@nestjs/common';
// Se carga con require para no depender de @types en el build.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Minio = require('minio');

/**
 * StorageService — almacenamiento de objetos en MinIO (evidencias fotográficas de OM).
 * El bucket se asegura de forma perezosa (antes de cada operación), no solo al arrancar,
 * para tolerar que MinIO todavía no esté listo en el primer boot.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private client: any;
  private bucket = process.env.MINIO_BUCKET || 'sgit-evidences';
  private ready = false;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'minio',
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: false,
      accessKey: process.env.MINIO_ACCESS_KEY || 'sgit_minio',
      secretKey: process.env.MINIO_SECRET_KEY || 'sgit_minio_pass',
    });
  }

  async onModuleInit() {
    // Intento temprano (no crítico): si falla, se reintenta al primer uso.
    await this.ensureBucket().catch(() => undefined);
  }

  private async ensureBucket(): Promise<void> {
    if (this.ready) return;
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) await this.client.makeBucket(this.bucket, 'us-east-1');
    this.ready = true;
  }

  async put(objectName: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return objectName;
  }

  async getBuffer(objectName: string): Promise<Buffer> {
    await this.ensureBucket();
    const stream = await this.client.getObject(this.bucket, objectName);
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async remove(objectName: string): Promise<void> {
    await this.ensureBucket();
    await this.client.removeObject(this.bucket, objectName);
  }
}
