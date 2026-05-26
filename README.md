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
cp .env.example .env
bin/rails db:prepare db:seed
bin/rails server
```

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

Default local API URL is `http://localhost:3000`. The homepage shows seeded event links on localhost when the Rails API is running. Admin access is MVP secret-link based for now; `bin/rails db:seed` prints the admin URL.

Local env vars you actually need:

```text
# api/.env
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173

# web/.env
VITE_API_URL=http://localhost:3000
```

AWS vars in `api/.env` are optional locally and only needed for S3 smoke tests. Development uploads use local disk storage by default.

## Checks

```bash
cd api && bin/rails test && bin/rubocop && bin/brakeman --no-pager
cd web && npm run lint && npm run build
```

## Production notes

- Netlify needs the included `web/public/_redirects` for direct QR/deep links.
- Render API should set `DATABASE_URL`, `APP_HOST`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`.
- Production Active Storage uses S3 with a public-read bucket policy. See `docs/s3-active-storage-notes.md` for bucket policy, CORS, and IAM setup.
