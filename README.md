# Wedding Photo Drop

A Rails 8 API + React/Vite app for collecting guest photos/videos at weddings and events.

## Structure

- `api/` — Rails API-only backend, PostgreSQL, Active Storage
- `web/` — React + Vite + TypeScript frontend
- `docs/s3-active-storage-notes.md` — production S3 bucket setup

## Core flows

- Guests upload via `/upload/:upload_token`.
- Admins sign in at `/admin` to manage events, invite reviewers, organize albums, and review uploads.
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

Default local API URL is `http://localhost:3000`. The homepage shows seeded event links on localhost when the Rails API is running. Admin access uses Clerk when configured; without Clerk keys in development, `/admin` uses a local dev admin fallback.

Local env vars you actually need:

```text
# api/.env
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173

# web/.env
VITE_API_URL=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=
```

AWS vars in `api/.env` are optional locally and only needed for S3 smoke tests. Development uploads use local disk storage by default.

For production Clerk auth, set `VITE_CLERK_PUBLISHABLE_KEY` on the frontend and `CLERK_ISSUER` or `CLERK_JWKS_URL` on the API. `CLERK_AUDIENCE` is optional if you configure an audience in Clerk. Set `CLERK_SECRET_KEY` for admin-created Clerk invitations, and `RESEND_API_KEY`/`RESEND_FROM_EMAIL` for invitation emails. The first authenticated user becomes the initial admin.

Admin users can invite admins/reviewers, resend pending invitations, edit roles, remove users, bulk approve/reject/delete uploads, download approved media as a ZIP, delete individual uploads, and create album sections for gallery organization.

## Checks

```bash
cd api && bin/rails test && bin/rubocop && bin/brakeman --no-pager
cd web && npm run lint && npm run build
```

## Production notes

- Netlify needs the included `web/public/_redirects` for direct QR/deep links.
- Render API should set `DATABASE_URL`, `APP_HOST`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`.
- Production Active Storage uses S3 with a public-read bucket policy. See `docs/s3-active-storage-notes.md` for bucket policy, CORS, and IAM setup.
