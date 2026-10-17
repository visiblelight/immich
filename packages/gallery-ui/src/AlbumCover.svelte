<script lang="ts">
  import { onMount } from 'svelte';
  let { src, alt }: { src: string; alt: string } = $props();
  let loaded = $state(false), failed = $state(false);
  let image: HTMLImageElement;
  onMount(() => {
    if (image.complete && image.naturalWidth > 0) loaded = true;
  });
</script>

<div class="cover" class:loading={!loaded && !failed} aria-busy={!loaded && !failed}>
  <img bind:this={image} {src} {alt} loading="lazy" width="600" height="450"
    class:loaded onload={() => loaded = true} onerror={() => failed = true} />
  {#if failed}<span>封面暂不可用</span>{/if}
</div>

<style>
  .cover { position: relative; width: 100%; height: 100%; aspect-ratio: 4/3; overflow: hidden; border-radius: inherit; background: #ecefe7; }
  img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 160ms ease; }
  img.loaded { opacity: 1; }
  .loading::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, #ffffff66 50%, transparent 80%); transform: translateX(-100%); animation: shimmer 1.6s infinite; }
  span { position: absolute; inset: 0; display: grid; place-items: center; color: #73806b; font-size: 13px; }
  @keyframes shimmer { to { transform: translateX(100%); } }
  @media (prefers-reduced-motion: reduce) { .loading::after { animation: none; } img { transition: none; } }
</style>
