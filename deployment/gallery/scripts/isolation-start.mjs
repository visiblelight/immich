import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const name = `gallery-db-check-${Date.now()}`;
const password = randomBytes(32).toString('hex');
const image =
  'ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0@sha256:bcf63357191b76a916ae5eb93464d65c07511da41e3bf7a8416db519b40b1c23';
await mkdir('.gallery-local/phase-b', { recursive: true });
const envFile = '.gallery-local/phase-b/postgres.env';
await writeFile(envFile, `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=gallery_test\n`, { mode: 0o600 });
execFileSync(
  'docker',
  [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    'gallery.isolation=true',
    '--env-file',
    envFile,
    '--tmpfs',
    '/var/lib/postgresql/data:rw',
    '-p',
    '127.0.0.1::5432',
    image,
  ],
  { stdio: 'pipe' },
);
const mapping = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim();
const port = Number(mapping.split(':').at(-1));
const config = {
  name,
  port,
  ownerUrl: `postgres://postgres:${password}@127.0.0.1:${port}/gallery_test`,
  passwords: Object.fromEntries(['migrator', 'admin', 'public'].map((role) => [role, randomBytes(32).toString('hex')])),
};
await writeFile('.gallery-local/phase-b/connection.json', JSON.stringify(config), { mode: 0o600 });
console.log(`Created isolated ${name}, loopback port ${port}; no existing volumes or network attached.`);
