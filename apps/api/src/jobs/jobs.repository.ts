import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type FacetBucket,
  type JobPosting,
  type JobSearchFacets,
  type JobSearchParams,
  type JobSearchResult,
} from '@web10/shared';
import { DatabaseService } from '../database/database.service';

interface JobRow {
  id: string;
  source: string;
  source_url: string;
  external_id: string | null;
  title: string;
  company: string | null;
  company_url: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  work_mode: string;
  employment_type: string;
  seniority: string;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string;
  description: string | null;
  skills: string[] | null;
  posted_at: Date | string | null;
  expires_at: Date | string | null;
  captured_at: Date | string;
  status: string;
}

interface FacetRow {
  kind: string;
  value: string;
  n: number;
}

function asIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function toJob(row: JobRow): JobPosting {
  return {
    id: row.id,
    source: row.source,
    source_url: row.source_url,
    external_id: row.external_id,
    title: row.title,
    company: row.company,
    company_url: row.company_url,
    location: row.location,
    city: row.city,
    country: row.country,
    work_mode: row.work_mode as JobPosting['work_mode'],
    employment_type: row.employment_type as JobPosting['employment_type'],
    seniority: row.seniority as JobPosting['seniority'],
    salary_min: asNumber(row.salary_min),
    salary_max: asNumber(row.salary_max),
    salary_currency: row.salary_currency,
    salary_period: row.salary_period as JobPosting['salary_period'],
    description: row.description,
    skills: row.skills ?? [],
    posted_at: asIso(row.posted_at),
    expires_at: asIso(row.expires_at),
    captured_at: asIso(row.captured_at) ?? new Date().toISOString(),
    status: row.status as JobPosting['status'],
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Salary ranges arrive in different periods. Filters and sorting compare an
 * annualized value so an hourly contract is not ranked below a yearly salary
 * just because its raw number is smaller.
 */
const ANNUAL_SALARY = `(COALESCE(salary_max, salary_min) * CASE salary_period
  WHEN 'hour' THEN 2080
  WHEN 'day' THEN 260
  WHEN 'week' THEN 52
  WHEN 'month' THEN 12
  ELSE 1
END)`;

@Injectable()
export class JobsRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Insert or refresh one posting. Deduplication looks at the canonical URL
   * first, then at the source's own posting ID, so URL variants of the same
   * ad collapse into one row.
   */
  async upsert(
    job: JobPosting,
  ): Promise<{ job: JobPosting; duplicate: boolean }> {
    const { rows: existing } = await this.db.query<{ id: string }>(
      `SELECT id
         FROM job_postings
        WHERE source_url = $1
           OR ($2::text IS NOT NULL AND source = $3 AND external_id = $2)
        ORDER BY (source_url = $1) DESC
        LIMIT 1`,
      [job.source_url, job.external_id, job.source],
    );

    const duplicate = existing.length > 0;
    const id = existing[0]?.id ?? job.id;
    const target: JobPosting = { ...job, id };

    const { rows } = await this.db.query<JobRow>(
      `INSERT INTO job_postings (
         id, source, source_url, external_id, title, company, company_url,
         location, city, country, work_mode, employment_type, seniority,
         salary_min, salary_max, salary_currency, salary_period, description,
         skills, posted_at, expires_at, captured_at, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
         $16, $17, $18, $19, $20, $21, $22, $23
       )
       ON CONFLICT (id) DO UPDATE SET
         source = EXCLUDED.source,
         source_url = EXCLUDED.source_url,
         external_id = EXCLUDED.external_id,
         title = EXCLUDED.title,
         company = EXCLUDED.company,
         company_url = EXCLUDED.company_url,
         location = EXCLUDED.location,
         city = EXCLUDED.city,
         country = EXCLUDED.country,
         work_mode = EXCLUDED.work_mode,
         employment_type = EXCLUDED.employment_type,
         seniority = EXCLUDED.seniority,
         salary_min = EXCLUDED.salary_min,
         salary_max = EXCLUDED.salary_max,
         salary_currency = EXCLUDED.salary_currency,
         salary_period = EXCLUDED.salary_period,
         description = EXCLUDED.description,
         skills = EXCLUDED.skills,
         posted_at = EXCLUDED.posted_at,
         expires_at = EXCLUDED.expires_at,
         captured_at = EXCLUDED.captured_at,
         status = EXCLUDED.status
       RETURNING *`,
      [
        target.id,
        target.source,
        target.source_url,
        target.external_id,
        target.title,
        target.company,
        target.company_url,
        target.location,
        target.city,
        target.country,
        target.work_mode,
        target.employment_type,
        target.seniority,
        target.salary_min,
        target.salary_max,
        target.salary_currency,
        target.salary_period,
        target.description,
        target.skills,
        target.posted_at,
        target.expires_at,
        target.captured_at,
        target.status,
      ],
    );

    return { job: toJob(rows[0]), duplicate };
  }

  async search(params: JobSearchParams): Promise<JobSearchResult> {
    const started = Date.now();
    const limit = clamp(params.limit ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const offset = Math.max(0, params.offset ?? 0);

    const where: string[] = [];
    const values: unknown[] = [];
    const bind = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    let queryParam: string | null = null;

    if (!params.includeInactive) {
      where.push(`(status = 'active' AND (expires_at IS NULL OR expires_at >= now()))`);
    }

    const q = params.q?.trim();
    if (q) {
      queryParam = bind(q);
      where.push(
        `(search_vector @@ websearch_to_tsquery('simple', ${queryParam})
          OR title ILIKE '%' || ${queryParam} || '%'
          OR company ILIKE '%' || ${queryParam} || '%')`,
      );
    }

    if (params.company?.trim()) {
      const param = bind(params.company.trim());
      where.push(`company ILIKE '%' || ${param} || '%'`);
    }

    if (params.location?.trim()) {
      const param = bind(params.location.trim());
      where.push(
        `(location ILIKE '%' || ${param} || '%'
          OR city ILIKE '%' || ${param} || '%'
          OR country ILIKE '%' || ${param} || '%')`,
      );
    }

    if (params.workMode) {
      where.push(`work_mode = ${bind(params.workMode)}`);
    }

    if (params.employmentType) {
      where.push(`employment_type = ${bind(params.employmentType)}`);
    }

    if (params.seniority) {
      where.push(`seniority = ${bind(params.seniority)}`);
    }

    if (typeof params.minSalary === 'number' && params.minSalary > 0) {
      where.push(`${ANNUAL_SALARY} >= ${bind(params.minSalary)}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    let orderSql = 'ORDER BY COALESCE(posted_at, captured_at) DESC, captured_at DESC';

    if (params.sort === 'salary') {
      orderSql = `ORDER BY ${ANNUAL_SALARY} DESC NULLS LAST, COALESCE(posted_at, captured_at) DESC`;
    } else if (params.sort === 'relevance' && queryParam) {
      orderSql = `ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('simple', ${queryParam})) DESC, COALESCE(posted_at, captured_at) DESC`;
    }

    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const jobsSql = `
      SELECT *, COUNT(*) OVER() AS total_count
        FROM job_postings
        ${whereSql}
        ${orderSql}
       LIMIT ${limitParam} OFFSET ${offsetParam}`;

    const facetsSql = `
      WITH filtered AS (
        SELECT * FROM job_postings ${whereSql}
      )
      SELECT kind, value, n FROM (
        (SELECT 'work_mode' AS kind, work_mode AS value, count(*)::int AS n
           FROM filtered GROUP BY work_mode ORDER BY n DESC, value ASC LIMIT 12)
        UNION ALL
        (SELECT 'employment_type', employment_type, count(*)::int
           FROM filtered GROUP BY employment_type ORDER BY 3 DESC, 2 ASC LIMIT 12)
        UNION ALL
        (SELECT 'seniority', seniority, count(*)::int
           FROM filtered GROUP BY seniority ORDER BY 3 DESC, 2 ASC LIMIT 12)
        UNION ALL
        (SELECT 'location', location, count(*)::int
           FROM filtered
          WHERE location IS NOT NULL AND location <> ''
          GROUP BY location ORDER BY 3 DESC, 2 ASC LIMIT 12)
        UNION ALL
        (SELECT 'company', company, count(*)::int
           FROM filtered
          WHERE company IS NOT NULL AND company <> ''
          GROUP BY company ORDER BY 3 DESC, 2 ASC LIMIT 12)
      ) f`;

    const [jobsResult, facetsResult] = await Promise.all([
      this.db.query<JobRow & { total_count: string }>(jobsSql, [
        ...values,
        limit,
        offset,
      ]),
      this.db.query<FacetRow>(facetsSql, values),
    ]);

    const facets: JobSearchFacets = {
      work_modes: [],
      employment_types: [],
      seniorities: [],
      locations: [],
      companies: [],
    };

    const target: Record<string, FacetBucket[]> = {
      work_mode: facets.work_modes,
      employment_type: facets.employment_types,
      seniority: facets.seniorities,
      location: facets.locations,
      company: facets.companies,
    };

    for (const row of facetsResult.rows) {
      target[row.kind]?.push({ value: row.value, count: row.n });
    }

    return {
      jobs: jobsResult.rows.map(toJob),
      total: Number(jobsResult.rows[0]?.total_count ?? 0),
      facets,
      took_ms: Date.now() - started,
    };
  }

  async findById(id: string): Promise<JobPosting | null> {
    const { rows } = await this.db.query<JobRow>(
      'SELECT * FROM job_postings WHERE id = $1',
      [id],
    );

    return rows[0] ? toJob(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query('DELETE FROM job_postings WHERE id = $1', [
      id,
    ]);

    return (result.rowCount ?? 0) > 0;
  }
}
