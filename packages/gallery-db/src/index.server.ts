import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { databaseConfig, type DatabaseService } from './config.server.ts';

export { databaseConfig, type DatabaseService } from './config.server.ts';

/** No connection is established on module import; callers own destroy()/shutdown. */
export function createDatabase<Schema>(connectionString: string, service: DatabaseService): Kysely<Schema> {
  return new Kysely<Schema>({
    dialect: new PostgresDialect({ pool: new pg.Pool(databaseConfig(connectionString, service)) }),
  });
}
