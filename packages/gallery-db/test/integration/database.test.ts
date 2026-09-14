import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, symlink, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { articles } from './articles.ts';
import { sharedPhotosAndTags } from './shared-photos.ts';
import { itemPublication } from './item-publication.ts';
import { photoGroups } from './photo-groups.ts';
import { recovery } from './recovery.ts';
import { workflow } from './workflow.ts';
import { maintainAccount } from '../../src/account-maintenance.server.ts';
import { login, sessionUser } from '../../src/auth.server.ts';
import { httpWorkflow } from './http-workflow.ts';
import pg from 'pg';
import { sql } from 'kysely';
import { migrate, migrationDirectory } from '../../src/migrate.server.ts';
import {
  createDatabase,
  listSourceAssets,
  listSourceAlbums,
  qualifySourceSelection,
  getMapClusters,
  readPublishedDerivative,
  assertDatabaseCompatibility,
} from '../../src/index.server.ts';

const configPath = process.env.GALLERY_TEST_CONFIG;
if (!configPath) throw new Error('Set GALLERY_TEST_CONFIG to an explicitly isolated database config');
const config = JSON.parse(await readFile(configPath, 'utf8')) as {
  name: string;
  ownerUrl: string;
  passwords: Record<string, string>;
};
const ownerUrl = new URL(config.ownerUrl);
if (
  !config.name.startsWith('gallery-db-check-') ||
  ownerUrl.hostname !== '127.0.0.1' ||
  ownerUrl.pathname !== '/gallery_test'
)
  throw new Error('Refusing a non-isolated database');
const roleUrl = (role: string) => {
  const u = new URL(ownerUrl);
  u.username = `gallery_${role}`;
  u.password = config.passwords[role]!;
  return u.toString();
};
const owner = new pg.Client({ connectionString: config.ownerUrl });
const migrator = new pg.Client({ connectionString: roleUrl('migrator') });
const admin = new pg.Client({ connectionString: roleUrl('admin') });
const pub = new pg.Client({ connectionString: roleUrl('public') });
const adminDb = createDatabase<unknown>(roleUrl('admin'), 'gallery-admin');
const publicDb = createDatabase<unknown>(roleUrl('public'), 'gallery-public');
const ids = {
  user: randomUUID(),
  owner: randomUUID(),
  outsider: randomUUID(),
  sourceAlbum: randomUUID(),
  sourceOther: randomUUID(),
  tag: randomUUID(),
};
const assets = [randomUUID(), randomUUID(), randomUUID()];
const mediaRoot = await mkdtemp(path.join(tmpdir(), 'gallery-media-check-'));
const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
const denied = async (client: pg.Client, query: string, values?: unknown[]) => {
  await assert.rejects(client.query(query, values), (e: { code: string }) => e.code === '42501');
};
const count = async (client: pg.Client, view: string) =>
  Number((await client.query(`SELECT count(*) FROM gallery.${view}`)).rows[0].count);

async function sourceAsset(id: string, ownerId: string) {
  await owner.query(
    `INSERT INTO public.asset(id, "ownerId", type, "originalPath", "fileCreatedAt", "fileModifiedAt",
    checksum, "originalFileName", "localDateTime", "checksumAlgorithm", width, height)
    VALUES ($1,$2,'IMAGE','/private/original.raw',now(),now(),$3,'sample.raw',now(),'sha1',1200,800)`,
    [id, ownerId, Buffer.from(id)],
  );
  await owner.query('INSERT INTO public.asset_exif("assetId", latitude, longitude) VALUES ($1,41.7151,44.8271)', [id]);
  for (const type of ['preview', 'thumbnail']) {
    await owner.query('INSERT INTO public.asset_file("assetId",type,path) VALUES($1,$2,$3)', [
      id,
      type,
      `/data/thumbs/${id}-${type}.jpg`,
    ]);
    await writeFile(path.join(mediaRoot, `${id}-${type}.jpg`), Buffer.from(`synthetic-${type}`));
  }
}
async function album(
  slug: string,
  parent: string | null,
  mode: string,
  members: string[],
  cover: string | null = null,
) {
  const albumId = randomUUID(),
    releaseId = randomUUID();
  await admin.query('INSERT INTO gallery.album(id,slug,created_by) VALUES($1,$2,$3)', [albumId, slug, ids.user]);
  await admin.query(
    'INSERT INTO gallery.album_draft(album_id,parent_album_id,title,location_mode,updated_by) VALUES($1,$2,$3,$4,$5)',
    [albumId, parent, slug, mode, ids.user],
  );
  await admin.query(
    `INSERT INTO gallery.album_release(id,album_id,release_number,source_draft_version,parent_album_id,title,location_mode,published_by,cover_asset_id)
    VALUES($1,$2,1,1,$3,$4,$5,$6,$7)`,
    [releaseId, albumId, parent, slug, mode, ids.user, cover],
  );
  const photos: string[] = [];
  for (const [position, asset] of members.entries()) {
    const photoId = randomUUID();
    photos.push(photoId);
    await admin.query(
      `INSERT INTO gallery.album_photo(id,album_id,immich_asset_id,position,title) VALUES($1,$2,$3,$4,$5)`,
      [photoId, albumId, asset, position, `${slug} own caption`],
    );
    await admin.query(
      `INSERT INTO gallery.album_release_photo(release_id,photo_id,immich_asset_id,position,title) VALUES($1,$2,$3,$4,$5)`,
      [releaseId, photoId, asset, position, `${slug} own caption`],
    );
  }
  await admin.query(
    `UPDATE gallery.album SET status='published',current_release_id=$2,first_published_at=now(),last_published_at=now() WHERE id=$1`,
    [albumId, releaseId],
  );
  return { id: albumId, release: releaseId, photos };
}

test('Gallery on real PostgreSQL 14 with actual runtime logins', async (t) => {
  await owner.connect();
  try {
    await owner.query('BEGIN');
    await owner.query(
      await readFile(new URL('../../../../deployment/gallery/database/bootstrap.sql', import.meta.url), 'utf8'),
    );
    for (const role of ['migrator', 'admin', 'public']) {
      await owner.query(
        `ALTER ROLE ${pg.escapeIdentifier(`gallery_${role}`)} PASSWORD ${pg.escapeLiteral(config.passwords[role]!)}`,
      );
    }
    await owner.query('COMMIT');
    await migrator.connect();
    await admin.connect();
    await pub.connect();
    await t.test('transactional migration, repeat execution, role identity', async () => {
      assert.deepEqual(await migrate(migrator), ['0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009']);
      assert.deepEqual(await migrate(migrator), []);
      await assert.rejects(migrate(admin), /require gallery_migrator/);
      assert.equal(
        (
          await owner.query(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='gallery' AND table_type='BASE TABLE'",
          )
        ).rows[0].count,
        '30',
      );
    });
    await t.test('runtime compatibility checks validate service roles and view contracts', async () => {
      await assertDatabaseCompatibility(publicDb, 'gallery-public');
      await assertDatabaseCompatibility(adminDb, 'gallery-admin');
      await assert.rejects(assertDatabaseCompatibility(adminDb, 'gallery-public'), /Unsupported/);
    });
    await t.test('changed history is rejected; failed migration rolls back DDL and history', async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'gallery-migration-check-'));
      try {
        for (const file of (await readdir(migrationDirectory)).filter((f) => f.endsWith('.sql')))
          await copyFile(new URL(file, migrationDirectory), path.join(directory, file));
        const dirUrl = pathToFileURL(`${directory}/`);
        await writeFile(path.join(directory, '0001_foundation.sql'), '-- tampered');
        await assert.rejects(migrate(migrator, dirUrl), /history mismatch/);
        await copyFile(new URL('0001_foundation.sql', migrationDirectory), path.join(directory, '0001_foundation.sql'));
        await writeFile(
          path.join(directory, '0010_failure.sql'),
          'CREATE TABLE gallery.rollback_probe(id integer); SELECT 1/0;',
        );
        await assert.rejects(migrate(migrator, dirUrl), (e: { code: string }) => e.code === '22012');
        assert.equal(
          (await owner.query("SELECT to_regclass('gallery.rollback_probe') AS relation")).rows[0].relation,
          null,
        );
        assert.equal(
          (await migrator.query("SELECT count(*) FROM gallery.schema_migration WHERE version='0010'")).rows[0].count,
          '0',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
    await t.test(
      'runtime permissions reject raw data, DDL, role escalation, history mutation and scope edits',
      async () => {
        for (const client of [pub, admin]) {
          await denied(client, 'SELECT id FROM public.asset');
          await denied(client, 'UPDATE public.asset SET "isOffline"=true');
          await denied(client, 'CREATE TABLE public.gallery_attack(id integer)');
          await denied(client, 'CREATE TABLE gallery.gallery_attack(id integer)');
          await denied(client, 'SET ROLE gallery_migrator');
          await denied(client, 'SET ROLE gallery_view_owner');
          await denied(client, 'DELETE FROM gallery.immich_source_owner');
          await denied(client, 'UPDATE gallery.schema_migration SET checksum=checksum');
        }
        for (const name of [
          '"user"',
          'user_credential',
          'session',
          'album',
          'album_draft',
          'album_photo',
          'album_release',
          'album_release_photo',
          'admin_source_asset',
        ]) {
          await denied(pub, `SELECT * FROM gallery.${name}`);
        }
        await denied(admin, 'DELETE FROM gallery.album_release_photo');
        await denied(admin, 'UPDATE gallery.album_release SET title=title');
        await denied(admin, 'SELECT * FROM gallery.audit_event');
        await denied(admin, 'DELETE FROM gallery.audit_event');
        const rows = await owner.query(
          "SELECT relname, reloptions, pg_get_userbyid(relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='gallery' AND c.relkind='v'",
        );
        assert.ok(
          rows.rows.every((r) => r.owner === 'gallery_view_owner' && r.reloptions.includes('security_barrier=true')),
        );
      },
    );
    // Synthetic records only; nothing is copied from the user's Immich rows.
    const group = randomUUID();
    await owner.query('INSERT INTO public.cluster_group(id) VALUES ($1)', [group]);
    for (const [i, id] of [ids.owner, ids.outsider].entries())
      await owner.query('INSERT INTO public."user"(id,email,"clusterGroupId") VALUES($1,$2,$3)', [
        id,
        `synthetic-${i}@example.invalid`,
        group,
      ]);
    for (const [i, asset] of assets.entries()) await sourceAsset(asset, i === 2 ? ids.outsider : ids.owner);
    await admin.query(
      'INSERT INTO gallery."user"(id,email,email_normalized,display_name,role) VALUES($1,$2,$2,$3,$4)',
      [ids.user, 'gallery@example.invalid', 'Gallery', 'admin'],
    );
    await t.test(
      'empty source allowlist denies every asset, then owner scope filters mixed albums and forged IDs',
      async () => {
        assert.deepEqual(await listSourceAssets(adminDb), []);
        await migrator.query('INSERT INTO gallery.immich_source_owner(immich_owner_id) VALUES($1)', [ids.owner]);
        for (const id of [ids.sourceAlbum, ids.sourceOther]) {
          await owner.query('INSERT INTO public.album(id,"albumName") VALUES($1,$2)', [id, 'Synthetic source']);
          await owner.query('INSERT INTO public.album_user("albumId","userId",role) VALUES($1,$2,$3)', [
            id,
            ids.owner,
            'owner',
          ]);
        }
        for (const asset of assets)
          await owner.query('INSERT INTO public.album_asset("albumId","assetId") VALUES($1,$2)', [
            ids.sourceAlbum,
            asset,
          ]);
        await owner.query('INSERT INTO public.album_asset("albumId","assetId") VALUES($1,$2)', [
          ids.sourceOther,
          assets[1],
        ]);
        await owner.query('INSERT INTO public.tag(id,"userId",value) VALUES($1,$2,$3)', [ids.tag, ids.owner, 'Travel']);
        await owner.query('INSERT INTO public.tag_asset("tagId","assetId") VALUES($1,$2)', [ids.tag, assets[0]]);
        assert.equal((await listSourceAlbums(adminDb)).length, 2);
        assert.equal((await listSourceAssets(adminDb, { albumId: ids.sourceAlbum })).length, 2);
        assert.equal((await listSourceAssets(adminDb, { albumId: ids.sourceOther })).length, 1);
        assert.equal((await listSourceAssets(adminDb, { tagId: ids.tag })).length, 1);
        assert.equal(await qualifySourceSelection(adminDb, assets), false);
        assert.equal(await qualifySourceSelection(adminDb, assets.slice(0, 2)), true);
        assert.equal(await qualifySourceSelection(adminDb, [assets[0]!, assets[0]!]), false);
      },
    );
    const country = await album('georgia', null, 'hidden', [], assets[0]!);
    const city = await album('tbilisi', country.id, 'exact', [assets[0]!, assets[1]!]);
    const coast = await album('batumi', country.id, 'approximate', [assets[0]!]);
    const hidden = await album('hidden-location', country.id, 'hidden', [assets[0]!]);
    await admin.query('INSERT INTO gallery.site(id,name,hero_album_id) VALUES(1,$1,$2)', ['Test Gallery', country.id]);
    await admin.query('INSERT INTO gallery.homepage_item(album_id,position) VALUES($1,0)', [city.id]);
    await t.test(
      'current publication reads independent captions; draft edits, deletion and source album removal do not change releases',
      async () => {
        await admin.query('UPDATE gallery.album_photo SET title=$1 WHERE id=$2', ['draft only', city.photos[0]]);
        await admin.query('DELETE FROM gallery.album_photo WHERE id=$1', [city.photos[1]]);
        await admin.query('UPDATE gallery.album_draft SET parent_album_id=NULL WHERE album_id=$1', [city.id]);
        await owner.query('DELETE FROM public.album_asset WHERE "assetId"=$1', [assets[0]]);
        assert.equal(
          (await pub.query('SELECT title FROM gallery.published_photo WHERE photo_id=$1', [city.photos[0]])).rows[0]
            .title,
          'tbilisi own caption',
        );
        assert.equal(
          (await pub.query('SELECT title FROM gallery.published_photo WHERE photo_id=$1', [coast.photos[0]])).rows[0]
            .title,
          'batumi own caption',
        );
        assert.equal(
          (await pub.query('SELECT parent_album_id FROM gallery.published_album WHERE album_id=$1', [city.id])).rows[0]
            .parent_album_id,
          country.id,
        );
        assert.equal(await count(pub, 'published_photo'), 4);
        assert.equal(
          (await readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root)).bytes.toString(),
          'synthetic-preview',
        );
      },
    );
    const world = { west: -180, south: -90, east: 180, north: 90, zoom: 8 };
    await t.test(
      'live GPS moves Tbilisi to Batumi without republishing; hidden and approximate remain private',
      async () => {
        await owner.query('UPDATE public.asset_exif SET latitude=41.6168,longitude=41.6367 WHERE "assetId"=$1', [
          assets[0],
        ]);
        const exact = (
          await pub.query('SELECT latitude,longitude FROM gallery.published_photo WHERE photo_id=$1', [city.photos[0]])
        ).rows[0];
        assert.deepEqual(exact, { latitude: 41.6168, longitude: 41.6367 });
        const approx = (
          await pub.query('SELECT latitude,longitude FROM gallery.published_photo WHERE photo_id=$1', [coast.photos[0]])
        ).rows[0];
        assert.deepEqual(approx, { latitude: 41.61, longitude: 41.63 });
        assert.equal(
          (await pub.query('SELECT latitude FROM gallery.published_photo WHERE photo_id=$1', [hidden.photos[0]]))
            .rows[0].latitude,
          null,
        );
        assert.equal(
          (await getMapClusters(publicDb, world)).reduce((sum, r) => sum + Number(r.count), 0),
          2,
        );
        // Tiny bbox contains exact GPS but not approximate point: global map must not leak exact through filtering.
        assert.equal(
          (await getMapClusters(publicDb, { west: 41.6366, east: 41.6368, south: 41.6167, north: 41.6169, zoom: 20 }))
            .length,
          0,
        );
        assert.equal(
          (
            await getMapClusters(publicDb, {
              west: 41.6366,
              east: 41.6368,
              south: 41.6167,
              north: 41.6169,
              zoom: 20,
              albumId: city.id,
            })
          ).length,
          1,
        );
        for (const coords of [
          [null, null],
          [91, 0],
          [0, 181],
        ]) {
          await owner.query('UPDATE public.asset_exif SET latitude=$2,longitude=$3 WHERE "assetId"=$1', [
            assets[0],
            ...coords,
          ]);
          assert.equal(
            (await pub.query('SELECT latitude FROM gallery.published_photo WHERE photo_id=$1', [city.photos[0]]))
              .rows[0].latitude,
            null,
          );
        }
        for (const value of ['NaN', 'Infinity']) {
          await assert.rejects(
            owner.query('UPDATE public.asset_exif SET latitude=$2,longitude=0 WHERE "assetId"=$1', [assets[0], value]),
            (e: { code: string }) => e.code === '23514' || e.code === '22003',
          );
        }
        await owner.query('UPDATE public.asset_exif SET latitude=90,longitude=180 WHERE "assetId"=$1', [assets[0]]);
        assert.deepEqual(
          (
            await pub.query('SELECT latitude,longitude FROM gallery.published_photo WHERE photo_id=$1', [
              coast.photos[0],
            ])
          ).rows[0],
          { latitude: 90, longitude: 180 },
        );
        await owner.query('UPDATE public.asset_exif SET latitude=41.6168,longitude=41.6367 WHERE "assetId"=$1', [
          assets[0],
        ]);
      },
    );
    await t.test(
      'parent offline closes descendant URLs, media, cover, homepage and map; restore respects individually offline child',
      async () => {
        await admin.query("UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=$1", [country.id]);
        for (const view of [
          'published_album',
          'published_photo',
          'published_media',
          'published_cover',
          'published_homepage',
        ])
          assert.equal(await count(pub, view), 0);
        assert.equal((await pub.query('SELECT hero_album_id FROM gallery.published_site')).rows[0].hero_album_id, null);
        assert.deepEqual(await getMapClusters(publicDb, world), []);
        await assert.rejects(
          readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root),
          /Media unavailable/,
        );
        await admin.query("UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=$1", [coast.id]);
        await admin.query("UPDATE gallery.album SET status='published',offline_at=NULL WHERE id=$1", [country.id]);
        assert.equal(await count(pub, 'published_album'), 3);
        await admin.query("UPDATE gallery.album SET status='published',offline_at=NULL WHERE id=$1", [coast.id]);
      },
    );
    await t.test(
      'source trash, delete timestamp, hidden, locked, offline, video and disabled owner revoke access immediately',
      async () => {
        const mutations = [
          "status='trashed'",
          '"deletedAt"=now()',
          "visibility='hidden'",
          "visibility='locked'",
          '"isOffline"=true',
          "type='VIDEO'",
        ];
        for (const assignment of mutations) {
          await owner.query(`UPDATE public.asset SET ${assignment} WHERE id=$1`, [assets[0]]);
          assert.equal(
            (await pub.query('SELECT count(*) FROM gallery.published_photo WHERE asset_id=$1', [assets[0]])).rows[0]
              .count,
            '0',
          );
          await assert.rejects(
            readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root),
            /Media unavailable/,
          );
          await owner.query(
            `UPDATE public.asset SET status='active',"deletedAt"=NULL,visibility='timeline',"isOffline"=false,type='IMAGE' WHERE id=$1`,
            [assets[0]],
          );
        }
        await migrator.query('UPDATE gallery.immich_source_owner SET enabled=false');
        assert.equal(await count(pub, 'published_photo'), 0);
        assert.equal((await listSourceAssets(adminDb)).length, 0);
        await migrator.query('UPDATE gallery.immich_source_owner SET enabled=true');
      },
    );
    await t.test(
      'edited derivatives must both exist; file version changes; forged IDs and raw variants fail',
      async () => {
        await owner.query('UPDATE public.asset SET "isEdited"=true WHERE id=$1', [assets[0]]);
        await assert.rejects(
          readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root),
          /Media unavailable/,
        );
        for (const type of ['preview', 'thumbnail']) {
          await owner.query('INSERT INTO public.asset_file("assetId",type,path,"isEdited") VALUES($1,$2,$3,true)', [
            assets[0],
            type,
            `/data/thumbs/edited-${type}.jpg`,
          ]);
          await writeFile(path.join(mediaRoot, `edited-${type}.jpg`), `edited-${type}`);
        }
        const edited = await readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root);
        assert.equal(edited.bytes.toString(), 'edited-preview');
        await owner.query('UPDATE public.asset_file SET path=path WHERE "assetId"=$1 AND "isEdited"', [assets[0]]);
        assert.notEqual(
          (await readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root)).sourceVersion,
          edited.sourceVersion,
        );
        await assert.rejects(
          readPublishedDerivative(publicDb, city.id, randomUUID(), 'preview', root),
          /Media unavailable/,
        );
        await assert.rejects(
          readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'raw' as 'preview', root),
          /Media unavailable/,
        );
        await owner.query('UPDATE public.asset SET "isEdited"=false WHERE id=$1', [assets[0]]);
      },
    );
    await t.test(
      'path traversal, sibling prefix and symlink escape are denied; missing file never falls back',
      async () => {
        const outside = await mkdtemp(path.join(tmpdir(), 'gallery-outside-'));
        try {
          await writeFile(path.join(outside, 'private.jpg'), 'private');
          await symlink(outside, path.join(mediaRoot, 'escape'));
          for (const candidate of [
            '/data/thumbs/../private.jpg',
            '/data/thumbs-other/private.jpg',
            '/data/thumbs/escape/private.jpg',
            '/data/thumbs/missing.jpg',
          ]) {
            await owner.query(
              'UPDATE public.asset_file SET path=$2 WHERE "assetId"=$1 AND type=\'preview\' AND NOT "isEdited"',
              [assets[0], candidate],
            );
            await assert.rejects(readPublishedDerivative(publicDb, city.id, city.photos[0]!, 'preview', root));
          }
          await owner.query(
            'UPDATE public.asset_file SET path=$2 WHERE "assetId"=$1 AND type=\'preview\' AND NOT "isEdited"',
            [assets[0], `/data/thumbs/${assets[0]}-preview.jpg`],
          );
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );
    await t.test(
      'constraints reject cross-album release, duplicate selection/order, malformed JSON, GPS EXIF and self-parent',
      async () => {
        const fails = async (query: string, values: unknown[], code = '23514') =>
          assert.rejects(admin.query(query, values), (e: { code: string }) => e.code === code);
        await fails('UPDATE gallery.album SET current_release_id=$2 WHERE id=$1', [city.id, coast.release], '23503');
        await fails('UPDATE gallery.album_draft SET parent_album_id=album_id WHERE album_id=$1', [city.id]);
        await fails('UPDATE gallery.album_draft SET description_document=$2 WHERE album_id=$1', [
          city.id,
          { schemaVersion: 1 },
        ]);
        await fails('UPDATE gallery.album_draft SET cover_focal_point=$2 WHERE album_id=$1', [city.id, { x: 2, y: 0 }]);
        await fails(
          'INSERT INTO gallery.album_photo(id,album_id,immich_asset_id,position) VALUES($1,$2,$3,10)',
          [randomUUID(), city.id, assets[0]],
          '23505',
        );
        await fails(
          'INSERT INTO gallery.album_release_photo(release_id,photo_id,immich_asset_id,position,public_exif) VALUES($1,$2,$3,99,$4)',
          [city.release, randomUUID(), randomUUID(), { latitude: 41 }],
        );
        await fails(
          "INSERT INTO gallery.session(id,user_id,token_hash,audience,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day')",
          [randomUUID(), ids.user, Buffer.from('short'), 'admin'],
        );
      },
    );
    await t.test('public traversal fails closed for a disconnected publication cycle', async () => {
      // Fault injection as owner, not a supported admin write. Phase D validates cycles before publishing.
      await owner.query('UPDATE gallery.album_release SET parent_album_id=$2 WHERE id=$1', [country.release, city.id]);
      assert.equal(await count(pub, 'published_album'), 0);
      await owner.query('UPDATE gallery.album_release SET parent_album_id=NULL WHERE id=$1', [country.release]);
    });
    await t.test('real deletion invalidates current media without a cross-schema foreign key', async () => {
      await owner.query('DELETE FROM public.asset WHERE id=$1', [assets[1]]);
      assert.equal(
        (await pub.query('SELECT count(*) FROM gallery.published_photo WHERE asset_id=$1', [assets[1]])).rows[0].count,
        '0',
      );
      await assert.rejects(
        readPublishedDerivative(publicDb, city.id, city.photos[1]!, 'preview', root),
        /Media unavailable/,
      );
    });
    await t.test('10,000 synthetic map points retain complete counts and bounded result size', async () => {
      const large = await album('large-synthetic', null, 'exact', []);
      await owner.query(
        `INSERT INTO public.asset(id,"ownerId",type,"originalPath","fileCreatedAt","fileModifiedAt",checksum,"originalFileName","localDateTime","checksumAlgorithm")
        SELECT ('99999999-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,'IMAGE','/synthetic.raw',now(),now(),convert_to(n::text,'UTF8'),'synthetic.raw',now(),'sha1' FROM generate_series(1,10000) n`,
        [ids.owner],
      );
      await owner.query(`INSERT INTO public.asset_exif("assetId",latitude,longitude)
        SELECT id, -80 + (row_number() OVER () % 16000)::float/100, -170 + (row_number() OVER () % 34000)::float/100
        FROM public.asset WHERE id::text LIKE '99999999-%'`);
      await owner.query(`INSERT INTO public.asset_file("assetId",type,path)
        SELECT a.id,t.type,'/data/thumbs/synthetic.jpg' FROM public.asset a CROSS JOIN (VALUES ('preview'),('thumbnail')) t(type) WHERE a.id::text LIKE '99999999-%'`);
      await admin.query(
        `INSERT INTO gallery.album_release_photo(release_id,photo_id,immich_asset_id,position)
        SELECT $1, unnest($2::uuid[]), unnest($2::uuid[]), generate_series(0,9999)`,
        [
          large.release,
          Array.from({ length: 10000 }, (_, i) => `99999999-0000-4000-8000-${String(i + 1).padStart(12, '0')}`),
        ],
      );
      await owner.query('ANALYZE');
      const start = performance.now();
      const clusters = await getMapClusters(publicDb, { ...world, albumId: large.id });
      const ms = performance.now() - start;
      assert.equal(
        clusters.reduce((sum, r) => sum + Number(r.count), 0),
        10000,
      );
      assert.ok(clusters.length <= 4225);
      const plan =
        await sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT count(*) FROM gallery.published_photo WHERE ${large.id}::uuid = ANY(ancestor_ids)`.execute(
          publicDb,
        );
      await writeFile(
        new URL('../../../../.gallery-local/phase-b/map-plan.json', import.meta.url),
        JSON.stringify(plan.rows, null, 2),
      );
      console.log(`Map fixture: 10,000 points, ${clusters.length} clusters, ${ms.toFixed(1)} ms; SQL plan recorded.`);
    });
    await t.test(
      'real Gallery workflow, publication isolation, conflicts, metadata stripping and authentication',
      async () => {
        await workflow(adminDb, publicDb, owner, ids.user, assets[0]!, assets[2]!, mediaRoot);
      },
    );
    await t.test('maintenance roles, session revocation and last administrator protection', async () => {
      await assert.rejects(maintainAccount(admin, 'disable', 'gallery@example.invalid'), /迁移账号/);
      await assert.rejects(maintainAccount(migrator, 'disable', 'gallery@example.invalid'), /最后一个/);
      const email = 'maintenance@example.invalid';
      await maintainAccount(migrator, 'create', email, 'maintenance-initial-password', 'Maintenance');
      const signed = await login(adminDb, email, 'maintenance-initial-password', 'maintenance-client');
      await maintainAccount(migrator, 'reset-password', email, 'maintenance-replacement-password');
      assert.equal(await sessionUser(adminDb, signed.token), null);
      await assert.rejects(login(adminDb, email, 'maintenance-initial-password', 'maintenance-client'), /账号或密码/);
      const next = await login(adminDb, email, 'maintenance-replacement-password', 'maintenance-client');
      await maintainAccount(migrator, 'disable', email);
      assert.equal(await sessionUser(adminDb, next.token), null);
      await assert.rejects(
        login(adminDb, email, 'maintenance-replacement-password', 'maintenance-client'),
        /账号或密码/,
      );
      await maintainAccount(migrator, 'enable', email);
      assert.ok((await login(adminDb, email, 'maintenance-replacement-password', 'maintenance-client')).token);
      await maintainAccount(migrator, 'disable', email);
    });
    await t.test('production HTTP login, CSRF, publish, media revocation and restart persistence', async () => {
      await httpWorkflow(assets[0]!, mediaRoot);
    });
    await t.test('Markdown groups, stable arrival, deduplicated timeline and publication revocation', async () => {
      const groupAssets = [randomUUID(), randomUUID()];
      for (const asset of groupAssets) await sourceAsset(asset, ids.owner);
      await photoGroups(adminDb, publicDb, owner, ids.user, groupAssets, mediaRoot);
    });
    await t.test('partial publication isolation, atomic groups, rollback, local clock and dirty state', async () => {
      const itemAssets = Array.from({ length: 4 }, () => randomUUID());
      for (const asset of itemAssets) await sourceAsset(asset, ids.owner);
      await itemPublication(adminDb, publicDb, owner, ids.user, itemAssets, mediaRoot);
    });
    await t.test('visited map reads live GPS, deduplicates, revokes evidence and keeps secrets private', async () => {
      const {
        publicVisited,
        adminVisited,
        countryPhotos,
        saveVisit,
        deleteVisit,
        adminMapSettings,
        saveMapSettings,
        publicMapSettings,
      } = await import('../../src/index.server.ts');
      const user = { id: ids.user, email: 'gallery@example.invalid', displayName: 'Gallery' };
      const mapAssets = [randomUUID(), randomUUID()];
      for (const asset of mapAssets) await sourceAsset(asset, ids.owner);
      await owner.query(`UPDATE public.asset_exif SET "timeZone"='Asia/Tbilisi' WHERE "assetId"=ANY($1::uuid[])`, [
        mapAssets,
      ]);
      const a = await album('visited-test', null, 'exact', mapAssets);
      const before = await publicVisited(publicDb);
      const duplicate = await album('visited-duplicate', null, 'exact', [mapAssets[0]!]);
      assert.equal((await publicVisited(publicDb)).total, before.total);
      let ge = await adminVisited(adminDb, 'GE');
      const selected = ge.photos.filter((p) => p.albumSlug === 'visited-test' || p.albumSlug === 'visited-duplicate');
      assert.equal(selected.length, 2);
      const correction = await saveVisit(adminDb, user, {
        country: 'GE',
        photoIds: selected.map((p) => p.id),
        start: '2025-01-01',
        end: '2025-01-12',
        label: 'Manual dates',
      });
      const manual = (await publicVisited(publicDb)).countries
        .find((c) => c.id === 'GE')!
        .visits.find((v) => v.id === correction)!;
      assert.equal(manual.count, 2);
      assert.equal(manual.label, 'Manual dates');
      await owner.query('UPDATE public.asset_exif SET latitude=48.8566,longitude=2.3522 WHERE "assetId"=$1', [
        mapAssets[0],
      ]);
      const moved = await publicVisited(publicDb);
      assert.ok(moved.countries.some((c) => c.id === 'FR'));
      const reduced = moved.countries.find((c) => c.id === 'GE')!.visits.find((v) => v.id === correction)!;
      assert.equal(reduced.count, 1);
      assert.equal(reduced.label, '');
      assert.notEqual(reduced.start, '2025-01-01');
      const photos = await countryPhotos(publicDb, 'FR');
      assert.ok(photos.photos.some((p) => p.albumSlug === 'visited-test' || p.albumSlug === 'visited-duplicate'));
      assert.ok(!JSON.stringify(photos).includes(mapAssets[0]!));
      await owner.query('UPDATE public.asset_exif SET latitude=NULL,longitude=NULL WHERE "assetId"=$1', [mapAssets[1]]);
      assert.ok(!(await publicVisited(publicDb)).countries.flatMap((c) => c.visits).some((v) => v.id === correction));
      await deleteVisit(adminDb, user, { id: correction, version: 1 });
      const master = 'ab'.repeat(32),
        settings = await adminMapSettings(adminDb, master);
      await saveMapSettings(
        adminDb,
        user,
        {
          ...settings,
          providers: settings.providers.map((p) =>
            p.provider === 'amap'
              ? { ...p, enabled: true, browserKey: 'synthetic-key', securityCode: 'synthetic-secret' }
              : p,
          ),
        },
        master,
      );
      const publicConfig = JSON.stringify(await publicMapSettings(publicDb));
      assert.ok(publicConfig.includes('synthetic-key'));
      assert.ok(!publicConfig.includes('synthetic-secret'));
      assert.ok(!publicConfig.includes('ciphertext'));
      await assert.rejects(saveMapSettings(adminDb, user, settings, master), /已被修改/);
      await denied(pub, 'UPDATE gallery.map_settings SET visit_gap_days=1');
      await denied(admin, 'UPDATE public.asset_exif SET latitude=0');
      const current = await adminMapSettings(adminDb, master);
      await saveMapSettings(
        adminDb,
        user,
        { ...current, providers: settings.providers.map((p) => ({ ...p, clearSecret: true })) },
        master,
      );
      await admin.query(`UPDATE gallery.album SET status='offline',offline_at=now() WHERE id=ANY($1::uuid[])`, [
        [a.id, duplicate.id],
      ]);
    });
    await t.test('shared photo publication, tag intersection, concurrency and public scope', async()=>{
      const tagAssets=[randomUUID(),randomUUID()];
      for(const asset of tagAssets) await sourceAsset(asset,ids.owner);
      await sharedPhotosAndTags(adminDb,publicDb,owner,ids.user,tagAssets,mediaRoot);
    });
    await t.test('articles: snapshots, media grants, about, concurrency and source revocation',async()=>{const asset=randomUUID();await sourceAsset(asset,ids.owner);await articles(adminDb,publicDb,owner,ids.user,asset,mediaRoot);});
    await t.test('full database backup and isolated recovery', async () => {
      await recovery(config, mediaRoot);
    });
  } finally {
    await Promise.allSettled([
      admin.end(),
      pub.end(),
      migrator.end(),
      owner.end(),
      adminDb.destroy(),
      publicDb.destroy(),
    ]);
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
