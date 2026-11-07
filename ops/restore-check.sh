#!/bin/sh
set -eu
archive=${1:?Pass a backup path under /backups}
case "$archive" in /backups/elina-*.dump) ;; *) echo "Invalid backup path" >&2; exit 1;; esac
test -f "$archive"
scratch="elina_restore_check_$$"
trap 'dropdb --if-exists "$scratch"' EXIT
createdb --template=template0 "$scratch"
pg_restore --exit-on-error --single-transaction --no-owner --dbname="$scratch" "$archive"
psql --dbname="$scratch" --no-align --tuples-only --command='SELECT count(*) FROM projects' >/dev/null
echo "Restore check passed: $archive"
