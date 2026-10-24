<script lang="ts">
  import Panel from './community/Panel.svelte';
  import { communityClient } from './community/context';
  import type { CommunityTarget } from '@gallery/core';
  const community = communityClient();
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import { beforeNavigate, goto, pushState, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { Gallery } from '@gallery/ui';
  import type { DisplayPhoto } from '@gallery/core';
  import { documentMarkdown } from '../../../gallery-core/src/markdown';
  import type { BrowseStream, StreamKind } from '../../../gallery-ui/src/browse-stream';
  import { browseKey, readBrowse, saveBrowse, type BrowseData } from './browse-state';
  let { data }: { data: BrowseData } = $props();
  const key = untrack(() => browseKey(page.url));
  let current = $state<BrowseData>(untrack(() => data));
  let firstAlbums = $state(untrack(() => data.albumWindow?.page ?? 1));
  let firstPhotos = $state(untrack(() => data.photoWindow?.page ?? 1));
  let loading = $state({ albums: false, photos: false });
  let errors = $state({ albums: '', photos: '' });
  const retryPrevious = { albums: false, photos: false };
  let mounted = false,
    alive = true;
  const controllers = new Set<AbortController>();
  const pending: Partial<Record<StreamKind, Promise<boolean>>> = {};
  let root: HTMLDivElement;
  let showTop = $state(false);
  let immersive = $state(false);
  let visiblePhoto = $derived(
    Object.prototype.hasOwnProperty.call(page.state, 'viewerPhoto')
      ? ((page.state as { viewerPhoto?: string | null }).viewerPhoto ?? null)
      : (data.photoId ?? null),
  );
  const active = $derived(
    current.feed
      ? {
          id: 'timeline',
          slug: '',
          title: '相片',
          summary: '',
          parent: '',
          blocks: [],
          cover: null,
          count: current.feed.total,
          photos: current.feed.photos,
        }
      : current.active,
  );
  const unique = <T extends { id: string }>(values: T[]) => [
    ...new Map(values.map((p) => [p.id, p])).values(),
  ];
  const anchorNow = () =>
    [...(root?.querySelectorAll<HTMLElement>('[id^="photo-"],[id^="album-"]') ?? [])].find(
      (el) => el.getBoundingClientRect().bottom > 0,
    );
  function capture() {
    if (!mounted) return;
    const anchor = anchorNow();
    saveBrowse(key, {
      data: $state.snapshot(current),
      anchor: anchor?.id,
      offset: anchor?.getBoundingClientRect().top ?? 0,
      y: window.scrollY,
      firstAlbums,
      firstPhotos,
      time: Date.now(),
    });
  }
  beforeNavigate(() => capture());
  onDestroy(() => {
    alive = false;
    for (const c of controllers) c.abort();
  });
  onMount(() => {
    mounted = true;
    const saved = readBrowse(key);
    // A fresh server response remains authoritative for totals and first-batch membership.
    const cached = saved?.data;
    const freshPhotos = data.feed?.photos ?? data.active?.photos ?? [];
    const cachedPhotos = cached?.feed?.photos ?? cached?.active?.photos ?? [];
    const valid =
      cached &&
      cached.albumWindow?.total === data.albumWindow?.total &&
      cached.photoWindow?.total === data.photoWindow?.total &&
      data.albums.every((a) => cached.albums.some((b) => JSON.stringify(a) === JSON.stringify(b))) &&
      freshPhotos.every((a) => cachedPhotos.some((b) => JSON.stringify(a) === JSON.stringify(b)));
    if (valid && saved?.data) {
      current = saved.data;
      firstAlbums = saved.firstAlbums;
      firstPhotos = saved.firstPhotos;
    }
    void tick().then(() => {
      if (!alive) return;
      const anchor =
        (valid ? saved?.anchor : null) || page.url.searchParams.get('anchor') || page.url.hash.slice(1);
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - (valid ? (saved?.offset ?? 16) : 16));
      else if (valid && saved) window.scrollTo(0, saved.y);
      else if (/^#photo-[0-9a-f-]{36}$/i.test(page.url.hash) && !page.url.searchParams.has('anchor')) {
        // A legacy hash is invisible to SSR: resolve its containing batch once on the client.
        const url = new URL(page.url);
        url.searchParams.set('anchor', url.hash.slice(1));
        url.hash = '';
        void goto(url, { replaceState: true });
      }
    });
    let timer: ReturnType<typeof setTimeout>;
    const scroll = () => {
      showTop = window.scrollY > window.innerHeight * 2;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!alive || visiblePhoto || loading.albums || loading.photos) return;
        const anchor = anchorNow();
        if (anchor) {
          const url = new URL(page.url);
          url.searchParams.set('anchor', anchor.id);
          replaceState(url, page.state);
        }
      }, 300);
    };
    window.addEventListener('scroll', scroll, { passive: true });
    scroll();
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', scroll);
    };
  });
  function load(kind: StreamKind, direction?: boolean): Promise<boolean> {
    if (pending[kind]) return pending[kind]!;
    const request = loadBatch(kind, direction).finally(() => {
      delete pending[kind];
    });
    pending[kind] = request;
    return request;
  }
  async function loadBatch(kind: StreamKind, direction?: boolean): Promise<boolean> {
    const previous = direction ?? (!!errors[kind] && retryPrevious[kind]);
    const windowState = kind === 'albums' ? current.albumWindow : current.photoWindow;
    if (!alive || loading[kind] || !windowState || (!previous && !windowState.hasMore)) return false;
    const first = kind === 'albums' ? firstAlbums : firstPhotos;
    if (previous && first <= 1) return false;
    const anchor = anchorNow(),
      offset = anchor?.getBoundingClientRect().top;
    loading[kind] = true;
    errors[kind] = '';
    const controller = new AbortController();
    controllers.add(controller);
    try {
      const q = new URLSearchParams(page.url.search);
      for (const name of ['photo', 'anchor', 'after', 'albumAfter', 'page', 'albumsPage', 'returnTo'])
        q.delete(name);
      q.set('kind', current.feed ? 'photos' : kind === 'albums' ? 'albums' : 'album-photos');
      if (current.active) q.set('slug', current.active.slug);
      if (previous) q.set(kind === 'albums' && current.active ? 'albumsPage' : 'page', String(first - 1));
      else q.set(kind === 'albums' ? 'albumAfter' : 'after', windowState.next!);
      const response = await fetch(`/api/browse?${q}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('加载失败');
      const next: BrowseData = await response.json();
      if (!alive) return false;
      if (kind === 'albums') {
        current.albums = unique(
          previous ? [...next.albums, ...current.albums] : [...current.albums, ...next.albums],
        );
        if (previous) firstAlbums = first - 1;
        else current.albumWindow = next.albumWindow;
      } else if (current.feed && next.feed) {
        current.feed.photos = unique(
          previous
            ? [...next.feed.photos, ...current.feed.photos]
            : [...current.feed.photos, ...next.feed.photos],
        );
        if (previous) firstPhotos = first - 1;
        else current.photoWindow = next.photoWindow;
      } else if (current.active && next.active) {
        current.active.photos = unique(
          previous
            ? [...next.active.photos, ...current.active.photos]
            : [...current.active.photos, ...next.active.photos],
        );
        current.active.groups = unique([...(current.active.groups ?? []), ...(next.active.groups ?? [])]);
        if (previous) firstPhotos = first - 1;
        else current.photoWindow = next.photoWindow;
      }
      loading[kind] = false;
      await tick();
      if (anchor && offset !== undefined) window.scrollBy(0, anchor.getBoundingClientRect().top - offset);
      return true;
    } catch (e) {
      if (alive && !(e instanceof DOMException && e.name === 'AbortError')) {
        retryPrevious[kind] = previous;
        errors[kind] = '加载失败，请重试';
      }
      return false;
    } finally {
      controllers.delete(controller);
      if (alive) loading[kind] = false;
    }
  }
  function changeQuery(name: string, value: string) {
    const input = document.activeElement instanceof HTMLInputElement ? document.activeElement : null;
    const caret = input?.selectionStart ?? null;
    const url = new URL(page.url);
    url.pathname = current.active ? `/albums/${current.active.slug}` : '/albums';
    for (const key of ['page', 'albumsPage', 'photo', 'anchor']) url.searchParams.delete(key);
    value ? url.searchParams.set(name, value) : url.searchParams.delete(name);
    void goto(url.pathname + url.search, { keepFocus: true }).then(() => {
      if (name === 'q' && input?.name === 'q') {
        const replacement = document.querySelector<HTMLInputElement>('.album-search input[name="q"]');
        replacement?.focus({ preventScroll: true });
        if (caret !== null) replacement?.setSelectionRange(caret, caret);
      }
    });
  }
  function photoChange(photo: DisplayPhoto | null) {
    if (!alive) return;
    const url = new URL(page.url);
    if (!photo && /\/photos\/[\w-]+$/.test(url.pathname)) {
      const selected = current.active?.photos.find((p) => p.id === visiblePhoto);
      void goto(
        data.returnTo ||
          `/albums/${current.active?.slug}?anchor=photo-${selected?.group?.cover ?? visiblePhoto ?? ''}`,
        { replaceState: true },
      );
      return;
    }
    if (photo) url.searchParams.set('photo', photo.id);
    else url.searchParams.delete('photo');
    const state = { ...page.state, viewerPhoto: photo?.id ?? null };
    if (photo && !visiblePhoto) pushState(url, state);
    else replaceState(url, state);
  }
  const stream = $derived<BrowseStream>({
    albums: current.albumWindow,
    photos: current.photoWindow,
    photoOffset: (firstPhotos - 1) * 48,
    loading,
    errors,
    previous: { albums: firstAlbums > 1, photos: firstPhotos > 1 },
    load,
    sort: current.albumSort ?? 'updated',
    changeSort: (sort) => changeQuery('sort', sort),
    photoChange,
  });
  let countError = $state('');
  $effect(() => {
    if (!community.enabled || !community.settings.showLikes) return;
    const targets: CommunityTarget[] = [
      ...current.albums.map((a) => ({ kind: 'album' as const, id: a.id })),
      ...(active?.photos ?? []).map((p) => ({
        kind: 'photo' as const,
        id: p.id,
      })),
    ];
    let stopped = false;
    void (async () => {
      try {
        for (let i = 0; i < targets.length; i += 100) {
          const r = await community.request('counts', {
            targets: targets.slice(i, i + 100),
          });
          if (stopped) return;
          Object.assign(community.counts, r.counts);
        }
        countError = '';
      } catch {
        if (!stopped) countError = '点赞数量暂时无法加载。';
      }
    })();
    return () => {
      stopped = true;
    };
  });
</script>

{#snippet albumActions(album: import('@gallery/core').DisplayAlbum)}<Panel
    target={{ kind: 'album', id: album.id }}
    mode="like"
  />{/snippet}
{#snippet albumComments(
  album: import('@gallery/core').DisplayAlbum,
  focusComposer: boolean,
  oncollapse: () => void,
)}
  {#key album.id}<Panel
      target={{ kind: 'album', id: album.id }}
      mode="comments"
      showEmptyState={!documentMarkdown(album, album.summary).trim()}
      {focusComposer}
      {oncollapse}
    />{/key}
{/snippet}
{#snippet photoLike(photo: import('@gallery/core').DisplayPhoto)}{#key photo.id}<Panel
      target={{ kind: 'photo', id: photo.id }}
      mode="like"
      dark
    />{/key}{/snippet}
{#snippet photoCommunity(photo: import('@gallery/core').DisplayPhoto)}{#key photo.id}<Panel
      target={{ kind: 'photo', id: photo.id }}
      mode="comments"
      dark
    />{/key}{/snippet}
<div bind:this={root}>
  <Gallery
    site={current.site}
    albums={current.albums}
    {active}
    feed={current.feed}
    {stream}
    albumActions={community.enabled && (community.settings.showLikes || community.settings.showComments)
      ? albumActions
      : undefined}
    albumComments={community.enabled && community.settings.showComments ? albumComments : undefined}
    albumHasComments={(album) => {
      const thread = community.thread({ kind: 'album', id: album.id }).data;
      return thread.total > 0 || thread.comments.length > 0;
    }}
    commentsEnabled={community.enabled && community.settings.showComments && community.settings.comments}
    photoLike={community.enabled ? photoLike : undefined}
    photoCommunity={community.enabled && community.settings.showComments ? photoCommunity : undefined}
    photoCommentCount={(photo) => community.thread({ kind: 'photo', id: photo.id }).data.total}
    likeCount={(kind, id) =>
      community.settings.showLikes ? (community.counts[`${kind}:${id}`] ?? null) : null}
    initialPhotoId={visiblePhoto}
    albumSearch={current.albumSearch}
    searchAlbums={(query) => changeQuery('q', query)}
    relatedArticles={current.relatedArticles ?? []}
    bind:immersive
  />
</div>
{#if countError}<p class="count-error" role="status">{countError}</p>{/if}
{#if showTop && !visiblePhoto}<button
    class="back-top"
    aria-label="回到顶部"
    onclick={() =>
      window.scrollTo({
        top: 0,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      })}>↑ <span>顶部</span></button
  >{/if}

<style>
  .count-error {
    font-size: 12px;
    color: #7b8477;
    text-align: center;
  }
  .back-top {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 20;
    border: 1px solid #dce3d8;
    background: #fafbf8;
    color: #45624b;
    border-radius: 24px;
    padding: 10px 15px;
    box-shadow: 0 2px 12px #24362812;
    cursor: pointer;
  }
  @media (max-width: 600px) {
    .back-top {
      right: 16px;
      bottom: 16px;
    }
  }
</style>
