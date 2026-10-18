<script lang="ts">
  let { more, loading, error = '', label, load, previous = false, loadPrevious }: {
    more: boolean; loading: boolean; error?: string; label: string;
    load: () => Promise<boolean>; previous?: boolean; loadPrevious?: () => Promise<boolean>;
  } = $props();
  let sentinel = $state<HTMLDivElement>();
  $effect(() => {
    if (!sentinel || loading || error || !more || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) void load();
    }, { rootMargin: '700px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>
<div class="more" bind:this={sentinel} aria-busy={loading}>
  {#if loading}<div class="placeholders" aria-hidden="true"><span></span><span></span><span></span></div>{/if}
  <div role="status" aria-live="polite">
    {#if loading}正在加载…{:else if error}<span>{error}</span> <button onclick={() => void load()}>重试</button>
    {:else if more}<button onclick={() => void load()}>加载更多</button>
    {:else}{previous ? `后面的${label}已加载完` : `已显示全部${label}`}{/if}
  </div>
  {#if previous && !loading}<button onclick={() => void loadPrevious?.()}>加载前面的{label}</button>{/if}
</div>
<style>
  .more { grid-column:1/-1; width:100%; padding:24px 0; text-align:center; color:var(--muted,#798575); font-size:13px; }
  button { border:0; background:transparent; color:inherit; padding:10px 16px; cursor:pointer; font:inherit; border-radius:6px; }
  button:hover { background:#eaf0e7; color:#355c44; }
  .placeholders { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; margin-bottom:16px; }
  .placeholders span { aspect-ratio:4/3; background:#edf0e9; border-radius:4px; animation:breathe 1.4s ease-in-out infinite alternate; }
  @keyframes breathe { to { opacity:.45; } }
  @media(prefers-reduced-motion:reduce) { .placeholders span { animation:none; } }
</style>
