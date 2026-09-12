import { publicCatalog, publicVisited } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load() {
  const { db } = getRuntime();
  const [catalog, visited] = await Promise.all([publicCatalog(db), publicVisited(db)]);
  return { site: catalog.site, visited };
}
