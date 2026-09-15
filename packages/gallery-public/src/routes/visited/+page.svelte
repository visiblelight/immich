<script lang="ts">
  import Frame from '$lib/visited/Frame.svelte';
  import World from '$lib/visited/World.svelte';
  let { data } = $props();
</script>

<svelte:head><title>去过 · {data.site.name}</title><meta name="description" content={data.site.tagline} /></svelte:head
><Frame site={data.site} name={data.site.name}><World {...data.visited} /></Frame>
