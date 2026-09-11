<script lang="ts">
  import { Gallery } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head><title>关于 · {data.site.name}</title></svelte:head><Gallery site={data.site} albums={data.albums} about />
