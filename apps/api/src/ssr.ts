import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@nestjs/common';
import type { HealthStatus } from '@web10/shared';
import type { Connect, ViteDevServer } from 'vite';

const logger = new Logger('SSR');

/** Mirrors `apps/web/src/app-data.ts`. Keep the two in sync. */
export interface AppData {
  health: HealthStatus | null;
  healthError: string | null;
}

type RenderFn = (data: AppData) => string;

interface SsrModule {
  render: RenderFn;
}

interface ResolvableUrl {
  url?: string;
  originalUrl?: string;
}

const MARKER = '<!--app-html-->';

/**
 * A real `import()`. TypeScript compiles a bare `import()` down to `require()`
 * under `module: commonjs`, and `require` cannot load a `file://` URL, so the
 * indirection keeps the native ESM loader in charge.
 */
const importModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<SsrModule>;

export function isApiPath(url: string): boolean {
  const path = url.split('?')[0];

  return path === '/api' || path.startsWith('/api/');
}

/** Injects markup, tolerating an HTML minifier that strips the marker. */
function applyHtml(template: string, content: string): string {
  if (template.includes(MARKER)) {
    return template.replace(MARKER, content);
  }

  return template.replace(/(<div id="root">)(<\/div>)/, `$1${content}$2`);
}

/** Embeds the server-resolved data so hydration starts from the same state. */
function injectData(html: string, data: AppData): string {
  const payload = JSON.stringify(data).replace(/</g, '\\u003c');

  return html.replace(
    '</body>',
    `<script>window.__WEB10_DATA__ = ${payload};</script></body>`,
  );
}

/**
 * Resolves the data the page needs. A self-request keeps the boundary honest:
 * the same endpoint the browser would call is the one the server calls.
 */
async function loadAppData(origin: string): Promise<AppData> {
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return { health: null, healthError: `API returned ${response.status}` };
    }

    return {
      health: (await response.json()) as HealthStatus,
      healthError: null,
    };
  } catch (error) {
    return {
      health: null,
      healthError: error instanceof Error ? error.message : String(error),
    };
  }
}

function requestPath(req: ResolvableUrl): string {
  return req.originalUrl ?? req.url ?? '/';
}

function hasFileExtension(path: string): boolean {
  return /\.[a-z0-9]+$/i.test(path.split('?')[0]);
}

function shouldRender(req: Connect.IncomingMessage): boolean {
  return req.method === 'GET' || req.method === 'HEAD';
}

function sendHtml(res: ServerResponse, html: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

/**
 * Development: Vite compiles `entry-server.tsx` on demand, so SSR and HMR work
 * against the same source that the browser loads.
 */
export function createDevSsr(options: {
  vite: ViteDevServer;
  webDir: string;
  origin: string;
}): Connect.NextHandleFunction {
  const templatePath = join(options.webDir, 'index.html');

  return async (req, res, next) => {
    const path = requestPath(req);

    if (!shouldRender(req) || isApiPath(path) || hasFileExtension(path)) {
      next();
      return;
    }

    try {
      const [template, module, data] = await Promise.all([
        readFile(templatePath, 'utf-8'),
        options.vite.ssrLoadModule('/src/entry-server.tsx') as Promise<SsrModule>,
        loadAppData(options.origin),
      ]);

      let html = await options.vite.transformIndexHtml(path, template);
      html = injectData(applyHtml(html, module.render(data)), data);

      sendHtml(res, html);
    } catch (error) {
      options.vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  };
}

/**
 * Production: loads the `vite build --ssr` bundle once and renders per request.
 * Returns `null` when no SSR bundle exists, so the caller can fall back to
 * client-only rendering instead of failing to boot.
 */
export async function createProdSsr(options: {
  webDir: string;
  origin: string;
}): Promise<Connect.NextHandleFunction | null> {
  const distDir = join(options.webDir, 'dist');
  const entryPath = join(distDir, 'server', 'entry-server.js');
  const templatePath = join(distDir, 'index.html');

  if (!existsSync(entryPath) || !existsSync(templatePath)) {
    logger.log(
      `No SSR bundle at ${entryPath}; falling back to client-only rendering.`,
    );
    return null;
  }

  const [template, module] = await Promise.all([
    readFile(templatePath, 'utf-8'),
    importModule(pathToFileURL(entryPath).href),
  ]);

  logger.log(`Server-rendering with ${entryPath}`);

  return async (req, res, next) => {
    const path = requestPath(req);

    if (!shouldRender(req) || isApiPath(path) || hasFileExtension(path)) {
      next();
      return;
    }

    try {
      const data = await loadAppData(options.origin);
      sendHtml(res, injectData(applyHtml(template, module.render(data)), data));
    } catch (error) {
      next(error);
    }
  };
}
