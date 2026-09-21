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
  saveSite,
  publicCatalog,
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
  readArticlePhotoDerivative,
  readPublishedDerivative,
  publicPhotoFeed,
} from '../../src/index.server.ts';
import { articleImageKey, type ArticleNode } from '../../../gallery-core/src/article.ts';
export async function articles(
  db: Kysely<unknown>,
  pub: Kysely<unknown>,
  owner: pg.Client,
  userId: string,
  asset: string,
  mediaRoot: string,
  otherAsset: string,
) {
  const user = {
    id: userId,
    email: 'gallery@example.invalid',
    displayName: 'Gallery',
  };
  const root = { sourceRoot: '/data/thumbs', mountedRoot: mediaRoot };
  const dir = await mkdtemp(path.join(tmpdir(), 'gallery-article-files-'));
  const text = (s: string): ArticleNode => ({
    type: 'paragraph',
    content: [{ type: 'text', text: s }],
  });
  try {
    const bytes = await sharp({
      create: { width: 100, height: 80, channels: 3, background: '#658068' },
    })
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
    assert.equal(a.firstPublishedAt, null);
    a.title = 'A formal journey';
    a.summary = 'Public summary';
    a.document = {
      schemaVersion: 1,
      doc: {
        type: 'doc',
        content: [
          text('Published text'),
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1 },
                    content: [text('Rome')],
                  },
                ],
              },
            ],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [text('Passport')],
              },
            ],
          },
          {
            type: 'codeBlock',
            content: [{ type: 'text', text: 'day 1\n  Rome' }],
          },
          {
            type: 'galleryImage',
            attrs: { kind: 'upload', ref: upload.id },
            content: [{ type: 'text', text: 'An article caption' }],
          },
        ],
      },
    };
    a = await saveArticle(db, user, {
      id,
      version: a.version,
      slug: 'article-test',
      content: a,
    });
    await assert.rejects(publicArticle(pub, 'article-test'));
    await assert.rejects(deleteArticleMedia(db, dir, upload.id), /引用/);
    await assert.rejects(saveArticle(db, user, { id, version: '1', slug: a.slug, content: a }), /其他页面/);
    a = await publishArticle(db, user, { id, version: a.version }, root, dir);
    const firstPublished = a.firstPublishedAt;
    assert.ok(firstPublished);
    assert.equal(a.publishedAt, firstPublished);
    const initialPublic = await publicArticle(pub, a.slug);
    assert.equal(initialPublic.title, a.title);
    assert.equal(initialPublic.firstPublishedAt, firstPublished);
    assert.deepEqual(initialPublic.document, a.document);
    assert.ok((await publicArticles(pub)).articles.some((x) => x.id === id));
    assert.ok((await readArticleMedia(pub, dir, upload.id, 'preview', id)).length);
    let settings = await aboutArticleSettings(db);
    const siteBefore = (await adminState(db)).site;
    const unified = {
      ...siteBefore,
      name: 'Unified settings',
      copyrightName: 'Photo author',
      footerText: 'Light and distance',
      aboutArticleId: id,
      aboutArticleVersion: settings.version,
    };
    await saveSite(db, user, unified);
    assert.equal((await aboutArticleSettings(db)).id, id);
    const shownSite = (await publicCatalog(pub)).site;
    assert.equal(shownSite.copyrightName, 'Photo author');
    assert.equal(shownSite.footerText, 'Light and distance');
    assert.equal(shownSite.name, 'Unified settings');
    await assert.rejects(saveSite(db, user, unified), /刷新/);
    const updatedSite = (await adminState(db)).site;
    const updatedAbout = await aboutArticleSettings(db);
    await assert.rejects(
      saveSite(db, user, {
        ...updatedSite,
        name: 'Must roll back',
        aboutArticleId: randomUUID(),
        aboutArticleVersion: updatedAbout.version,
      }),
      /已发布/,
    );
    assert.equal((await publicCatalog(pub)).site.name, 'Unified settings');
    assert.equal((await aboutArticleSettings(db)).version, updatedAbout.version);
    await assert.rejects(saveSite(db, user, { ...updatedSite, footerText: 'x'.repeat(301) }), /页脚/);
    await saveAboutArticle(db, { id, version: updatedAbout.version });
    await assert.rejects(saveSite(db, user, { ...updatedSite }), /刷新/);

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
    a = await saveArticle(db, user, {
      id,
      version: a.version,
      slug: a.slug,
      content: a,
    });
    assert.equal((await publicArticle(pub, '', true)).title, 'A formal journey');
    await assert.rejects(publishArticle(db, user, { id, version: stale.version }, root, dir), /版本/);
    a = await publishArticle(db, user, { id, version: a.version }, root, dir);
    assert.equal(a.firstPublishedAt, firstPublished);
    assert.ok(a.publishedAt! >= firstPublished!);
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
    second.cover = {
      type: 'galleryImage',
      attrs: { kind: 'upload', ref: upload.id },
    };
    second.document = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [text('Cover-only upload')] },
    };
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
        v: {
          version: row.version,
          draftVersion: row.draftVersion,
          treeVersion: state.site.treeVersion,
        },
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
    second.document = {
      schemaVersion: 1,
      doc: { type: 'doc', content: [text('Travel'), photo] },
    };
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
    // Hidden works retain album membership and shared metadata, but only article context grants bytes.
    await assert.rejects(sql`SELECT * FROM gallery.article_source_photo`.execute(pub));
    await assert.rejects(sql`SELECT * FROM gallery.article_source_group`.execute(pub));
    sa = await albumState();
    const photoId = sa.row.draft.photos[0]!.id;
    sa.row.draft.photos[0]!.hiddenFromGallery = true;
    sa.row.draft.cover = asset;
    await saveAlbum(db, user, album, { ...sa.v, content: sa.row.draft });
    assert.ok(
      (await readPublishedDerivative(pub, album, photoId, 'preview', root)).bytes.length,
      'draft visibility does not alter public release',
    );
    await publishAlbum(db, user, album, (await albumState()).v, root);
    await assert.rejects(readPublishedDerivative(pub, album, photoId, 'preview', root));
    const hiddenCatalog = await publicCatalog(pub, (await albumState()).row.draft.slug);
    assert.equal(hiddenCatalog.active!.photos.length, 0);
    assert.equal(hiddenCatalog.active!.cover, null);
    assert.ok(!(await publicPhotoFeed(pub)).photos.some((p) => p.albumId === album));
    assert.equal(
      (await sql`SELECT 1 FROM gallery.published_photo WHERE asset_id=${asset}::uuid`.execute(pub)).rows
        .length,
      0,
    );
    assert.ok((await readArticlePhotoDerivative(pub, id2, album, asset, 'preview', root)).bytes.length);
    await assert.rejects(readArticlePhotoDerivative(pub, randomUUID(), album, asset, 'preview', root));
    const picker = await articleMediaOptions(db, 'photo', '', album);
    assert.equal(picker.items[0]!.hidden, true);
    assert.equal((await albumState()).row.draft.photos.length, 1);
    // The same work in a second album retains hidden status, never broadens the public grant.
    const otherAlbum = await createAlbum(db, user, {
      title: 'Other context',
      treeVersion: (await adminState(db)).site.treeVersion,
    });
    let all = await adminState(db),
      other = all.albums.find((a) => a.id === otherAlbum)!;
    other.draft.photos = [{ ...(await albumState()).row.draft.photos[0]!, id: randomUUID() }];
    await saveAlbum(db, user, otherAlbum, {
      version: other.version,
      draftVersion: other.draftVersion,
      treeVersion: all.site.treeVersion,
      content: other.draft,
    });
    all = await adminState(db);
    other = all.albums.find((a) => a.id === otherAlbum)!;
    await publishAlbum(
      db,
      user,
      otherAlbum,
      { version: other.version, draftVersion: other.draftVersion, treeVersion: all.site.treeVersion },
      root,
    );
    await assert.rejects(readArticlePhotoDerivative(pub, id2, otherAlbum, asset, 'preview', root));
    assert.equal((await publicCatalog(pub, other.draft.slug)).active!.photos.length, 0);
    // Published Gallery group references stay live; temporary groups keep article-local membership.
    for (const variant of ['preview', 'thumbnail'])
      await writeFile(path.join(mediaRoot, `${otherAsset}-${variant}.jpg`), bytes);
    sa = await albumState();
    const groupId = randomUUID();
    sa.row.draft.photos[0]!.group = groupId;
    sa.row.draft.photos.push({
      id: randomUUID(),
      asset: otherAsset,
      title: 'Second view',
      description: 'Different angle',
      alt: 'Second',
      location: 'inherit',
      group: groupId,
      tags: [],
    });
    sa.row.draft.groups = [
      { id: groupId, title: 'Referenced group', description: 'Shared group caption', cover: photoId },
    ];
    await saveAlbum(db, user, album, { ...sa.v, content: sa.row.draft });
    await publishAlbum(db, user, album, (await albumState()).v, root);
    const live: ArticleNode = { type: 'galleryImageGroup', attrs: { kind: 'group', ref: groupId, album } };
    const temporary: ArticleNode = {
      type: 'galleryImageGroup',
      attrs: { kind: 'temporary', caption: 'Article-only' },
      content: [photo, { type: 'galleryImage', attrs: { kind: 'upload', ref: upload.id } }],
    };
    second.document.doc.content = [text('Travel'), live, temporary];
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    await assert.rejects(
      readArticlePhotoDerivative(pub, id2, album, otherAsset, 'preview', root),
      'draft group does not grant a newly selected member',
    );
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    let shown = await publicArticle(pub, second.slug);
    assert.equal(shown.images[articleImageKey(live)]!.items!.length, 2);
    assert.equal(shown.images[articleImageKey(live)]!.caption, 'Shared group caption');
    assert.ok((await readArticlePhotoDerivative(pub, id2, album, otherAsset, 'preview', root)).bytes.length);
    assert.ok((await readArticleMedia(pub, dir, upload.id, 'preview', id2)).length);
    assert.equal((await articleMediaOptions(db, 'group', '', album)).items[0]!.items!.length, 2);
    const groupRelease = (
      await sql<any>`SELECT current_release_id FROM gallery.article WHERE id=${id2}::uuid`.execute(db)
    ).rows[0]!.current_release_id;
    await assert.rejects(
      sql`DELETE FROM gallery.article_group_ref WHERE release_id=${groupRelease}::uuid`.execute(db),
    );
    sa = await albumState();
    sa.row.draft.groups![0]!.description = 'Updated group caption';
    sa.row.draft.photos.reverse();
    await saveAlbum(db, user, album, { ...sa.v, content: sa.row.draft });
    assert.equal(
      (await publicArticle(pub, second.slug)).images[articleImageKey(live)]!.caption,
      'Shared group caption',
    );
    await publishAlbum(db, user, album, (await albumState()).v, root);
    shown = await publicArticle(pub, second.slug);
    assert.equal(shown.images[articleImageKey(live)]!.caption, 'Updated group caption');
    assert.equal(shown.images[articleImageKey(live)]!.items![0]!.ref, otherAsset);
    // Removing the live source group revokes its members; independently referenced hidden photo remains valid.
    sa = await albumState();
    sa.row.draft.groups = [];
    for (const p of sa.row.draft.photos) p.group = '';
    await saveAlbum(db, user, album, { ...sa.v, content: sa.row.draft });
    await publishAlbum(db, user, album, (await albumState()).v, root);
    assert.equal((await publicArticle(pub, second.slug)).images[articleImageKey(live)], undefined);
    await assert.rejects(readArticlePhotoDerivative(pub, id2, album, otherAsset, 'preview', root));
    assert.ok((await readArticlePhotoDerivative(pub, id2, album, asset, 'preview', root)).bytes.length);
    // Remove the historical temporary reference and prove it no longer authorizes bytes.
    second.document.doc.content = [text('Travel'), photo];
    second = await saveArticle(db, user, {
      id: id2,
      version: second.version,
      slug: second.slug,
      content: second,
    });
    second = await publishArticle(db, user, { id: id2, version: second.version }, root, dir);
    await assert.rejects(readArticleMedia(pub, dir, upload.id, 'preview', id2));
    sa = await albumState();
    await setAlbumAvailability(db, user, album, { ...sa.v, action: 'offline' });
    await assert.rejects(readArticlePhotoDerivative(pub, id2, album, asset, 'preview', root));

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
