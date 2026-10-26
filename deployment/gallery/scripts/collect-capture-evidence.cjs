/* Operator-only read-only collector. Run inside the existing Immich container, not a Gallery runtime.
 * stdout is a private JSON report; it contains no credentials or source paths. Never writes media/DB. */
const { createRequire } = require('node:module');
const requireImmich = createRequire(process.cwd() + '/package.json');
const { ExifTool } = requireImmich('exiftool-vendored');
const pg = requireImmich('pg');
const geo = requireImmich('geo-tz');
const { realpath, stat } = require('node:fs/promises');
const path = require('node:path');
const sourceExpression = `md5(jsonb_build_array(extract(epoch from a."fileCreatedAt"),extract(epoch from a."localDateTime"),e."timeZone",e.latitude,e.longitude)::text)`;
const dateTags = [
  'SubSecDateTimeOriginal',
  'SubSecCreateDate',
  'DateTimeOriginal',
  'CreationDate',
  'CreateDate',
  'MediaCreateDate',
  'DateTimeCreated',
  'GPSDateTime',
  'DateTimeUTC',
  'SonyDateTime2',
];
function clock(date) {
  if (!date || !Number.isInteger(date.year) || !Number.isInteger(date.hour)) return null;
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}:${String(date.second).padStart(2, '0')}.${String(date.millisecond ?? 0).padStart(3, '0')}Z`;
}
const firstDate = (tags) => dateTags.map((tag) => ({ tag, date: tags?.[tag] })).find((v) => clock(v.date));
async function main() {
  const root = await realpath(process.env.GALLERY_CAPTURE_MEDIA_ROOT || '/data');
  const client = new pg.Client(
    process.env.DB_URL
      ? { connectionString: process.env.DB_URL }
      : {
          host: process.env.DB_HOSTNAME || 'database',
          port: Number(process.env.DB_PORT || 5432),
          user: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD,
          database: process.env.DB_DATABASE_NAME || 'immich',
        },
  );
  const tool = new ExifTool({
    backfillTimezones: true,
    inferTimezoneFromDatestamps: true,
    inferTimezoneFromTimeStamp: true,
    useMWG: true,
    geoTz: (lat, lng) => geo.find(lat, lng)[0],
    geolocation: true,
  });
  const photos = [],
    errors = [];
  async function read(file) {
    const resolved = await realpath(file),
      relative = path.relative(root, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error('outside media root');
    const before = await stat(resolved);
    const tags = await tool.read(resolved);
    const after = await stat(resolved);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
      throw new Error('source changed while reading');
    return tags;
  }
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout='30s'");
    const requested = (process.env.GALLERY_CAPTURE_ASSETS || '').split(',').filter(Boolean);
    const { rows } = await client.query(
      `SELECT a.id,a."originalPath" AS original,sidecar.path AS sidecar,e.latitude,e.longitude,${sourceExpression} AS signature
      FROM gallery.admin_source_asset s JOIN gallery.photo p ON p.immich_asset_id=s.asset_id
      JOIN public.asset a ON a.id=s.asset_id LEFT JOIN public.asset_exif e ON e."assetId"=a.id
      LEFT JOIN public.asset_file sidecar ON sidecar."assetId"=a.id AND sidecar.type='sidecar' AND NOT sidecar."isEdited"
      WHERE cardinality($1::uuid[])=0 OR a.id=ANY($1::uuid[]) ORDER BY a.id`,
      [requested],
    );
    await client.query('ROLLBACK');
    for (const row of rows)
      try {
        const media = await read(row.original),
          sidecar = row.sidecar ? await read(row.sidecar) : null;
        const selected = firstDate(sidecar) || firstDate(media);
        const d = selected?.date;
        const validPosition = (lat, lng) =>
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 90 &&
          Math.abs(lng) <= 180 &&
          !(lat === 0 && lng === 0);
        const gpsPositionValid = validPosition(media.GPSLatitude, media.GPSLongitude);
        const gpsPositionMatches =
          gpsPositionValid &&
          validPosition(row.latitude, row.longitude) &&
          Math.hypot(media.GPSLatitude - row.latitude, media.GPSLongitude - row.longitude) < 0.01;
        const gpsStatus = media.GPSStatus ?? null;
        const badFix = gpsStatus && !['A', 'Measurement Active', 'Active'].includes(gpsStatus);
        // Invalid embedded coordinates cannot certify a local zone; a different manually supplied location can.
        const destinationZone =
          validPosition(row.latitude, row.longitude) && !(badFix && gpsPositionMatches)
            ? (geo.find(row.latitude, row.longitude)[0] ?? null)
            : null;
        const explicitOffset =
          d && d.inferredZone === false && Number.isFinite(d.tzoffsetMinutes) ? d.tzoffsetMinutes : null;
        photos.push({
          assetId: row.id,
          sourceSignature: row.signature,
          evidence: {
            clock: clock(d),
            explicitOffset,
            dateSource: (firstDate(sidecar) ? 'sidecar:' : 'original:') + (selected?.tag || 'none'),
            destinationZone,
            gpsUtc: media.GPSDateTime?.toDateTime?.().toUTC().toISO() ?? null,
            gpsStatus,
            gpsPositionValid,
            gpsPositionMatches,
          },
        });
      } catch {
        errors.push({ assetId: row.id, message: '元数据读取失败，保留已有证据。' });
      }
    console.log(JSON.stringify({ schemaVersion: 1, collectedAt: new Date().toISOString(), photos, errors }));
  } finally {
    await client.end();
    await tool.end();
  }
}
main().catch(() => {
  console.error('Capture evidence collection failed; no files or database rows were changed.');
  process.exitCode = 1;
});
