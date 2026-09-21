<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { onMount } from 'svelte';
  import { analyticsPage, analyticsReferrer } from '$lib/analytics/events';
  let { data, children } = $props();
  type Payload = Record<string, unknown>;
  type Tracker = { track: (fn: (payload: Payload) => Payload) => Promise<void> };
  let ready = false;
  let lastPage = '', lastPhoto = '';
  function track() {
    try {
      const tracker = (window as unknown as { umami?: Tracker }).umami;
      const path = analyticsPage(page.url.pathname, page.status);
      if (!ready || !tracker || !path || localStorage.getItem('umami.disabled')) return;
      const referrer = analyticsReferrer(lastPage || document.referrer, location.origin);
      const send = (extra: Payload) => {
        void tracker.track((payload) => ({ ...payload, url: path, title: document.title, referrer, ...extra })).catch(() => {});
      };
      if (path !== lastPage) {
        send({});
        if (/^\/visited\/[A-Z]{2}$/.test(path)) send({ name: 'country_view', data: { country: path.split('/')[2] } });
        lastPage = path;
      }
      const photo = String((page.data as { photoId?: string }).photoId ?? '');
      if (photo && photo !== lastPhoto) send({ name: 'photo_view', data: { photo } });
      lastPhoto = photo;
    } catch { /* Analytics must never affect browsing, including denied browser storage. */ }
  }
  afterNavigate(track);
  onMount(() => {
    try {
      if (!data.analytics || location.hostname !== data.analytics.domain || localStorage.getItem('umami.disabled') || navigator.doNotTrack === '1') return;
      const script = document.createElement('script');
      script.src = '/analytics/script.js';
      script.async = true;
      script.dataset.websiteId = data.analytics.website;
      script.dataset.hostUrl = location.origin + '/analytics';
      script.dataset.autoTrack = 'false';
      script.dataset.doNotTrack = 'true';
      script.dataset.domains = data.analytics.domain;
      script.dataset.excludeSearch = 'true';
      script.dataset.excludeHash = 'true';
      script.onload = () => { ready = true; track(); };
      document.head.append(script);
      return () => { script.onload = null; script.remove(); };
    } catch { /* Optional telemetry. */ }
  });
</script>

{@render children()}
