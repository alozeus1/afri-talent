# Trust Review Runbook

## Who reviews
The admin user (bootstrapped via `BOOTSTRAP_ADMIN_EMAIL`) is responsible for
reviewing the trust queue at launch. Access the queue at `/admin/trust`.

## SLA
- Employer verification submissions: review within 24 hours of receipt.
- Candidate verification submissions: review within 48 hours.
- Abuse reports: review within 4 hours.

## How to access
1. Log in with the admin account.
2. Navigate to `/admin/trust`.
3. The queue shows pending verification artifacts and risk cases.
4. Click "Review" on any artifact to see the submission details and approve/reject.

## Approval criteria
- Employer: Company name matches submitted document. LinkedIn URL (if provided) resolves.
- Candidate: Government-issued ID is legible. Name matches profile.
- Reject if: document is unreadable, name mismatch, or submission appears fraudulent.

## After review
Approved artifacts increment the entity's trust score and may unlock the
VERIFIED badge. Rejected artifacts send a notification to the user.
