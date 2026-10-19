<script lang="ts">
  import Frame from '$lib/visited/Frame.svelte';
  import World from '$lib/visited/World.svelte';
  import VisitedHeading from '$lib/visited/VisitedHeading.svelte';
  let { data } = $props();
</script>

<svelte:head><title>去过 · {data.site.name}</title><meta name="description" content={data.site.tagline} /></svelte:head
><Frame site={data.site} name={data.site.name}>
  <VisitedHeading count={data.visited.countries.length} total={data.visited.total} />
  <World {...data.visited} showHeading={false} />
</Frame>
