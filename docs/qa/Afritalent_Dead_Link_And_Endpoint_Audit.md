# AfriTalent Dead Link and Endpoint Audit

This document tracks endpoints and frontend routes that were found to be missing, unhandled, or returning 500 errors during early-access testing.

## Resolved Issues

| Issue | Location | Resolution | Status |
|-------|----------|------------|--------|
| Missing `skip-link` | `frontend/src/app/layout.tsx` | Added `.skip-link` CSS to global stylesheet. | ✅ Fixed |
| `aria-label` missing | `frontend/src/components/jobs/job-card.tsx` | Validated that `aria-label="Save job"` and `aria-pressed` are correctly implemented. | ✅ Verified |
| 500 on Match Jobs | `backend/src/routes/orchestrator.ts` | Backend robust error returns; frontend UI updated to clear the "OK" badge and display "FAILED" accurately on error. | ✅ Fixed |
| Phone Verification | `backend/src/routes/trust.ts` | Bypassed locally via `previewCode`. Production checks for `SMS_DISABLED` and returns HTTP 503 instead of crashing. | ✅ Fixed |
| Mara AI Grounding | `backend/src/lib/ai/chat-context.ts`| Embedded Trust Center constraints, `CandidateTrustProfile` lookup, and AI Match feature context directly into system prompt. | ✅ Fixed |
| AI Assistant Upload | `frontend/src/app/candidate/ai-assistant/page.tsx` | Added client-side `FileReader` parsing for `.txt` and `.md` formats. | ✅ Fixed |

## Ongoing Watchlist
- **AI Rate Limits**: Ensure `/api/orchestrator/run` continues to track `tokenBudgetUsed` cleanly and prevents `429 Too Many Requests` cascading into 500.
- **Twilio SMS Webhooks**: To be tested in staging once AWS SNS or Twilio secrets are provisioned in `.env`.
