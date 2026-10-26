#!/bin/sh
# Privileged maintenance only. Application containers never receive original media or owner credentials.
set -eu
umask 077
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
immich_container=${GALLERY_CAPTURE_IMMICH_CONTAINER:-vision-immich-server-1}
admin_container=${GALLERY_CAPTURE_ADMIN_CONTAINER:-vision-admin-1}
exec 9>/var/lib/gallery-capture/scan.lock
flock -n 9 || exit 0
report=$(mktemp /var/lib/gallery-capture/evidence.XXXXXX)
trap 'rm -f "$report"' EXIT HUP INT TERM
docker exec -i -w /usr/src/app/server "$immich_container" node < "$source_dir/collect-capture-evidence.cjs" > "$report"
# Import uses the existing gallery_admin runtime identity, not Immich credentials.
docker exec -i -w /app "$admin_container" node packages/gallery-db/scripts/capture-import.ts - < "$report"
