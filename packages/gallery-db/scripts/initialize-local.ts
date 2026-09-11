/** Explicit local Immich development integration. Never a production bootstrap. */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, access, open } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { migrate } from '../src/migrate.server.ts';
import { hashPassword } from '../src/auth.server.ts';
const sourceOwner = process.argv[2];
if (!sourceOwner || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sourceOwner))
  throw new Error('Usage: initialize-local.ts <approved source owner UUID>');
const container = 'immich_postgres';
const root = path.resolve('.gallery-local/runtime');
await mkdir(root, { recursive: true, mode: 0o700 });
const psql = (query: string) => {
  try {
    return execFileSync(
      'docker',
      ['exec', '-i', container, 'sh', '-c', 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'],
      { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    throw new Error('Local database command failed. No credentials were logged; preserve runtime files for recovery.');
  }
};
if (psql("SELECT count(*) FROM pg_namespace WHERE nspname='gallery'") !== '0')
  throw new Error('Gallery already exists; use the existing configuration and explicit migrations.');
if (psql(`SELECT count(*) FROM public."user" WHERE id='${sourceOwner}'::uuid AND "deletedAt" IS NULL`) !== '1')
  throw new Error('Approved source account does not exist.');
const media = path.resolve('docker/library/photos/thumbs');
await access(media);
const dbName = psql('SELECT current_database()');
const immichRole = psql('SELECT current_user');
const passwords = Object.fromEntries(
  ['migrator', 'admin', 'public'].map((role) => [role, randomBytes(32).toString('hex')]),
);
const backupDir = path.resolve('.gallery-local/backups');
await mkdir(backupDir, { recursive: true, mode: 0o700 });
const backup = path.join(backupDir, `before-gallery-${Date.now()}.dump`);
const dump = await open(backup, 'wx', 0o600);
try {
  execFileSync('docker', ['exec', container, 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc'], {
    stdio: ['ignore', dump.fd, 'pipe'],
  });
} finally {
  await dump.close();
}
const bootstrap = await readFile(
  new URL('../../../deployment/gallery/database/bootstrap.sql', import.meta.url),
  'utf8',
);
const roleUrl = (role: string) =>
  `postgresql://gallery_${role}:${passwords[role]}@127.0.0.1:5432/${encodeURIComponent(dbName)}`;
// Persist recovery information before the first change; nothing secret is logged.
await writeFile(path.join(root, 'migration.env'), `GALLERY_MIGRATION_DATABASE_URL=${roleUrl('migrator')}\n`, {
  mode: 0o600,
  flag: 'wx',
});
psql(
  `BEGIN; GRANT USAGE,CREATE ON SCHEMA public TO ${pg.escapeIdentifier(immichRole)};\n${bootstrap}\n${Object.entries(
    passwords,
  )
    .map(([role, password]) => `ALTER ROLE gallery_${role} PASSWORD ${pg.escapeLiteral(password)};`)
    .join('\n')}\nCOMMIT;`,
);
const client = new pg.Client({ connectionString: roleUrl('migrator') });
await client.connect();
try {
  await migrate(client);
  const password = randomBytes(24).toString('base64url');
  const id = randomUUID();
  await client.query('BEGIN');
  await client.query(
    'INSERT INTO gallery."user"(id,email,email_normalized,display_name,role) VALUES($1,$2,$2,$3,\'admin\')',
    [id, 'admin@gallery.local', 'VisionKE'],
  );
  await client.query('INSERT INTO gallery.user_credential(user_id,password_hash) VALUES($1,$2)', [
    id,
    await hashPassword(password),
  ]);
  await client.query('INSERT INTO gallery.site(id,name,tagline,updated_by) VALUES(1,$1,$2,$3)', [
    '光与远方',
    '记录旅行，也记录日常。',
    id,
  ]);
  await client.query('INSERT INTO gallery.immich_source_owner(immich_owner_id,label) VALUES($1,$2)', [
    sourceOwner,
    'Local approved owner',
  ]);
  await client.query('COMMIT');
  await writeFile(
    path.join(root, 'initial-admin.txt'),
    `Gallery 管理后台：http://127.0.0.1:3101/login\n邮箱：admin@gallery.local\n初始密码：${password}\n登录后可在个人账号中修改密码。不要提交或分享此文件。\n`,
    { mode: 0o600, flag: 'wx' },
  );
  for (const service of ['admin', 'public']) {
    const port = service === 'admin' ? 3101 : 3100;
    await writeFile(
      path.join(root, `${service}.env`),
      `GALLERY_DATABASE_URL=${roleUrl(service)}\nGALLERY_ADMIN_ORIGIN=http://127.0.0.1:3101\nGALLERY_PUBLIC_ORIGIN=http://127.0.0.1:3100\nGALLERY_MEDIA_SOURCE_ROOT=/data/thumbs\nGALLERY_MEDIA_MOUNTED_ROOT=${media}\nGALLERY_DESIGN_PREVIEW=1\nHOST=127.0.0.1\nPORT=${port}\nORIGIN=http://127.0.0.1:${port}\nBODY_SIZE_LIMIT=2M\n`,
      { mode: 0o600, flag: 'wx' },
    );
  }
  console.log(
    'Gallery initialized with separate runtime roles, an independent administrator and the approved source scope. No albums were published. Credentials: .gallery-local/runtime/initial-admin.txt',
  );
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Gallery initialization did not finish. Preserve runtime/migration.env and the backup for recovery.');
  throw new Error('Initialization failed; inspect SQLSTATE privately.');
} finally {
  await client.end();
}
