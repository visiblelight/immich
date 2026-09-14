<script lang="ts">
  import { Gallery } from '@gallery/ui';
  import { goto } from '$app/navigation';
  import type { DisplayAlbum, DisplayPhoto, ContactLink } from '@gallery/core';
  let {
    data,
  }: {
    data: {
      site: { name: string; tagline: string; contactLinks?: ContactLink[] };
      albums: DisplayAlbum[];
      active?: DisplayAlbum | null;
      photoId?: string | null;
      returnTo?: string | null;
      initialPage?: number;
      relatedArticles?: {title:string;slug:string}[];
    };
  } = $props();
  let immersive = $state(false);
  function navigatePhoto(photo: DisplayPhoto | null, replace = false) {
    if (!data.active) return;
    const base = `/albums/${data.active.slug}`;
    const selected = data.active.photos.find((p) => p.id === data.photoId);
    const items = data.active.photos.filter(
      (p, index, list) => !p.group || list.findIndex((member) => member.group?.id === p.group?.id) === index,
    );
    const selectedIndex = items.findIndex((p) =>
      selected?.group ? p.group?.id === selected.group.id : p.id === selected?.id,
    );
    const cover = selected?.group
      ? (data.active.photos.find((p) => p.id === selected.group?.cover) ?? items[selectedIndex])
      : selected;
    const returnUrl = `${base}?page=${Math.max(1, Math.floor(selectedIndex / 48) + 1)}#photo-${cover?.id ?? ''}`;
    void goto(
      photo
        ? `${base}/photos/${photo.id}${data.returnTo ? `?returnTo=${encodeURIComponent(data.returnTo)}` : ''}`
        : data.returnTo || returnUrl,
      {
        replaceState: replace,
        noScroll: !!photo,
        keepFocus: false,
      },
    );
  }
</script>

{#key data.photoId ?? data.active?.id}<Gallery
    site={data.site}
    albums={data.albums}
    active={data.active}
    initialPhotoId={data.photoId}
    initialPage={data.initialPage ?? 1}
    {navigatePhoto}
    bind:immersive
  />{/key}

{#if !data.photoId && data.relatedArticles?.length}<aside class="related-articles"><span>相关文章</span>{#each data.relatedArticles as article}<a href={'/records/'+article.slug}>{article.title} ↗</a>{/each}</aside>{/if}
<style>.related-articles{margin:0 4vw 45px;border-top:1px solid #e2e7dd;padding:22px 0;display:flex;gap:18px 30px;flex-wrap:wrap;font-size:13px;color:#88927f}.related-articles a{color:#55734e;text-decoration:none}</style>
