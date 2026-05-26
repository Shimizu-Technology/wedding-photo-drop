# S3 / Active Storage Notes

This project uses Rails Active Storage for event media. Development/test use local disk storage. Production uses the `amazon_public` Active Storage service backed by a public-read S3 bucket policy so gallery/admin media URLs can be served directly from S3 or a CDN.

## Required production env vars

```text
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-southeast-2
AWS_S3_BUCKET=wedding-photo-drop-uploads-prod
FRONTEND_URL=https://your-netlify-site.netlify.app
ALLOWED_ORIGINS=https://your-netlify-site.netlify.app
APP_HOST=your-render-api-host.onrender.com
DATABASE_URL=postgres://...
```

Optional:

```text
AWS_PUBLIC_HOST=https://your-cloudfront-or-custom-media-domain.example.com
UPLOAD_RATE_LIMIT_PER_MINUTE=12
EVENT_UPLOAD_RATE_LIMIT_PER_MINUTE=60
```

If `AWS_PUBLIC_HOST` is unset, API responses expose direct S3 virtual-hosted URLs:

```text
https://{bucket}.s3.{region}.amazonaws.com/{active_storage_blob_key}
```

## Bucket configuration

For the MVP's public gallery behavior, configure the bucket for public object reads:

1. Disable “Block all public access” for the bucket.
2. Keep Object Ownership ACLs disabled unless you have a legacy reason to enable ACLs. The Rails service does not rely on object ACLs.
3. Add this bucket policy, replacing the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::wedding-photo-drop-uploads-prod/*"
    }
  ]
}
```

4. Configure CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## IAM permissions

Use least-privilege IAM credentials for Rails:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WeddingPhotoDropS3Access",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::wedding-photo-drop-uploads-prod",
        "arn:aws:s3:::wedding-photo-drop-uploads-prod/*"
      ]
    }
  ]
}
```

## Notes

- Uploaded files are still moderated by the app. The gallery API returns approved uploads only, but public S3 object URLs are not access-controlled once known.
- Do not use this public bucket pattern for sensitive documents.
- Production boot raises if required S3 env vars are missing.
