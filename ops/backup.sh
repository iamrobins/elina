#!/bin/sh
set -eu
umask 077
chmod 700 /backups

while :; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  archive="/backups/elina-$stamp.dump"
  temporary="$archive.tmp"
  if pg_dump --format=custom --file="$temporary" && pg_restore --list "$temporary" >/dev/null; then
    mv "$temporary" "$archive"
    find /backups -maxdepth 1 -name 'elina-*.dump' -type f -mtime +6 -delete
    echo "Backup ready: $archive"
  else
    rm -f "$temporary"
    echo "Backup failed" >&2
  fi
  sleep 86400
done
