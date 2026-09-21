import { env } from '$env/dynamic/private';
import { getRuntime } from '$lib/server/runtime';
export function load({ locals }: { locals: App.Locals }) {
  let dashboard: string | null = null;
  try {
    const url = new URL(env.GALLERY_ANALYTICS_DASHBOARD_URL ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) dashboard = url.href;
  } catch { /* Not configured locally. */ }
  return { user: locals.user!, publicOrigin: getRuntime().publicOrigin, dashboard };
}
