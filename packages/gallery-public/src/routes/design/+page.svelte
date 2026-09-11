<script lang="ts">
  import Catalog from '$lib/design/Catalog.svelte';
  let { data } = $props();
</script>

<Catalog albumId={data.albumId} view={data.view} />
