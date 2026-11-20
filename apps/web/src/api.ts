import {
  API_ENDPOINTS,
  type ClassificationResult,
  type ClassifyPageInput,
  type HealthStatus,
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

export async function classifyPage(
  input: ClassifyPageInput,
): Promise<ClassificationResult> {
  const response = await fetch(API_ENDPOINTS.classify, {
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

  return payload as ClassificationResult;
}
