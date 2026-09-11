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

export {
  listSourceAssets,
  listSourceAlbums,
  qualifySourceSelection,
  type SourceAsset,
  type SourceFilters,
} from './source.server.ts';
export { readPublishedDerivative, type MediaRoot, type MediaVariant } from './media.server.ts';
export { getMapClusters, type MapRequest, type MapCluster } from './map.server.ts';
export { assertDatabaseCompatibility } from './compatibility.server.ts';
export * from './auth.server.ts';
export * from './albums.server.ts';
export * from './catalog.server.ts';
export * from './feed.server.ts';
export * from './runtime.server.ts';
export { readSourceDerivative, sanitizeImage } from './media.server.ts';
