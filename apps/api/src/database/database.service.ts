import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DatabaseHealth } from '@web10/shared';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';

/**
 * The job index schema. It is applied at every boot with `IF NOT EXISTS`
 * guards, so a fresh database and an existing one follow the same path.
 * Additive changes belong here; destructive ones need a real migration.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  source_url text NOT NULL UNIQUE,
  external_id text,
  title text NOT NULL,
  company text,
  company_url text,
  location text,
  city text,
  country text,
  work_mode text NOT NULL DEFAULT 'unknown',
  employment_type text NOT NULL DEFAULT 'other',
  seniority text NOT NULL DEFAULT 'unknown',
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text NOT NULL DEFAULT 'unknown',
  description text,
  skills text[] NOT NULL DEFAULT '{}',
  posted_at timestamptz,
  expires_at timestamptz,
  captured_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active',
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(company, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(location, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS job_postings_search_idx
  ON job_postings USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS job_postings_captured_idx
  ON job_postings (captured_at DESC);
CREATE INDEX IF NOT EXISTS job_postings_work_mode_idx
  ON job_postings (work_mode);
CREATE INDEX IF NOT EXISTS job_postings_employment_idx
  ON job_postings (employment_type);
CREATE INDEX IF NOT EXISTS job_postings_seniority_idx
  ON job_postings (seniority);
CREATE INDEX IF NOT EXISTS job_postings_status_idx
  ON job_postings (status);
CREATE UNIQUE INDEX IF NOT EXISTS job_postings_source_external_idx
  ON job_postings (source, external_id)
  WHERE external_id IS NOT NULL;
`;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>(
      'DATABASE_URL',
      'postgresql://web10@127.0.0.1:5432/web10',
    );
    const sslValue = (config.get<string>('DATABASE_SSL', '') ?? '').toLowerCase();
    const useSsl = ['1', 'true', 'yes'].includes(sslValue);

    this.pool = new Pool({
      connectionString,
      max: 10,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });

    this.pool.on('error', (error) => {
      this.logger.error(`Idle PostgreSQL client error: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.pool.query(SCHEMA_SQL);
      this.logger.log('PostgreSQL job index ready');
    } catch (error) {
      // Keep the API bootable so `/api/health` can explain what is wrong.
      this.logger.error(
        `Could not prepare the PostgreSQL schema: ${describe(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async health(): Promise<DatabaseHealth> {
    try {
      const { rows } = await this.pool.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM job_postings',
      );

      return { ok: true, jobs: Number(rows[0]?.count ?? 0) };
    } catch (error) {
      return { ok: false, error: describe(error) };
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
