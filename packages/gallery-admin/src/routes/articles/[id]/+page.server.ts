import { getArticle, articleImageMap, articleAlbumOptions } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals, params }: { locals: App.Locals; params: { id: string } }) {
  const app = getRuntime();
  const article = await getArticle(app.db, params.id);
  return {
    article,
    images: await articleImageMap(app.db, article.id, article, true),
    albums: await articleAlbumOptions(app.db),
    user: locals.user!,
    publicOrigin: app.publicOrigin,
  };
}
