import { createDatabase } from '../src/index.server.ts';
import { importCaptureEvidence } from '../src/capture.server.ts';
import { claimCaptureRefresh, finishCaptureRefresh } from '../src/capture-refresh.server.ts';

if (!process.env.GALLERY_DATABASE_URL) throw new Error('Gallery admin environment required');
const db = createDatabase(process.env.GALLERY_DATABASE_URL, 'gallery-admin');
try {
  const action = process.argv[2];
  if (action === 'claim') console.log(JSON.stringify({ jobs: await claimCaptureRefresh(db) }));
  else {
    process.stdin.setEncoding('utf8');
    let source = '';
    for await (const part of process.stdin) source += part;
    const input = JSON.parse(source);
    if (!Array.isArray(input.jobs) || input.jobs.length > 100) throw new Error('Invalid jobs');
    if (action === 'import') {
      console.log(JSON.stringify({ ...await importCaptureEvidence(db, input.report, input.jobs), readErrors: input.report.errors?.length ?? 0 }));
      if (input.report.errors?.length) process.exitCode = 2;
    } else if (action === 'fail') {
      await finishCaptureRefresh(db, input.jobs, new Set(), '读取服务暂时未完成，请重新读取。');
      console.log(JSON.stringify({ failed: input.jobs.length }));
    } else throw new Error('Unknown action');
  }
} catch {
  console.error('Capture task failed; source files and Immich metadata were not changed.');
  process.exitCode = 1;
} finally { await db.destroy(); }
