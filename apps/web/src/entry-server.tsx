import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import type { AppData } from './app-data';

/**
 * Server entry. Loaded by the Nest SSR middleware — via `vite.ssrLoadModule`
 * in development and from the `vite build --ssr` bundle in production.
 *
 * Add a `url` parameter here as soon as pages become route-dependent; the
 * middleware already passes the request path through.
 */
export function render(initialData: AppData): string {
  return renderToString(
    <StrictMode>
      <App initialData={initialData} />
    </StrictMode>,
  );
}
