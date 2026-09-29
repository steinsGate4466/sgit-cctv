import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';

/**
 * LA DEMOSTRACIÓN, CARGADA DESDE LA PROPIA APLICACIÓN — bloque 166.
 *
 * «No se cargó en Railway: dame para cargar el mapa y todas las pruebas.»
 * `npm run demo:plano` corre en el PC contra la base y el MinIO LOCALES: en
 * Railway el Mapa seguía vacío. Correrlo desde el PC contra Railway exige la
 * URL pública de la base Y del almacén de imágenes; si falta la segunda, el
 * plano queda sin imagen.
 *
 * Aquí se ejecutan LOS MISMOS scripts (compilados en `dist/prisma` por el
 * build) como procesos hijos del servidor: heredan su base y su almacén, así
 * que lo que cargan queda donde la aplicación lo lee. Sin duplicar lógica: si
 * mañana cambia `demo-plano.ts`, cambia lo que carga este botón.
 *
 * Todo lo que crean lleva DEMO-, los planos dicen «NO ES LA PLANTA REAL» y
 * `borrar` lo quita (sólo lo DEMO-). Nada se inventa del árbol real: si no hay
 * trenes, el script lo dice y para.
 */
const PASOS = {
  cargar: ['demo.js', 'demo-infra.js', 'demo-plano.js'],
  borrar: ['demo-borrar.js'],
} as const;
export type AccionDemo = keyof typeof PASOS;
const TOPE_MS = 4 * 60 * 1000;

/** Sin códigos de color y sin líneas de pila: la pantalla enseña lo que pasó, no el stack. */
export function limpiarSalida(texto: string, tope = 160): string[] {
  return texto
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l && !/^\s+at\s/.test(l))
    .slice(-tope);
}

@Injectable()
export class DemoEnServidorService {
  private enCurso = false;

  constructor(private readonly audit: AuditService) {}

  private ruta(archivo: string) {
    return join(process.cwd(), 'dist', 'prisma', archivo);
  }

  private correr(archivo: string): Promise<{ ok: boolean; salida: string }> {
    return new Promise((ok) => {
      execFile(process.execPath, [this.ruta(archivo)], { env: process.env, timeout: TOPE_MS, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => ok({ ok: !err, salida: `${stdout || ''}${stderr || ''}${err && !stderr ? `\n${err.message}` : ''}` }));
    });
  }

  async ejecutar(accion: AccionDemo, userId: string | null, ip?: string) {
    const pasos = PASOS[accion];
    if (!pasos) throw new BadRequestException('Acción desconocida.');
    const faltan = pasos.filter((p) => !existsSync(this.ruta(p)));
    if (faltan.length) {
      throw new BadRequestException(`Faltan los scripts compilados (${faltan.join(', ')}). Vuelve a desplegar: los genera \`npm run build\`.`);
    }
    if (this.enCurso) throw new ConflictException('Ya se está cargando o borrando la demostración. Espera a que termine.');
    this.enCurso = true;
    const lineas: string[] = [];
    let ok = true;
    try {
      for (const p of pasos) {
        const r = await this.correr(p);
        lineas.push(...limpiarSalida(r.salida));
        if (!r.ok) { ok = false; break; }
      }
    } finally {
      this.enCurso = false;
    }
    await this.audit.record({
      userId, ip, action: accion === 'cargar' ? 'DEMO_CARGAR' : 'DEMO_BORRAR', entity: 'demo', entityId: accion,
      after: { ok, lineas: lineas.length },
    });
    return { ok, salida: lineas.slice(-160) };
  }
}
