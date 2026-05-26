# Wedding Photo Drop

A Rails 8 API + React/Vite app for collecting guest photos/videos at weddings and events.

## Structure

- `api/` — Rails API-only backend, PostgreSQL, Active Storage
- `web/` — React + Vite + TypeScript frontend
- `docs/s3-active-storage-notes.md` — production S3 bucket setup

## Core flows

- Guests upload via `/upload/:upload_token`.
- Admin reviews via `/admin/:admin_token`.
- Public gallery at `/gallery/:upload_token` shows approved uploads only.

## Local setup

```bash
cd api
bundle install
bin/rails db:prepare db:seed
bin/rails server
```

```bash
cd web
npm install
npm run dev
```

Default local API URL is `http://localhost:3000`; configure `web/.env` from `web/.env.example` if needed.

## Checks

```bash
cd api && bin/rails test && bin/rubocop && bin/brakeman --no-pager
cd web && npm run lint && npm run build
```

## Production notes

- Netlify needs the included `web/public/_redirects` for direct QR/deep links.
- Render API should set `DATABASE_URL`, `APP_HOST`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`.
- Production Active Storage uses S3 with a public-read bucket policy. See `docs/s3-active-storage-notes.md` for bucket policy, CORS, and IAM setup.
