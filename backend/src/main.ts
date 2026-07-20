import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors();

  // Documentación OpenAPI — contrato base para futura integración SAP/Zabbix
  const config = new DocumentBuilder()
    .setTitle('SGIT-CCTV API')
    .setDescription('Gestión de Infraestructura y Tecnología — Aceros Arequipa, Planta Pisco')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`SGIT-CCTV API escuchando en :${port} (docs en /docs)`);
}
bootstrap();
