import { adminCommunity } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import type { AdminCommunityData } from '$lib/community-types';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url, locals }) => {
  const app = getRuntime();
  return {
    ...((await adminCommunity(app.db, url.searchParams)) as AdminCommunityData),
    user: locals.user!,
    publicOrigin: app.publicOrigin,
    query: url.searchParams.get('q') ?? '',
    filter: url.searchParams.get('status') ?? 'pending',
  };
};
