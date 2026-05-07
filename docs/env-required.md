# Required Environment Variables

This file lists variables needed for controlled early access. Never commit real secrets.

## Backend

Core:
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `FRONTEND_URL`
- `ALLOWED_ORIGIN_REGEX`
- `PORT`
- `NODE_ENV`

OAuth:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`

Email:
- `SES_REGION`
- `SES_FROM_EMAIL`

SMS:
- `AT_USERNAME`
- `AT_API_KEY`
- `AT_SANDBOX`
- `AT_SENDER_ID`
- `SMS_ENABLED`
- `TEST_SMS_OTP_PREVIEW`

Push:
- `WEB_PUSH_VAPID_SUBJECT`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`

Jobs and AI retrieval:
- `ADZUNA_APP_ID`
- `ADZUNA_API_KEY`
- `APIFY_TOKEN`
- `APIFY_JOB_TASKS_JSON`
- `GREENHOUSE_BOARD_TOKENS`
- `LEVER_SITE_TOKENS`
- `WORKABLE_COMPANY_TOKENS`
- `COMPANY_CAREER_SOURCES_JSON`
- `SEMANTIC_EMBEDDING_PROVIDER`
- `SEMANTIC_EMBEDDING_MODEL`
- `SEMANTIC_EMBEDDING_DIMENSIONS`
- `OPENAI_EMBEDDING_ENDPOINT`
- `SEMANTIC_INDEX_ENABLED`

Payments:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_CATALOG_JSON`

## Frontend

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_DEFAULT_LOCALE`
- `NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS`
- `NEXT_PUBLIC_SENTRY_DSN`

## Safe Missing-Config Behavior

- OAuth provider buttons only appear when provider discovery reports configured providers.
- OAuth callback failures return safe error codes and do not expose secrets.
- SMS OTP returns an operational message if production/staging SMS credentials are missing.
- Browser push controls are hidden when VAPID public key discovery fails.
- Email sends use dev logging when `SES_FROM_EMAIL` is absent and record delivery events without exposing reset tokens.
