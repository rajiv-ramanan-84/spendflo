#!/usr/bin/env bash
# Spins up a throwaway Postgres 16, applies Supabase stubs, every migration in
# order, the seed, then the assertions in supabase/tests/verify.sql.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
DIR="$(mktemp -d)"
PORT="${PGPORT_VERIFY:-55432}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUN="runuser -u postgres --"; fi

cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

$RUN "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR" -l "$DIR/log" start -w >/dev/null

PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"
"${PSQL[@]}" -f "$ROOT/supabase/seed.sql"   # seed must be idempotent
"${PSQL[@]}" -f "$ROOT/supabase/tests/verify.sql"
