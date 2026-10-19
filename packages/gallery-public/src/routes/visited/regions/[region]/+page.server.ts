import { publicCatalog, publicRegionalVisited, regionOverview, publicMapSettings } from '@gallery/db/server';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
import { getRuntime } from '$lib/server/runtime';
import { mapSelection } from '$lib/visited/map-selection';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  try {
    const { db } = getRuntime();
    if (params.region === 'CN') {
      const [catalog, regional] = await Promise.all([publicCatalog(db), publicRegionalVisited(db, 'CN')]);
      return { site: catalog.site, regional, detail: null, maps: null };
    }
    const selection = mapSelection(url.searchParams, 'region');
    const [catalog, detail, maps] = await Promise.all([
      publicCatalog(db), regionOverview(db, params.region, selection.visitId), publicMapSettings(db),
    ]);
    return { site: catalog.site, regional: null, detail, maps, initialScope: selection.expandedScope };
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
};
