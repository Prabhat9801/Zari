#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Runs on every container start, before the API boots.
#
# `prisma migrate deploy` applies any pending migrations and is a no-op when
# the database is already up to date, so it is safe to run on every deploy and
# on every replica. It uses DIRECT_URL (port 5432 on Supabase), NOT the pooled
# DATABASE_URL — migrations cannot run through pgbouncer.
# ---------------------------------------------------------------------------

echo "[zari-api] Applying database migrations..."
npx prisma migrate deploy

# Seeds the ops-managed cost rules on an empty database only. Safe to re-run.
if [ "${RUN_SEED_ON_START}" = "true" ]; then
  echo "[zari-api] Seeding reference data..."
  node dist/seed.js || echo "[zari-api] Seed skipped (already populated)"
fi

echo "[zari-api] Starting API..."
exec "$@"
