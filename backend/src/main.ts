import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { StructuredLogger } from './common/logger.service';
import {
  ContadorDePeticiones, LIMITE_GENERAL, LIMITE_PESADO,
  claveDeOrigen, esRutaPesada,
} from './common/limite-peticiones';

async function bootstrap() {
  // Registro estructurado: en producción (LOG_FORMAT=json) cada línea sale en
  // JSON y se puede filtrar por nivel o por módulo. En desarrollo no cambia nada.
  const app = await NestFactory.create(AppModule, { logger: new StructuredLogger() });

  // IP REAL del usuario para la auditoría.
  // La aplicación corre detrás de un proxy (Railway / Nginx on-premise), así que
  // `req.ip` devolvía la IP interna del proxy (ej. 10.x.x.x) y la traza no servía
  // para saber desde dónde se conectó la persona. Con 'trust proxy' Express toma
  // la IP del cliente desde la cabecera X-Forwarded-For.
  app.getHttpAdapter().getInstance().set('trust proxy', true);

  /* LÍMITE DE PETICIONES (bloque 26).
     Va ANTES que las cabeceras y que todo lo demás: si alguien está barriendo
     el servidor, cuanto menos trabajo se haga antes de cortarle, mejor.

     Se cuenta por USUARIO cuando se le conoce y por IP cuando no. En Aceros
     toda la planta sale por la misma IP pública: contar sólo por IP dejaría
     sin servicio a los demás por culpa de uno. El identificador del usuario
     se lee del token sin verificar la firma — para CONTAR no hace falta, y
     verificarla aquí duplicaría el trabajo del guard. Un token falseado sólo
     conseguiría gastarse su propio cupo. */
  const contador = new ContadorDePeticiones();
  app.use((req: any, res: any, next: any) => {
    let userId: string | undefined;
    const cab = String(req.headers?.authorization || '');
    if (cab.startsWith('Bearer ')) {
      try {
        const carga = JSON.parse(
          Buffer.from(cab.slice(7).split('.')[1] || '', 'base64').toString('utf8'),
        );
        userId = carga?.sub || carga?.userId;
      } catch { /* token ilegible: se cuenta por IP y ya */ }
    }
    const regla = esRutaPesada(req.originalUrl || req.url || '') ? LIMITE_PESADO : LIMITE_GENERAL;
    const esperar = contador.consultar(claveDeOrigen(userId, req.ip), regla);
    if (esperar !== null) {
      res.setHeader('Retry-After', String(esperar));
      return res.status(429).json({
        statusCode: 429,
        message:
          'Demasiadas peticiones seguidas. Espera ' + esperar + ' segundos. ' +
          'Si esto te pasa usando la aplicación con normalidad, avisa: el límite está mal puesto.',
      });
    }
    return next();
  });

  // Cabeceras de seguridad (equivalente a lo esencial de helmet, sin dependencias):
  // evitan que el navegador adivine tipos, que la app se embeba en un iframe ajeno
  // (clickjacking) y que se filtre la URL interna al navegar a sitios externos.
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-XSS-Protection', '0'); // recomendado: desactivar el filtro heredado
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    /* CSP (bloque 12.4) — limita QUE puede cargar el navegador.
       Es la ultima red contra un XSS: aunque alguien lograra inyectar un
       <script src="http://sitio-ajeno">, el navegador se negaria a bajarlo.

       'unsafe-inline' en estilos esta a proposito: el frontend usa `style={}`
       en varios sitios y quitarlo romperia pantallas hoy. En scripts NO se
       permite, que es donde de verdad importa.

       connect-src '*' porque la API y el frontend viven en dominios distintos
       en Railway y la lista blanca dependeria del despliegue. Se afina cuando
       haya dominio propio (va con el bloque de Cloudflare). */
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src *",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  });

  /* `health` VA FUERA DEL PREFIJO. Bloque 44.
     -------------------------------------------------------------------------
     Estaba dentro, así que la ruta real era `/api/v1/health`. Y el HEALTHCHECK
     del Dockerfile llama a `http://127.0.0.1:3000/health`, que devolvía 404:
     el contenedor se marcaba como NO SANO en cada arranque y nadie lo miraba.

     Es la clase de fallo que este proyecto persigue: no rompe nada visible
     —la aplicación funciona— pero deja inservible justo la señal que sirve
     para saber si funciona.

     Un endpoint de salud vive en la raíz por convención, y es lo que esperan
     el orquestador, el balanceador y cualquier vigilancia externa que se
     enganche mañana. Los que apunten a `/api/v1/health` siguen funcionando: se
     excluye la ruta del prefijo, no se mueve. */
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // Traduce errores técnicos a mensajes claros (no más "Internal server error").
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---------------------------------------------------------------- CORS
  //  ANTES: si CORS_ORIGIN no estaba definida se llamaba a enableCors() sin
  //  argumentos, que permite CUALQUIER origen. Ese era el valor por DEFECTO, y
  //  en producción significa que cualquier web que visite un usuario con la
  //  sesión abierta puede llamar a esta API con su token.
  //
  //  AHORA falla en cerrado: en producción, sin lista blanca, el servidor NO
  //  arranca. Un servidor que no levanta se arregla en dos minutos; uno que
  //  levanta abierto no se nota nunca.
  const corsEnv = process.env.CORS_ORIGIN;
  const enProduccion = process.env.NODE_ENV === 'production';

  if (corsEnv && corsEnv.trim()) {
    const origins = corsEnv.split(',').map((o) => o.trim()).filter(Boolean);
    // `allowedHeaders` explícito: por defecto CORS refleja lo que pida el
    // navegador, y funciona — hasta el día que alguien lo endurece y la
    // cabecera de aparato deja de llegar sin que nadie sepa por qué.
    app.enableCors({
      origin: origins,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Dispositivo'],
    });
  } else if (enProduccion) {
    // eslint-disable-next-line no-console
    console.error(
      '\n[ARRANQUE ABORTADO] Falta la variable CORS_ORIGIN.\n' +
      'En produccion hay que declarar desde que direcciones se acepta la API.\n' +
      'Railway -> servicio backend -> Variables:\n' +
      '  CORS_ORIGIN = https://tu-frontend.up.railway.app\n' +
      'Se pueden poner varias separadas por coma.\n',
    );
    process.exit(1);
  } else {
    // Solo en desarrollo local: cualquier origen, para no estorbar.
    app.enableCors();
  }

  // Documentación OpenAPI — contrato base para futura integración SAP/Zabbix
  const config = new DocumentBuilder()
    .setTitle('SGIT-CCTV API')
    .setDescription('Gestión de Infraestructura y Tecnología — Aceros Arequipa, Planta Pisco')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  //  La documentación enseña TODAS las rutas, campos y formatos. No es una
  //  brecha, pero es un plano gratis del sistema para cualquiera que pase.
  //  Se publica solo fuera de producción, o si se activa a propósito con
  //  SWAGGER_PUBLIC=true (útil el día que haya que integrar SAP o Zabbix).
  const docsVisibles = !enProduccion || process.env.SWAGGER_PUBLIC === 'true';
  if (docsVisibles) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `SGIT-CCTV API escuchando en :${port}` +
    (docsVisibles ? ' (docs en /docs)' : ' (docs cerrados en produccion)'),
  );
}
bootstrap();
