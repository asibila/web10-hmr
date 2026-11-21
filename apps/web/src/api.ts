import {
  API_ENDPOINTS,
  type CaptureJobInput,
  type CaptureJobResult,
  type HealthStatus,
  type JobPosting,
  type JobSearchParams,
  type JobSearchResult,
} from '@web10/shared';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      `Expected a JSON response but received: ${text.slice(0, 200)}`,
      response.status,
    );
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const { message } = payload as Record<string, unknown>;

    if (Array.isArray(message)) {
      return message.join('; ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return `Request failed with status ${status}.`;
}

/** Serializes only the parameters that are actually set. */
export function jobSearchQuery(params: JobSearchParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    search.set(key, String(value));
  }

  const query = search.toString();

  return query ? `?${query}` : '';
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(API_ENDPOINTS.health, {
    headers: { accept: 'application/json' },
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as HealthStatus;
}

export async function fetchJobs(
  params: JobSearchParams,
  signal?: AbortSignal,
): Promise<JobSearchResult> {
  const response = await fetch(`${API_ENDPOINTS.jobs}${jobSearchQuery(params)}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as JobSearchResult;
}

export async function fetchJob(
  id: string,
  signal?: AbortSignal,
): Promise<JobPosting> {
  const response = await fetch(`${API_ENDPOINTS.jobs}/${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' },
    signal,
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as JobPosting;
}

export async function captureJob(
  input: CaptureJobInput,
): Promise<CaptureJobResult> {
  const response = await fetch(API_ENDPOINTS.jobs, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(input),
  });
  const payload = await readJson(response);

  if (!response.ok) {
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }

  return payload as CaptureJobResult;
}

export async function deleteJob(id: string): Promise<void> {
  const response = await fetch(`${API_ENDPOINTS.jobs}/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const payload = await readJson(response);
    throw new ApiError(errorMessage(payload, response.status), response.status);
  }
}
