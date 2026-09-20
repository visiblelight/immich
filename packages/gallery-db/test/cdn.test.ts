import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { cdnObjectKey, publishedCdnRedirect, signCdnUrl } from '../src/cdn.server.ts';
const bytes = Buffer.from([255, 216, 255, 217]);
const secret = 'testOnlySigningKey0000000000000000';

test('content-addressed object keys change when derivative bytes change', () => {
  assert.match(cdnObjectKey(bytes), /^gallery\/v1\/[a-f0-9]{64}\.jpg$/);
  assert.notEqual(cdnObjectKey(bytes), cdnObjectKey(Buffer.concat([bytes, Buffer.from('changed')])));
  assert.throws(() => cdnObjectKey(Buffer.from('not an image')));
});
test('A signature covers URI, original authorization timestamp, nonce and secret', () => {
  const key = cdnObjectKey(bytes), timestamp = 1789000000, nonce = 'abc123';
  const url = new URL(signCdnUrl('https://cdn.example.com', key, secret, timestamp, nonce));
  const digest = createHash('md5').update(`/${key}-${timestamp}-${nonce}-0-${secret}`).digest('hex');
  assert.equal(url.searchParams.get('auth_key'), `${timestamp}-${nonce}-0-${digest}`);
  assert.throws(() => signCdnUrl('http://cdn.example.com', key, secret, timestamp));
  assert.throws(() => signCdnUrl('https://cdn.example.com/path', key, secret, timestamp));
  assert.throws(() => signCdnUrl('https://cdn.example.com', '../original.jpg', secret, timestamp));
});
test('redirect requires ready matching bytes, fresh worker state and enabled configuration', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'gallery-cdn-'));
  const now = Date.now();
  const config = { enabled: true, origin: 'https://cdn.example.com', signingKey: secret };
  const state = { version: 1, checkedAt: now, objects: { [cdnObjectKey(bytes)]: true } };
  const put = async (name: string, data: unknown) => writeFile(path.join(directory, name), JSON.stringify(data));
  try {
    assert.equal(await publishedCdnRedirect(bytes, now, directory), null);
    await put('config.json', config); await put('ready.json', state);
    const response = await publishedCdnRedirect(bytes, now, directory);
    assert.equal(response?.status, 302);
    assert.equal(response?.headers.get('cache-control'), 'no-store');
    assert.ok(response?.headers.get('location')?.includes(`auth_key=${Math.floor(now / 1000)}-`));
    assert.equal(await publishedCdnRedirect(Buffer.concat([bytes, Buffer.from('new')]), now, directory), null);
    assert.equal(await publishedCdnRedirect(bytes, now - 31000, directory), null);
    await put('ready.json', { ...state, checkedAt: now - 181000 });
    assert.equal(await publishedCdnRedirect(bytes, now, directory), null);
    await put('ready.json', { ...state, checkedAt: now + 60000 });
    assert.equal(await publishedCdnRedirect(bytes, now, directory), null);
    await put('ready.json', state); await put('config.json', { ...config, enabled: false });
    assert.equal(await publishedCdnRedirect(bytes, now, directory), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
