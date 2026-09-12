import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function verify(name, designPreview = false) {
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['build/index.js'], {
    cwd: fileURLToPath(new URL(`../../../packages/gallery-${name}/`, import.meta.url)),
    env: { PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin, NODE_ENV: 'production', GALLERY_DESIGN_PREVIEW: designPreview ? '1' : '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => { output = (output + chunk.toString()).slice(-4000); });
  }

  try {
    let live;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`gallery-${name} exited: ${output}`);
      try {
        live = await fetch(`${origin}/health/live`, { signal: AbortSignal.timeout(1000) });
        break;
      } catch { await delay(100); }
    }
    assert.ok(live, `gallery-${name} did not start: ${output}`);
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('cache-control'), 'no-store');
    const body = await live.json();
    assert.equal(body.service, `gallery-${name}`);
    assert.equal(body.status, 'alive');

    const ready = await fetch(`${origin}/health/ready`, { signal: AbortSignal.timeout(2000) });
    assert.equal(ready.status, 503, 'phase A must not claim database/application readiness');
    assert.equal((await ready.json()).reason, 'foundation-only');
    const page = await fetch(origin, { signal: AbortSignal.timeout(2000) });
    assert.equal(page.status, 503, 'unconfigured service must not expose a working gallery/admin page');
    await page.text();
    if (name === 'public') {
      for (const path of ['/design', '/design/visited', '/design/visited/world', '/design?album=georgia', '/design?album=city-notes', '/design?page=about', '/design/a?scene=story', '/design/b?scene=home', '/design/credits']) {
        const preview = await fetch(`${origin}${path}`);
        assert.equal(preview.status, designPreview ? 200 : 404, `preview gate: ${path}`);
        if (designPreview) {
          assert.equal(preview.headers.get('cache-control'), 'no-store');
          assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow');
        }
        await preview.text();
      }
      const invalid = await fetch(`${origin}/design/unknown`);
      assert.equal(invalid.status, 404);
      await invalid.text();
      for (const path of ['/design?album=missing', '/design?page=missing']) {
        const missing = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(2000) });
        assert.equal(missing.status, 404);
        await missing.text();
      }
    }
    if (name === 'admin') {
      const preview = await fetch(`${origin}/design`);
      assert.equal(preview.status, designPreview ? 200 : 404);
      if (designPreview) {
        assert.equal(preview.headers.get('cache-control'), 'no-store');
        assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow');
      }
      await preview.text();
    }
    console.log(`PASS gallery-${name} (design=${designPreview}): production build starts, liveness 200, readiness/root 503`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      try { await closed; } finally { clearTimeout(timer); }
    }
  }
}

await verify('public');
await verify('admin');
await verify('public', true);

await verify('admin', true);
