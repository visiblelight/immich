<script lang="ts">
  import { Gallery } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head
  ><title>{data.active?.title} · {data.site.name}</title><meta
    name="description"
    content={data.active?.summary ?? ''}
  /><link rel="canonical" href={`${data.origin}/albums/${data.active?.slug}`} /></svelte:head
>
{#key data.active?.id}<Gallery site={data.site} albums={data.albums} active={data.active} />{/key}
