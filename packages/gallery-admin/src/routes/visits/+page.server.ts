import { adminVisited } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url, locals }) => {
  const app = getRuntime();
  return {
    user: locals.user!,
    visits: await adminVisited(app.db, url.searchParams.get('country') ?? undefined),
    country: url.searchParams.get('country') ?? '',
    publicOrigin: app.publicOrigin,
  };
};
