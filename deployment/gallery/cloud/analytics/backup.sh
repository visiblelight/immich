#!/bin/sh
set -eu
umask 077
root=${ANALYTICS_STATE_ROOT:-/srv/gallery-analytics}
repo=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
destination=${1:?Specify a new backup directory}
[ ! -e "$destination" ] || { echo 'Backup destination exists' >&2; exit 1; }
mkdir -p "$destination"
docker compose --env-file "$root/deployment.env" -f "$repo/compose.yml" exec -T database pg_dump -U umami_owner -d umami -Fc > "$destination/umami.dump"
tar -C "$root" -czf "$destination/private-config.tar.gz" secrets deployment.env website.json
cp "$repo/compose.yml" "$destination/compose.yml"
(cd "$destination" && sha256sum umami.dump private-config.tar.gz compose.yml > SHA256SUMS)
echo 'Analytics backup complete (contains credentials; keep private).'
