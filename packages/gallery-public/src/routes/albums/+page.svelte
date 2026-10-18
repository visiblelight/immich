<script lang="ts">
  import BrowseGallery from '$lib/BrowseGallery.svelte';
  let { data } = $props();
</script>
<svelte:head><title>相册 · {data.site.name}</title><meta name="description" content={data.site.tagline} /><link rel="canonical" href={`${data.origin}/albums`} /></svelte:head>
{#key data}<BrowseGallery {data} />{/key}
