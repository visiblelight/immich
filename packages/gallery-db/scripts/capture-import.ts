import { readFile } from 'node:fs/promises';
import { createDatabase } from '../src/index.server.ts';
import { importCaptureEvidence } from '../src/capture.server.ts';
const file = process.argv[2];
if (!file || !process.env.GALLERY_DATABASE_URL)
  throw new Error('Use the Gallery admin environment and pass a private capture evidence report path.');
const db = createDatabase(process.env.GALLERY_DATABASE_URL, 'gallery-admin');
try {
  let source = '';
  if (file === '-') {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) source += chunk;
  } else source = await readFile(file, 'utf8');
  const report = JSON.parse(source);
  console.log({ ...(await importCaptureEvidence(db, report)), readErrors: report.errors?.length ?? 0 });
  if (report.errors?.length) process.exitCode = 2;
} catch {
  console.error('时间证据导入失败，请检查私有报告和配置；原片与 Immich 数据未修改。');
  process.exitCode = 1;
} finally {
  await db.destroy();
}
