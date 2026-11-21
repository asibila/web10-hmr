/**
 * The Web10 jobs contract, shared by the API and every client.
 *
 * Web10 now focuses on one catalogue: job postings captured from the open web,
 * normalized into one deduplicated, searchable index. Keep this module free of
 * runtime dependencies — it is compiled to CommonJS for the NestJS API and
 * imported as TypeScript source by the Vite web app.
 */

export const WORK_MODES = ['remote', 'hybrid', 'onsite', 'unknown'] as const;

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'contract',
  'temporary',
  'internship',
  'freelance',
  'other',
] as const;

export const SENIORITY_LEVELS = [
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
  'principal',
  'director',
  'executive',
  'unknown',
] as const;

export const SALARY_PERIODS = [
  'year',
  'month',
  'week',
  'day',
  'hour',
  'unknown',
] as const;

export const JOB_STATUSES = ['active', 'expired', 'closed', 'unknown'] as const;

export const JOB_SORTS = ['newest', 'salary', 'relevance'] as const;

export type WorkMode = (typeof WORK_MODES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobSort = (typeof JOB_SORTS)[number];

/**
 * One normalized job posting. Unknown fields are `null` (or an empty array for
 * `skills`), never invented.
 */
export interface JobPosting {
  /** Server-generated UUID. */
  id: string;
  /** Hostname the posting was captured from, without `www.` (for example `linkedin.com`). */
  source: string;
  /** Canonical page URL. Also the deduplication key. */
  source_url: string;
  /** The source's own posting ID, when the page exposed one. */
  external_id: string | null;
  title: string;
  company: string | null;
  company_url: string | null;
  /** Human-readable location as shown by the source ("Berlin, Germany", "Remote"). */
  location: string | null;
  city: string | null;
  country: string | null;
  work_mode: WorkMode;
  employment_type: EmploymentType;
  seniority: SeniorityLevel;
  salary_min: number | null;
  salary_max: number | null;
  /** ISO 4217 code, uppercase, when the source stated a currency. */
  salary_currency: string | null;
  salary_period: SalaryPeriod;
  description: string | null;
  /** Short skill tags extracted from the posting, lowercased and deduplicated. */
  skills: string[];
  posted_at: string | null;
  expires_at: string | null;
  /** When Web10 captured the page. */
  captured_at: string;
  status: JobStatus;
}

/** What a client sends to `POST /api/jobs` to capture a page. */
export interface CaptureJobInput {
  url: string;
  title?: string;
  content: string;
  html?: string;
  jsonLd?: unknown[];
  metadata?: Record<string, unknown>;
  capturedAt?: string;
}

export interface CaptureJobResult {
  job: JobPosting;
  /** True when an existing posting was refreshed instead of inserted. */
  duplicate: boolean;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface JobSearchFacets {
  work_modes: FacetBucket[];
  employment_types: FacetBucket[];
  seniorities: FacetBucket[];
  locations: FacetBucket[];
  companies: FacetBucket[];
}

export interface JobSearchParams {
  /** Full-text query over title, company, location and description. */
  q?: string;
  company?: string;
  location?: string;
  workMode?: WorkMode;
  employmentType?: EmploymentType;
  seniority?: SeniorityLevel;
  /** Keep jobs whose top of range is at least this amount. */
  minSalary?: number;
  sort?: JobSort;
  /** Include expired/closed postings. Defaults to false. */
  includeInactive?: boolean;
  limit?: number;
  offset?: number;
}

export interface JobSearchResult {
  jobs: JobPosting[];
  /** Total matching rows, ignoring `limit`/`offset`. */
  total: number;
  facets: JobSearchFacets;
  took_ms: number;
}

/**
 * The routes the web app serves. Asset pages are addressable, so a posting can
 * be linked, refreshed and shared without going through the search screen.
 */
export type AppRoute = { kind: 'home' } | { kind: 'asset'; id: string };

export const JOB_ASSET_PREFIX = '/asset';

/** The stable, human-facing link for one posting. */
export function jobAssetPath(id: string): string {
  return `${JOB_ASSET_PREFIX}/${encodeURIComponent(id)}`;
}

/** Parses a request pathname into a known route; anything else is the home page. */
export function parseAppRoute(pathname: string): AppRoute {
  const path = pathname.split('?')[0];
  const match = /^\/asset\/([^/]+)\/?$/.exec(path);

  if (!match) {
    return { kind: 'home' };
  }

  try {
    return { kind: 'asset', id: decodeURIComponent(match[1]) };
  } catch {
    return { kind: 'home' };
  }
}

/**
 * Everything the server resolves before rendering one page. Mirrored by
 * `apps/web/src/app-data.ts` and `apps/api/src/ssr.ts`; keep them in sync.
 */
export interface AppData {
  route: AppRoute;
  health: HealthStatus | null;
  healthError: string | null;
  /** First page of the index; only loaded for the home route. */
  jobs: JobSearchResult | null;
  jobsError: string | null;
  /** Posting resolved for an asset route. */
  job: JobPosting | null;
  jobError: string | null;
}

export interface OpenCodeHealth {
  ok: boolean;
  url: string;
  version?: string;
  error?: string;
}

export interface DatabaseHealth {
  ok: boolean;
  /** Number of indexed postings; omitted when the connection failed. */
  jobs?: number;
  error?: string;
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  opencode: OpenCodeHealth;
  database: DatabaseHealth;
}

export const API_PREFIX = 'api';

export const API_ENDPOINTS = {
  health: `/${API_PREFIX}/health`,
  jobs: `/${API_PREFIX}/jobs`,
} as const;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export const EMPTY_FACETS: JobSearchFacets = {
  work_modes: [],
  employment_types: [],
  seniorities: [],
  locations: [],
  companies: [],
};

export const EMPTY_JOB_SEARCH: JobSearchResult = {
  jobs: [],
  total: 0,
  facets: EMPTY_FACETS,
  took_ms: 0,
};

export const EMPTY_APP_DATA: AppData = {
  route: { kind: 'home' },
  health: null,
  healthError: null,
  jobs: null,
  jobsError: null,
  job: null,
  jobError: null,
};
