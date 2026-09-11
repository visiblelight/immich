import { publicCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load() {
  return publicCatalog(getRuntime().db);
}
