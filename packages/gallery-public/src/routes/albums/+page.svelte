<script lang="ts">
  import { Gallery } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head
  ><title>相册 · {data.site.name}</title><meta name="description" content={data.site.tagline} /><link
    rel="canonical"
    href={`${data.origin}/albums`}
  /></svelte:head
>
<Gallery site={data.site} albums={data.albums} />
