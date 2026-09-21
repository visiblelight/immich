import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import pg from 'pg';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDatabase,
  publicCatalog,
  readPublishedDerivative,
  sanitizeImage,
  publicArticle,
  readArticleMedia,
  readArticlePhotoDerivative,
} from '../../src/index.server.ts';

/** Full database recovery in a second database inside the labelled disposable test container. */
export async function recovery(
  config: { name: string; ownerUrl: string; passwords: Record<string, string> },
  mediaRoot: string,
) {
  assert.ok(config.name.startsWith('gallery-db-check-'));
  assert.equal(
    execFileSync(
      'docker',
      ['inspect', config.name, '--format', '{{index .Config.Labels "gallery.isolation"}}'],
      {
        encoding: 'utf8',
      },
    ).trim(),
    'true',
  );
  const source = new pg.Client({ connectionString: config.ownerUrl });
  await source.connect();
  const snapshot = async (client: pg.Client) =>
    (
      await client.query(`SELECT
    (SELECT count(*) FROM gallery.album) albums,
    (SELECT count(*) FROM gallery.album_release) releases,
    (SELECT count(*) FROM gallery.album_release_photo) photos,
    (SELECT count(*) FROM gallery."user") users,
    (SELECT count(*) FROM gallery.article) articles,
    (SELECT count(*) FROM gallery.article_release) article_releases,
    (SELECT md5(string_agg(id::text||content::text,',' ORDER BY id)) FROM gallery.article_release) article_content,
    (SELECT count(*) FROM gallery.article_media_ref) article_media_refs,
    (SELECT count(*) FROM gallery.article_group_ref) article_group_refs,
    (SELECT count(*) FROM gallery.photo_release WHERE hidden_from_gallery) hidden_photo_releases,
    (SELECT count(*) FROM gallery.photo) shared_photos,
    (SELECT count(*) FROM gallery.photo_release) photo_releases,
    (SELECT count(*) FROM gallery.photo_tag) draft_tags,
    (SELECT count(*) FROM gallery.photo_release_tag) published_tags,
    (SELECT md5(string_agg(id::text||name,',' ORDER BY id)) FROM gallery.tag) tag_names,
    (SELECT md5(string_agg(id::text||':'||description_document::text,',' ORDER BY id)) FROM gallery.album_release) content`)
    ).rows[0];
  const expected = await snapshot(source);
  const dump = execFileSync(
    'docker',
    ['exec', config.name, 'pg_dump', '-U', 'postgres', '-d', 'gallery_test', '-Fc'],
    {
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  execFileSync('docker', ['exec', config.name, 'createdb', '-U', 'postgres', 'gallery_restore']);
  execFileSync(
    'docker',
    ['exec', '-i', config.name, 'pg_restore', '-U', 'postgres', '-d', 'gallery_restore', '--exit-on-error'],
    { input: dump, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  const url = new URL(config.ownerUrl);
  url.pathname = '/gallery_restore';
  const restored = new pg.Client({ connectionString: url.toString() });
  await restored.connect();
  const publicUrl = new URL(url);
  publicUrl.username = 'gallery_public';
  publicUrl.password = config.passwords.public!;
  const db = createDatabase<unknown>(publicUrl.toString(), 'gallery-public');
  try {
    assert.deepEqual(await snapshot(restored), expected);
    // A restored credential/session snapshot must not revive old browser sessions.
    await restored.query('UPDATE gallery.session SET revoked_at=now() WHERE revoked_at IS NULL');
    assert.equal(
      (await restored.query('SELECT count(*) FROM gallery.session WHERE revoked_at IS NULL')).rows[0].count,
      '0',
    );
    const catalog = await publicCatalog(db);
    const album = catalog.albums.find((a) => a.title === 'HTTP workflow')!;
    assert.ok(album);
    const active = (await publicCatalog(db, album.slug)).active!;
    assert.equal(active.photos.length, 239); // One HTTP fixture work is hidden from Gallery.
    const media = await readPublishedDerivative(db, album.id, active.photos[0]!.id, 'thumbnail', {
      sourceRoot: '/data/thumbs',
      mountedRoot: mediaRoot,
    });
    assert.ok((await sanitizeImage(media.bytes, 'thumbnail')).length > 0);
    const copiedMedia = await mkdtemp(path.join(tmpdir(), 'gallery-article-restore-'));
    try {
      await cp(path.join(mediaRoot, 'article-uploads'), copiedMedia, { recursive: true });
      const article = await publicArticle(db, 'http-article');
      const material = (Object.values(article.images) as { kind: string; ref: string }[]).find(
        (p) => p.kind === 'upload',
      )!;
      assert.ok(material);
      const work = (Object.values(article.images) as { kind: string; ref: string; album: string }[]).find(
        (p) => p.kind === 'photo',
      )!;
      assert.ok(work);
      assert.ok(
        (
          await readArticlePhotoDerivative(db, article.id, work.album, work.ref, 'preview', {
            sourceRoot: '/data/thumbs',
            mountedRoot: mediaRoot,
          })
        ).bytes.length,
      );
      assert.equal(
        (await restored.query('SELECT count(*) FROM gallery.published_photo WHERE asset_id=$1', [work.ref]))
          .rows[0].count,
        '0',
      );
      assert.ok((await readArticleMedia(db, copiedMedia, material.ref, 'preview', article.id)).length);
    } finally {
      await rm(copiedMedia, { recursive: true, force: true });
    }
    await writeFile(
      new URL('../../../../.gallery-local/phase-b/recovery.json', import.meta.url),
      JSON.stringify(
        {
          passed: true,
          data: 'synthetic',
          dumpBytes: dump.length,
          sha256: createHash('sha256').update(dump).digest('hex'),
          counts: expected,
          oldSessionsRevoked: true,
          mediaVerified: true,
          articleMediaCopyVerified: true,
        },
        null,
        2,
      ),
    );
    console.log(
      `Full pg_dump/pg_restore recovery passed (${dump.length} bytes); releases, text, role-restricted reads and media verified.`,
    );
  } finally {
    await Promise.allSettled([source.end(), restored.end(), db.destroy()]);
  }
}
