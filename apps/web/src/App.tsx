import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  DEFAULT_PAGE_SIZE,
  JOB_SORTS,
  jobAssetPath,
  parseAppRoute,
  type AppRoute,
  type CaptureJobResult,
  type HealthStatus,
  type JobPosting,
  type JobSearchParams,
  type JobSearchResult,
  type JobSort,
} from '@web10/shared';
import {
  ApiError,
  deleteJob,
  fetchHealth,
  fetchJob,
  fetchJobs,
} from './api';
import type { AppData } from './app-data';
import { CaptureForm } from './components/CaptureForm';
import { Filters } from './components/Filters';
import { JobCard } from './components/JobCard';
import { JobDetail } from './components/JobDetail';
import { pluralJobs } from './format';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: HealthStatus }
  | { kind: 'error'; message: string };

const SORT_LABELS: Record<JobSort, string> = {
  newest: 'Newest first',
  salary: 'Highest salary',
  relevance: 'Best match',
};

const HOME_TITLE = 'Web10 Jobs — search captured job postings';

function describeHealth(state: HealthState): { tone: string; text: string } {
  switch (state.kind) {
    case 'loading':
      return { tone: 'pending', text: 'Checking API…' };
    case 'error':
      return { tone: 'bad', text: `API unreachable — ${state.message}` };
    case 'ready': {
      const { opencode, database } = state.value;

      if (!database.ok) {
        return { tone: 'bad', text: 'API up · database unavailable' };
      }

      const jobs = pluralJobs(database.jobs ?? 0);

      return opencode.ok
        ? {
            tone: 'good',
            text: `${jobs} indexed · OpenCode ${opencode.version ?? 'connected'}`,
          }
        : { tone: 'warn', text: `${jobs} indexed · OpenCode offline` };
    }
  }
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function missingJobMessage(cause: unknown): string | null {
  return cause instanceof ApiError &&
    (cause.status === 404 || cause.status === 400)
    ? 'This job is not in the index. It may have been removed.'
    : null;
}

/** True for a plain left click that should be handled in-app. */
function isPlainClick(event: ReactMouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function App({ initialData }: { initialData: AppData }) {
  const [health, setHealth] = useState<HealthState>(() =>
    initialData.health
      ? { kind: 'ready', value: initialData.health }
      : initialData.healthError
        ? { kind: 'error', message: initialData.healthError }
        : { kind: 'loading' },
  );
  const [params, setParams] = useState<JobSearchParams>({
    sort: 'newest',
    limit: DEFAULT_PAGE_SIZE,
  });
  const [result, setResult] = useState<JobSearchResult | null>(
    initialData.jobs,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialData.jobsError);
  const [route, setRoute] = useState<AppRoute>(initialData.route);
  const [job, setJob] = useState<JobPosting | null>(initialData.job);
  const [jobError, setJobError] = useState<string | null>(initialData.jobError);
  const [jobLoading, setJobLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const [q, setQ] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const skippedInitial = useRef(false);
  // Remembers which asset id is already in state, so SSR data and card clicks
  // do not trigger a redundant fetch.
  const resolvedJobId = useRef<string | null>(
    initialData.job?.id ??
      (initialData.route.kind === 'asset' && initialData.jobError
        ? initialData.route.id
        : null),
  );

  useEffect(() => {
    if (initialData.health || initialData.healthError) {
      return;
    }

    let cancelled = false;

    fetchHealth()
      .then((value) => {
        if (!cancelled) {
          setHealth({ kind: 'ready', value });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setHealth({ kind: 'error', message: errorText(cause) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialData.health, initialData.healthError]);

  // Keep the indexed-job count in the header in step with captures and deletes.
  useEffect(() => {
    if (version === 0) {
      return;
    }

    let cancelled = false;

    fetchHealth()
      .then((value) => {
        if (!cancelled) {
          setHealth({ kind: 'ready', value });
        }
      })
      .catch(() => {
        // A stale count is better than replacing a working pill with an error.
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  // Browser back/forward moves between the index and asset pages.
  useEffect(() => {
    function onPopState() {
      setRoute(parseAppRoute(window.location.pathname));
    }

    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Debounce the free-text fields so typing does not hammer the index.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = q.trim() || undefined;

      setParams((previous) =>
        previous.q === next ? previous : { ...previous, q: next, offset: 0 },
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = locationInput.trim() || undefined;

      setParams((previous) =>
        previous.location === next
          ? previous
          : { ...previous, location: next, offset: 0 },
      );
    }, 300);

    return () => window.clearTimeout(timer);
  }, [locationInput]);

  useEffect(() => {
    if (route.kind !== 'home') {
      return;
    }

    if (!skippedInitial.current) {
      skippedInitial.current = true;

      // The server already resolved the default first page.
      if (initialData.jobs && version === 0) {
        return;
      }
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchJobs(params, controller.signal)
      .then((value) => {
        setResult(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [route.kind, params, version, initialData.jobs]);

  // Asset pages resolve their own posting. SSR already supplied the first one.
  useEffect(() => {
    if (route.kind !== 'asset') {
      return;
    }

    const id = route.id;

    if (resolvedJobId.current === id) {
      return;
    }

    resolvedJobId.current = id;

    const controller = new AbortController();
    setJobLoading(true);
    setJob(null);
    setJobError(null);

    fetchJob(id, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) {
          setJob(loaded);
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          const missing = missingJobMessage(cause);
          setJobError(missing ?? errorText(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setJobLoading(false);
        }
      });

    return () => controller.abort();
  }, [route]);

  // Link previews get the job title from the server; keep the tab in step.
  useEffect(() => {
    document.title =
      route.kind === 'asset'
        ? job
          ? `${job.title} at ${job.company ?? job.source} — Web10 Jobs`
          : 'Job not found — Web10 Jobs'
        : HOME_TITLE;
  }, [route, job]);

  const applyPatch = useCallback((patch: Partial<JobSearchParams>) => {
    setParams((previous) => ({ ...previous, ...patch, offset: 0 }));
  }, []);

  const clearFilters = useCallback(() => {
    setQ('');
    setLocationInput('');
    setParams((previous) => ({
      sort: previous.sort,
      limit: DEFAULT_PAGE_SIZE,
    }));
  }, []);

  const goHome = useCallback(() => {
    if (route.kind === 'home') {
      return;
    }

    const state = window.history.state as { web10?: string } | null;

    if (state?.web10 === 'asset-from-home') {
      // Reached an asset by clicking the index: go back so the search screen
      // and its scroll position are restored.
      window.history.back();
      return;
    }

    window.history.replaceState({ web10: 'home' }, '', '/');
    setRoute({ kind: 'home' });
  }, [route.kind]);

  const openJob = useCallback(
    (next: JobPosting) => {
      window.history.pushState(
        { web10: route.kind === 'home' ? 'asset-from-home' : 'asset' },
        '',
        jobAssetPath(next.id),
      );

      resolvedJobId.current = next.id;
      setJob(next);
      setJobError(null);
      setJobLoading(false);
      setRoute({ kind: 'asset', id: next.id });
    },
    [route.kind],
  );

  const handleCaptured = useCallback(
    (capture: CaptureJobResult) => {
      setVersion((value) => value + 1);
      openJob(capture.job);
    },
    [openJob],
  );

  const handleDelete = useCallback(
    async (jobToDelete: JobPosting) => {
      if (!window.confirm(`Remove "${jobToDelete.title}" from the index?`)) {
        return;
      }

      try {
        await deleteJob(jobToDelete.id);
        resolvedJobId.current = null;
        setJob(null);
        setJobError(null);
        setVersion((value) => value + 1);
        goHome();
      } catch (cause) {
        setError(errorText(cause));
      }
    },
    [goHome],
  );

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  const status = describeHealth(health);
  const offset = params.offset ?? 0;
  const limit = params.limit ?? DEFAULT_PAGE_SIZE;
  const total = result?.total ?? 0;
  const shownFrom = total === 0 ? 0 : offset + 1;
  const shownTo = offset + (result?.jobs.length ?? 0);
  const canPrevious = offset > 0;
  const canNext = shownTo < total;

  const activeCount = [
    params.q,
    params.location,
    params.company,
    params.workMode,
    params.employmentType,
    params.seniority,
    params.minSalary,
    params.includeInactive,
  ].filter(Boolean).length;

  function goToOffset(nextOffset: number) {
    setParams((previous) => ({ ...previous, offset: nextOffset }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main className="page">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            if (!isPlainClick(event)) {
              return;
            }

            event.preventDefault();
            goHome();
          }}
        >
          <span className="brand__mark" aria-hidden="true">
            10
          </span>
          <div>
            <h1>Web10 Jobs</h1>
            <p className="brand__tagline">
              One private index of jobs captured from across the web.
            </p>
          </div>
        </a>

        <div className="topbar__actions">
          <span className={`status status--${status.tone}`}>{status.text}</span>
          <CaptureForm onCaptured={handleCaptured} />
        </div>
      </header>

      {route.kind === 'asset' ? (
        <section className="asset-view" aria-live="polite">
          {jobLoading && !job ? (
            <div className="card skeleton skeleton--detail" aria-hidden="true" />
          ) : null}

          {!jobLoading && jobError ? (
            <div className="empty card">
              <h3>Job not found</h3>
              <p className="muted">{jobError}</p>
              <button type="button" className="button" onClick={goHome}>
                Back to all jobs
              </button>
            </div>
          ) : null}

          {job ? (
            <JobDetail
              job={job}
              variant="page"
              onClose={goHome}
              onDelete={handleDelete}
            />
          ) : null}
        </section>
      ) : (
        <>
          <section className="searchbar card" aria-label="Search and sort">
            <label className="searchbar__input">
              <span className="sr-only">Search jobs</span>
              <span className="searchbar__icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search roles, companies, skills…"
              />
            </label>

            <label className="searchbar__sort">
              <span>Sort</span>
              <select
                value={params.sort ?? 'newest'}
                onChange={(event) =>
                  setParams((previous) => ({
                    ...previous,
                    sort: event.target.value as JobSort,
                    offset: 0,
                  }))
                }
              >
                {JOB_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="button button--ghost"
              onClick={refresh}
              disabled={loading}
            >
              Refresh
            </button>
          </section>

          <div className="layout">
            <Filters
              facets={
                result?.facets ?? {
                  work_modes: [],
                  employment_types: [],
                  seniorities: [],
                  locations: [],
                  companies: [],
                }
              }
              params={params}
              location={locationInput}
              onLocationChange={setLocationInput}
              onChange={applyPatch}
              onClear={clearFilters}
              activeCount={activeCount}
            />

            <section className="results" aria-live="polite">
              <div className="results__head">
                <div>
                  <h2>{result ? pluralJobs(result.total) : 'Loading jobs…'}</h2>
                  {result && result.total > 0 ? (
                    <p className="muted">
                      Showing {shownFrom}–{shownTo}
                      {result.took_ms > 0 ? ` · ${result.took_ms} ms` : ''}
                    </p>
                  ) : null}
                </div>
                {loading ? (
                  <span
                    className="spinner"
                    role="status"
                    aria-label="Searching"
                  />
                ) : null}
              </div>

              {error ? (
                <div className="banner banner--error">
                  <span>{error}</span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={refresh}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {loading && !result ? (
                <div className="results__list">
                  {[0, 1, 2].map((index) => (
                    <div
                      key={index}
                      className="skeleton card"
                      aria-hidden="true"
                    />
                  ))}
                </div>
              ) : null}

              {result && result.jobs.length > 0 ? (
                <div
                  className={`results__list${loading ? ' results__list--busy' : ''}`}
                >
                  {result.jobs.map((item) => (
                    <JobCard key={item.id} job={item} onSelect={openJob} />
                  ))}
                </div>
              ) : null}

              {!loading && result && result.jobs.length === 0 ? (
                <div className="empty card">
                  <h3>
                    {activeCount > 0
                      ? 'No jobs match these filters'
                      : 'Your job index is empty'}
                  </h3>
                  {activeCount > 0 ? (
                    <>
                      <p className="muted">
                        Try removing a filter or widening the salary range.
                      </p>
                      <button
                        type="button"
                        className="button"
                        onClick={clearFilters}
                      >
                        Clear filters
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="muted">
                        Open an individual job ad, then save it with the Web10
                        Chrome extension. Captured jobs appear here, ready to
                        search.
                      </p>
                      <ol className="empty__steps">
                        <li>Start the API with <code>npm run dev</code>.</li>
                        <li>
                          Load the <code>chrome-extension</code> folder
                          unpacked.
                        </li>
                        <li>
                          Click the extension on a job ad and choose Save job.
                        </li>
                      </ol>
                    </>
                  )}
                </div>
              ) : null}

              {canPrevious || canNext ? (
                <nav className="pagination" aria-label="Pagination">
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => goToOffset(Math.max(0, offset - limit))}
                    disabled={!canPrevious || loading}
                  >
                    ← Previous
                  </button>
                  <span className="muted">
                    Page {Math.floor(offset / limit) + 1}
                  </span>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => goToOffset(offset + limit)}
                    disabled={!canNext || loading}
                  >
                    Next →
                  </button>
                </nav>
              ) : null}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
