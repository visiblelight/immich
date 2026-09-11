<script lang="ts">
  import { Gallery } from '@gallery/ui';
  let { data } = $props();
</script>

<svelte:head><title>草稿预览 · {data.active.title}</title></svelte:head>{#key data.active.id}<Gallery
    site={data.site}
    albums={data.albums}
    active={data.active}
    preview
  />{/key}
