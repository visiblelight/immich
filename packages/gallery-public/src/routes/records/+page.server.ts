import { publicArticles, publicCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({
  url,
  setHeaders,
}: {
  url: URL;
  setHeaders: (h: Record<string, string>) => void;
}) {
  setHeaders({ 'cache-control': 'no-store' });
  const app = getRuntime();
  return {
    ...(await publicArticles(app.db, Number(url.searchParams.get('page') ?? 1))),
    site: (await publicCatalog(app.db)).site,
  };
}
