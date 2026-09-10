export type DatabaseService = 'gallery-public' | 'gallery-admin';

/** Explicit connection only: never read Immich environment variables or log URLs. */
export function databaseConfig(connectionString: string, service: DatabaseService) {
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('Gallery database URL is missing or invalid');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    !parsed.username ||
    parsed.pathname.length <= 1 ||
    parsed.hash
  ) {
    throw new Error('Gallery database URL must specify a PostgreSQL host, role and database');
  }

  // PG enforces actual privileges; this is only a fail-fast configuration guard.
  const expectedRole = service === 'gallery-public' ? 'gallery_public' : 'gallery_admin';
  if (parsed.username !== expectedRole) {
    throw new Error(`Gallery runtime requires the ${expectedRole} database role`);
  }

  // Query-string options can override connection properties in pg-connection-string.
  // Keep this boundary explicit until remote TLS settings are designed and verified.
  if (parsed.search) {
    throw new Error('Gallery database URL query parameters are not supported');
  }

  return {
    connectionString,
    application_name: service,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  } as const;
}
