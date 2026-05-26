# Wedding Photo Drop — AGENTS.md

## Project
Wedding/event guest photo upload MVP for Shimizu Technology. Initial dogfood event is Leon & Kami's wedding.

## Tech Stack
- Monorepo: `api/` + `web/`
- Backend: Rails 8 API-only, PostgreSQL, Active Storage
- Frontend: React + Vite + TypeScript, mobile-first
- Storage: Active Storage local in dev/test, AWS S3 in production
- Hosting target: Render API + Netlify frontend, matching recent Shimizu projects

## Product Shape
- Public guest upload page via private event token/QR link
- Secret admin page via admin token
- Pending upload queue with approve/reject
- Public gallery shows approved media only

## Conventions
- No guest login for MVP
- Use unguessable tokens for event/admin access
- Keep originals private; expose media through Rails blob URLs/presigned S3 in production
- Mobile-first, 44px+ touch targets
- Avoid emojis in UI; use text/SVG where needed
