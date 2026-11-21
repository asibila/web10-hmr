import {
  EMPTY_APP_DATA,
  parseAppRoute,
  type AppData,
} from '@web10/shared';

/**
 * Data the server resolves before rendering, so the first paint already has it.
 * The shape lives in `@web10/shared` so the API's SSR middleware and this app
 * cannot drift apart.
 */
export type { AppData };

export const APP_DATA_GLOBAL = '__WEB10_DATA__';

export { EMPTY_APP_DATA };

/**
 * Reads the payload the Nest SSR middleware injected into the HTML. Returns the
 * empty payload when the page was served without SSR, in which case the app
 * fetches its data on the client as before. The URL still decides the route, so
 * a client-only build opens a pasted /asset/:id link correctly.
 */
export function readAppData(): AppData {
  const injected = (globalThis as unknown as Record<string, unknown>)[
    APP_DATA_GLOBAL
  ];

  if (injected && typeof injected === 'object') {
    return injected as AppData;
  }

  if (typeof window !== 'undefined') {
    return { ...EMPTY_APP_DATA, route: parseAppRoute(window.location.pathname) };
  }

  return EMPTY_APP_DATA;
}
