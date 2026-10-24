import { env } from '$env/dynamic/private';
import { closedCommunity } from '@gallery/core';
import { communitySettings, renewMemberSession } from '@gallery/db/server';
import { communityConfigured, getCommunity, memberCookie } from '$lib/server/community';
import { getRuntime } from '$lib/server/runtime';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ url, cookies }) => {
  let community = {
    user: null as Awaited<ReturnType<typeof renewMemberSession>>,
    settings: closedCommunity(),
    enabled: false,
  };
  if (!url.pathname.startsWith('/design') && communityConfigured()) {
    try {
      const { db, ready } = getCommunity(),
        token = cookies.get(memberCookie);
      await ready();
      const user = token ? await renewMemberSession(db, token) : null;
      if (user && token)
        cookies.set(memberCookie, token, {
          path: '/',
          httpOnly: true,
          secure: getRuntime().secure,
          sameSite: 'lax',
          expires: user.expires,
        });
      community = { user, settings: await communitySettings(db), enabled: true };
    } catch {
      /* A failed optional member service must not take public content offline. */
    }
  }
  const id = env.GALLERY_ANALYTICS_WEBSITE_ID ?? '';
  let domain = '';
  try {
    domain = new URL(env.GALLERY_PUBLIC_ORIGIN ?? '').hostname;
  } catch {
    /* disabled */
  }
  return {
    community,
    analytics:
      /^[0-9a-f-]{36}$/i.test(id) && domain && !['localhost', '127.0.0.1', '::1'].includes(domain)
        ? { website: id, domain }
        : null,
  };
};
