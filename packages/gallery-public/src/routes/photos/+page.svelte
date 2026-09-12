<script lang="ts">
  import { Gallery } from '@gallery/ui';
  import type { DisplayPhoto, DisplayAlbum } from '@gallery/core';
  import { goto } from '$app/navigation';
  let { data } = $props();
  let immersive = $state(false);
  let active = $derived<DisplayAlbum>({
    id: 'timeline',
    slug: '',
    title: '相片',
    summary: '',
    blocks: [],
    parent: '',
    cover: null,
    count: data.feed.total,
    photos: data.feed.photos,
  });
  function query(page = data.feed.page) {
    return new URLSearchParams({ sort: data.feed.sort, month: data.feed.month, page: String(page) });
  }
  function navigatePhoto(p: DisplayPhoto | null, replace = false) {
    const q = query();
    if (p) q.set('photo', p.id);
    void goto(`/photos?${q}${!p && data.photoId ? '#photo-' + data.photoId : ''}`, {
      replaceState: replace,
      noScroll: !!p,
    });
  }
  function navigateBoundary(offset: number) {
    const page = data.feed.page + offset;
    if (page < 1 || page > Math.ceil(data.feed.total / 48)) return;
    const q = query(page);
    q.set('photo', offset > 0 ? 'first' : 'last');
    void goto(`/photos?${q}`, { replaceState: true, noScroll: true });
  }
</script>

<svelte:head
  ><title>相片 · {data.site.name}</title><meta name="description" content="按时间浏览旅途与日常中的照片" /><link
    rel="canonical"
    href={`${data.origin}/photos`}
  /></svelte:head
>
{#key `${data.feed.sort}:${data.feed.month}:${data.feed.page}:${data.photoId}`}<Gallery
    site={data.site}
    albums={data.albums}
    {active}
    feed={data.feed}
    initialPhotoId={data.photoId}
    {navigatePhoto}
    {navigateBoundary}
    bind:immersive
  />{/key}
