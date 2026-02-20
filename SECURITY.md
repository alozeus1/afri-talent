# AfriTalent Security Hardening Guide

## Overview

This document outlines the security measures implemented for the AfriTalent platform.

## Authentication Security

### JWT Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Algorithm | HS256 | Default jsonwebtoken algorithm |
| Expiry | 7 days (configurable) | Set via `JWT_EXPIRES_IN` |
| Issuer | `afritalent-api` | Validated on verification |
| Audience | `afritalent-app` | Validated on verification |

**Production Requirements:**
- `JWT_SECRET` must be set (app fails to start without it)
- Use minimum 64 characters of random data
- Generate with: `openssl rand -base64 64`

### Token Strategy Decisions

**Current: Stateless JWT in Authorization Header**

| Approach | Pros | Cons |
|----------|------|------|
| **Header (current)** | Simple, stateless, works with mobile | Requires secure storage on client |
| Cookie | HttpOnly prevents XSS | Requires CSRF protection, same-domain only |

**Recommendation:** Keep header-based for API flexibility. Frontend should store in memory or secure storage, not localStorage.

### Rate Limiting

| Endpoint | Window | Max Requests | Purpose |
|----------|--------|--------------|---------|
| `/api/auth/register` | 1 hour | 5 | Prevent mass account creation |
| `/api/auth/login` | 15 min | 10 | Prevent brute force attacks |
| General API | 15 min | 100 | Prevent API abuse |
| Health check | N/A | Unlimited | Monitoring systems |

## Input Validation

### Zod Schema Enforcement

All request payloads are validated using Zod schemas:

| Endpoint | Schema | Key Validations |
|----------|--------|-----------------|
| `POST /api/auth/register` | `registerSchema` | Email format, password strength, max lengths |
| `POST /api/auth/login` | `loginSchema` | Email format, password max length |
| `POST /api/jobs` | `createJobSchema` | Required fields, min lengths |
| `POST /api/applications` | `applySchema` | UUID format, URL format |

### Password Requirements
- Minimum 8 characters
- Maximum 128 characters
- Must contain: uppercase, lowercase, number
- Hashed with bcrypt (cost factor 10)

### String Sanitization
- Control characters stripped from all inputs
- Email addresses normalized to lowercase
- String fields trimmed and length-limited

## HTTP Security Headers

Implemented via Helmet.js:

| Header | Value | Purpose |
|--------|-------|---------|
| `Content-Security-Policy` | Restrictive | Prevent XSS, injection |
| `Strict-Transport-Security` | max-age=31536000 | Force HTTPS |
| `X-Content-Type-Options` | nosniff | Prevent MIME sniffing |
| `X-Frame-Options` | DENY | Prevent clickjacking |
| `X-XSS-Protection` | 1; mode=block | XSS filter (legacy browsers) |
| `Referrer-Policy` | strict-origin | Limit referrer info |

## CORS Configuration

### Development
- Allows requests from `http://localhost:3000`
- Allows requests without origin (curl, mobile apps)

### Production
- Strict origin checking against `FRONTEND_URL`
- Rejects requests from unlisted origins
- Credentials allowed for authenticated requests
- 24-hour preflight cache

### Allowed Methods
`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `OPTIONS`

### Allowed Headers
`Content-Type`, `Authorization`

## Body Parsing Limits

| Type | Limit | Purpose |
|------|-------|---------|
| JSON | 10kb | Prevent memory exhaustion |
| URL-encoded | 10kb | Prevent memory exhaustion |

## Security Checklist

### Before Production

- [ ] Set strong `JWT_SECRET` (64+ random characters)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `FRONTEND_URL` to exact production domain
- [ ] Enable HTTPS on all endpoints
- [ ] Enable database SSL (`?sslmode=require`)
- [ ] Review and tighten CSP if needed
- [ ] Set up monitoring/alerting for rate limit hits
- [ ] Configure log aggregation for security events

### Ongoing

- [ ] Rotate `JWT_SECRET` periodically (invalidates all tokens)
- [ ] Monitor for unusual auth patterns
- [ ] Keep dependencies updated (`npm audit`)
- [ ] Review access logs regularly

## Known Limitations

1. **No refresh tokens**: Current implementation uses long-lived access tokens. Consider adding refresh token flow for enhanced security.

2. **No account lockout**: Rate limiting helps, but consider adding temporary lockout after N failed attempts.

3. **No password reset**: Implement with secure token + email verification when needed.

4. **No MFA**: Consider adding TOTP/SMS verification for admin accounts.

## Risk Notes

| Risk | Severity | Mitigation |
|------|----------|------------|
| JWT secret leak | High | Use env vars, rotate periodically |
| Brute force login | Medium | Rate limiting implemented |
| Mass registration | Medium | Strict rate limiting implemented |
| XSS via API | Low | CSP headers, input sanitization |
| SQL injection | Low | Prisma parameterized queries |

## Incident Response

1. **Suspected credential leak**: Rotate `JWT_SECRET` immediately (invalidates all sessions)
2. **Brute force detected**: IP can be blocked at infrastructure level
3. **Data breach**: Follow applicable data protection regulations
