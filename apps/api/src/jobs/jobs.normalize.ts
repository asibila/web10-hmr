import { randomUUID } from 'node:crypto';
import {
  EMPLOYMENT_TYPES,
  JOB_STATUSES,
  SALARY_PERIODS,
  SENIORITY_LEVELS,
  WORK_MODES,
  type EmploymentType,
  type JobPosting,
  type JobStatus,
  type SalaryPeriod,
  type SeniorityLevel,
  type WorkMode,
} from '@web10/shared';
import { CaptureJobDto } from './dto/capture-job.dto';

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asId(value: unknown): string | null {
  if (typeof value === 'string') {
    return asString(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function asIsoDate(value: unknown): string | null {
  const text = asString(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asUrl(value: unknown): string | null {
  const text = asString(value);

  if (!text) {
    return null;
  }

  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function asCurrency(value: unknown): string | null {
  const text = asString(value)?.toUpperCase();

  return text && /^[A-Z]{3}$/.test(text) ? text : null;
}

function asSkills(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const skills: string[] = [];

  for (const entry of value) {
    const text = asString(entry)?.toLowerCase().replace(/\s+/g, ' ');

    if (!text || text.length > 60 || seen.has(text)) {
      continue;
    }

    seen.add(text);
    skills.push(text);

    if (skills.length >= 30) {
      break;
    }
  }

  return skills;
}

function key(value: unknown): string | null {
  return (
    asString(value)
      ?.toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() ?? null
  );
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  aliases: Record<string, T>,
  fallback: T,
): T {
  const normalized = key(value);

  if (!normalized) {
    return fallback;
  }

  if ((allowed as readonly string[]).includes(normalized)) {
    return normalized as T;
  }

  return aliases[normalized] ?? fallback;
}

const WORK_MODE_ALIASES: Record<string, WorkMode> = {
  remote: 'remote',
  'fully remote': 'remote',
  'remote only': 'remote',
  'remote first': 'remote',
  'work from home': 'remote',
  wfh: 'remote',
  anywhere: 'remote',
  hybrid: 'hybrid',
  'partially remote': 'hybrid',
  'hybrid remote': 'hybrid',
  onsite: 'onsite',
  'on site': 'onsite',
  'in office': 'onsite',
  'in person': 'onsite',
  office: 'onsite',
  'office based': 'onsite',
};

const EMPLOYMENT_ALIASES: Record<string, EmploymentType> = {
  'full time': 'full_time',
  fulltime: 'full_time',
  permanent: 'full_time',
  'permanent full time': 'full_time',
  'part time': 'part_time',
  parttime: 'part_time',
  contract: 'contract',
  contractor: 'contract',
  contracting: 'contract',
  b2b: 'contract',
  'fixed term': 'contract',
  temporary: 'temporary',
  temp: 'temporary',
  seasonal: 'temporary',
  internship: 'internship',
  intern: 'internship',
  'working student': 'internship',
  freelance: 'freelance',
  freelancer: 'freelance',
  'independent contractor': 'freelance',
};

const SENIORITY_ALIASES: Record<string, SeniorityLevel> = {
  intern: 'intern',
  internship: 'intern',
  'working student': 'intern',
  junior: 'junior',
  jr: 'junior',
  entry: 'junior',
  'entry level': 'junior',
  graduate: 'junior',
  mid: 'mid',
  middle: 'mid',
  'mid level': 'mid',
  intermediate: 'mid',
  senior: 'senior',
  sr: 'senior',
  lead: 'lead',
  'team lead': 'lead',
  'tech lead': 'lead',
  'lead engineer': 'lead',
  principal: 'principal',
  staff: 'principal',
  architect: 'principal',
  director: 'director',
  head: 'director',
  'head of': 'director',
  executive: 'executive',
  vp: 'executive',
  'vice president': 'executive',
  cto: 'executive',
  ceo: 'executive',
  cfo: 'executive',
  'c level': 'executive',
};

const STATUS_ALIASES: Record<string, JobStatus> = {
  active: 'active',
  open: 'active',
  hiring: 'active',
  expired: 'expired',
  past: 'expired',
  closed: 'closed',
  filled: 'closed',
  archived: 'closed',
};

const PERIOD_ALIASES: Record<string, SalaryPeriod> = {
  year: 'year',
  yearly: 'year',
  annual: 'year',
  annually: 'year',
  'per year': 'year',
  yr: 'year',
  month: 'month',
  monthly: 'month',
  mo: 'month',
  'per month': 'month',
  week: 'week',
  weekly: 'week',
  'per week': 'week',
  day: 'day',
  daily: 'day',
  'per day': 'day',
  hour: 'hour',
  hourly: 'hour',
  hr: 'hour',
  'per hour': 'hour',
};

/**
 * Turns the model output into the shared `JobPosting` shape. Returns `null`
 * when the model decided the page is not a job posting. Throws when the output
 * is malformed, so the caller can report an upstream failure rather than an
 * empty capture.
 */
export function normalizeJob(
  parsed: unknown,
  input: CaptureJobDto,
): JobPosting | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Job extraction output must be a JSON object.');
  }

  const root = parsed as Record<string, unknown>;
  const candidate = 'job' in root ? root.job : root;

  if (candidate === null) {
    return null;
  }

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Job extraction output did not contain a job object.');
  }

  const raw = candidate as Record<string, unknown>;
  const title =
    asString(raw.title)?.slice(0, 500) ??
    asString(input.title)?.slice(0, 500) ??
    null;

  if (!title) {
    return null;
  }

  let salaryMin = asNumber(raw.salary_min);
  let salaryMax = asNumber(raw.salary_max);

  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    [salaryMin, salaryMax] = [salaryMax, salaryMin];
  }

  if (salaryMin !== null) {
    salaryMin = Math.max(0, Math.round(salaryMin * 100) / 100);
  }

  if (salaryMax !== null) {
    salaryMax = Math.max(0, Math.round(salaryMax * 100) / 100);
  }

  const expiresAt = asIsoDate(raw.expires_at);
  let status = enumValue<JobStatus>(
    raw.status,
    JOB_STATUSES,
    STATUS_ALIASES,
    'unknown',
  );

  const expired = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();

  if (expired && status !== 'closed') {
    status = 'expired';
  } else if (status === 'unknown' && !expired) {
    status = 'active';
  }

  let source = 'unknown';

  try {
    source = new URL(input.url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    // Keep the placeholder; the URL field is still stored as given.
  }

  const hasSalary = salaryMin !== null || salaryMax !== null;

  return {
    id: randomUUID(),
    source,
    source_url: input.url,
    external_id: asId(raw.external_id),
    title,
    company: asString(raw.company)?.slice(0, 300) ?? null,
    company_url: asUrl(raw.company_url),
    location: asString(raw.location)?.slice(0, 300) ?? null,
    city: asString(raw.city)?.slice(0, 200) ?? null,
    country: asString(raw.country)?.slice(0, 200) ?? null,
    work_mode: enumValue<WorkMode>(
      raw.work_mode,
      WORK_MODES,
      WORK_MODE_ALIASES,
      'unknown',
    ),
    employment_type: enumValue<EmploymentType>(
      raw.employment_type,
      EMPLOYMENT_TYPES,
      EMPLOYMENT_ALIASES,
      'other',
    ),
    seniority: enumValue<SeniorityLevel>(
      raw.seniority,
      SENIORITY_LEVELS,
      SENIORITY_ALIASES,
      'unknown',
    ),
    salary_min: salaryMin,
    salary_max: salaryMax,
    salary_currency: asCurrency(raw.salary_currency),
    salary_period: hasSalary
      ? enumValue<SalaryPeriod>(
          raw.salary_period,
          SALARY_PERIODS,
          PERIOD_ALIASES,
          'unknown',
        )
      : 'unknown',
    description: asString(raw.description)?.slice(0, 20_000) ?? null,
    skills: asSkills(raw.skills),
    posted_at: asIsoDate(raw.posted_at),
    expires_at: expiresAt,
    captured_at: asIsoDate(input.capturedAt) ?? new Date().toISOString(),
    status,
  };
}
