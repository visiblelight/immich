#!/bin/sh
# One consistent checkpoint; destination must be a new private directory.
set -eu
umask 077
config=${1:?Usage: backup.sh /absolute/compose.env /absolute/new-backup-dir}
backup=${2:?Set a new backup directory}
case "$config:$backup" in /*:/*) ;; *) echo 'Use absolute paths' >&2; exit 1;; esac
repo=${VISION_REPOSITORY:-$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)}
data=$(sed -n 's/^VISION_DATA_ROOT=//p' "$config")
case "$data" in /*) ;; *) echo 'Missing absolute VISION_DATA_ROOT' >&2; exit 1;; esac
compose() { docker compose --env-file "$config" -p vision -f "$repo/deployment/gallery/cloud/compose.yml" "$@"; }
# Record only running writers; do not start services that the operator had stopped.
running=$(compose ps --services --status running)
writers=''
for service in admin immich-server immich-machine-learning; do
  if printf '%s\n' "$running" | grep -qx "$service"; then writers="$writers $service"; fi
done
mkdir -m 700 "$backup"
resume() { if [ -n "$writers" ]; then compose start $writers >/dev/null; fi; }
trap resume EXIT
trap 'exit 1' HUP INT TERM
if [ -n "$writers" ]; then compose stop $writers >/dev/null; fi
compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup/database.dump"
tar -czf "$backup/media.tar.gz" -C "$data" library articles
tar -czf "$backup/configuration.tar.gz" -C "$(dirname -- "$config")" .
# Certificate state lives outside /srv/vision so its unprivileged worker can access it.
# Preserve the ACME account and renewal state without racing a running renewal.
if [ -f /etc/gallery/cdn-certificate.json ] && [ -d /var/lib/gallery-certificate ]; then
  (
    flock -w 60 9
    tar --exclude='*.log' -czf "$backup/certificate.tar.gz" -C / \
      etc/gallery/cdn-certificate.json var/lib/gallery-certificate
  ) 9>>/var/lib/gallery-certificate/task.lock
fi
git -C "$repo" rev-parse HEAD > "$backup/source-commit.txt"
compose images --format json > "$backup/images.json"
(cd "$backup" && sha256sum database.dump media.tar.gz configuration.tar.gz source-commit.txt images.json > SHA256SUMS)
if [ -f "$backup/certificate.tar.gz" ]; then
  (cd "$backup" && sha256sum certificate.tar.gz >> SHA256SUMS)
fi
printf 'Created private checkpoint: %s\n' "$backup"
