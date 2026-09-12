import { publicCatalog, countryOverview, publicMapSettings } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const { db } = getRuntime();
    const [catalog, overview, maps] = await Promise.all([
      publicCatalog(db),
      countryOverview(db, params.country, url.searchParams.get('visit')),
      publicMapSettings(db),
    ]);
    return { site: catalog.site, ...overview, maps };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
};
