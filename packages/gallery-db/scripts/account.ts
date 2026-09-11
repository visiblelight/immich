import { readFile, stat } from 'node:fs/promises';
import pg from 'pg';
import { GalleryError } from '@gallery/core';
import { maintainAccount } from '../src/account-maintenance.server.ts';

// Passwords are read from a protected file, never argv, stdout or a shared default.
const [action, email, ...args] = process.argv.slice(2);
let client: pg.Client | undefined;
try {
  if (!action || !email)
    throw new Error(
      'Usage: account.ts create|reset-password|disable|enable <email> [--password-file <path>] [--name <display name>]',
    );
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--password-file', '--name'].includes(args[i]!) || !args[i + 1]) throw new Error('Invalid arguments');
    options[args[i]!] = args[i + 1]!;
  }
  let password: string | undefined;
  if (['create', 'reset-password'].includes(action)) {
    const file = options['--password-file'];
    if (!file) throw new Error('A protected --password-file is required');
    const info = await stat(file);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 2048)
      throw new Error('Password file must be a private regular file (0600)');
    password = (await readFile(file, 'utf8')).replace(/\r?\n$/, '');
  }
  const connectionString = process.env.GALLERY_MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('Set GALLERY_MIGRATION_DATABASE_URL');
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
  await client.connect();
  await maintainAccount(client, action, email, password, options['--name']);
  console.log('Gallery account maintenance completed. Existing sessions were revoked where applicable.');
} catch (e) {
  console.error(
    e instanceof GalleryError
      ? e.message
      : 'Account maintenance failed; check arguments, private password file and migration configuration.',
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
