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
 * What the `vite build` step actually left in the web dist folder. Read once at
 * boot so the serving strategy is decided in a single place.
 */
export type WebBuild =
  | { kind: 'ssr'; templatePath: string; entryPath: string }
  | { kind: 'client'; templatePath: string }
  | { kind: 'none' };

/**
 * A missing SSR bundle is a normal state, not an error: `apps/web` builds the
 * client and the server bundle in two separate steps, and `emptyOutDir` means a
 * client-only build deletes `dist/server`. Report what is there and let the
 * caller choose a mode.
 */
export function inspectWebBuild(webDist: string): WebBuild {
  const templatePath = join(webDist, 'index.html');
  const entryPath = join(webDist, 'server', 'entry-server.js');

  if (!existsSync(templatePath)) {
    return { kind: 'none' };
  }

  return existsSync(entryPath)
    ? { kind: 'ssr', templatePath, entryPath }
    : { kind: 'client', templatePath };
}

/**
 * Production: loads the `vite build --ssr` bundle once and renders per request.
 * Paths come from `inspectWebBuild`, so this only runs when the bundle exists.
 */
export async function createProdSsr(options: {
  entryPath: string;
  templatePath: string;
  origin: string;
}): Promise<Connect.NextHandleFunction> {
  const [template, module] = await Promise.all([
    readFile(options.templatePath, 'utf-8'),
    importModule(pathToFileURL(options.entryPath).href),
  ]);

  logger.log(`Server-rendering with ${options.entryPath}`);

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
