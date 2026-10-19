import { publicCatalog, countryOverview, publicMapSettings } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
import { mapSelection } from '$lib/visited/map-selection';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const { db } = getRuntime();
    const selection = mapSelection(url.searchParams, 'country');
    const [catalog, overview, maps] = await Promise.all([
      publicCatalog(db),
      countryOverview(db, params.country, selection.visitId),
      publicMapSettings(db),
    ]);
    return { site: catalog.site, ...overview, maps, initialScope: selection.expandedScope };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
};
