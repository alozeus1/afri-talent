# AfriTalent Mobile Scaffold (Phase 3)

This Expo scaffold reuses existing AfriTalent APIs and cookie/JWT auth endpoints.

## Quick Start

```bash
cd mobile
npm install
cp .env.example .env
npm run start
```

Set `EXPO_PUBLIC_API_URL` to the backend host reachable from your simulator/device.

## Current Scope

- Candidate sign-in with existing `/api/auth/login`
- Jobs feed from `/api/jobs`
- Job detail preview (in-app)
- Candidate dashboard shell (`/api/auth/me`)

## Next Steps

- Add secure token storage and refresh strategy
- Add push registration to `/api/push/*`
- Add mock interview session UI over `/api/mock-interviews/*`
- Add ATS integration management for employer-facing app variant
