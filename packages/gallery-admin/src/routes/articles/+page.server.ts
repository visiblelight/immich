import { listArticles, aboutArticleSettings } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  const app = getRuntime();
  return {
    ...(await listArticles(
      app.db,
      url.searchParams.get('q') ?? '',
      Number(url.searchParams.get('page') ?? 1),
      url.searchParams.get('status') ?? '',
    )),
    status: url.searchParams.get('status') ?? '',
    query: url.searchParams.get('q') ?? '',
    about: await aboutArticleSettings(app.db),
    user: locals.user!,
    publicOrigin: app.publicOrigin,
  };
}
