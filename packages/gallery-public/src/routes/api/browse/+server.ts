import { json } from '@sveltejs/kit';
import { loadBrowse } from '$lib/server/browse';
export async function GET({ url }) {
  return json(await loadBrowse(url, url.searchParams.get('slug') || undefined), { headers: { 'Cache-Control': 'private, no-store' } });
}
