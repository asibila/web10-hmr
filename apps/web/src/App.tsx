import { useEffect, useState, type FormEvent } from 'react';
import type {
  ClassificationResult,
  EntityClassification,
  HealthStatus,
} from '@web10/shared';
import { classifyPage, fetchHealth } from './api';
import type { AppData } from './app-data';

const ENTITY_FIELDS: ReadonlyArray<{
  key: keyof EntityClassification;
  label: string;
}> = [
  { key: 'category', label: 'Category' },
  { key: 'subcategory', label: 'Subcategory' },
  { key: 'title', label: 'Title' },
  { key: 'description_short', label: 'Short description' },
  { key: 'description_full', label: 'Full description' },
  { key: 'external_id', label: 'External ID' },
  { key: 'sku', label: 'SKU' },
  { key: 'object_code', label: 'Object code' },
  { key: 'listing_type', label: 'Listing type' },
  { key: 'offer_type', label: 'Offer type' },
  { key: 'state', label: 'State' },
  { key: 'created_at', label: 'Created at' },
  { key: 'expires_at', label: 'Expires at' },
  { key: 'view_count', label: 'View count' },
];

const SAMPLE = {
  url: 'https://example.com/oglasi/useljiva-kuca-kotoriba-51081818',
  title: 'Useljiva kuća s lijepom okućnicom (prodaja)',
  content:
    'Na prodaju useljiva obiteljska kuća u mirnom dijelu Kotoribe. ' +
    'Kuća: Kotoriba, 120.00 m2, katnica, samostojeća. ' +
    'Sastoji se od kuhinje, dnevnog boravka, tri sobe, kupaonice i WC-a. ' +
    'Cijena: 85.000 EUR. Šifra oglasa: 51081818.',
};

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ready'; value: HealthStatus }
  | { kind: 'error'; message: string };

function describeHealth(state: HealthState): { tone: string; text: string } {
  switch (state.kind) {
    case 'loading':
      return { tone: 'pending', text: 'Checking API…' };
    case 'error':
      return { tone: 'bad', text: `API unreachable — ${state.message}` };
    case 'ready':
      return state.value.opencode.ok
        ? {
            tone: 'good',
            text: `API up · OpenCode ${state.value.opencode.version ?? 'connected'}`,
          }
        : { tone: 'warn', text: 'API up · OpenCode unreachable' };
  }
}

function display(value: string | number | null): string {
  return value === null || value === '' ? '—' : String(value);
}

export function App({ initialData }: { initialData: AppData }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [health, setHealth] = useState<HealthState>(() =>
    initialData.health
      ? { kind: 'ready', value: initialData.health }
      : initialData.healthError
        ? { kind: 'error', message: initialData.healthError }
        : { kind: 'loading' },
  );

  useEffect(() => {
    // The server already resolved this, so refetching would only flash.
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
          setHealth({
            kind: 'error',
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialData.health, initialData.healthError]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const classification = await classifyPage({
        url: url.trim(),
        title: title.trim() || undefined,
        content: content.trim(),
        metadata: { lang: navigator.language },
        capturedAt: new Date().toISOString(),
      });

      setResult(classification);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setUrl(SAMPLE.url);
    setTitle(SAMPLE.title);
    setContent(SAMPLE.content);
    setError(null);
    setResult(null);
  }

  const status = describeHealth(health);

  return (
    <main className="page">
      <header className="masthead">
        <div>
          <h1>Web10</h1>
          <p className="tagline">
            Classify a page into the catalogue with the local OpenCode model.
          </p>
        </div>
        <span className={`status status--${status.tone}`}>{status.text}</span>
      </header>

      <section className="card">
        <form onSubmit={onSubmit} className="form">
          <label className="field">
            <span>URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/listing/123"
              required
            />
          </label>

          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Optional page title"
            />
          </label>

          <label className="field field--grow">
            <span>Page text</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste the visible text of the page…"
              rows={10}
              required
            />
          </label>

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Classifying…' : 'Classify page'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={loadSample}
              disabled={busy}
            >
              Load sample
            </button>
          </div>
        </form>
      </section>

      {error ? <p className="banner banner--error">{error}</p> : null}

      {result ? (
        <section className="card">
          <div className="result-head">
            <h2>
              {result.entity.category}
              <span className="slash">/</span>
              {result.entity.subcategory}
            </h2>
            <span className="chip">{result.entity.state}</span>
          </div>

          <dl className="entity">
            {ENTITY_FIELDS.map(({ key, label }) => (
              <div key={key} className="entity__row">
                <dt>{label}</dt>
                <dd>{display(result.entity[key])}</dd>
              </div>
            ))}
          </dl>

          <details className="raw">
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
