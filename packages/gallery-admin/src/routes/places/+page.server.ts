import { adminPlaces } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  const app = getRuntime();
  return {
    user: locals.user!,
    publicOrigin: app.publicOrigin,
    ...(await adminPlaces(app.db, url.searchParams.get('q') ?? '')),
    q: url.searchParams.get('q') ?? '',
  };
}
