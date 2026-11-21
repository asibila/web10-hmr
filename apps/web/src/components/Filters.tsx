import type { ReactNode } from 'react';
import {
  EMPLOYMENT_TYPES,
  SENIORITY_LEVELS,
  WORK_MODES,
  type EmploymentType,
  type FacetBucket,
  type JobSearchFacets,
  type JobSearchParams,
  type SeniorityLevel,
  type WorkMode,
} from '@web10/shared';
import {
  EMPLOYMENT_LABELS,
  SENIORITY_LABELS,
  WORK_MODE_LABELS,
} from '../format';

interface FiltersProps {
  facets: JobSearchFacets;
  params: JobSearchParams;
  location: string;
  onLocationChange: (value: string) => void;
  onChange: (patch: Partial<JobSearchParams>) => void;
  onClear: () => void;
  activeCount: number;
}

const SALARY_STEPS = [30_000, 50_000, 80_000, 100_000, 150_000];

const COMPACT = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 0,
});

function countFor(buckets: FacetBucket[], value: string): number | undefined {
  return buckets.find((bucket) => bucket.value === value)?.count;
}

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' filter-chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      {typeof count === 'number' ? (
        <span className="filter-chip__count">{count}</span>
      ) : null}
    </button>
  );
}

export function Filters({
  facets,
  params,
  location,
  onLocationChange,
  onChange,
  onClear,
  activeCount,
}: FiltersProps) {
  const topLocations = facets.locations.slice(0, 8);
  const topCompanies = facets.companies.slice(0, 6);

  return (
    <aside className="filters card" aria-label="Search filters">
      <div className="filters__head">
        <h2>
          Filters
          {activeCount > 0 ? (
            <span className="filters__count">{activeCount}</span>
          ) : null}
        </h2>
        <button
          type="button"
          className="link-button"
          onClick={onClear}
          disabled={activeCount === 0}
        >
          Clear all
        </button>
      </div>

      <section className="filter-group">
        <h3>Work mode</h3>
        <div className="filter-chips">
          {WORK_MODES.map((mode) => (
            <Chip
              key={mode}
              active={params.workMode === mode}
              count={countFor(facets.work_modes, mode)}
              onClick={() =>
                onChange({
                  workMode: params.workMode === mode ? undefined : (mode as WorkMode),
                })
              }
            >
              {WORK_MODE_LABELS[mode]}
            </Chip>
          ))}
        </div>
      </section>

      <section className="filter-group">
        <h3>Employment</h3>
        <div className="filter-chips">
          {EMPLOYMENT_TYPES.map((type) => (
            <Chip
              key={type}
              active={params.employmentType === type}
              count={countFor(facets.employment_types, type)}
              onClick={() =>
                onChange({
                  employmentType:
                    params.employmentType === type
                      ? undefined
                      : (type as EmploymentType),
                })
              }
            >
              {EMPLOYMENT_LABELS[type]}
            </Chip>
          ))}
        </div>
      </section>

      <section className="filter-group">
        <h3>Seniority</h3>
        <div className="filter-chips">
          {SENIORITY_LEVELS.map((level) => (
            <Chip
              key={level}
              active={params.seniority === level}
              count={countFor(facets.seniorities, level)}
              onClick={() =>
                onChange({
                  seniority:
                    params.seniority === level
                      ? undefined
                      : (level as SeniorityLevel),
                })
              }
            >
              {SENIORITY_LABELS[level]}
            </Chip>
          ))}
        </div>
      </section>

      <section className="filter-group">
        <h3>Location</h3>
        <input
          type="search"
          value={location}
          placeholder="City or country"
          aria-label="Filter by location"
          onChange={(event) => onLocationChange(event.target.value)}
        />
        {topLocations.length > 0 ? (
          <div className="filter-chips filter-chips--tight">
            {topLocations.map((bucket) => {
              const active = params.location === bucket.value;

              return (
                <Chip
                  key={bucket.value}
                  active={active}
                  count={bucket.count}
                  onClick={() => {
                    onLocationChange(active ? '' : bucket.value);
                    onChange({ location: active ? undefined : bucket.value });
                  }}
                >
                  {bucket.value}
                </Chip>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="filter-group">
        <h3>Minimum salary</h3>
        <select
          value={params.minSalary ?? ''}
          aria-label="Minimum salary"
          onChange={(event) =>
            onChange({
              minSalary: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        >
          <option value="">Any salary</option>
          {SALARY_STEPS.map((step) => (
            <option key={step} value={step}>
              {COMPACT.format(step)}+
            </option>
          ))}
        </select>
      </section>

      {topCompanies.length > 0 ? (
        <section className="filter-group">
          <h3>Companies</h3>
          <div className="filter-chips filter-chips--tight">
            {topCompanies.map((bucket) => {
              const active = params.company === bucket.value;

              return (
                <Chip
                  key={bucket.value}
                  active={active}
                  count={bucket.count}
                  onClick={() =>
                    onChange({ company: active ? undefined : bucket.value })
                  }
                >
                  {bucket.value}
                </Chip>
              );
            })}
          </div>
        </section>
      ) : null}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={params.includeInactive ?? false}
          onChange={(event) =>
            onChange({
              includeInactive: event.target.checked ? true : undefined,
            })
          }
        />
        Include expired and closed jobs
      </label>
    </aside>
  );
}
