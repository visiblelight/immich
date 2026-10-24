<script lang="ts">
  let { seed, size = 36 }: { seed: string; size?: number } = $props();
  import { avatarGeometry } from '@gallery/core';
  const cells = $derived(avatarGeometry(seed));
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
  <circle cx="24" cy="24" r="24" fill="#edf0e7" />
  <g fill={cells.color}>
    {#each cells.shapes as shape}
      <g transform={`translate(${shape.x},${shape.y}) rotate(${shape.turn},5,5)`}>
        {#if shape.kind === 0}<circle cx="5" cy="5" r="4" />
        {:else if shape.kind === 1}<path d="M1 1H9V9H1Z" />
        {:else if shape.kind === 2}<path d="M1 1H9V9Z" />
        {:else}<path d="M1 9V1A8 8 0 0 1 9 9Z" />{/if}
      </g>
    {/each}
  </g>
</svg>

<style>
  svg {
    display: block;
    flex: none;
    border-radius: 50%;
  }
</style>
