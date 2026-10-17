<script lang="ts">
  import { goto } from '$app/navigation';
  import { Gallery } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head
  ><title>相册 · {data.site.name}</title><meta name="description" content={data.site.tagline} /><link
    rel="canonical"
    href={`${data.origin}/albums`}
  /></svelte:head
>
<Gallery
  site={data.site}
  albums={data.albums}
  albumSearch={data.albumSearch}
  searchAlbums={(query) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    void goto(`/albums${params.size ? `?${params}` : ''}`, {
      keepFocus: true,
      noScroll: true,
      replaceState: true,
    });
  }}
/>
