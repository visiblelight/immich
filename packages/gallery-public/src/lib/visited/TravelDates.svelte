<script lang="ts">
  import { visitDateRange, compareVisitsByCapture, type VisitSummary } from '@gallery/core';
  let { visits }: { visits: VisitSummary[] } = $props();
</script>

<span class="travel-dates">
  {#each visits.toSorted(compareVisitsByCapture) as visit (visit.id)}
    <span title={visit.label || undefined}>{visitDateRange(visit)}</span>
  {/each}
</span>

<style>
  .travel-dates { display: flex; flex-direction: column; gap: 3px; font-size: 12px; line-height: 1.6; color: #6f7c69; font-variant-numeric: tabular-nums; }
</style>
