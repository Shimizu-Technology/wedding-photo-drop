# S3 / Active Storage Notes

This project follows the current Shimizu Rails monorepo pattern seen in AIRE Services and Marianas Open:

- Rails API stores uploads with Active Storage.
- Development/test use local disk storage.
- Production uses the `amazon` Active Storage service.
- S3 credentials are read from environment variables, not Rails credentials.
- Default AWS region is `ap-southeast-2` for Guam/Pacific proximity.
- Production boot raises if S3 env vars are missing.

Required production env vars:

```text
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=wedding-photo-drop-uploads-prod
FRONTEND_URL=https://your-netlify-site.netlify.app
ALLOWED_ORIGINS=https://your-netlify-site.netlify.app
```

Bucket guidance:

- Keep the bucket private.
- Use least-privilege IAM permissions for `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` on the bucket and bucket objects.
- Rails Active Storage generates blob URLs; with S3 in production, those resolve through Rails to signed/private object access rather than exposing a public bucket.
