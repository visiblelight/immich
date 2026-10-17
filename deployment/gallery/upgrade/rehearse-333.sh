#!/bin/bash
set -euo pipefail
umask 077
base=/srv/vision/upgrade-333
mkdir -m 700 "$base"
old=$(docker inspect vision-immich-server-1 --format '{{.Config.Image}}')
new=$(docker image inspect ghcr.io/immich-app/immich-server:v3.3.3 --format '{{index .RepoDigests 0}}')
gallery=$(docker inspect vision-public-1 --format '{{.Config.Image}}')
printf '%s\n' "$old" > "$base/old-image"
printf '%s\n' "$new" > "$base/new-image"
docker exec vision-database-1 pg_dump -U postgres -d immich -Fc > "$base/database.dump"
docker exec vision-database-1 pg_dumpall -U postgres --roles-only > "$base/roles.sql"
python3 - "$base" <<'PY'
from pathlib import Path
import sys,secrets,urllib.parse
b=Path(sys.argv[1]);pw=secrets.token_hex(32)
(b/'postgres.env').write_text('POSTGRES_PASSWORD='+pw+'\nPOSTGRES_DB=immich\n')
(b/'migrate.env').write_text('GALLERY_UPGRADE_DATABASE_URL=postgres://postgres:'+pw+'@gallery-upgrade-333-db:5432/immich\n')
r=(b/'roles.sql').read_text();r='\n'.join(l for l in r.splitlines() if not l.startswith('CREATE ROLE postgres;') and not l.startswith('ALTER ROLE postgres '))+'\n';(b/'test-roles.sql').write_text(r)
for service in ['public','admin']:
 lines=Path('/srv/vision/secrets/'+service+'.env').read_text().splitlines();out=[]
 for line in lines:
  if line.startswith('GALLERY_DATABASE_URL='):
   url=urllib.parse.urlsplit(line.split('=',1)[1]);netloc=url.netloc.rsplit('@',1)[0]+'@gallery-upgrade-333-db:5432';line='GALLERY_DATABASE_URL='+urllib.parse.urlunsplit(url._replace(netloc=netloc))
  out.append(line)
 (b/(service+'.env')).write_text('\n'.join(out)+'\n')
PY
docker network create --internal gallery-upgrade-333 >/dev/null
docker run -d --name gallery-upgrade-333-db --label gallery.isolation=true --network gallery-upgrade-333 --env-file "$base/postgres.env" --tmpfs /var/lib/postgresql/data:rw --shm-size 128m "$(docker inspect vision-database-1 --format '{{.Config.Image}}')" >/dev/null
for i in $(seq 1 60); do docker exec gallery-upgrade-333-db pg_isready -h 127.0.0.1 -U postgres -d immich >/dev/null 2>&1 && break; sleep 2; done
docker exec -i gallery-upgrade-333-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$base/test-roles.sql" > "$base/roles-restore.log"
restore() { docker exec -i gallery-upgrade-333-db pg_restore -U postgres -d immich --exit-on-error < "$base/database.dump"; }
restore
migrate() { docker run --rm --network gallery-upgrade-333 --env-file "$base/migrate.env" -v /srv/vision/official-migrations-333.cjs:/verify.cjs:ro --entrypoint node "$1" /verify.cjs; }
smoke() { for role in public admin; do docker run --rm --network gallery-upgrade-333 --env-file "$base/$role.env" -v /srv/vision/gallery-upgrade-smoke.mjs:/verify.mjs:ro --entrypoint node "$gallery" /verify.mjs "$role"; done; }
migrate "$old" > "$base/before-migrations.json"
smoke > "$base/before-gallery.json"
docker exec gallery-upgrade-333-db pg_dump -U postgres -d immich -n gallery --data-only > "$base/gallery-before.sql"
migrate "$new" > "$base/after-migrations.json"
smoke > "$base/after-gallery.json"
cmp "$base/before-gallery.json" "$base/after-gallery.json"
docker exec gallery-upgrade-333-db pg_dump -U postgres -d immich -n gallery --data-only > "$base/gallery-after.sql"
cmp "$base/gallery-before.sql" "$base/gallery-after.sql"
docker exec gallery-upgrade-333-db pg_dump -U postgres -d immich --schema-only > "$base/upgraded-schema.sql"
docker exec gallery-upgrade-333-db pg_dump -U postgres -d immich --data-only -t public.kysely_migrations -t public.migration_overrides > "$base/upgraded-migrations.sql"
# Restore into the isolated database only; the working database is never a target.
docker exec gallery-upgrade-333-db dropdb -U postgres immich
docker exec gallery-upgrade-333-db createdb -U postgres immich
restore
migrate "$old" > "$base/rollback-migrations.json"
smoke > "$base/rollback-gallery.json"
cmp "$base/before-gallery.json" "$base/rollback-gallery.json"
printf 'PASS: official migrations, zero drift, unchanged Gallery data and restricted-role queries, old-version restore\n' | tee "$base/PASSED"
docker rm -f gallery-upgrade-333-db >/dev/null
docker network rm gallery-upgrade-333 >/dev/null
