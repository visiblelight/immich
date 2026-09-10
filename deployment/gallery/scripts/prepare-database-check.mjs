import { cp, mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const directory = resolve('.gallery-local/drift');
for (const file of [
  'server/dist/schema/index.js',
  'server/dist/repositories/database.repository.js',
  'packages/plugin-sdk/dist/index.js',
]) {
  await stat(file).catch(() => {
    throw new Error(`Missing upstream build: ${file}. Build the pinned Immich server/plugin SDK first.`);
  });
}
await mkdir(directory, { recursive: true });
for (const file of ['package.json', 'package-lock.json'])
  await cp(`deployment/gallery/verification/${file}`, `${directory}/${file}`);
// npm is only used for this standalone, locked verification environment; it never
// operates on the Immich/Gallery workspace dependency tree or its shared lock.
const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
await new Promise((ok, fail) => {
  const child = spawn(
    process.execPath,
    [npmCli, 'ci', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund'],
    { stdio: 'inherit' },
  );
  child.on('error', fail);
  child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`Verification dependencies exited ${code}`))));
});
await rm(`${directory}/immich-code`, { recursive: true, force: true });
await cp('server/dist', `${directory}/immich-code`, { recursive: true, force: true });
await writeFile(`${directory}/immich-code/package.json`, JSON.stringify({ type: 'commonjs' }));
await mkdir(`${directory}/node_modules/@immich/plugin-sdk`, { recursive: true });
await cp('packages/plugin-sdk/dist', `${directory}/node_modules/@immich/plugin-sdk/dist`, {
  recursive: true,
  force: true,
});
await cp('packages/plugin-sdk/package.json', `${directory}/node_modules/@immich/plugin-sdk/package.json`);
const serverVersion = JSON.parse(await readFile('server/package.json', 'utf8')).version;
const manifest = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
if (manifest.version !== serverVersion) throw new Error('Verification lock belongs to a different Immich baseline');
await writeFile(
  `${directory}/build-provenance.json`,
  JSON.stringify(
    {
      serverVersion,
      repositorySha256: createHash('sha256')
        .update(await readFile('server/dist/repositories/database.repository.js'))
        .digest('hex'),
    },
    null,
    2,
  ),
);
console.log('Isolated, locked Immich verification tools prepared.');
