import { existsSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Logger } from '@nestjs/common';
import {
  parseAppRoute,
  type AppData,
  type AppRoute,
  type HealthStatus,
  type JobPosting,
  type JobSearchResult,
} from '@web10/shared';
import type { Connect, ViteDevServer } from 'vite';

const logger = new Logger('SSR');

/** The first page of the index, matching the web app's default search. */
const DEFAULT_JOBS_PATH = '/api/jobs?limit=25&sort=newest';

const HOME_TITLE = 'Web10 Jobs — search captured job postings';

type RenderFn = (data: AppData) => string;

interface SsrModule {
  render: RenderFn;
}

/** The data plus the HTTP status the page should be served with. */
interface SsrResult {
  data: AppData;
  status: number;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function pageTitle(data: AppData): string {
  if (data.route.kind === 'asset') {
    return data.job
      ? `${data.job.title} at ${data.job.company ?? data.job.source} — Web10 Jobs`
      : 'Job not found — Web10 Jobs';
  }

  return HOME_TITLE;
}

function pageDescription(data: AppData): string {
  const job = data.job;

  if (!job) {
    return data.route.kind === 'asset'
      ? 'This job posting is not in the Web10 index.'
      : 'A private, searchable index of job postings captured from around the web.';
  }

  const body = job.description?.replace(/\s+/g, ' ').trim();

  if (body) {
    return truncate(body, 160);
  }

  const summary = [job.title, job.company, job.location]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return truncate(`${summary} — captured from ${job.source}.`, 160);
}

/**
 * Asset pages are linkable, so give each one its own title and description
 * instead of the home page's. Search engines and link previews see this.
 */
function applyHead(html: string, data: AppData): string {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(pageTitle(data))}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escapeHtml(pageDescription(data))}" />`,
    );
}

class ApiResponseError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`API returned ${status} for ${url}`);
    this.name = 'ApiResponseError';
    this.status = status;
  }
}

/**
 * Resolves the data one page needs. A self-request keeps the boundary honest:
 * the same endpoints the browser would call are the ones the server calls.
 */
async function loadAppData(
  origin: string,
  route: AppRoute,
): Promise<SsrResult> {
  if (route.kind === 'asset') {
    const [healthResult, jobResult] = await Promise.allSettled([
      fetchJson<HealthStatus>(`${origin}/api/health`),
      fetchJson<JobPosting>(
        `${origin}/api/jobs/${encodeURIComponent(route.id)}`,
      ),
    ]);

    const missing =
      jobResult.status === 'rejected' &&
      jobResult.reason instanceof ApiResponseError &&
      (jobResult.reason.status === 404 || jobResult.reason.status === 400);

    return {
      data: {
        route,
        health: healthResult.status === 'fulfilled' ? healthResult.value : null,
        healthError:
          healthResult.status === 'rejected'
            ? describe(healthResult.reason)
            : null,
        jobs: null,
        jobsError: null,
        job: jobResult.status === 'fulfilled' ? jobResult.value : null,
        jobError: missing
          ? 'This job is not in the index. It may have been removed.'
          : jobResult.status === 'rejected'
            ? describe(jobResult.reason)
            : null,
      },
      status: missing ? 404 : 200,
    };
  }

  const [healthResult, jobsResult] = await Promise.allSettled([
    fetchJson<HealthStatus>(`${origin}/api/health`),
    fetchJson<JobSearchResult>(`${origin}${DEFAULT_JOBS_PATH}`),
  ]);

  return {
    data: {
      route,
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      healthError:
        healthResult.status === 'rejected' ? describe(healthResult.reason) : null,
      jobs: jobsResult.status === 'fulfilled' ? jobsResult.value : null,
      jobsError:
        jobsResult.status === 'rejected' ? describe(jobsResult.reason) : null,
      job: null,
      jobError: null,
    },
    status: 200,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

  if (!response.ok) {
    throw new ApiResponseError(response.status, url);
  }

  return (await response.json()) as T;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function sendHtml(
  res: ServerResponse,
  html: string,
  status = 200,
): void {
  res.statusCode = status;
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
      const route = parseAppRoute(path);
      const [template, module, result] = await Promise.all([
        readFile(templatePath, 'utf-8'),
        options.vite.ssrLoadModule('/src/entry-server.tsx') as Promise<SsrModule>,
        loadAppData(options.origin, route),
      ]);

      let html = await options.vite.transformIndexHtml(path, template);
      html = applyHead(html, result.data);
      html = injectData(applyHtml(html, module.render(result.data)), result.data);

      sendHtml(res, html, result.status);
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
      const route = parseAppRoute(path);
      const result = await loadAppData(options.origin, route);
      const html = applyHead(template, result.data);

      sendHtml(
        res,
        injectData(applyHtml(html, module.render(result.data)), result.data),
        result.status,
      );
    } catch (error) {
      next(error);
    }
  };
}
