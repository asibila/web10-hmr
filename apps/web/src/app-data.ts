import type { HealthStatus } from '@web10/shared';

/**
 * Data the server resolves before rendering, so the first paint already has it.
 * Extend this interface as pages start needing real per-route data.
 */
export interface AppData {
  health: HealthStatus | null;
  healthError: string | null;
}

export const APP_DATA_GLOBAL = '__WEB10_DATA__';

export const EMPTY_APP_DATA: AppData = { health: null, healthError: null };

/**
 * Reads the payload the Nest SSR middleware injected into the HTML. Returns the
 * empty payload when the page was served without SSR, in which case the app
 * fetches its data on the client as before.
 */
export function readAppData(): AppData {
  const injected = (globalThis as unknown as Record<string, unknown>)[
    APP_DATA_GLOBAL
  ];

  if (injected && typeof injected === 'object') {
    return injected as AppData;
  }

  return EMPTY_APP_DATA;
}
