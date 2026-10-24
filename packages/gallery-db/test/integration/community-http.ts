import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type { CommunityTarget } from '@gallery/core';
import type { MediaRoot } from '../../src/media.server.ts';
export async function communityHttp(
  communityUrl: string,
  secret: string,
  root: MediaRoot,
  token: string,
  target: CommunityTarget,
  challenge: { id: string; code: string },
) {
  const config = JSON.parse(await readFile(process.env.GALLERY_TEST_CONFIG!, 'utf8'));
  const dbUrl = new URL(config.ownerUrl);
  dbUrl.username = 'gallery_public';
  dbUrl.password = config.passwords.public;
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((r) => listener.close(() => r()));
  const origin = `http://localhost:${port}`;
  const child = spawn(
    process.execPath,
    [
      process.env.GALLERY_BUILD_SUBDIR
        ? `build/${process.env.GALLERY_BUILD_SUBDIR}/index.js`
        : 'build/index.js',
    ],
    {
      cwd: fileURLToPath(new URL('../../../gallery-public/', import.meta.url)),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(port),
        ORIGIN: origin,
        GALLERY_PUBLIC_ORIGIN: origin,
        GALLERY_DATABASE_URL: dbUrl.toString(),
        GALLERY_COMMUNITY_DATABASE_URL: communityUrl,
        GALLERY_MEMBER_CODE_SECRET: secret,
        GALLERY_MEDIA_SOURCE_ROOT: root.sourceRoot,
        GALLERY_MEDIA_MOUNTED_ROOT: root.mountedRoot,
        GALLERY_DESIGN_PREVIEW: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  // Do not print process output: auth responses and test configuration remain private.
  child.stdout!.resume();
  child.stderr!.resume();
  const headers = { 'content-type': 'application/json', origin, cookie: `gallery_member_session=${token}` };
  const post = (action: string, body: unknown, h: Record<string, string> = headers) =>
    fetch(`${origin}/api/community/${action}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assert.equal(child.exitCode, null);
      try {
        if ((await fetch(origin + '/health/ready')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, 'public app readiness');
    const me = await fetch(origin + '/api/community/me', { headers });
    assert.equal(me.status, 200);
    assert.match(me.headers.get('cache-control')!, /no-store/);
    assert.ok((await me.json()).user.email);
    const isolated = await fetch(origin + '/api/community/me', {
      headers: { cookie: `gallery_admin_session=${token}` },
    });
    assert.equal((await isolated.json()).user, null, 'admin cookie is not a member login');
    assert.equal(
      (await post('like', { target, liked: true }, { ...headers, origin: 'https://foreign.example.invalid' }))
        .status,
      403,
    );
    assert.equal(
      (await post('like', { target, liked: true }, { origin, 'content-type': 'application/json' })).status,
      401,
    );
    assert.equal(
      (await post('like', { target, liked: true }, { ...headers, 'content-type': 'text/plain' })).status,
      415,
    );
    const oversized = await post('comment', { target, text: 'x'.repeat(40000) });
    assert.equal(oversized.status, 413);
    const verified = await post('verify', challenge, { origin, 'content-type': 'application/json' });
    assert.equal(verified.status, 200);
    const cookie = verified.headers.get('set-cookie')!;
    assert.match(cookie, /gallery_member_session=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.ok(!(await verified.text()).includes('token'), 'raw token never in JSON');
    const thread = await fetch(`${origin}/api/community/thread?kind=${target.kind}&id=${target.id}`);
    assert.equal(thread.status, 200);
    assert.ok(!(await thread.text()).includes('@example.invalid'));
    const account = await fetch(origin + '/account');
    assert.equal(account.status, 200);
    assert.match(await account.text(), /noindex/);
    assert.equal(
      (await fetch(origin + '/design/community')).status,
      404,
      'mock OTP unavailable outside design mode',
    );
  } finally {
    if (child.exitCode === null) {
      const done = once(child, 'close');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      await done;
      clearTimeout(timer);
    }
  }
}
