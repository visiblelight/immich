#!/bin/bash
# Install as a root-owned dispatcher target; CI can update Gallery only.
set -euo pipefail
umask 077
sha=${1:?Expected commit SHA}
image=${2:?Expected immutable GHCR image}
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$image" =~ ^ghcr.io/visiblelight/gallery@sha256:[0-9a-f]{64}$ ]] || exit 2
repo=/root/work/immich
config=/srv/vision/secrets/compose.env
exec 9>/var/lock/gallery-deploy.lock
flock -n 9 || { echo 'Another Gallery deployment is running'; exit 1; }
tmp=$(mktemp -d)
export DOCKER_CONFIG="$tmp/docker"
mkdir "$DOCKER_CONFIG"
trap 'rm -rf "$tmp"' EXIT
# A short-lived workflow GITHUB_TOKEN arrives over SSH stdin, never argv or logs.
docker login ghcr.io -u visiblelight --password-stdin >/dev/null
docker pull "$image"
revision=$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')
[[ "$revision" == "$sha" ]] || { echo 'Image revision mismatch'; exit 1; }
git -C "$repo" fetch origin codex/gallery
git -C "$repo" merge-base --is-ancestor "$sha" origin/codex/gallery
# Reject stale deploys: latest queued workflow will deploy the newest revision.
[[ $(git -C "$repo" rev-parse origin/codex/gallery) == "$sha" ]] || { echo 'Superseded revision; refusing deploy'; exit 1; }
[[ -z $(git -C "$repo" status --porcelain --untracked-files=no) ]] || { echo 'Tracked server files modified'; exit 1; }
compose() { docker compose --env-file "$config" -p vision -f "$repo/deployment/gallery/cloud/compose.yml" "$@"; }
old_sha=$(git -C "$repo" rev-parse HEAD)
old_image=$(sed -n 's/^GALLERY_IMAGE=//p' "$config")
# Automatic deploys do not run migrations. Compare the candidate against actual DB history.
docker run --rm --network none --entrypoint node "$image" --input-type=module -e '
import {readdirSync,readFileSync} from "node:fs";import{createHash}from"node:crypto";
const dir="/app/packages/gallery-db/migrations/";
for(const n of readdirSync(dir).filter(n=>/^\d{4}_[a-z0-9_]+\.sql$/.test(n)).sort()) console.log(n.slice(0,4)+"|"+n+"|"+createHash("sha256").update(readFileSync(dir+n)).digest("hex"));
' > "$tmp/candidate-migrations"
compose exec -T database sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT version, name, checksum FROM gallery.schema_migration ORDER BY version"' > "$tmp/current-migrations"
cmp -s "$tmp/candidate-migrations" "$tmp/current-migrations" || { echo 'Migration review required; production unchanged'; exit 1; }
# Changes to service topology require a separate reviewed deployment.
if ! git -C "$repo" diff --quiet "$old_sha" "$sha" -- deployment/gallery/cloud/compose.yml deployment/gallery/compose/compose.yml; then
    echo 'Compose changes require a coordinated deployment'; exit 1
fi
cp "$config" "$tmp/compose.before"
set_image() {
    python3 - "$config" "$1" <<'PY'
from pathlib import Path
import sys,os
p=Path(sys.argv[1]);s=p.read_text().splitlines()
assert sum(x.startswith('GALLERY_IMAGE=') for x in s)==1
q=p.with_suffix('.next');q.write_text('\n'.join('GALLERY_IMAGE='+sys.argv[2] if x.startswith('GALLERY_IMAGE=') else x for x in s)+'\n');q.chmod(0o600);os.replace(q,p)
PY
}
rollback() {
    cp "$tmp/compose.before" "$config"
    git -C "$repo" checkout --detach "$old_sha"
    compose up -d --no-deps --no-build --wait --wait-timeout 180 public admin
}
git -C "$repo" checkout --detach "$sha"
set_image "$image"
if ! compose up -d --no-deps --no-build --wait --wait-timeout 180 public admin ||
   ! curl --fail --silent http://127.0.0.1:3200/health/ready >/dev/null ||
   ! curl --fail --silent http://127.0.0.1:3201/health/ready >/dev/null; then
    rollback
    echo 'Deployment failed; previous application restored'; exit 1
fi
mkdir -p /srv/vision/releases
printf '%s\n%s\n' "$old_sha" "$old_image" > /srv/vision/releases/previous
printf '%s\n%s\n' "$sha" "$image" > /srv/vision/releases/current
printf 'Gallery deployed: %s\n' "$sha"
