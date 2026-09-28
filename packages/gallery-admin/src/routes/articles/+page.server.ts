import { articleImageKey } from '@gallery/core';
import { listArticles, aboutArticleSettings, articleImageMap } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ locals, url }: { locals: App.Locals; url: URL }) {
  const app = getRuntime();
  const result = await listArticles(
    app.db,
    url.searchParams.get('q') ?? '',
    Number(url.searchParams.get('page') ?? 1),
    url.searchParams.get('status') ?? '',
  );
  const articles = await Promise.all(
    result.articles.map(async (article) => {
      const images = article.cover
        ? await articleImageMap(
            app.db,
            article.id,
            { ...article, document: { schemaVersion: 1, doc: { type: 'doc', content: [] } } },
            true,
          )
        : {};
      const cover = article.cover ? images[articleImageKey(article.cover)] : undefined;
      return {
        ...article,
        coverPreview: cover ? cover.src.replace('variant=preview', 'variant=thumbnail') : null,
      };
    }),
  );
  return {
    ...result,
    articles,
    status: url.searchParams.get('status') ?? '',
    query: url.searchParams.get('q') ?? '',
    about: await aboutArticleSettings(app.db),
    user: locals.user!,
    publicOrigin: app.publicOrigin,
  };
}
