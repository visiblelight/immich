import { loadBrowse } from '$lib/server/browse';
export const load = ({ url }: { url: URL }) => loadBrowse(url);
