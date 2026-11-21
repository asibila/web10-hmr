import { useEffect, useState, type ReactNode } from 'react';
import { jobAssetPath, type JobPosting } from '@web10/shared';
import {
  companyInitials,
  EMPLOYMENT_LABELS,
  formatDate,
  formatLocation,
  formatSalary,
  postedLabel,
  SENIORITY_LABELS,
  STATUS_LABELS,
  WORK_MODE_LABELS,
} from '../format';

interface JobDetailProps {
  job: JobPosting;
  /** `drawer` slides over the index; `page` is the standalone `/asset/:id` view. */
  variant?: 'drawer' | 'page';
  onClose: () => void;
  onDelete: (job: JobPosting) => void;
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Last-resort copy for browsers that deny the async clipboard API. */
function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();

  let copied = false;

  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  area.remove();

  return copied;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Clipboard timed out')), 1500),
      ),
    ]);

    return true;
  } catch {
    return legacyCopy(text);
  }
}

/** Copies the posting's stable `/asset/:id` link. */
function CopyLinkButton({ job }: { job: JobPosting }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);

    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    const url = `${window.location.origin}${jobAssetPath(job.id)}`;

    if (await writeClipboard(url)) {
      setCopied(true);
    } else {
      try {
        window.prompt('Copy this link', url);
      } catch {
        // Sandboxed pages can forbid prompt(); the button just stays put.
      }
    }
  }

  return (
    <button type="button" className="link-button" onClick={copy}>
      {copied ? 'Copied ✓' : 'Copy link'}
    </button>
  );
}

export function JobDetail({
  job,
  variant = 'drawer',
  onClose,
  onDelete,
}: JobDetailProps) {
  const isPage = variant === 'page';

  useEffect(() => {
    if (isPage) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isPage, onClose]);

  const paragraphs = (job.description ?? '')
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  const body = (
    <>
      <header className="drawer__head">
        <div className="job-card__logo job-card__logo--large" aria-hidden="true">
          {companyInitials(job.company)}
        </div>
        <div className="drawer__titles">
          <h2>{job.title}</h2>
          <p>{job.company ?? 'Company not listed'}</p>
        </div>
        {isPage ? (
          <CopyLinkButton job={job} />
        ) : (
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close job details"
          >
            ✕
          </button>
        )}
      </header>

      <div className="drawer__salary">
        <strong>{formatSalary(job)}</strong>
        <div className="job-card__meta">
          <span className={`badge badge--${job.work_mode}`}>
            {WORK_MODE_LABELS[job.work_mode]}
          </span>
          <span className="badge">
            {EMPLOYMENT_LABELS[job.employment_type]}
          </span>
          <span className="badge">{SENIORITY_LABELS[job.seniority]}</span>
          {job.status !== 'active' ? (
            <span className={`badge badge--status-${job.status}`}>
              {STATUS_LABELS[job.status]}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="detail-grid">
        <DetailRow label="Location">{formatLocation(job)}</DetailRow>
        <DetailRow label="Source">{job.source}</DetailRow>
        <DetailRow label="Posted">
          {job.posted_at ? formatDate(job.posted_at) : 'Not stated'}
        </DetailRow>
        <DetailRow label="Captured">{formatDate(job.captured_at)}</DetailRow>
        <DetailRow label="Expires">
          {job.expires_at ? formatDate(job.expires_at) : 'Not stated'}
        </DetailRow>
        <DetailRow label="External ID">
          {job.external_id ?? 'Not stated'}
        </DetailRow>
      </dl>

      {job.skills.length > 0 ? (
        <section className="drawer__section">
          <h3>Skills</h3>
          <ul className="chips">
            {job.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="drawer__section">
        <h3>Description</h3>
        {paragraphs.length > 0 ? (
          <div className="prose">
            {paragraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
        ) : (
          <p className="muted">No description was captured for this posting.</p>
        )}
      </section>

      <footer className="drawer__foot">
        <a
          className="button"
          href={job.source_url}
          target="_blank"
          rel="noreferrer"
        >
          Open original posting ↗
        </a>
        <span className="muted">{postedLabel(job)}</span>
        <button
          type="button"
          className="button button--danger"
          onClick={() => onDelete(job)}
        >
          Remove from index
        </button>
      </footer>
    </>
  );

  if (isPage) {
    return (
      <article className="job-page card" aria-label={`${job.title} at ${job.company ?? job.source}`}>
        <div className="job-page__bar">
          <a
            className="link-button"
            href="/"
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              event.preventDefault();
              onClose();
            }}
          >
            ← All jobs
          </a>
          <span className="job-page__id" title="Stable asset link">
            {jobAssetPath(job.id)}
          </span>
        </div>
        {body}
      </article>
    );
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${job.title} at ${job.company ?? job.source}`}
        onClick={(event) => event.stopPropagation()}
      >
        {body}
      </aside>
    </div>
  );
}
