import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile, symlink, lstat, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
const baseline = JSON.parse(await readFile('deployment/gallery/baseline.json', 'utf8'));
const candidate = baseline.immich.upgradeCandidate;
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
assert.equal(
  git('rev-parse', candidate.tag + '^{commit}'),
  candidate.commit,
  'Candidate tag must match the recorded immutable commit',
);
const baselinePackage = JSON.parse(git('show', baseline.immich.sourceCommit + ':server/package.json'));
const candidatePackage = JSON.parse(git('show', candidate.commit + ':server/package.json'));
assert.deepEqual(
  candidatePackage.dependencies,
  baselinePackage.dependencies,
  'Refresh isolated verification dependencies before checking this candidate',
);
assert.equal(
  git('diff', '--name-only', baseline.immich.sourceCommit, candidate.commit, '--', 'packages/plugin-sdk'),
  '',
  'Refresh isolated plugin SDK before checking this candidate',
);
const source = resolve('.gallery-local/upgrade/source');
const output = resolve('.gallery-local/upgrade/runtime/dist');
await rm(source, { recursive: true, force: true });
await rm(output, { recursive: true, force: true });
await mkdir(source, { recursive: true });
await mkdir(output, { recursive: true });
const archive = execFileSync('git', ['archive', candidate.commit, 'server/src', 'server/package.json'], {
  maxBuffer: 64 * 1024 * 1024,
});
execFileSync('tar', ['-x', '-C', source], { input: archive });
const ts = createRequire(resolve('packages/gallery-db/package.json'))('typescript');
async function compile(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) {
      await compile(file);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts') || entry.name.endsWith('.d.ts')) continue;
    const target = join(output, relative(join(source, 'server/src'), file)).replace(/\.ts$/, '.js');
    let { outputText } = ts.transpileModule(await readFile(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2024,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
      fileName: file,
    });
    // Apply the upstream src/* alias to emitted relative CommonJS paths only.
    outputText = outputText.replace(/require\("src\/([^\"]+)"\)/g, (_, name) => {
      const rel = relative(dirname(target), join(output, name));
      return `require(${JSON.stringify(rel.startsWith('.') ? rel : './' + rel)})`;
    });
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, outputText);
  }
}
await compile(join(source, 'server/src'));
const manifest = JSON.parse(await readFile(join(source, 'server/package.json'), 'utf8'));
await writeFile(
  resolve('.gallery-local/upgrade/runtime/package.json'),
  JSON.stringify({ version: manifest.version, type: 'commonjs' }),
);
const modules = resolve('.gallery-local/upgrade/runtime/node_modules');
try {
  await lstat(modules);
} catch {
  await symlink(resolve('.gallery-local/drift/node_modules'), modules, 'dir');
}
const schemaDiff = git(
  'diff',
  '--name-only',
  baseline.immich.sourceCommit,
  candidate.commit,
  '--',
  'server/src/schema',
  'server/src/migrations',
  'server/src/repositories/database.repository.ts',
);
await writeFile(
  resolve('.gallery-local/upgrade/provenance.json'),
  JSON.stringify(
    {
      candidate,
      compiledVersion: manifest.version,
      compiler: ts.version,
      scope: 'original migration repository and schema, not full Immich application',
      databaseSourceChanges: schemaDiff.split('\n').filter(Boolean),
    },
    null,
    2,
  ),
);
console.log(`Prepared ${candidate.tag} (${candidate.commit}) original migration/schema runtime at ${output}.`);
