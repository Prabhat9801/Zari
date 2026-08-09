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

# Strip surrounding quotes and stray whitespace from the connection strings.
#
# In a .env file dotenv removes the quotes for you, so people copy the quoted
# form into a dashboard env var — where they stay literal. Prisma then reports
# `P1013: the scheme is not recognized`, which reads like a malformed host and
# sends you looking in the wrong place entirely.
strip_quotes() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

DATABASE_URL=$(strip_quotes "${DATABASE_URL}")
DIRECT_URL=$(strip_quotes "${DIRECT_URL}")
export DATABASE_URL DIRECT_URL

case "${DIRECT_URL}" in
  postgres://*|postgresql://*) ;;
  "")
    echo "[zari-api] DIRECT_URL is not set. Set it to the Supabase SESSION pooler" >&2
    echo "[zari-api]   (aws-0-<region>.pooler.supabase.com:5432, user postgres.<project-ref>)." >&2
    exit 1
    ;;
  *)
    echo "[zari-api] DIRECT_URL does not start with postgresql:// — check for stray quotes." >&2
    exit 1
    ;;
esac

echo "[zari-api] Applying database migrations..."
npx prisma migrate deploy

# Seeds the ops-managed cost rules on an empty database only. Safe to re-run.
if [ "${RUN_SEED_ON_START}" = "true" ]; then
  echo "[zari-api] Seeding reference data..."
  node dist/seed.js || echo "[zari-api] Seed skipped (already populated)"
fi

echo "[zari-api] Starting API..."
exec "$@"
