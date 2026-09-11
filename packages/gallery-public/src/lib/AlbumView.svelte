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
      initialPage?: number;
    };
  } = $props();
  function navigatePhoto(photo: DisplayPhoto | null, replace = false) {
    if (!data.active) return;
    const base = `/albums/${data.active.slug}`;
    const index = data.active.photos.findIndex((p) => p.id === data.photoId);
    void goto(
      photo
        ? `${base}/photos/${photo.id}`
        : `${base}?page=${Math.max(1, Math.floor(index / 48) + 1)}#photo-${data.photoId}`,
      { replaceState: replace, noScroll: !!photo, keepFocus: false },
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
  />{/key}
