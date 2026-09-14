import { publicCatalog, publicArticle } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
export async function load({ setHeaders }: { setHeaders: (h: Record<string, string>) => void }) {
  setHeaders({ 'cache-control': 'no-store' });
  const db = getRuntime().db;
  return { ...(await publicCatalog(db)), article: await publicArticle(db, '', true) };
}
