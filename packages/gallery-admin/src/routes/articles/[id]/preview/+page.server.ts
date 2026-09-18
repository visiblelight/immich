import { getArticle, articleImageMap, publicCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';

export async function load({ params }: { params: { id: string } }) {
  const app = getRuntime();
  const article = await getArticle(app.db, params.id);
  const catalog = await publicCatalog(app.db);
  return {
    site: catalog.site,
    publicOrigin: app.publicOrigin,
    article: {
      ...article,
      images: await articleImageMap(app.db, article.id, article, true),
      related: catalog.albums
        .filter((album) => article.albums.includes(album.id))
        .map((album) => ({
          title: album.title,
          href: `${app.publicOrigin}/albums/${album.slug}`,
        })),
    },
  };
}
