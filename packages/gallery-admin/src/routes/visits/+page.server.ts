import { adminVisitIndex } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url, locals }) => {
  const app = getRuntime();
  const scope = url.searchParams.get('scope') === 'region' ? 'region' : 'country';
  const country = scope === 'region' ? 'CN' : url.searchParams.get('country') ?? '';
  const region = scope === 'region' ? url.searchParams.get('region') ?? '' : '';
  const q = url.searchParams.get('q') ?? '';
  const status = url.searchParams.get('status') ?? '';
  return {
    user: locals.user!,
    visits: await adminVisitIndex(app.db, { scope, place: scope === 'region' ? region : country,
      q, status, page: Number(url.searchParams.get('page') ?? 1) }),
    country,
    region,
    scope,
    q,
    status,
    publicOrigin: app.publicOrigin,
  };
};
