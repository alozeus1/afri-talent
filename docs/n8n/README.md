# n8n workflows for AfriTalent

AfriTalent uses a self-hosted n8n instance (`https://n8n.maralito.uk`) for
human-facing notifications that need no app UI of their own: approval emails,
support-ticket routing, review moderation alerts and job-crawler health alerts.

The backend is always the source of truth. n8n only receives events and sends
email. If n8n is down or unconfigured, the backend keeps working: every emitter
is best-effort, non-fatal, and a silent no-op when its URL env var is empty.

| Workflow (n8n name) | n8n ID | Status | Webhook path (POST) | Backend env var |
|---|---|---|---|---|
| AfriTalent Approval Broker | `e0FlvlnW9OCNuxSw` | Published (pre-existing) | `/webhook/afritalent-approval-requested` (+ GET `/webhook/afritalent-approval-decision`) | `N8N_APPROVAL_WEBHOOK_URL`, `N8N_APPROVAL_HMAC_SECRET` |
| Route AfriTalent support and review events | `97LNmRvpqVqCjW6s` | **Unpublished, founder review** | `/webhook/afritalent-support-events` | `N8N_SUPPORT_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` |
| Alert on AfriTalent job crawler health | `4uEKRCgu2pUxcCxi` | **Unpublished, founder review** | `/webhook/afritalent-crawler-health` | `N8N_OPS_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` |

Production URL = `https://n8n.maralito.uk` + path. The `/webhook-test/...`
variant only works while the workflow is open in the editor with "Listen for
test event".

---

## 1. Approval Broker (existing, already wired)

Emitter: `backend/src/lib/notifications/approvalWebhook.ts`.
Callback: `backend/src/routes/n8n-webhooks.ts` (`POST /api/webhooks/n8n/approval`).

When a LangGraph run pauses for a human gate, the backend POSTs a PII-free
`approval_requested` event (ids only), signed with
`x-afritalent-signature: hex(HMAC-SHA256(rawBody, N8N_APPROVAL_HMAC_SECRET))`.
n8n emails the operator a console deep link (approval stays behind TOTP) and a
one-click Deny link. The Deny link hits n8n, which calls back
`POST /api/webhooks/n8n/approval` with `{ token }`. The backend verifies the
signed, expiring, single-use token, so n8n never holds approval power.

Known gaps in the live workflow. These are not changed here because the
workflow is live and owned by the founder:

- The workflow does not verify `x-afritalent-signature`. n8n has no
  credential-backed HMAC verifier, and putting the secret into a Crypto node
  text field would leak it on export. Risk is low: the payload carries no PII,
  and anyone who forges a request can only make the operator receive an email.
  To close the gap, switch it to the JWT scheme below.
- The Deny link is a plain GET. Email security scanners that prefetch links
  could trigger a deny. The deny itself is safe (it only blocks an action), but
  consider a confirm page (GET shows a button, POST performs the deny), or
  enable the Webhook option `ignoreBots`.
- The callback URL is hard-coded to `https://api.staging.afri-talent.com`.
  Update it on "Callback Deny to AfriTalent" when the API domain changes.

---

## Auth for the new workflows: short-lived JWT (`N8N_WEBHOOK_SECRET`)

The two new webhooks use the Webhook node's built-in **JWT Auth**, so the
secret lives in an encrypted n8n credential and never in a node field.

**n8n side (founder, one time):** create a credential of type **JWT Auth**
(`jwtAuth`): Key Type = *Passphrase*, Secret = the value of
`N8N_WEBHOOK_SECRET`, Algorithm = **HS256**. Bind it on the trigger node of
both workflows. Its placeholder name is
`AfriTalent backend JWT (N8N_WEBHOOK_SECRET)`.

**Backend side (the contract):** for every POST, mint a fresh JWT and send it as
`Authorization: Bearer <jwt>`:

```ts
import jwt from "jsonwebtoken";

const token = jwt.sign(
  { iss: "afritalent-backend", kind: payload.kind },
  process.env.N8N_WEBHOOK_SECRET!,
  { algorithm: "HS256", expiresIn: 60 }, // short-lived: limits replay
);
await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(5000),
});
```

n8n rejects a missing, invalid or expired token with 403 before any node runs.
Treat any non-2xx as a non-fatal failure: log a warning and record an ops
event, the same as `emitApprovalRequested`. Never block the user request on
n8n. Fire it with `void`.

Response codes from the new workflows:

| Code | Meaning |
|---|---|
| 202 | Accepted. Emails are sent after the response, with 3 retries 5 s apart. |
| 400 | `{ "error": "validation_error", ... }`: unknown `kind` or missing required fields |
| 403 | JWT missing, invalid or expired |
| 404 | Workflow not published (or wrong path) |

Delivery failures after the 202 trigger the workflow's own Error Trigger. That
sends the operator an email with the execution link.

---

## 2. Route AfriTalent support and review events (`97LNmRvpqVqCjW6s`)

Purpose: the contact-us form and leave-a-review flow should reach a human. The
backend persists the ticket or review first, then emits.

### `support_ticket_created`

Required: `kind`, `ticketId`, `email`, `message`. Everything else is optional.

```jsonc
{
  "kind": "support_ticket_created",
  "ticketId": "ckx...",              // required, DB id
  "reference": "AT-1042",            // optional human-readable ref (falls back to ticketId)
  "category": "billing",             // general | account | billing | technical | employer | abuse | other
  "subject": "Cannot upgrade",
  "message": "The checkout page fails.",  // required
  "name": "Ada Obi",
  "email": "ada@example.com",        // required, used as reply-to and ack recipient
  "locale": "en",
  "userId": null,                    // set when the submitter is logged in
  "role": "CANDIDATE",               // CANDIDATE | EMPLOYER | ADMIN | null (visitor)
  "adminUrl": "https://afri-talent.com/admin/support?ticket=ckx...",
  "ackRequested": true,              // false = backend already sent its own acknowledgement
  "createdAt": "2026-10-14T12:00:00.000Z"
}
```

Flow: 202, then a plain-text email to the support inbox with reply-to set to
the customer, then (unless `ackRequested === false`) a plain-text
acknowledgement with the reference sent to the customer. Plain text is used on
purpose, so user-supplied text cannot inject HTML into the emails.

Set `ackRequested: false` if the backend sends its own localized
acknowledgement (preferred long-term, because the n8n ack is English only).

### `review_submitted`

Required: `kind`, `reviewId`.

```jsonc
{
  "kind": "review_submitted",
  "reviewId": "ckr...",
  "targetType": "platform",          // platform | company
  "targetName": "AfriTalent",
  "rating": 5,
  "title": "Great experience",
  "body": "Found a remote role in 3 weeks.",
  "authorName": "Kwame A.",          // display name only; do not send author email
  "status": "PENDING",
  "adminUrl": "https://afri-talent.com/admin/reviews?id=ckr...",
  "createdAt": "2026-10-14T12:00:00.000Z"
}
```

Flow: 202, then an email to the moderator with the admin deep link.

---

## 3. Alert on AfriTalent job crawler health (`4uEKRCgu2pUxcCxi`)

Purpose: notice a broken job source within one cycle, not when the board goes
stale. The aggregator cron (`backend/src/workers/aggregator-cron.ts`) already
tracks `aggregator:consecutive_failures` and
`aggregator:consecutive_zero_results` in Redis. It should emit **only on state
transitions** (healthy → failing, healthy → zero_results, degraded → recovered),
deduped in Redis, so n8n does not need its own state.

```jsonc
{
  "kind": "crawler_health_alert",
  "status": "failing",               // failing | zero_results | recovered (required)
  "consecutiveFailures": 3,
  "consecutiveZeroResults": 0,
  "failingSources": [
    { "source": "GREENHOUSE", "error": "HTTP 503", "consecutiveFailures": 3 }
  ],
  "jobsIngested": 0,
  "lastCycleAt": "2026-10-14T08:00:00.000Z",
  "lastSuccessfulIngestionAt": "2026-10-13T08:00:00.000Z",
  "adminUrl": "https://afri-talent.com/admin/aggregator",
  "emittedAt": "2026-10-14T08:00:05.000Z"
}
```

Suggested threshold: emit `failing` when consecutive failures reach 3 (the same
threshold the ATS connection health uses) or when a critical source
(`GREENHOUSE`, `LEVER`, `WORKABLE`) fails twice in a row.

---

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `N8N_APPROVAL_WEBHOOK_URL` | backend | Approval Broker production URL (existing) |
| `N8N_APPROVAL_HMAC_SECRET` | backend | Signs approval events + deny tokens (existing) |
| `APP_ADMIN_URL` | backend | Base for admin deep links in emails (existing) |
| `N8N_SUPPORT_WEBHOOK_URL` | backend | `https://n8n.maralito.uk/webhook/afritalent-support-events` |
| `N8N_OPS_WEBHOOK_URL` | backend | `https://n8n.maralito.uk/webhook/afritalent-crawler-health` |
| `N8N_WEBHOOK_SECRET` | backend + n8n JWT Auth credential | HS256 secret for the bearer JWT. Required when either URL above is set. Generate with `openssl rand -base64 48` |

Empty URL = feature off (emitter no-ops). Secrets go in AWS SSM / GitHub
Secrets for deployed environments, never in Variables or the repo.

## Founder go-live checklist

1. In n8n, create the **JWT Auth** credential (see above) and bind it on
   "Receive support event" and "Receive crawler health alert".
2. Open every email node and confirm the **SMTP account** credential and the
   addresses. The default inbox is the founder Gmail; switch to
   `support@afri-talent.com` once that mailbox exists. The SMTP account must be
   allowed to send as the `From` address.
3. Publish both workflows.
4. Set `N8N_SUPPORT_WEBHOOK_URL`, `N8N_OPS_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`
   in the backend environment.
5. Smoke test: submit the contact form on staging and confirm the support email
   plus the acknowledgement arrive. Check n8n Executions for both workflows.

## Not built (and why)

- **WhatsApp/Telegram bot bridge** (`BOT_BRIDGE_OUTBOUND_URL`): deferred by
  founder instruction. Bot verification is out of scope for now.
- **Job crawling in n8n:** crawling stays in the backend aggregator, which
  already handles dedup, Africa-signal filtering and upserts. n8n only alerts on
  its health.
- **Shared error workflow:** each new workflow has its own Error Trigger, because
  a shared `errorWorkflow` setting must point at a *published* workflow, and
  these are intentionally left unpublished.
