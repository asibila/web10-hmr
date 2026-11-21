# Web10

Web10 is a private, deduplicated, faceted search index of job postings captured
from the open web.

## Local OpenCode instance

URL: http://127.0.0.1:4096/api/session

The desktop background service on `http://127.0.0.1:28894` also works. Its
password is in `~/.config/opencode/service.json`.

## Chrome extension ../chrome-extension

Sibling folder at `C:\Moje\Web10\chrome-extension`. Load it unpacked and click
**Save job** on an individual job ad.

## Web10 Jobs
- API: apps/api (NestJS + PostgreSQL)
- UI: apps/web (React + Vite, SSR through the API)
- Contract: packages/shared (`JobPosting`, search types, enums)
- Database: `DATABASE_URL` in apps/api/.env. The schema is created at boot.

## GIT

Do not git add or git commit.
