import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
assert.equal(
  execFileSync(
    'docker',
    ['inspect', 'gallery-upgrade-320-database-1', '--format', '{{index .Config.Labels "com.docker.compose.project"}}'],
    { encoding: 'utf8' },
  ).trim(),
  'gallery-upgrade-320',
);
const dir = resolve('.gallery-local/upgrade-v3.2.0');
const auth = JSON.parse(await readFile(dir + '/test-auth.json', 'utf8'));
const env = Object.fromEntries(
  (await readFile(dir + '/test.env', 'utf8'))
    .trim()
    .split('\n')
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const require = createRequire(resolve('packages/gallery-db/package.json'));
const sharp = require('sharp'),
  pg = require('pg');
const db = new pg.Client({
  host: '127.0.0.1',
  port: 45432,
  user: 'postgres',
  password: env.TEST_DB_PASSWORD,
  database: 'immich',
});
await db.connect();
const immich = 'http://127.0.0.1:40283',
  admin = 'http://localhost:4101',
  pub = 'http://127.0.0.1:4100';
let token = '',
  cookie = '';
async function request(base, path, { method = 'GET', body, headers = {}, status = 200 } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...headers,
      ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(r.status, status, `${method} ${path}: ${await r.clone().text()}`);
  return r;
}
const iapi = async (path, method = 'GET', body, status = 200) =>
  request(immich, '/api' + path, {
    method,
    body,
    status,
    headers: token ? { authorization: 'Bearer ' + token } : {},
  }).then((r) => r.json());
const gapi = async (action, body, status = 200) =>
  request(admin, '/api/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    body,
    status,
    headers: { cookie, origin: admin },
  }).then((r) => r.json());
const state = () => gapi('state');
const version = async (id) => {
  const s = await state(),
    a = s.albums.find((a) => a.id === id);
  return { id, version: a.version, draftVersion: a.draftVersion, treeVersion: s.site.treeVersion, content: a.draft };
};
try {
  const v = await iapi('/server/version');
  assert.deepEqual({ major: v.major, minor: v.minor, patch: v.patch }, { major: 3, minor: 2, patch: 0 });
  assert.equal(v.prerelease, null);
  const before = JSON.parse(await readFile(dir + '/restored-before.json', 'utf8'));
  const after = (
    await db.query(
      `SELECT (SELECT count(*) FROM public.asset) assets,(SELECT count(*) FROM gallery.album) albums,(SELECT count(*) FROM gallery.album_release) releases,(SELECT count(*) FROM gallery.album_release_photo) photos,(SELECT md5(string_agg(id::text||':'||description_document::text,',' ORDER BY id)) FROM gallery.album_release) content`,
    )
  ).rows[0];
  assert.deepEqual(after, before, 'Startup must retain restored Gallery content and assets');
  token = (await iapi('/auth/login', 'POST', { email: auth.immichEmail, password: auth.immichPassword }, 201))
    .accessToken;
  assert.ok(token);
  const signed = await request(admin, '/api/login', {
    method: 'POST',
    headers: { origin: admin },
    body: { email: auth.galleryEmail, password: auth.galleryPassword },
  });
  cookie = signed.headers.get('set-cookie').split(';')[0];
  await request(pub, '/albums');
  const original = (await state()).albums.find((a) => a.status === 'published');
  assert.ok(original);
  const existing = await request(pub, '/albums/' + original.draft.slug).then((r) => r.text());
  const oldImage = existing.match(/src="(\/media\/[^\"]+)"/)[1].replaceAll('&amp;', '&');
  await request(pub, oldImage);
  const assets = [];
  for (let n = 0; n < 2; n++) {
    const bytes = await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: n ? '#3c6d88' : '#884c39' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Gallery upgrade test' } } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set('assetData', new Blob([bytes], { type: 'image/jpeg' }), `gallery-upgrade-${randomUUID()}.jpg`);
    form.set('fileCreatedAt', new Date().toISOString());
    form.set('fileModifiedAt', new Date().toISOString());
    assets.push((await iapi('/assets', 'POST', form, 201)).id);
  }
  console.log('Official stable Immich: authentication, restored media and two new image uploads passed.');
  const sourceAlbums = [];
  for (let n = 0; n < 2; n++)
    sourceAlbums.push(
      (await iapi('/albums', 'POST', { albumName: 'Gallery 升级验收来源 ' + (n + 1), assetIds: [assets[n]] }, 201)).id,
    );
  for (const id of assets) {
    let found = false;
    for (let n = 0; n < 90; n++) {
      const s = await gapi('source');
      if (s.assets.some((a) => a.id === id)) {
        found = true;
        break;
      }
      await delay(1000);
    }
    assert.ok(found, 'Immich must produce both derivatives for new upload');
  }
  for (let n = 0; n < 2; n++)
    assert.ok((await gapi('source?album=' + sourceAlbums[n])).assets.some((a) => a.id === assets[n]));
  const parent = (await gapi('create', { title: '稳定版升级验收', treeVersion: (await state()).site.treeVersion })).id;
  await gapi('publish', await version(parent));
  const child = (
    await gapi('create', { title: '跨相册选片验收', parent, treeVersion: (await state()).site.treeVersion })
  ).id;
  let spec = await version(child);
  const content = {
    ...spec.content,
    summary: '只存在于隔离环境',
    blocks: [{ kind: 'paragraph', text: 'Gallery 独立游记验收' }],
    location: 'exact',
    showExif: true,
    cover: assets[0],
    photos: assets.map((asset, n) => ({
      id: randomUUID(),
      asset,
      title: 'Gallery 独立标题 ' + n,
      description: '与 Immich 描述独立',
      alt: '合成测试照片',
      location: 'inherit',
    })),
  };
  await gapi('save', { ...spec, content });
  await request(admin, '/preview/' + child, { headers: { cookie } });
  await gapi('publish', await version(child));
  const page = '/albums/' + content.slug,
    photo = '/media/' + child + '/' + content.photos[0].id + '?variant=preview',
    direct = page + '/photos/' + content.photos[0].id;
  await request(pub, direct);
  const image = await request(pub, photo);
  assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).exif, undefined);
  await iapi('/assets/' + assets[0], 'PUT', {
    latitude: 41.7151,
    longitude: 44.8271,
    description: 'Immich 的来源说明',
  });
  await iapi('/assets/' + assets[0], 'PUT', { latitude: 41.6168, longitude: 41.6367 });
  const coords = (
    await db.query('SELECT latitude,longitude,title FROM gallery.published_photo WHERE album_id=$1 AND photo_id=$2', [
      child,
      content.photos[0].id,
    ])
  ).rows[0];
  assert.equal(coords.longitude, 41.6367);
  assert.equal(coords.title, content.photos[0].title);
  await gapi('save', { ...(await version(child)), content: { ...content, summary: '未发布的新游记' } });
  assert.doesNotMatch(await request(pub, page).then((r) => r.text()), /未发布的新游记/);
  await gapi('availability', { ...(await version(parent)), action: 'offline' });
  await request(pub, direct, { status: 404 });
  await request(pub, photo, { status: 404 });
  await gapi('availability', { ...(await version(parent)), action: 'restore' });
  await request(pub, direct);
  await request(immich, '/api/assets', {
    method: 'DELETE',
    headers: { authorization: 'Bearer ' + token },
    body: { ids: [assets[0]] },
    status: 204,
  });
  await request(pub, direct, { status: 404 });
  await request(pub, photo, { status: 404 });
  await gapi('logout', {});
  await request(admin, '/api/state', { headers: { cookie }, status: 401 });
  await writeFile(
    dir + '/flow-result.json',
    JSON.stringify(
      {
        passed: true,
        immichVersion: v,
        restoredCounts: before,
        uploadedImages: 2,
        sourceAlbums: 2,
        crossAlbumSelection: true,
        draftIsolation: true,
        parentRevocation: true,
        sourceTrashRevocation: true,
        liveGps: true,
        metadataStripped: true,
        testAlbumSlug: content.slug,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    'Gallery: cross-source selection, draft/preview/publish, photo links, live GPS, ancestry/source revocation and logout passed.',
  );
} finally {
  await db.end();
}
