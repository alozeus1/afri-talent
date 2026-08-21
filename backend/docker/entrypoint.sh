#!/bin/sh
set -eu

if [ "${RUN_DB_MIGRATIONS:-1}" = "1" ]; then
  # Recover the staging migration ledger from the earlier failed trust rollout.
  node ./node_modules/prisma/build/index.js db execute --stdin <<'SQL' >/dev/null 2>&1 || true
UPDATE "_prisma_migrations"
SET "rolled_back_at" = NOW(),
    "logs" = COALESCE("logs", '') || E'\nAuto-resolved by backend entrypoint after trust migration repair.'
WHERE "migration_name" = '20260329003000_add_candidate_authenticity_layer'
  AND "finished_at" IS NULL
  AND "rolled_back_at" IS NULL;
SQL
  echo "Running Prisma migrations..."
  node ./node_modules/prisma/build/index.js migrate deploy
fi

exec node --import ./dist/instrument.js dist/server.js
