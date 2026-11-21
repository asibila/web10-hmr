import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from './App';
import type { AppData } from './app-data';

/**
 * Server entry. Loaded by the Nest SSR middleware — via `vite.ssrLoadModule`
 * in development and from the `vite build --ssr` bundle in production.
 *
 * The middleware resolves the route and page data first; the app renders the
 * same tree the browser will hydrate.
 */
export function render(initialData: AppData): string {
  return renderToString(
    <StrictMode>
      <App initialData={initialData} />
    </StrictMode>,
  );
}
