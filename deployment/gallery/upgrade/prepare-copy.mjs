import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Run from the original development repository, against the explicit copied cluster only.
const directory = resolve('.gallery-local/upgrade-v3.2.0');
const env = Object.fromEntries(
  (await readFile(directory + '/test.env', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
assert.equal(
  execFileSync(
    'docker',
    ['inspect', 'gallery-upgrade-320-database-1', '--format', '{{index .Config.Labels "com.docker.compose.project"}}'],
    { encoding: 'utf8' },
  ).trim(),
  'gallery-upgrade-320',
);
const auth = JSON.parse(await readFile(directory + '/test-auth.json', 'utf8'));
const pg = createRequire(resolve('packages/gallery-db/package.json'))('pg');
const db = new pg.Client({
  host: '127.0.0.1',
  port: 45432,
  user: 'postgres',
  password: env.TEST_DB_PASSWORD,
  database: 'immich',
});
await db.connect();
try {
  const snapshot = (
    await db.query(
      `SELECT (SELECT count(*) FROM public.asset) assets,(SELECT count(*) FROM gallery.album) albums,(SELECT count(*) FROM gallery.album_release) releases,(SELECT count(*) FROM gallery.album_release_photo) photos,(SELECT md5(string_agg(id::text||':'||description_document::text,',' ORDER BY id)) FROM gallery.album_release) content`,
    )
  ).rows[0];
  await writeFile(directory + '/restored-before.json', JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  for (const role of ['PUBLIC', 'ADMIN']) {
    const password = env['TEST_' + role + '_PASSWORD'];
    assert.match(password, /^[a-f0-9]{64}$/);
    await db.query(`ALTER ROLE gallery_${role.toLowerCase()} PASSWORD '${password}'`);
  }
  const bcryptHash = execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--entrypoint',
      'node',
      'ghcr.io/immich-app/immich-server@sha256:ae13784ffcfcce8f4178113eb6661602a1fd1912f3d539880b8ac0dd95fc8ac2',
      '-e',
      `const bcrypt=require('/usr/src/app/server/node_modules/bcrypt');let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>process.stdout.write(bcrypt.hashSync(s,10)));`,
    ],
    { input: auth.immichPassword, encoding: 'utf8' },
  ).trim();
  assert.match(bcryptHash, /^\$2[aby]\$/);
  const source = (
    await db.query(
      'SELECT u.id,u.email FROM public."user" u JOIN gallery.immich_source_owner s ON s.immich_owner_id=u.id WHERE u."isAdmin" AND s.enabled LIMIT 1',
    )
  ).rows[0];
  assert.ok(source, 'Copy must have a scoped Immich administrator');
  await db.query('UPDATE public."user" SET password=$2,"shouldChangePassword"=false WHERE id=$1', [
    source.id,
    bcryptHash,
  ]);
  const user = (await db.query("SELECT id,email FROM gallery.\"user\" WHERE role='admin' AND status='active' LIMIT 1"))
    .rows[0];
  const { hashPassword } = await import(pathToFileURL(resolve('packages/gallery-db/src/auth.server.ts')).href);
  await db.query('UPDATE gallery.user_credential SET password_hash=$2 WHERE user_id=$1', [
    user.id,
    await hashPassword(auth.galleryPassword),
  ]);
  await db.query('UPDATE gallery.session SET revoked_at=now() WHERE revoked_at IS NULL');
  await db.query(
    `INSERT INTO public.system_metadata(key,value) VALUES('system-config','{"machineLearning":{"enabled":false}}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=jsonb_set(system_metadata.value,'{machineLearning}',coalesce(system_metadata.value->'machineLearning','{}'::jsonb)||'{"enabled":false}'::jsonb,true)`,
  );
  auth.immichEmail = source.email;
  auth.galleryEmail = user.email;
  await writeFile(directory + '/test-auth.json', JSON.stringify(auth), { mode: 0o600 });
  console.log('Copied database prepared; isolated credentials, revoked Gallery sessions, ML disabled.');
} finally {
  await db.end();
}
