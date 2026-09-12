import { adminMapSettings } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals }: { locals: App.Locals }) {
  const app = getRuntime();
  return {
    user: locals.user!,
    settings: await adminMapSettings(app.db, app.mapSecretKey),
    publicOrigin: app.publicOrigin,
  };
}
