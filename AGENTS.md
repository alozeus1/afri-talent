# Repository Guidelines

## Project Structure & Module Organization

- `backend/`: Express + Prisma API (TypeScript). Entry: `src/server.ts`. Prisma schema/seed in `prisma/`.
- `frontend/`: Next.js App Router UI (TypeScript). Pages in `src/app`, shared UI in `src/components`.
- `infra/terraform/`: AWS ECS + RDS + CloudFront infrastructure, CI/CD workflows.
- `docs`: Root markdown files describe deployment, security, and ops.

## Build, Test, and Development Commands

Backend:
- `cd backend && npm run dev`: start API with ts-node.
- `cd backend && npm run build`: compile TypeScript to `dist/`.
- `cd backend && npx tsc --noEmit`: typecheck only.
- `cd backend && npx prisma migrate dev`: run migrations.

Frontend:
- `cd frontend && npm run dev`: start Next.js dev server.
- `cd frontend && npm run build`: production build.
- `cd frontend && npm run lint`: run ESLint.
- `cd frontend && npx tsc --noEmit`: typecheck only.

## Coding Style & Naming Conventions

- TypeScript throughout; follow existing patterns and file structure.
- 2‑space indentation in TS/TSX.
- React components use PascalCase; hooks are `useX`.
- Prefer descriptive names (`candidateApplications`, not `data`).

## Testing Guidelines

- No dedicated test suite yet; rely on linting and typechecks.
- CI runs `eslint`, `tsc`, and Terraform validation.

## Commit & Pull Request Guidelines

- Use concise, imperative commit messages (e.g., “Add Terraform plan job”).
- PRs should include a summary, related issue links, and UI screenshots when applicable.
- Keep changes scoped; avoid mixing infra and app changes unless required.

## Security & Configuration Tips

- Never commit `.env` files; use `backend/.env.example` and `frontend/.env.example`.
- For deploys, use GitHub OIDC role from Terraform outputs (see `infra/terraform/README.md`).
