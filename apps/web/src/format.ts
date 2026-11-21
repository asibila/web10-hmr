import type {
  EmploymentType,
  JobPosting,
  JobStatus,
  SalaryPeriod,
  SeniorityLevel,
  WorkMode,
} from '@web10/shared';

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
  unknown: 'Unspecified',
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  freelance: 'Freelance',
  other: 'Other',
};

export const SENIORITY_LABELS: Record<SeniorityLevel, string> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  lead: 'Lead',
  principal: 'Principal',
  director: 'Director',
  executive: 'Executive',
  unknown: 'Unspecified',
};

export const STATUS_LABELS: Record<JobStatus, string> = {
  active: 'Active',
  expired: 'Expired',
  closed: 'Closed',
  unknown: 'Unknown',
};

const PERIOD_SUFFIX: Record<SalaryPeriod, string> = {
  year: 'yr',
  month: 'mo',
  week: 'wk',
  day: 'day',
  hour: 'hr',
  unknown: '',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function money(value: number, currency: string | null): string {
  if (currency) {
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      // Fall through to a plain number when the model emitted an odd code.
    }
  }

  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(value);
}

export function formatSalary(job: JobPosting): string {
  const { salary_min: min, salary_max: max, salary_currency: currency } = job;
  const suffix = PERIOD_SUFFIX[job.salary_period];

  if (min === null && max === null) {
    return 'Salary not listed';
  }

  let range: string;

  if (min !== null && max !== null && min !== max) {
    range = `${money(min, currency)} – ${money(max, currency)}`;
  } else if (min !== null) {
    range = `${money(min, currency)}${max !== null ? ' +' : ''}`;
  } else {
    range = `Up to ${money(max as number, currency)}`;
  }

  return suffix ? `${range} / ${suffix}` : range;
}

export function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

export function formatLocation(job: JobPosting): string {
  if (job.location) {
    return job.location;
  }

  const parts = [job.city, job.country].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(', ') : 'Location not listed';
}

export function companyInitials(company: string | null): string {
  if (!company) {
    return '?';
  }

  return company
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function postedLabel(job: JobPosting): string {
  if (job.posted_at) {
    return `Posted ${formatDate(job.posted_at)}`;
  }

  return `Captured ${formatDate(job.captured_at)}`;
}

export function pluralJobs(count: number): string {
  return count === 1 ? '1 job' : `${count.toLocaleString('en')} jobs`;
}
