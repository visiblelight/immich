import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(resolve(root, 'deployment/gallery/baseline.json'), 'utf8'));
const mise = readFileSync(resolve(root, 'mise.toml'), 'utf8');
const requiredNode = mise.match(/^node = "([^"]+)"/m)?.[1];
const requiredPnpm = manifest.packageManager.replace(/^pnpm@/, '');
const checks = [];
function check(label, passed) {
  checks.push(passed);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
}

check(`Node ${requiredNode} (current ${process.versions.node})`, process.versions.node === requiredNode);
let pnpm = 'unavailable';
try {
  pnpm = execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch { /* Report presence only, never dump environment values. */ }
check(`pnpm ${requiredPnpm} (current ${pnpm})`, pnpm === requiredPnpm);
check('baseline matches repository toolchain', baseline.toolchain.node === requiredNode && baseline.toolchain.pnpm === requiredPnpm);

for (const name of ['core', 'db', 'ui', 'public', 'admin']) {
  const directory = resolve(root, `packages/gallery-${name}`);
  check(`@gallery/${name} manifest exists`, existsSync(resolve(directory, 'package.json')));
  check(`@gallery/${name} dependencies installed`, existsSync(resolve(directory, 'node_modules')));
}

console.log('This checks the local toolchain only; it does not connect to a database or report production readiness.');
process.exitCode = checks.every(Boolean) ? 0 : 1;
