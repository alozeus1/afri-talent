# PR Review Checklist

## Scope

- PR solves one coherent problem.
- Unrelated dirty files are not included.
- Product behavior matches the ticket and acceptance criteria.

## Correctness

- Backend contracts and frontend calls agree.
- Auth and role checks are enforced server-side.
- Loading, empty, error, and success states are handled.
- Data migrations are safe and approved when required.

## Tests

- Relevant unit/API tests are added or updated.
- Relevant Playwright coverage is added or updated for user-facing flows.
- Local commands and CI status are documented in the PR.

## Security

- No secrets or `.env` files are included.
- File upload, auth, billing, verification, and AI changes have explicit review.
- Logs do not expose sensitive user data.

## Operations

- Deployment and rollback notes are included when behavior affects staging or
  production.
- Terraform, IAM, secrets, and migrations have human approval noted when
  applicable.
