import { useState, type FormEvent } from 'react';
import type { CaptureJobResult } from '@web10/shared';
import { captureJob } from '../api';

interface CaptureFormProps {
  onCaptured: (result: CaptureJobResult) => void;
}

export function CaptureForm({ onCaptured }: CaptureFormProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await captureJob({
        url: url.trim(),
        title: title.trim() || undefined,
        content: content.trim(),
        capturedAt: new Date().toISOString(),
        metadata: { lang: navigator.language },
      });

      setNotice(
        result.duplicate
          ? 'That posting was already indexed, so it was refreshed.'
          : 'Job added to the index.',
      );
      setUrl('');
      setTitle('');
      setContent('');
      onCaptured(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="capture">
      <button
        type="button"
        className="button button--ghost"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Close' : 'Add job'}
      </button>

      {open ? (
        <div className="capture__panel card">
          <div className="capture__head">
            <h2>Add a job manually</h2>
            <p className="muted">
              Paste a job ad. The local model extracts the structured posting.
              The extension does this in one click.
            </p>
          </div>

          <form className="form" onSubmit={onSubmit}>
            <label className="field">
              <span>Job URL</span>
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/jobs/senior-engineer"
                required
              />
            </label>

            <label className="field">
              <span>Source title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Optional page title"
              />
            </label>

            <label className="field">
              <span>Page text</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Paste the visible text of the job ad…"
                rows={8}
                required
              />
            </label>

            <div className="actions">
              <button type="submit" className="button" disabled={busy}>
                {busy ? 'Extracting…' : 'Extract and save'}
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>

          {error ? <p className="banner banner--error">{error}</p> : null}
          {notice ? <p className="banner banner--good">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
