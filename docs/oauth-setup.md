# OAuth Setup

AfriTalent uses backend-managed OAuth exchange with frontend callback handling.

## Google Console

Register these Authorized redirect URIs:

- Local: `http://localhost:3000/auth/callback`
- Staging: `${FRONTEND_URL}/auth/callback`
- Production: `${FRONTEND_URL}/auth/callback`

The backend exchanges the authorization code from `/auth/callback` using the same redirect URI. A mismatch is reported as `OAUTH_CALLBACK_MISMATCH`.

## Required Backend Variables

- `FRONTEND_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Diagnostics

Use `GET /api/auth/oauth/diagnostics` from an internal/admin context to confirm which providers are configured and which callback URLs must be registered. The response intentionally reports booleans only and never returns client secrets.

## User-Facing Failure States

- Missing config: “Google sign-in is not configured for this environment yet.”
- Callback mismatch: “Google rejected this callback URL.”
- Provider unavailable: “Google sign-in is temporarily unavailable.”
- User cancellation: “Google sign-in was cancelled.”
