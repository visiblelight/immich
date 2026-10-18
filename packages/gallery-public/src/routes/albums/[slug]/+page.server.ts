import { loadBrowse } from '$lib/server/browse';
export const load = ({ url, params }: { url: URL; params: { slug: string } }) => loadBrowse(url, params.slug);
