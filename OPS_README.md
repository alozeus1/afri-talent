# AfriTalent Operations Guide

## Logging

### Overview

The backend uses **Pino** for structured JSON logging, providing:
- High-performance logging
- Structured JSON output for log aggregation
- Request correlation IDs
- Automatic sensitive data redaction

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Application errors, exceptions |
| `warn` | Warnings, deprecations |
| `info` | Important events (startup, requests) |
| `debug` | Detailed debugging info |

Set log level via `LOG_LEVEL` environment variable:
```bash
LOG_LEVEL=debug npm run dev
LOG_LEVEL=info npm run start
```

### Log Format

```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "pid": 12345,
  "host": "server-1",
  "requestId": "req_abc123",
  "method": "POST",
  "url": "/api/auth/login",
  "statusCode": 200,
  "responseTime": 45,
  "msg": "POST /api/auth/login completed with 200"
}
```

### Request Correlation

Every request gets a unique `requestId`:
- Generated automatically or uses `x-request-id` header if provided
- Included in all log entries for that request
- Returned in response header `x-request-id`
- Included in error responses

Use for debugging:
```bash
# Find all logs for a specific request
grep "req_abc123" logs/app.log
```

### Sensitive Data Redaction

The following fields are automatically redacted:
- `authorization` headers
- `cookie` headers
- `password` fields
- `token` fields
- `secret` fields

---

## Health Checks

### Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `GET /health` | General health | Database connectivity |
| `GET /ready` | Readiness probe | Database + dependencies |
| `GET /live` | Liveness probe | Process alive |

### Kubernetes Integration

```yaml
# Example k8s deployment
spec:
  containers:
  - name: backend
    livenessProbe:
      httpGet:
        path: /live
        port: 4000
      initialDelaySeconds: 10
      periodSeconds: 15
    readinessProbe:
      httpGet:
        path: /ready
        port: 4000
      initialDelaySeconds: 5
      periodSeconds: 10
```

### Response Examples

**Healthy:**
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Unhealthy:**
```json
{
  "status": "error",
  "db": "disconnected",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Tracking (Sentry)

### Setup

1. Install Sentry:
   ```bash
   npm install @sentry/node
   ```

2. Set environment variable:
   ```bash
   SENTRY_DSN=https://xxx@sentry.io/xxx
   ```

3. Initialize in `server.ts`:
   ```typescript
   import { initSentry, sentryErrorHandler } from "./lib/sentry.js";
   
   // Before routes
   await initSentry();
   
   // After routes, before error handler
   app.use(sentryErrorHandler);
   ```

### Configuration

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry project DSN |
| `NODE_ENV` | Environment tag (production/staging) |

### Features
- Automatic exception capture
- Request context included
- Sensitive data filtered
- Performance tracing (10% sample in production)

---

## Monitoring Recommendations

### Metrics to Track

| Metric | Alert Threshold | Notes |
|--------|-----------------|-------|
| Response time (p99) | > 2s | API latency |
| Error rate | > 1% | 5xx errors |
| Database connections | > 80% pool | Connection exhaustion |
| Memory usage | > 80% | Memory leak detection |
| Health check failures | > 2 consecutive | Service down |

### Recommended Tools

| Purpose | Tool Options |
|---------|-------------|
| Uptime monitoring | UptimeRobot, Pingdom, Better Uptime |
| APM | Sentry, Datadog, New Relic |
| Log aggregation | Railway logs, Papertrail, Datadog |
| Metrics | Prometheus + Grafana, Datadog |

### Alert Configuration

```yaml
# Example alerting rules
alerts:
  - name: High Error Rate
    condition: error_rate > 1% for 5 minutes
    severity: critical
    
  - name: Slow Response Time
    condition: p99_latency > 2000ms for 10 minutes
    severity: warning
    
  - name: Health Check Failed
    condition: health_check_failures > 2
    severity: critical
```

---

## Graceful Shutdown

The server handles shutdown signals properly:

1. **SIGTERM/SIGINT** received
2. Stop accepting new connections
3. Wait for in-flight requests to complete
4. Close database connections
5. Exit cleanly

Timeout: Allow 30 seconds for graceful shutdown in orchestrators.

---

## Troubleshooting

### Common Issues

**Database Connection Failed**
```
Check: /health endpoint returns db: "disconnected"
Solution: Verify DATABASE_URL, check database is running
```

**High Memory Usage**
```
Check: Memory steadily increasing over time
Solution: Check for memory leaks, review query patterns
```

**Slow Requests**
```
Check: Response time increasing
Solution: Review database queries, add indexes, check N+1 queries
```

### Debug Mode

Enable verbose logging:
```bash
LOG_LEVEL=debug NODE_ENV=development npm run dev
```

### Database Debugging

Check Prisma queries:
```bash
DEBUG="prisma:query" npm run dev
```

---

## Runbook

### Deploy New Version

1. Run CI pipeline (lint, test, build)
2. Deploy to staging
3. Verify health checks pass
4. Run smoke tests
5. Deploy to production
6. Monitor error rates for 15 minutes

### Rollback

1. Identify issue in monitoring
2. Trigger rollback in deployment platform
3. Verify health checks pass
4. Investigate root cause

### Database Migration

1. Backup database
2. Run migrations: `npx prisma migrate deploy`
3. Verify application works
4. If issues, restore from backup
