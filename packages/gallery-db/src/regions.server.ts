import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createCountryLocator, type BoundaryData } from './countries.server.ts';

let locator: Promise<ReturnType<typeof createCountryLocator>> | undefined;
/** Fixed offline administrative boundaries; never display/cartogram geometry. */
export const getRegionLocator = () =>
  (locator ??= readFile(
    new URL('../data/china-regions-5.1.2.json.gz', import.meta.url),
  ).then((bytes) =>
    createCountryLocator(
      JSON.parse(gunzipSync(bytes).toString()) as BoundaryData,
    ),
  ));
