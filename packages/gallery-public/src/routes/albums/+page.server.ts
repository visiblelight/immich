import { publicCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load() {
  const app = getRuntime();
  return { ...(await publicCatalog(app.db)), origin: app.origin };
}
