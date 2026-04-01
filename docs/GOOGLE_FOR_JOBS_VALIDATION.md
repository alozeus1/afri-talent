# Google For Jobs Validation Guide

Use this checklist after deploying job-page schema changes.

## 1) Confirm a published, active job emits JSON-LD

1. Open an active job detail page (`/jobs/{slug}`).
2. Inspect the page source or DOM and confirm there is a `script[type="application/ld+json"]`.
3. Verify required fields are present:
   - `@type: "JobPosting"`
   - `title`
   - `description`
   - `datePosted`
   - `employmentType`
   - `hiringOrganization`
   - `jobLocation` (or `jobLocationType: TELECOMMUTE` for remote)
   - `applicantLocationRequirements` (when available)
   - `baseSalary` (when salary data exists)

## 2) Validate with Google Rich Results Test

1. Go to: https://search.google.com/test/rich-results
2. Test the full job URL.
3. Confirm Job Posting is detected and there are no critical errors.
4. Resolve warnings where possible (non-blocking warnings may still appear).

## 3) Confirm expired jobs do NOT emit active job schema

1. Use a job with `isExpired=true` or a `validThrough` date in the past.
2. Open the job detail page.
3. Confirm no JobPosting JSON-LD is present.

## 4) Post-deploy monitoring

1. In Google Search Console, inspect a sample job URL.
2. Check the Job Posting enhancement report for new issues.
3. Re-test at least one job per market/region if job location requirements differ.
