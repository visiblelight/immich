import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { sql, type Kysely } from 'kysely';
import type pg from 'pg';
import {
  createArticle,
  getArticle,
  saveArticle,
  publishArticle,
  offlineArticle,
  deleteArticle,
  publicArticle,
  publicArticles,
  aboutArticleSettings,
  saveAboutArticle,
  uploadArticleMedia,
  readArticleMedia,
  deleteArticleMedia,
  articleMediaOptions,
  adminState,
  createAlbum,
  saveAlbum,
  publishAlbum,
  setAlbumAvailability,
  relatedArticles,
} from '../../src/index.server.ts';
import { articleImageKey, type ArticleNode } from '../../../gallery-core/src/article.ts';
export async function articles(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  asset: string,
  mediaRoot: string,
) {
  const user = { id: userId, email: 'gallery@example.invalid', displayName: 'Gallery' };
  const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const dir = await mkdtemp(path.join(tmpdir(), 'gallery-article-files-'));
  const text = (s: string): ArticleNode => ({ type: 'paragraph', content: [{ type: 'text', text: s }] });
  try {
    const bytes = await sharp({ create: { width: 100, height: 80, channels: 3, background: '#658068' } })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const upload = await uploadArticleMedia(db, user, dir, bytes, 'sample.jpg');
    const media = await readArticleMedia(db, dir, upload.id, 'preview');
    const meta = await sharp(media).metadata();
    assert.equal(meta.exif, undefined);
    assert.equal(meta.format, 'webp');
    await assert.rejects(readArticleMedia(pub, dir, upload.id, 'preview', randomUUID()));
    await assert.rejects(
      uploadArticleMedia(
        db,
        user,
        dir,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'x.svg',
      ),
    );
    await assert.rejects(sql`SELECT * FROM gallery.article`.execute(pub));
    const id = await createArticle(db, user);
    let a = await getArticle(db, id);
    a.title = 'A formal journey';
    a.summary = 'Public summary';
    a.document = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          text('Published text'),
          {
            type: 'galleryImage',
            attrs: { kind: 'upload', ref: upload.id },
            content: [{ type: 'text', text: 'An article caption' }],
          },
        ],
      },
    };
    a = await saveArticle(db, user, { id, version: a.version, slug: 'article-test', content: a });
    await assert.rejects(publicArticle(pub, 'article-test'));
    await assert.rejects(deleteArticleMedia(db, dir, upload.id), /引用/);
    await assert.rejects(saveArticle(db, user, { id, version: '1', slug: a.slug, content: a }), /其他页面/);
    a = await publishArticle(db, user, { id, version: a.version }, root, dir);
    assert.equal((await publicArticle(pub, a.slug)).title, a.title);
    assert.ok((await publicArticles(pub)).articles.some((x) => x.id === id));
    assert.ok((await readArticleMedia(pub, dir, upload.id, 'preview', id)).length);
    let settings = await aboutArticleSettings(db);
    await saveAboutArticle(db, { id, version: settings.version });
    await assert.rejects(offlineArticle(db, { id, version: a.version }), /关于/);
    assert.equal((await publicArticle(pub, '', true)).title, a.title);
    const release = (
      await sql<{
        current_release_id: string;
      }>`SELECT current_release_id FROM gallery.article WHERE id=${id}::uuid`.execute(db)
    ).rows[0]!.current_release_id;
    await assert.rejects(
      sql`UPDATE gallery.article_release SET content='{}'::jsonb WHERE id=${release}::uuid`.execute(db),
    );
    await assert.rejects(
      sql`DELETE FROM gallery.article_media_ref WHERE release_id=${release}::uuid`.execute(db),
    );
    const stale = structuredClone(a);
    a.title = 'Unpublished title';
    a = await saveArticle(db, user, { id, version: a.version, slug: a.slug, content: a });
    assert.equal((await publicArticle(pub, '', true)).title, 'A formal journey');
    await assert.rejects(publishArticle(db, user, { id, version: stale.version }, root, dir), /版本/);
    a = await publishArticle(db, user, { id, version: a.version }, root, dir);
    assert.equal((await publicArticle(pub, '', true)).title, a.title);
    settings = await aboutArticleSettings(db);
    await saveAboutArticle(db, { id: '', version: settings.version });
    a = await offlineArticle(db, { id, version: a.version });
    await assert.rejects(readArticleMedia(pub, dir, upload.id, 'preview', id));
    await assert.rejects(publicArticle(pub, a.slug));
    // A second published article grants only its own media URL, not the offline article URL.
    const id2 = await createArticle(db, user);
    let second = await getArticle(db, id2);
    second = { ...second, title: 'About', document: a.document, listed: false };
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    assert.ok((await readArticleMedia(pub, dir, upload.id, 'preview', id2)).length);
    await assert.rejects(readArticleMedia(pub, dir, upload.id, 'preview', id));
    assert.ok(!(await publicArticles(pub)).articles.some((x) => x.id === id2));
    second.cover = { type: 'galleryImage', attrs: { kind: 'upload', ref: upload.id } };
    second.document = { schemaVersion: 1, doc: { type: 'doc', content: [text('Cover-only upload')] } };
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    assert.ok((await readArticleMedia(pub, dir, upload.id, 'preview', id2)).length);
    // Removing from the current release must withdraw access even when historical refs remain.
    second.cover = null;
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    await assert.rejects(readArticleMedia(pub, dir, upload.id, 'preview', id2));
    // Source photos retain their explicitly selected album context.
    for (const v of ['preview', 'thumbnail'])
      await writeFile(path.join(mediaRoot, `${asset}-${v}.jpg`), bytes);
    const album = await createAlbum(db, user, {
      title: 'Article source',
      treeVersion: (await adminState(db)).site.treeVersion,
    });
    const albumState = async () => {
      const state = await adminState(db);
      const row = state.albums.find((a) => a.id === album)!;
      return {
        row,
        v: { version: row.version, draftVersion: row.draftVersion, treeVersion: state.site.treeVersion },
      };
    };
    let sa = await albumState();
    sa.row.draft.photos = [
      {
        id: randomUUID(),
        asset,
        title: 'Source photo',
        description: 'Shared description',
        alt: 'Photo',
        location: 'inherit',
        tags: [],
      },
    ];
    await saveAlbum(db, user, album, { ...sa.v, content: sa.row.draft });
    await publishAlbum(db, user, album, (await albumState()).v, root);
    const photo: ArticleNode = {
      type: 'galleryImage',
      attrs: { kind: 'photo', ref: asset, album },
      content: [{ type: 'text', text: 'Local caption' }],
    };
    second.document = { schemaVersion: 1, doc: { type: 'doc', content: [text('Travel'), photo] } };
    second.albums = [album];
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    assert.ok((await publicArticle(pub, second.slug)).images[articleImageKey(photo)]);
    assert.ok((await relatedArticles(pub, album)).some((a) => a.slug === second.slug));
    sa = await albumState();
    await setAlbumAvailability(db, user, album, { ...sa.v, action: 'offline' });
    assert.equal((await publicArticle(pub, second.slug)).images[articleImageKey(photo)], undefined);
    await assert.rejects(publishArticle(db, user, { id: id2, version: second.version }, root, dir));
    // Filesystem safety and unused upload cleanup.
    const spare = await uploadArticleMedia(db, user, dir, bytes, 'spare.jpg');
    const key = (
      await sql<{
        storage_key: string;
      }>`SELECT storage_key FROM gallery.article_media WHERE id=${spare.id}::uuid`.execute(db)
    ).rows[0]!.storage_key;
    const file = path.join(dir, key, 'preview.webp');
    await rename(file, file + '.original');
    await symlink(file + '.original', file);
    await assert.rejects(readArticleMedia(db, dir, spare.id, 'preview'));
    await rm(file);
    await rename(file + '.original', file);
    await deleteArticleMedia(db, dir, spare.id);
    await assert.rejects(readArticleMedia(db, dir, spare.id, 'preview'));
    const draft = await createArticle(db, user);
    await deleteArticle(db, { id: draft, version: '1' });
    await assert.rejects(getArticle(db, draft));
    // Keep rows offline for the existing backup test; these synthetic uploads are cleaned at teardown.
    await offlineArticle(db, { id: second.id, version: second.version });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
