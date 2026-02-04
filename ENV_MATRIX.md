# Environment Variables Matrix

## Backend Environment Variables

| Variable | Required | Local | Staging | Production | Description |
|----------|----------|-------|---------|------------|-------------|
| `NODE_ENV` | Yes | `development` | `staging` | `production` | Runtime environment |
| `PORT` | Yes | `4000` | `4000` | `4000` | Server port |
| `DATABASE_URL` | Yes | `postgresql://postgres:postgres@localhost:5432/afritalent` | Managed PG URL | Managed PG URL (SSL) | PostgreSQL connection |
| `JWT_SECRET` | Yes | Any string | Random 32+ chars | Random 64+ chars | JWT signing key |
| `JWT_EXPIRES_IN` | No | `7d` | `7d` | `7d` | Token expiration |
| `FRONTEND_URL` | Yes | `http://localhost:3000` | `https://staging.afritalent.com` | `https://afritalent.com` | CORS origin |

## Frontend Environment Variables

| Variable | Required | Local | Staging | Production | Description |
|----------|----------|-------|---------|------------|-------------|
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:4000` | `https://api-staging.afritalent.com` | `https://api.afritalent.com` | Backend API URL |
| `NEXT_PUBLIC_APP_NAME` | No | `AfriTalent` | `AfriTalent (Staging)` | `AfriTalent` | App display name |

## Security Notes

### JWT_SECRET Generation
```bash
# Generate a secure 64-character secret
openssl rand -base64 64

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

### Database URL Format
```
# Local
postgresql://USER:PASSWORD@HOST:PORT/DATABASE

# With SSL (production)
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require

# Supabase format
postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
```

## Platform-Specific Configuration

### Vercel (Frontend)
```
NEXT_PUBLIC_API_URL=https://api.afritalent.com
```

### Railway (Backend)
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<your-generated-secret>
FRONTEND_URL=https://afritalent.com
NODE_ENV=production
PORT=4000
```

### Render (Backend)
```
DATABASE_URL=<managed-postgres-url>
JWT_SECRET=<your-generated-secret>
FRONTEND_URL=https://afritalent.com
NODE_ENV=production
PORT=4000
```

## Secrets Management

| Environment | Recommendation |
|-------------|----------------|
| Local | `.env` file (gitignored) |
| Staging | Platform secrets (Railway/Render/Vercel) |
| Production | Platform secrets + consider Vault/AWS Secrets Manager for scale |

## Validation Checklist

- [ ] All required variables are set
- [ ] No secrets committed to git
- [ ] Database URL tested and working
- [ ] CORS origin matches frontend domain exactly
- [ ] JWT_SECRET is unique per environment
