<script lang="ts">
  import Frame from '$lib/visited/Frame.svelte';
  import Country from '$lib/visited/Country.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.country.name} · 去过 · {data.site.name}</title></svelte:head><Frame name={data.site.name}
  >{#key `${data.country.id}:${data.visitId}`}<Country
      country={data.country}
      bounds={data.bounds}
      providers={data.maps.providers}
      visitId={data.visitId}
    />{/key}</Frame
>
