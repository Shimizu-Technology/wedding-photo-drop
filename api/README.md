# Wedding Photo Drop API

Rails 8 API-only backend for event uploads, moderation, and gallery responses.

## Setup

```bash
bundle install
cp .env.example .env
bin/rails db:prepare db:seed
bin/rails server
```

Seed output prints guest upload, gallery, and admin paths.

## Test and quality checks

```bash
bin/rails test
bin/rubocop
bin/brakeman --no-pager
```

## Upload constraints

- Max 20 files/request
- Max 250MB/file
- Max 500MB/request
- Allowed types: JPEG, PNG, HEIC/HEIF, WebP, MP4, MOV
- Upload and event rate limits are enforced with Rack::Attack

## Production configuration

Required env vars are documented in `.env.example` and `../docs/s3-active-storage-notes.md`.

Production uses the `amazon_public` Active Storage service with a public-read bucket policy and returns public S3/CDN media URLs in API responses. Do not use this bucket pattern for sensitive files.
