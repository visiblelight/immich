import { photoLibrary, adminTags } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  const app = getRuntime();
  return {
    ...(await photoLibrary(app.db, url.searchParams)),
    tags: await adminTags(app.db),
    user: locals.user!,
    publicOrigin: app.publicOrigin,
    filters: Object.fromEntries(
      ['q', 'album', 'tag', 'scope'].map((key) => [key, url.searchParams.get(key) || '']),
    ),
  };
}
