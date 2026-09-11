<script lang="ts">
  import AlbumView from '$lib/AlbumView.svelte';
  let { data } = $props();
</script>

<svelte:head
  ><title>{data.active?.title} · {data.site.name}</title><meta
    name="description"
    content={data.active?.summary ?? ''}
  /><link rel="canonical" href={`${data.origin}/albums/${data.active?.slug}`} /></svelte:head
>
<AlbumView {data} />
