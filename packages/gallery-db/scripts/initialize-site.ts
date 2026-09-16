/** One-shot site initialization after migrations and administrator creation. */
import pg from 'pg';
const [email, name, tagline = ''] = process.argv.slice(2);
if (!email || !name?.trim() || name.length > 100 || tagline.length > 2000)
  throw new Error('Usage: initialize-site.ts <existing admin email> <site name> [tagline]');
if (!process.env.GALLERY_MIGRATION_DATABASE_URL) throw new Error('Set the dedicated migration connection');
const client = new pg.Client({ connectionString: process.env.GALLERY_MIGRATION_DATABASE_URL });
try {
  await client.connect();
  if ((await client.query('SELECT current_user')).rows[0]?.current_user !== 'gallery_migrator')
    throw new Error('Requires migration role');
  await client.query('BEGIN');
  await client.query('LOCK TABLE gallery.site IN EXCLUSIVE MODE');
  if ((await client.query('SELECT 1 FROM gallery.site')).rowCount) throw new Error('Site already initialized');
  const admin = (await client.query(
    'SELECT id FROM gallery."user" WHERE email_normalized=$1 AND role=\'admin\' AND status=\'active\'',
    [email.trim().toLowerCase()],
  )).rows[0];
  if (!admin) throw new Error('Create an active administrator first');
  await client.query('INSERT INTO gallery.site(id,name,tagline,updated_by) VALUES(1,$1,$2,$3)', [name.trim(), tagline, admin.id]);
  await client.query('COMMIT');
  console.log('Empty Gallery site initialized. No source owners or content were imported.');
} catch {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Site initialization failed. Check migrations, administrator and existing site; no content was replaced.');
  process.exitCode = 1;
} finally {
  await client.end();
}
