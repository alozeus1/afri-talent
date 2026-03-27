#!/bin/sh
set -eu

if [ "${RUN_DB_MIGRATIONS:-1}" = "1" ]; then
  echo "Running Prisma migrations..."
  npx prisma migrate deploy
fi

exec node --import ./dist/instrument.js dist/server.js
