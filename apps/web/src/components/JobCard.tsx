import { jobAssetPath, type JobPosting } from '@web10/shared';
import {
  companyInitials,
  EMPLOYMENT_LABELS,
  formatLocation,
  formatSalary,
  postedLabel,
  SENIORITY_LABELS,
  STATUS_LABELS,
  WORK_MODE_LABELS,
} from '../format';

interface JobCardProps {
  job: JobPosting;
  onSelect: (job: JobPosting) => void;
}

export function JobCard({ job, onSelect }: JobCardProps) {
  return (
    <a
      className="job-card"
      href={jobAssetPath(job.id)}
      aria-label={`Open ${job.title} at ${job.company ?? job.source}`}
      onClick={(event) => {
        // Let modified clicks open the stable link in a new tab like any anchor.
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
        onSelect(job);
      }}
    >
      <div className="job-card__logo" aria-hidden="true">
        {companyInitials(job.company)}
      </div>

      <div className="job-card__body">
        <div className="job-card__head">
          <div className="job-card__identity">
            <h2 className="job-card__title">{job.title}</h2>
            <p className="job-card__company">
              {job.company ?? 'Company not listed'}
            </p>
          </div>
          <span className="job-card__salary">{formatSalary(job)}</span>
        </div>

        <div className="job-card__meta">
          <span className="meta">{formatLocation(job)}</span>
          <span className={`badge badge--${job.work_mode}`}>
            {WORK_MODE_LABELS[job.work_mode]}
          </span>
          <span className="badge">
            {EMPLOYMENT_LABELS[job.employment_type]}
          </span>
          <span className="badge">{SENIORITY_LABELS[job.seniority]}</span>
        </div>

        {job.skills.length > 0 ? (
          <ul className="chips" aria-label="Skills">
            {job.skills.slice(0, 6).map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
            {job.skills.length > 6 ? (
              <li className="chips__more">+{job.skills.length - 6}</li>
            ) : null}
          </ul>
        ) : null}

        <div className="job-card__foot">
          <span className="job-card__source">{job.source}</span>
          <span>{postedLabel(job)}</span>
          {job.status !== 'active' ? (
            <span className={`badge badge--status-${job.status}`}>
              {STATUS_LABELS[job.status]}
            </span>
          ) : null}
        </div>
      </div>
    </a>
  );
}
