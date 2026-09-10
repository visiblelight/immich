import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// An isolated copy of the exact upstream tool, not a new shared dependency.
const toolPath =
  process.env.GALLERY_SQL_TOOLS_PATH ?? '.gallery-local/drift/node_modules/@immich/sql-tools/dist/index.js';
const { schemaFromDatabase, schemaDiff } = await import(pathToFileURL(resolve(toolPath)).href);
const config = JSON.parse(await readFile('.gallery-local/phase-b/connection.json', 'utf8'));
const current = await schemaFromDatabase({ connection: { connectionType: 'url', url: config.ownerUrl } });
const options = {
  tables: { ignoreExtra: true },
  constraints: { ignoreExtra: false },
  indexes: { ignoreExtra: true },
  triggers: { ignoreExtra: true },
  columns: { ignoreExtra: true },
  functions: { ignoreExtra: false },
  parameters: { ignoreExtra: true },
  extensions: { ignoreExtra: true },
};
if (process.argv[2] === 'before') {
  await writeFile('.gallery-local/phase-b/schema-before.json', JSON.stringify(current, null, 2));
  console.log('Recorded Immich schema using @immich/sql-tools 0.6.3.');
} else {
  const before = JSON.parse(await readFile('.gallery-local/phase-b/schema-before.json', 'utf8'));
  const drift = schemaDiff(before, current, options);
  await writeFile('.gallery-local/phase-b/schema-drift.json', JSON.stringify(drift, null, 2));
  console.log('Gallery-induced Immich drift:', JSON.stringify(drift));
  if (!Array.isArray(drift.items) || drift.items.length) process.exitCode = 1;
}
