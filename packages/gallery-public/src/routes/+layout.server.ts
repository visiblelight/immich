import { env } from '$env/dynamic/private';
export function load() {
  const id = env.GALLERY_ANALYTICS_WEBSITE_ID ?? '';
  let domain = '';
  try { domain = new URL(env.GALLERY_PUBLIC_ORIGIN ?? '').hostname; } catch { /* disabled */ }
  return { analytics: /^[0-9a-f-]{36}$/i.test(id) && domain && !['localhost', '127.0.0.1', '::1'].includes(domain)
    ? { website: id, domain } : null };
}
