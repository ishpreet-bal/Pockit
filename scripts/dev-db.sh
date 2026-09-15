#!/usr/bin/env bash
# Starts a local Postgres for development and the end-to-end smoke test.
# The app is coupled to nothing but DATABASE_URL, so this is interchangeable with
# any hosted Postgres.
set -euo pipefail

PGDATA="${PGDATA:-/var/lib/postgresql/pockit}"
PGPORT="${PGPORT:-5433}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"

mkdir -p "$PGDATA" /var/run/postgresql
chown -R postgres:postgres "$PGDATA" /var/run/postgresql 2>/dev/null || true

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  su postgres -c "$PGBIN/initdb -D $PGDATA -U postgres --auth-local=trust --auth-host=trust"
fi

if ! su postgres -c "$PGBIN/pg_ctl -D $PGDATA status" > /dev/null 2>&1; then
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log -o '-p $PGPORT -k /var/run/postgresql' start"
  sleep 2
fi

psql -h 127.0.0.1 -p "$PGPORT" -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='pockit'" \
  | grep -q 1 || psql -h 127.0.0.1 -p "$PGPORT" -U postgres -c "CREATE DATABASE pockit"

echo "Postgres ready on port $PGPORT"
echo "DATABASE_URL=\"postgres://postgres@127.0.0.1:$PGPORT/pockit\""
