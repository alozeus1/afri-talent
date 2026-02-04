# AfriTalent Performance & Scaling Guide

## Database Indexes

### Added Indexes (Prisma Schema)

The following indexes have been added to optimize query performance:

#### User Table
| Index | Purpose |
|-------|---------|
| `role` | Filter users by role (admin dashboard) |
| `createdAt` | Sort users by registration date |

#### Job Table
| Index | Purpose |
|-------|---------|
| `status` | Filter by job status |
| `status, publishedAt DESC` | List published jobs sorted by date |
| `employerId` | List jobs by employer |
| `location` | Filter jobs by location |
| `type` | Filter jobs by type (full-time, etc.) |
| `seniority` | Filter jobs by seniority level |

#### Application Table
| Index | Purpose |
|-------|---------|
| `jobId, candidateId` (unique) | Prevent duplicate applications |
| `jobId` | List applications for a job |
| `candidateId` | List candidate's applications |
| `status` | Filter by application status |
| `createdAt DESC` | Sort applications by date |

#### Resource Table
| Index | Purpose |
|-------|---------|
| `published` | Filter published resources |
| `published, publishedAt DESC` | List published resources sorted by date |
| `category` | Filter resources by category |

#### AdminReview Table
| Index | Purpose |
|-------|---------|
| `reviewerId` | List reviews by admin |
| `targetType` | Filter reviews by type |
| `createdAt DESC` | Sort reviews by date |

### Applying Indexes

```bash
# Generate migration for indexes
cd backend
npx prisma migrate dev --name add_performance_indexes

# In production, use deploy
npx prisma migrate deploy
```

---

## Pagination

All list endpoints implement pagination:

| Endpoint | Default Limit | Max Limit |
|----------|---------------|-----------|
| `GET /api/jobs` | 10 | 100 |
| `GET /api/resources` | 10 | 100 |
| `GET /api/admin/jobs` | 20 | 100 |
| `GET /api/admin/users` | 20 | 100 |
| `GET /api/admin/resources` | 20 | 100 |
| `GET /api/admin/reviews` | 20 | 100 |

### Usage

```bash
# Get page 2 with 20 items
GET /api/jobs?page=2&limit=20
```

### Response Format

```json
{
  "jobs": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Frontend Optimizations

### Image Optimization

All images use Next.js `<Image>` component:

- **Automatic optimization**: WebP/AVIF conversion
- **Lazy loading**: Images load on scroll
- **Responsive sizing**: Appropriate sizes per viewport
- **Priority loading**: Above-the-fold images load first

### Configuration

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};
```

---

## Caching Strategy (Design Only)

### Recommended Redis Cache Candidates

| Data | TTL | Invalidation |
|------|-----|--------------|
| Job listings (public) | 5 min | On job create/update/delete |
| Resource listings | 10 min | On resource publish/unpublish |
| Categories list | 1 hour | On resource create |
| Admin stats | 1 min | On any data change |
| User session | Match JWT expiry | On logout |

### Implementation Notes

When Redis is needed:
1. Install: `npm install ioredis`
2. Create cache service with pattern: `cache:${entity}:${id}`
3. Use cache-aside pattern (check cache → miss → DB → populate cache)
4. Implement pub/sub for cache invalidation in multi-instance deployments

### Cache Key Patterns

```
cache:jobs:list:status=PUBLISHED:page=1:limit=10
cache:jobs:detail:slug={slug}
cache:resources:list:category={cat}:page=1
cache:resources:detail:slug={slug}
cache:stats:admin
```

---

## Scaling Strategy

### Current Architecture (Starter)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Vercel    │────▶│   Railway   │────▶│  PostgreSQL │
│  (Frontend) │     │  (Backend)  │     │  (Managed)  │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Scaled Architecture (Growth)

```
                    ┌─────────────┐
                    │     CDN     │
                    │  (Vercel)   │
                    └──────┬──────┘
                           │
┌─────────────┐     ┌──────┴──────┐     ┌─────────────┐
│   Vercel    │────▶│    Load     │────▶│   Backend   │
│  (Frontend) │     │  Balancer   │     │  Instance 1 │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                           │                   │
                    ┌──────┴──────┐     ┌──────┴──────┐
                    │   Backend   │     │    Redis    │
                    │  Instance 2 │     │   (Cache)   │
                    └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  PostgreSQL │
                    │  (Primary)  │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │  Read       │
                    │  Replica    │
                    └─────────────┘
```

### Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| Response time p99 | > 500ms | Add backend instance |
| CPU usage | > 70% sustained | Add backend instance |
| Database connections | > 80% pool | Increase pool or add read replica |
| Memory usage | > 80% | Investigate leaks, increase memory |

### Horizontal Scaling Checklist

Before scaling horizontally:
- [ ] Stateless backend (no in-memory sessions)
- [ ] Database connection pooling configured
- [ ] Rate limiting uses distributed store (Redis)
- [ ] File uploads use object storage (S3/R2)
- [ ] Logs aggregate to central service

---

## Performance Monitoring

### Key Metrics

| Metric | Target | Tool |
|--------|--------|------|
| Time to First Byte (TTFB) | < 200ms | Vercel Analytics |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse |
| API response time (p50) | < 100ms | Application logs |
| API response time (p99) | < 500ms | Application logs |
| Database query time | < 50ms | Prisma logs |

### Prisma Query Logging

Enable in development:
```bash
DEBUG="prisma:query" npm run dev
```

### Performance Testing

Before production:
```bash
# Install k6
brew install k6

# Run load test
k6 run --vus 50 --duration 30s scripts/load-test.js
```

---

## Recommendations Summary

### Immediate (Done)
- [x] Database indexes added
- [x] Pagination on all list endpoints
- [x] Next.js Image optimization
- [x] Standalone build for Docker

### Short-term (When Needed)
- [ ] Add Redis for caching
- [ ] Enable Prisma connection pooling
- [ ] Add read replica for heavy read workloads

### Long-term (At Scale)
- [ ] Implement CDN for static assets
- [ ] Add full-text search (PostgreSQL or Elasticsearch)
- [ ] Consider edge functions for global latency
- [ ] Implement job queue for async tasks
