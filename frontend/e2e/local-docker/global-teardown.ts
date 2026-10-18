/**
 * Purges the accounts and jobs the local-docker journeys create (reserved
 * "e2e-" email prefix) so they never pile up on the public job board.
 * Runs backend/scripts/purge-e2e-data.ts against the stack's local Postgres.
 *
 *   E2E_KEEP_DATA=1      keep the run's data for debugging
 *   E2E_DATABASE_URL=... override the database (default: compose DB on DB_HOST_PORT)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

export default function globalTeardown(): void {
  if (process.env.E2E_KEEP_DATA === "1") return;
  const port = process.env.DB_HOST_PORT ?? "55432";
  const databaseUrl =
    process.env.E2E_DATABASE_URL ??
    `postgresql://postgres:postgres@127.0.0.1:${port}/afritalent`; // secret-scan:allow (local-only dev credentials)
  try {
    execFileSync("npx", ["tsx", "scripts/purge-e2e-data.ts", "--apply"], {
      cwd: path.resolve(__dirname, "../../../backend"),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
      timeout: 120_000,
    });
  } catch (error) {
    console.warn("[e2e teardown] purge failed; run backend/scripts/purge-e2e-data.ts manually:", error);
  }
}
