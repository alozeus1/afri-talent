# Security Review Checklist

Use this checklist before PR approval for auth, verification, file upload,
payments, AI, and infrastructure changes.

## Auth And Authorization

- JWT cookies are HttpOnly, Secure in deployed environments, and scoped safely.
- API routes enforce role-based access server-side.
- Candidate, employer, and admin data cannot be read across tenants.
- OAuth callback state validation is preserved.

## Input And API Validation

- Zod or equivalent validation exists for request bodies.
- Optional fields accept only intended null/empty states.
- Search/filter inputs are bounded.
- Error responses do not leak secrets or stack traces.

## File Uploads

- Signed upload headers match backend signing configuration.
- Accepted file types and sizes are bounded.
- Uploaded verification documents are not publicly exposed.
- Malware scanning or manual review gaps are documented.

## Abuse And Trust

- Rate limits protect auth, AI, matching, verification, and messaging.
- Scam reporting and suspicious conversation guidance remain visible.
- Automated verification produces evidence for admin review, not silent
  approval of sensitive claims.

## Secrets And Logging

- No `.env` or secret material is committed.
- Logs do not include raw resumes, credentials, tokens, or verification files.
- Secrets come from environment variables or Secrets Manager.

## Infrastructure

- IAM changes are least-privilege and human-approved.
- Terraform applies are human-approved.
- Production-impacting changes have rollback notes.
