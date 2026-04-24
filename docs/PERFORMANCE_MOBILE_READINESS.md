# AfriTalent Mobile Performance Readiness

## Mission
Improve AfriTalent for low-end mobile devices, unstable networks, and data-sensitive users, with particular focus on search and job discovery flows.

## Audit Summary

### Before this pass
- Jobs search (`/jobs`) was fully client-rendered and fetched after mount.
- Job detail (`/jobs/[slug]`) was fully client-rendered and hydrated the whole page before actions were usable.
- Hero stats on the homepage fetched client-side after paint.
- Header unread counts polled every 30 seconds on every connection type.
- Job cards used default Next.js prefetching, which can over-fetch on long search result lists.
- Pricing used a spinner-first loading state that caused meaningful layout shift when cards arrived.
- There was no global offline or constrained-network guidance.

### Implemented in this pass
- Converted public jobs search to a server-rendered page with a smaller client search shell.
- Converted public job detail to a server-rendered page with a small client-only apply panel.
- Added route loading and error boundaries for jobs search and job detail.
- Added a global network-status banner for offline and low-bandwidth conditions.
- Reduced background polling on constrained connections and when the tab is hidden.
- Disabled eager card-level prefetching on job result links.
- Moved homepage stats to server rendering.
- Tuned hero image delivery for mobile with tighter `sizes` and lower quality.
- Replaced pricing spinner swaps with reserved skeleton cards to eliminate CLS.
- Added Lighthouse CI coverage for `/en`, `/en/pricing`, `/en/jobs`, and `/en/login`.

## Prioritized Fixes Shipped

### P0
- Server-first jobs search render
  - [jobs page](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/app/jobs/page.tsx)
  - [jobs search shell](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/jobs/jobs-search-shell.tsx)
- Server-first job detail render
  - [job detail page](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/app/jobs/[slug]/page.tsx)
  - [job apply panel](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/jobs/job-apply-panel.tsx)

### P1
- Offline and low-bandwidth resilience
  - [network status banner](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/layout/network-status-banner.tsx)
  - [network profile hook](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/lib/network-profile.ts)
- Reduced background network cost
  - [header](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/layout/header.tsx)
- Search interaction cleanup and lower mobile input overhead
  - [job filters](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/jobs/job-filters.tsx)
  - [job card](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/jobs/job-card.tsx)

### P2
- Homepage stat rendering and image tuning
  - [hero stats](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/home/hero-stats.tsx)
  - [home page](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/components/home/home-page.tsx)
- Pricing CLS stabilization
  - [pricing page](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/src/app/pricing/page.tsx)
- Image delivery and platform config
  - [next config](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/next.config.ts)

## Benchmarks

### Architectural before/after
| Surface | Before | After |
|---|---|---|
| Jobs search | Full client page, fetch-after-mount, full-page hydration | Server-rendered results with a small client filter shell |
| Job detail | Full client page, heavy hydration for read-only content | Server-rendered detail with client-only apply actions |
| Homepage stats | Client fetch after paint | Server-rendered stats with graceful fallback |
| Header polling | 30s polling for all users on all network types | Visibility-aware, low-bandwidth-aware polling |
| Pricing load state | Spinner-to-grid swap causing CLS | Skeleton cards reserve layout from first paint |

### Local LHCI averages after changes
Lab environment:
- MacBook local run
- Production frontend build
- Local backend on `http://localhost:4000`
- 2 Lighthouse runs per route

| Route | Perf | A11y | Best Practices | SEO | LCP ms | CLS | TTI ms | TBT ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/en` | 0.915 | 0.96 | 0.96 | 1.00 | 3299 | 0.000 | 3534 | 19 |
| `/en/pricing` | 0.950 | 0.94 | 0.96 | 1.00 | 2963 | 0.000 | 3256 | 35 |
| `/en/jobs` | 0.960 | 0.94 | 0.96 | 1.00 | 2804 | 0.000 | 3041 | 18 |
| `/en/login` | 0.925 | 0.94 | 0.96 | 1.00 | 3249 | 0.000 | 3274 | 28 |

### Remaining watch items
- Home and login LCP are still slightly above the 3200 ms target in local lab runs.
- INP did not produce a Lighthouse lab value in passive page-load audits, so CI keeps it as a non-blocking warning. Real INP should be checked with interactive browser flows and field telemetry.

## Lighthouse CI
- Config: [lighthouserc.json](/Users/ocheme/Desktop/Client-Projects/afri-tech/frontend/lighthouserc.json)
- CI workflow: [ci.yml](/Users/ocheme/Desktop/Client-Projects/afri-tech/.github/workflows/ci.yml)

Routes covered:
- `/en`
- `/en/pricing`
- `/en/jobs`
- `/en/login`

Assertions:
- Performance >= 0.70
- Accessibility >= 0.90
- Best Practices >= 0.90
- SEO >= 0.90
- LCP <= 3200 ms
- CLS <= 0.10
- TTI <= 6000 ms
- TBT <= 300 ms
- INP warning-only until interactive lab coverage is added

## Device and Network Testing Matrix

### Primary devices
- Android low-end: 2 GB RAM, 360x800 viewport
- Android mid-tier: 4 GB RAM, 390x844 viewport
- iPhone SE class: 375x667 viewport
- Desktop baseline: 1440x900 viewport

### Primary network profiles
- Offline
- Slow 3G
- Fast 3G
- 4G
- Save-Data enabled

### Flows to verify
- Homepage first load
- `/en/jobs` first load
- `/en/jobs` filter refinement
- `/en/jobs/[slug]` open from search result
- Apply CTA availability while offline
- Retry from jobs error state
- Pricing first load and interval/region switches

## Recommended Next Iteration
- Add field Web Vitals reporting for LCP, CLS, and INP segmented by country, device memory class, and effective connection type.
- Add interactive Playwright performance scripts so INP has actionable lab coverage instead of passive Lighthouse warnings.
- Tune home/login hero surfaces for sub-3200 ms LCP on low-end Android.
- Add image placeholders or lighter illustrations for non-essential marketing imagery below the fold.
