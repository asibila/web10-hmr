/**
 * The Web10 catalogue contract, shared by the API and every client.
 *
 * Keep this module free of runtime dependencies. It is compiled to CommonJS for
 * the NestJS API, imported as TypeScript source by the Vite web app, and can be
 * dropped into the Chrome extension once it gets a bundler.
 */

export const CATEGORIES = [
  'classifieds',
  'jobs',
  'stock_media',
  'rentals',
  'auctions',
  'services',
  'resumes',
  'tickets',
  'real_estate',
  'events',
  'datasets',
  'other',
] as const;

export const OFFER_TYPES = [
  'for_sale',
  'for_rent',
  'wanted',
  'hiring',
  'service',
  'auction',
  'license',
  'free',
  'other',
] as const;

export const STATES = [
  'ACTIVE',
  'EXPIRED',
  'SOLD',
  'RENTED',
  'CLOSED',
  'UNKNOWN',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type OfferType = (typeof OFFER_TYPES)[number];
export type EntityState = (typeof STATES)[number];

/** What a client sends to `POST /api/classify`. */
export interface ClassifyPageInput {
  url: string;
  title?: string;
  content: string;
  html?: string;
  jsonLd?: unknown[];
  metadata?: Record<string, unknown>;
  capturedAt?: string;
}

/** One normalized catalogue entry. Unknown fields are `null`, never invented. */
export interface EntityClassification {
  category: string;
  subcategory: string;
  title: string | null;
  description_short: string | null;
  description_full: string | null;
  external_id: string | null;
  sku: string | null;
  object_code: string | null;
  listing_type: string | null;
  offer_type: string;
  state: string;
  created_at: string | null;
  expires_at: string | null;
  view_count: number | null;
}

export interface ClassificationResult {
  entity: EntityClassification;
}

export interface OpenCodeHealth {
  ok: boolean;
  url: string;
  version?: string;
  error?: string;
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  opencode: OpenCodeHealth;
}

export const API_PREFIX = 'api';

export const API_ENDPOINTS = {
  health: `/${API_PREFIX}/health`,
  classify: `/${API_PREFIX}/classify`,
} as const;
