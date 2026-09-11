import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
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
    const child = spawn(process.execPath, ['build/index.js'], {
      cwd,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        GALLERY_DATABASE_URL: url.toString(),
        GALLERY_ADMIN_ORIGIN: origins.admin,
        GALLERY_PUBLIC_ORIGIN: origins.public,
        GALLERY_MEDIA_SOURCE_ROOT: '/data/thumbs',
        GALLERY_MEDIA_MOUNTED_ROOT: mediaRoot,
        GALLERY_DESIGN_PREVIEW: '0',
        HOST: '127.0.0.1',
        PORT: String(ports[service]),
        ORIGIN: origins[service],
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    const oldLink = await fetch(`http://127.0.0.1:${ports.admin}/login?from=old-link`, { redirect: 'manual' });
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
    const signed = await api('login', { email: 'gallery@example.invalid', password: 'replacement-synthetic-password' });
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
    const photoUrl = `${origins.public}/media/${created.id}/${content.photos[0]!.id}?variant=preview`;
    const image = await fetch(photoUrl);
    assert.equal(image.status, 200);
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.format, 'webp');
    assert.equal(image.headers.get('cache-control'), 'no-store');
    await api('save', { ...(await version()), content: { ...content, summary: 'Unpublished summary' } });
    assert.doesNotMatch(await fetch(url).then((r) => r.text()), /Unpublished summary/);
    assert.equal((await fetch(`${origins.admin}/preview/${created.id}`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${origins.public}/media/${created.id}/${randomUUID()}`)).status, 404);
    await api('availability', { ...(await version()), action: 'offline' });
    assert.equal((await fetch(url)).status, 404);
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
    await api('logout', {});
    await api('state', undefined, 401);
  } finally {
    await Promise.allSettled(children.map(stop));
  }
}
