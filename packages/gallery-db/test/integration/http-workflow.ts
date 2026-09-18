import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import sharp from 'sharp';
import type { AlbumContent, ManagedAlbum } from '@gallery/core';

async function port() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const p = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return p;
}
export async function httpWorkflow(asset: string, mediaRoot: string) {
  const config = JSON.parse(await readFile(process.env.GALLERY_TEST_CONFIG!, 'utf8')) as {
    ownerUrl: string;
    passwords: Record<string, string>;
  };
  const ports = { admin: await port(), public: await port() };
  const origins = { admin: `http://localhost:${ports.admin}`, public: `http://127.0.0.1:${ports.public}` };
  const children: ChildProcess[] = [];
  async function start(service: 'admin' | 'public') {
    const url = new URL(config.ownerUrl);
    url.username = `gallery_${service}`;
    url.password = config.passwords[service]!;
    const cwd = fileURLToPath(new URL(`../../../gallery-${service}/`, import.meta.url));
    const child = spawn(
      process.execPath,
      [
        process.env.GALLERY_BUILD_SUBDIR
          ? `build/${process.env.GALLERY_BUILD_SUBDIR}/index.js`
          : 'build/index.js',
      ],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          GALLERY_DATABASE_URL: url.toString(),
          GALLERY_ADMIN_ORIGIN: origins.admin,
          GALLERY_PUBLIC_ORIGIN: origins.public,
          GALLERY_MEDIA_SOURCE_ROOT: '/data/thumbs',
          GALLERY_MEDIA_MOUNTED_ROOT: mediaRoot,
          GALLERY_ARTICLE_MEDIA_ROOT: mediaRoot + '/article-uploads',
          BODY_SIZE_LIMIT: '12M',
          GALLERY_DESIGN_PREVIEW: '0',
          HOST: '127.0.0.1',
          PORT: String(ports[service]),
          ORIGIN: origins[service],
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    children.push(child);
    let log = '';
    for (const stream of [child.stdout, child.stderr])
      stream!.on('data', (chunk) => {
        log = (log + chunk).slice(-3000);
      });
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null, `app startup failed: ${log}`);
      try {
        const r = await fetch(`${origins[service]}/health/ready`);
        if (r.status === 200) return child;
      } catch {}
      await delay(100);
    }
    throw new Error(`app readiness failed: ${log}`);
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'close');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    try {
      await closed;
    } finally {
      clearTimeout(timer);
    }
  }
  let cookie = '';
  async function api(action: string, body?: unknown, expected = 200, origin = origins.admin) {
    const response = await fetch(
      `${origins.admin}/api/${action}`,
      body === undefined
        ? { headers: { cookie } }
        : {
            method: 'POST',
            headers: { cookie, origin, 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    assert.equal(response.status, expected, `${action}: ${await response.clone().text()}`);
    return response;
  }
  try {
    let admin = await start('admin');
    let pub = await start('public');
    const oldLink = await fetch(`http://127.0.0.1:${ports.admin}/login?from=old-link`, {
      redirect: 'manual',
    });
    assert.equal(oldLink.status, 307);
    assert.equal(oldLink.headers.get('location'), `${origins.admin}/login?from=old-link`);
    const wrongHost = await fetch(`${origins.admin}/login`, {
      headers: { host: 'example.invalid' },
      redirect: 'manual',
    });
    assert.equal(wrongHost.status, 200); // No redirect to any value supplied by a request header.
    assert.equal((await fetch(`${origins.admin}/albums`, { redirect: 'manual' })).status, 303);
    await api('source', undefined, 401);
    assert.equal((await fetch(`${origins.admin}/media/source/${asset}`)).status, 401);
    const signed = await api('login', {
      email: 'gallery@example.invalid',
      password: 'replacement-synthetic-password',
    });
    cookie = signed.headers.get('set-cookie')!.split(';')[0]!;
    assert.match(signed.headers.get('set-cookie')!, /HttpOnly/i);
    assert.match(signed.headers.get('set-cookie')!, /SameSite=Strict/i);
    const rejected = await api('create', { title: 'forbidden' }, 403, 'https://unrelated.example');
    assert.match(rejected.headers.get('content-type') ?? '', /application\/json/);
    assert.match((await rejected.json()).message, /请求来源与后台地址不一致/);
    const wrongLogin = await api(
      'login',
      { email: 'gallery@example.invalid', password: 'replacement-synthetic-password' },
      403,
      `http://127.0.0.1:${ports.admin}`,
    );
    assert.ok((await wrongLogin.json()).message.includes(origins.admin + '/login'));
    await api(
      'login',
      { email: 'gallery@example.invalid', password: 'replacement-synthetic-password' },
      403,
      'http://127.0.0.1',
    );
    await api(
      'login',
      { email: 'gallery@example.invalid', password: 'replacement-synthetic-password' },
      403,
      `http://localhost:${ports.public}`,
    );
    const oldPost = await fetch(`http://127.0.0.1:${ports.admin}/api/login`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1', 'content-type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    });
    assert.equal(oldPost.status, 403);
    assert.equal(oldPost.headers.get('location'), null);
    assert.equal(
      (
        await fetch(`${origins.admin}/api/create`, {
          method: 'POST',
          headers: { cookie, origin: origins.admin, 'content-type': 'text/plain' },
          body: '{}',
        })
      ).status,
      415,
    );
    const current = () => api('state').then((r) => r.json());
    await api('profile', { displayName: 'Updated administrator' });
    assert.equal((await current()).user.displayName, 'Updated administrator');
    const site = (await current()).site;
    await api('site', { ...site, contactLinks: [{ label: 'Contact', url: 'mailto:photo@example.invalid' }] });
    assert.equal((await current()).site.contactLinks[0].url, 'mailto:photo@example.invalid');
    assert.match(
      await fetch(`${origins.public}/about`).then((r) => r.text()),
      /mailto:photo@example.invalid/,
    );
    await api('site', { ...site, contactLinks: [{ label: 'Bad', url: 'javascript:alert(1)' }] }, 400);

    const created = await api('create', {
      title: 'HTTP workflow',
      treeVersion: (await current()).site.treeVersion,
    }).then((r) => r.json());
    async function version() {
      const s = await current();
      const a = s.albums.find((a: ManagedAlbum) => a.id === created.id) as ManagedAlbum;
      return {
        id: created.id,
        version: a.version,
        draftVersion: a.draftVersion,
        treeVersion: s.site.treeVersion,
        content: a.draft,
      };
    }
    const v = await version();
    const content: AlbumContent = {
      ...v.content,
      summary: 'Published summary',
      cover: asset,
      photos: [
        {
          id: randomUUID(),
          asset,
          // The 10,000 map fixtures can sort ahead of this asset; narrow the picker before reading its version.
          photoVersion: (await (await api('source?search=sample.raw')).json()).assets.find(
            (p: { id: string }) => p.id === asset,
          )?.galleryPhoto?.photoVersion,
          title: 'HTTP published photo',
          description: 'Own description',
          alt: 'Synthetic image',
          location: 'inherit',
        },
      ],
    };
    await api('save', { ...v, content });
    await api('publish', await version());
    const url = `${origins.public}/albums/${content.slug}`;
    const published = await fetch(url);
    assert.equal(published.status, 200);
    assert.match(await published.text(), /Published summary/);
    assert.equal(published.headers.get('cache-control'), 'no-store');
    const directUrl = `${url}/photos/${content.photos[0]!.id}`;
    assert.equal((await fetch(directUrl)).status, 200);
    assert.match(await fetch(directUrl).then((r) => r.text()), /HTTP published photo/);
    assert.equal((await fetch(`${url}/photos/${randomUUID()}`)).status, 404);
    assert.equal((await fetch(`${url}/photos/invalid`)).status, 404);
    const photoUrl = `${origins.public}/media/${created.id}/${content.photos[0]!.id}?variant=preview`;
    const image = await fetch(photoUrl);
    assert.equal(image.status, 200);
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.format, 'jpeg');
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    content.photos = (await version()).content.photos;
    await api('save', { ...(await version()), content: { ...content, summary: 'Unpublished summary' } });
    assert.doesNotMatch(await fetch(url).then((r) => r.text()), /Unpublished summary/);
    assert.equal(
      (await fetch(`${origins.admin}/preview/${created.id}`, { headers: { cookie } })).status,
      200,
    );
    assert.equal((await fetch(`${origins.public}/media/${created.id}/${randomUUID()}`)).status, 404);
    await api('availability', { ...(await version()), action: 'offline' });
    assert.equal((await fetch(url)).status, 404);
    assert.equal((await fetch(directUrl)).status, 404);
    assert.equal((await fetch(photoUrl)).status, 404);
    await api('availability', { ...(await version()), action: 'restore' });
    assert.match(await fetch(url).then((r) => r.text()), /Published summary/);
    await stop(admin);
    await stop(pub);
    admin = await start('admin');
    pub = await start('public');
    assert.equal(
      (await current()).albums.find((a: ManagedAlbum) => a.id === created.id).draft.summary,
      'Unpublished summary',
    );
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(directUrl)).status, 200);
    assert.equal((await current()).user.displayName, 'Updated administrator');
    const tagResult = await api('tag-save', { name: 'HTTP topic', active: true }).then((r) => r.json());
    const tagged = await version();
    tagged.content.photos[0]!.tags = [tagResult.id];
    await api('item', { ...tagged, target: tagged.content.photos[0]!.id, publish: false });
    assert.doesNotMatch(await fetch(`${origins.public}/photos`).then((r) => r.text()), /HTTP topic/);
    await api('item', { ...(await version()), target: tagged.content.photos[0]!.id, publish: true });
    const filtered = await fetch(`${origins.public}/photos?tag=${tagResult.id}`).then((r) => r.text());
    assert.match(filtered, /HTTP topic/);
    assert.match(filtered, /1 张/);
    assert.match(await fetch(directUrl).then((r) => r.text()), /HTTP topic/);
    assert.equal((await fetch(`${origins.admin}/tags`, { headers: { cookie } })).status, 200);
    // 240 distinct scoped assets, one generated derivative file. No personal photos.
    await writeFile(
      `${mediaRoot}/synthetic.jpg`,
      await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#40674e' } })
        .jpeg()
        .toBuffer(),
    );
    const large = {
      ...content,
      photos: Array.from({ length: 240 }, (_, i) => ({
        id: randomUUID(),
        asset: `99999999-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        title: `Load photo ${i + 1}`,
        description: 'Synthetic performance fixture',
        alt: 'Synthetic image',
        location: 'inherit' as const,
      })),
    };
    large.cover = large.photos[0]!.asset;
    await api('save', { ...(await version()), content: large });
    const publishStart = performance.now();
    await api('publish', await version());
    assert.equal((await fetch(directUrl)).status, 404); // Removed from the new release.
    const pageStart = performance.now();
    const pageHtml = await fetch(`${url}?page=2`).then((r) => r.text());
    assert.match(pageHtml, /Load photo 49/);
    assert.equal((pageHtml.match(/class="photo /g) ?? []).length, 48);
    const pageMs = performance.now() - pageStart;
    const mediaUrls = large.photos.slice(0, 24).map((p) => `${origins.public}/media/${created.id}/${p.id}`);
    async function batch() {
      const start = performance.now();
      await Promise.all(
        mediaUrls.map(async (u) => {
          const r = await fetch(u);
          assert.equal(r.status, 200);
          assert.ok((await r.arrayBuffer()).byteLength > 0);
        }),
      );
      return performance.now() - start;
    }
    const coldMs = await batch(),
      warmMs = await batch();
    console.log(
      `240-photo fixture: publish ${(pageStart - publishStart).toFixed(0)} ms; page ${pageMs.toFixed(0)} ms; 24 concurrent thumbnails cold ${coldMs.toFixed(0)} ms / warm ${warmMs.toFixed(0)} ms.`,
    );
    await api('availability', { ...(await version()), action: 'offline' });
    assert.equal((await fetch(mediaUrls[0]!)).status, 404); // Warm encoding cache cannot bypass authorization.
    await api('availability', { ...(await version()), action: 'restore' });
    // Article HTTP loop: no seed data leaks to production, all routes use real runtime roles.
    const articleId = (await (await api('article-create', {})).json()).id;
    let articleVersion = '1';
    const articleContent = {
      title: 'HTTP article',
      summary: 'A journey',
      date: '2025-06-01',
      listed: true,
      albums: [],
      cover: null,
      document: {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Public article body' }] }],
        },
      },
    };
    let articleResult = await (
      await api('article-save', {
        id: articleId,
        version: articleVersion,
        slug: 'http-article',
        content: articleContent,
      })
    ).json();
    assert.ok(Number.isFinite(Date.parse(articleResult.updatedAt)), 'save response contains persisted timestamp');
    const previewUrl = `${origins.admin}/articles/${articleId}/preview`;
    assert.equal((await fetch(previewUrl, { redirect: 'manual' })).status, 303);
    const draftPreview = await fetch(previewUrl, { headers: { cookie } });
    assert.equal(draftPreview.status, 200);
    assert.equal(draftPreview.headers.get('cache-control'), 'no-store');
    assert.match(draftPreview.headers.get('x-robots-tag') || '', /noindex/);
    const draftHtml = await draftPreview.text();
    assert.match(draftHtml, /Public article body/);
    assert.match(draftHtml, /草稿预览/);
    assert.match(draftHtml, /public-footer/);
    articleVersion = articleResult.version;
    assert.equal((await fetch(`${origins.public}/records/http-article`)).status, 404);
    await api(
      'article-save',
      { id: articleId, version: '1', slug: 'http-article', content: articleContent },
      409,
    );
    const uploadImage = await sharp(randomBytes(900 * 900 * 3), {
      raw: { width: 900, height: 900, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();
    assert.ok(uploadImage.length > 512 * 1024);
    const requestUpload = (headers: Record<string, string>, body: Buffer<ArrayBuffer> = uploadImage) =>
      fetch(`${origins.admin}/api/article-upload`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', 'x-file-name': 'sample.jpg', ...headers },
        body,
      });
    // Authentication rejects before reading the body. Keep rejected requests small
    // and consume their responses before reusing the HTTP connection.
    const anonymousUpload = await requestUpload({ origin: origins.admin }, Buffer.from('unauthorized'));
    assert.equal(anonymousUpload.status, 401);
    await anonymousUpload.arrayBuffer();
    const crossOriginUpload = await requestUpload(
      { cookie, origin: 'https://unrelated.example' },
      Buffer.from('cross-origin'),
    );
    assert.equal(crossOriginUpload.status, 403);
    await crossOriginUpload.arrayBuffer();
    const uploaded = await requestUpload({ cookie, origin: origins.admin });
    assert.equal(uploaded.status, 200);
    const material = await uploaded.json();
    const contentWithImage = {
      ...articleContent,
      cover: { type: 'galleryImage', attrs: { kind: 'upload', ref: material.id } },
      document: {
        schemaVersion: 1,
        doc: {
          type: 'doc',
          content: [
            ...articleContent.document.doc.content,
            { type: 'galleryImage', attrs: { kind: 'upload', ref: material.id }, content: [] },
          ],
        },
      },
    };
    articleResult = await (
      await api('article-save', {
        id: articleId,
        version: articleVersion,
        slug: 'http-article',
        content: contentWithImage,
      })
    ).json();
    articleVersion = articleResult.version;
    const articleMediaUrl = `${origins.public}/media/articles/${articleId}/${material.id}?variant=preview`;
    assert.equal((await fetch(articleMediaUrl)).status, 404);
    articleResult = await (await api('article-publish', { id: articleId, version: articleVersion })).json();
    articleVersion = articleResult.version;
    assert.equal((await fetch(articleMediaUrl)).status, 200);
    assert.match(
      await fetch(`${origins.public}/records/http-article`).then((r) => r.text()),
      /Public article body/,
    );
    assert.match(await fetch(`${origins.public}/records`).then((r) => r.text()), /HTTP article/);
    assert.equal(
      (await fetch(`${origins.admin}/articles/${articleId}`, { headers: { cookie } })).status,
      200,
    );
    const about = await (await api('article-about')).json();
    await api('article-about', { id: articleId, version: about.version });
    await api('article-offline', { id: articleId, version: articleVersion }, 409);
    assert.match(await fetch(`${origins.public}/about`).then((r) => r.text()), /Public article body/);
    articleResult = await (
      await api('article-save', {
        id: articleId,
        version: articleVersion,
        slug: 'http-article',
        content: { ...contentWithImage, title: 'Draft-only title' },
      })
    ).json();
    articleVersion = articleResult.version;
    assert.ok(!(await fetch(`${origins.public}/about`).then((r) => r.text())).includes('Draft-only title'));
    const aboutAfter = await (await api('article-about')).json();
    await api('article-about', { id: '', version: aboutAfter.version });
    articleResult = await (await api('article-offline', { id: articleId, version: articleVersion })).json();
    articleVersion = articleResult.version;
    assert.equal((await fetch(articleMediaUrl)).status, 404);
    articleResult = await (await api('article-publish', { id: articleId, version: articleVersion })).json();
    assert.equal((await fetch(articleMediaUrl)).status, 200);
    console.log(
      'Article HTTP: authenticated upload >512KB, drafts, optimistic conflict, publication, about binding and media revocation passed.',
    );
    await api('logout', {});
    await api('state', undefined, 401);
  } finally {
    await Promise.allSettled(children.map(stop));
  }
}
