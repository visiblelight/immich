<script lang="ts">
  import Exhibition from '$lib/design/Exhibition.svelte';
  let { data } = $props();
</script>

<Exhibition direction={data.direction} />
