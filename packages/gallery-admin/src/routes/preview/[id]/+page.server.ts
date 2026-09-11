import { draftCatalog } from '@gallery/db/server';
import { getRuntime } from '$lib/server/runtime';
import { GalleryError } from '@gallery/core';
import { error } from '@sveltejs/kit';
export async function load({ params }: { params: { id: string } }) {
  try {
    return await draftCatalog(getRuntime().db, params.id);
  } catch (e) {
    if (e instanceof GalleryError) error(e.status, e.message);
    throw e;
  }
}
