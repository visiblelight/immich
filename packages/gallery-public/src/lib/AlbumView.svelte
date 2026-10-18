<script lang="ts">
  import BrowseGallery from './BrowseGallery.svelte';
  import type { BrowseData } from './browse-state';
  let { data }: { data: BrowseData } = $props();
</script>
{#key data}<BrowseGallery {data} />{/key}
