#!/bin/bash
# Reviewed one-time coordinated upgrade. Run by systemd, independently of the SSH client.
set -euo pipefail
umask 077
sha=${1:?commit}; image=${2:?gallery image}
[[ $sha =~ ^[0-9a-f]{40}$ && $image =~ ^ghcr.io/visiblelight/gallery@sha256:[0-9a-f]{64}$ ]] || exit 2
repo=/root/work/immich
config=/srv/vision/secrets/compose.env
base=/srv/vision/upgrade-333
new=ghcr.io/immich-app/immich-server@sha256:bae7664ff3aa4c2c1fcbdcdd86b40b105643c5f861f3e6a770fc760089f25862
ml=ghcr.io/immich-app/immich-machine-learning@sha256:73915f07e1f4289ba45b174c58443db74cef47ddf502613f475fc5e52458ea42
exec 9>/var/lock/gallery-deploy.lock
flock -n 9
[[ -f $base/PASSED && $(cat "$base/new-image") == "$new" ]]
[[ $(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}') == "$sha" ]]
docker image inspect "$new" "$ml" >/dev/null
git -C "$repo" -c fetch.recurseSubmodules=false fetch origin codex/gallery
[[ $(git -C "$repo" rev-parse origin/codex/gallery) == "$sha" ]]
[[ -z $(git -C "$repo" status --porcelain --untracked-files=no) ]]
oldsha=$(git -C "$repo" rev-parse HEAD)
oldimage=$(docker inspect vision-public-1 --format '{{.Config.Image}}')
oldimmich=$(docker inspect vision-immich-server-1 --format '{{.Config.Image}}')
[[ $oldimmich == $(cat "$base/old-image") ]]
backup=/srv/vision/backups/immich-333-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
cp "$config" "$backup/compose.env"
cp /srv/vision/releases/current "$backup/release.before"
printf '%s\n' "$oldsha" > "$backup/source.before"
# Complete media checkpoint fits before stopping writers.
need=$(du -sb /srv/vision/data/library /srv/vision/data/articles | awk '{n+=$1}END{print n}')
available=$(df -B1 --output=avail /srv/vision | tail -1)
(( available > need + 2147483648 )) || { echo 'Insufficient space for full media checkpoint'; exit 1; }
compose() { docker compose --env-file "$config" -p vision -f "$repo/deployment/gallery/cloud/compose.yml" "$@"; }
restorable=0; migrating=0
rollback() {
  status=$?
  trap - EXIT
  if (( status != 0 )); then
    echo 'Upgrade failed; restoring checkpoint before reopening services'
    compose stop public admin immich-server immich-machine-learning || true
    if (( migrating )); then
      docker exec vision-database-1 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='immich' AND pid<>pg_backend_pid()" >/dev/null
      docker exec vision-database-1 dropdb -U postgres immich
      docker exec vision-database-1 createdb -U postgres immich
      docker exec -i vision-database-1 pg_restore -U postgres -d immich --exit-on-error < "$backup/database.dump"
      tar -xf "$backup/media.tar" -C /srv/vision/data
    fi
    cp "$backup/compose.env" "$config"
    git -C "$repo" checkout --detach "$oldsha"
    compose up -d --no-deps --no-build --wait --wait-timeout 240 public admin immich-server immich-machine-learning
    echo 'Previous release restored'
  fi
  exit "$status"
}
trap rollback EXIT
compose stop public admin immich-server immich-machine-learning
# No writers remain while the database and matching media checkpoint are captured.
docker exec vision-database-1 pg_dump -U postgres -d immich -Fc > "$backup/database.dump"
docker exec vision-database-1 pg_dumpall -U postgres --roles-only > "$backup/roles.sql"
tar -cf "$backup/media.tar" -C /srv/vision/data library articles
cp -a /srv/vision/secrets "$backup/secrets"
(cd "$backup" && sha256sum database.dump media.tar roles.sql > SHA256SUMS)
restorable=1
python3 - "$config" "$base/production-migrate.env" <<'PY'
from pathlib import Path
from urllib.parse import quote
import sys
v=dict(l.split('=',1) for l in Path(sys.argv[1]).read_text().splitlines() if '=' in l and not l.startswith('#'))
Path(sys.argv[2]).write_text('GALLERY_UPGRADE_DATABASE_URL=postgres://postgres:'+quote(v['DB_PASSWORD'],safe='')+'@database:5432/immich\n')
PY
migrating=1
docker run --rm --network vision-data --env-file "$base/production-migrate.env" -v /srv/vision/official-migrations-333.cjs:/verify.cjs:ro --entrypoint node "$new" /verify.cjs | tee "$backup/production-migrations.json"
git -C "$repo" checkout --detach "$sha"
python3 - "$config" "$image" "$ml" <<'PY'
from pathlib import Path
import sys,os
p=Path(sys.argv[1]);s=p.read_text().splitlines();changes={'GALLERY_IMAGE':sys.argv[2],'IMMICH_ML_IMAGE':sys.argv[3]}
for k in changes: assert sum(l.startswith(k+'=') for l in s)==1
p.write_text('\n'.join(l.split('=',1)[0]+'='+changes[l.split('=',1)[0]] if l.split('=',1)[0] in changes else l for l in s)+'\n');p.chmod(0o600)
PY
compose up -d --no-deps --no-build --wait --wait-timeout 300 public admin immich-server immich-machine-learning
curl -fsS http://127.0.0.1:3200/health/ready >/dev/null
curl -fsS http://127.0.0.1:3201/health/ready >/dev/null
curl -fsS http://127.0.0.1:2283/api/server/version | tee "$backup/production-version.json"
python3 - "$backup/production-version.json" <<'PY'
import json,sys
v=json.load(open(sys.argv[1]));assert (v['major'],v['minor'],v['patch'])==(3,3,3)
PY
cp "$backup/release.before" /srv/vision/releases/previous
printf '%s\n%s\n' "$sha" "$image" > /srv/vision/releases/current
printf '%s\n' "$new" "$ml" > /srv/vision/releases/immich-current
printf 'PASS %s\n' "$sha" | tee "$base/DEPLOYED"
trap - EXIT
