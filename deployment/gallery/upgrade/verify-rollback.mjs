import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
const pg = require('pg');
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
try {
  const v = await iapi('/server/version');
  assert.deepEqual({ major: v.major, minor: v.minor, patch: v.patch }, { major: 3, minor: 2, patch: 0 });
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
  assert.equal(v.prerelease, 0);
  await gapi('logout', {});
  await writeFile(
    dir + '/rollback-result.json',
    JSON.stringify(
      {
        passed: true,
        version: v,
        restoredCounts: after,
        immichLogin: true,
        galleryLogin: true,
        originalPublishedMedia: true,
        runtime: 'previous compiled server and Node; unchanged production dependency versions from stable image',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log('Rollback: previous server version, original data digest, both logins and published media passed.');
} finally {
  await db.end();
}
