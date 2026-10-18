<script lang="ts">
  import BrowseGallery from '$lib/BrowseGallery.svelte';
  let { data } = $props();
</script>
<svelte:head><title>相片 · {data.site.name}</title><meta name="description" content={data.site.tagline || '按时间浏览旅途与日常中的照片'} /><link rel="canonical" href={`${data.origin}/photos`} /></svelte:head>
{#key data}<BrowseGallery {data} />{/key}
