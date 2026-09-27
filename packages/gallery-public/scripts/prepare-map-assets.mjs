// Build-time installation only. No glyph/style proxy or tile prefetch at runtime.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = fileURLToPath(new URL('../static/vendor/osm-shortbread-v1/', import.meta.url));
const archives = [
  {
    name: 'fonts',
    url: 'https://github.com/versatiles-org/versatiles-fonts/releases/download/v2.1.0/noto_sans.tar.gz',
    sha256: '2019212a0eaf738ac0f05a0f495bbf94655d244001b1819903e3c1e6d57f63fa',
  },
  {
    name: 'sprites',
    url: 'https://github.com/versatiles-org/versatiles-style/releases/download/v5.13.0/sprites.tar.gz',
    sha256: 'e48685a7e06c3672552c63c33d03993dade074efe9f364d6e5acfe79cf81c4d0',
  },
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identity = hash(JSON.stringify(archives));
const manifestPath = join(destination, 'assets-manifest.json');
try {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.identity !== identity) throw new Error('Asset version changed');
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (hash(await readFile(join(destination, path))) !== expected) throw new Error('Asset changed');
  }
  if (!Object.keys(manifest.files).length) throw new Error('Empty assets');
  console.log('Gallery map display assets verified');
} catch {
  const work = await mkdtemp(join(tmpdir(), 'gallery-map-assets-'));
  try {
    const files = {};
    for (const archive of archives) {
      console.log(`Preparing pinned map ${archive.name}`);
      const response = await fetch(archive.url, { signal: AbortSignal.timeout(180000) });
      if (!response.ok) throw new Error(`Map asset download: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== archive.sha256) throw new Error(`Map asset checksum mismatch: ${archive.name}`);
      const tar = join(work, `${archive.name}.tar.gz`);
      await writeFile(tar, bytes);
      const entries = execFileSync('tar', ['-tzf', tar], { encoding: 'utf8' }).trim().split('\n');
      const selected = entries.filter((entry) =>
        archive.name === 'fonts'
          ? /^noto_sans_(regular|bold)\/\d+-\d+\.pbf$/.test(entry)
          : /^basics\/sprites(?:@2x)?\.(json|png)$/.test(entry),
      );
      if (!selected.length) throw new Error('No map assets in archive');
      const unpack = join(work, archive.name);
      await mkdir(unpack);
      execFileSync('tar', ['-xzf', tar, '-C', unpack, ...selected]);
      await rm(join(destination, archive.name), { recursive: true, force: true });
      await cp(unpack, join(destination, archive.name), { recursive: true });
      for (const entry of selected)
        files[`${archive.name}/${entry}`] = hash(await readFile(join(unpack, entry)));
    }
    await writeFile(manifestPath, JSON.stringify({ identity, files }));
    console.log(`Prepared ${Object.keys(files).length} local map display assets`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
