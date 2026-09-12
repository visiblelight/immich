<script lang="ts">
  import Manager from '$lib/Manager.svelte';
  let { data } = $props();
</script>

<Manager initial={data} initialPage="account" />
