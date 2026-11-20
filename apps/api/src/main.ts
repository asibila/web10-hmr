import 'reflect-metadata';
import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { Connect } from 'vite';
import { AppModule } from './app.module';
import { createDevSsr, createProdSsr, isApiPath } from './ssr';

const logger = new Logger('Bootstrap');

/**
 * `--dev` (used by `npm run dev`) boots Vite in middleware mode inside this
 * process. One server on one port serves the API, the React app rendered on the
 * server, and HMR. Without the flag the `vite build` output is served instead.
 */
const DEV_SERVER = process.argv.includes('--dev');

/** Development: Vite owns assets and module requests, this app owns the HTML. */
async function attachDevServer(
  app: NestExpressApplication,
  webDir: string,
  origin: string,
  port: number,
): Promise<void> {
  const { createServer } = await import('vite');

  const vite = await createServer({
    configFile: join(webDir, 'vite.config.ts'),
    // 'custom' keeps Vite from answering navigation requests; the SSR
    // middleware below renders those so the response is real markup.
    appType: 'custom',
    server: {
      middlewareMode: true,
      // Reuse Nest's HTTP server so HMR needs no second port.
      hmr: { server: app.getHttpServer() },
    },
  });

  app.use(
    (
      req: Connect.IncomingMessage,
      res: ServerResponse,
      next: Connect.NextFunction,
    ) => {
      if (isApiPath(req.url ?? '')) {
        next();
        return;
      }

      vite.middlewares(req, res, next);
    },
  );

  app.use(createDevSsr({ vite, webDir, origin }));

  const shutdown = () => {
    void vite.close();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  logger.log(`Vite + SSR attached; HMR shares port ${port}`);
}

/** Fallback when there is a client build but no SSR bundle. */
function attachClientOnly(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  const configured = config.get<string>('WEB_DIST_DIR');
  const webDist = configured
    ? resolve(configured)
    : join(__dirname, '..', '..', 'web', 'dist');

  if (!existsSync(join(webDist, 'index.html'))) {
    logger.log(`No web build at ${webDist}; running API only.`);
    return;
  }

  app.useStaticAssets(webDist);

  // Structurally typed so this package needs no direct express dependency.
  app.use(
    (
      req: { url?: string },
      res: { sendFile: (filePath: string) => unknown },
      next: () => void,
    ) => {
      if (isApiPath(req.url ?? '')) {
        next();
        return;
      }

      res.sendFile(join(webDist, 'index.html'));
    },
  );

  logger.log(`Serving the web build from ${webDist} (client-only)`);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const allowed =
        !origin ||
        origin.startsWith('chrome-extension://') ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      callback(null, allowed);
    },
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT', '3000'));
  const origin = `http://127.0.0.1:${port}`;
  const webDir = join(__dirname, '..', '..', 'web');

  if (DEV_SERVER) {
    await attachDevServer(app, webDir, origin, port);
  } else {
    const ssr = await createProdSsr({ webDir, origin });

    if (ssr) {
      // `index: false` so `/` reaches the SSR middleware instead of the file.
      app.useStaticAssets(join(webDir, 'dist'), { index: false });
      app.use(ssr);
    } else {
      attachClientOnly(app, config);
    }
  }

  await app.listen(port, '127.0.0.1');

  console.log(`Web10 listening on http://127.0.0.1:${port}`);
}

void bootstrap();
