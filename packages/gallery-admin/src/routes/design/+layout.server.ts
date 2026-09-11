import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';

export function load({ setHeaders }: { setHeaders: (headers: Record<string, string>) => void }) {
  if (env.GALLERY_DESIGN_PREVIEW !== '1') error(404, '页面不存在');
  setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
}
