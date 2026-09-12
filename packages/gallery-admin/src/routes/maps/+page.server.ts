import { adminMapSettings } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load() {
  const app = getRuntime();
  return { settings: await adminMapSettings(app.db, app.mapSecretKey), publicOrigin: app.publicOrigin };
}
