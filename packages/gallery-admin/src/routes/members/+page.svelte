<script lang="ts">
  import CommunityManager from '$lib/CommunityManager.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<CommunityManager {data} active="members" />
