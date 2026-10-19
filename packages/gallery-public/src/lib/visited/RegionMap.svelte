<script lang="ts">
  import { goto } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  import type { VisitedCountry } from '@gallery/core';
  import { chinaLayout, type ChinaRegion } from './china-layout';

  import { SearchField } from '@gallery/ui';
  import MapLegend from './MapLegend.svelte';



  let { summaries, countryName = '中国', layout = chinaLayout }: {
    summaries: VisitedCountry[];
    countryName?: string;
    layout?: typeof chinaLayout;
  } = $props();
  const regions = $derived(layout.regions);
  const stats = $derived(Object.fromEntries(summaries.map(region => [region.id, region])));
  const visited = $derived(regions.filter(region => stats[region.id]?.count));
  function period(region: VisitedCountry) {
    const dates = region.visits.flatMap(visit => [visit.start, visit.end]).filter((date): date is string => !!date).sort();
    return dates.length ? dates[0] + ' — ' + dates.at(-1) : '拍摄日期待确认';
  }
  let viewport = $state({
    x: 0,
    y: 0,
    w: untrack(() => layout.width),
    h: untrack(() => layout.height),
  });
  let hovered = $state<ChinaRegion | null>(null);
  let selected = $state<ChinaRegion | null>(null);
  let pointer = $state({ x: 0, y: 0 });
  let dragging = $state(false);
  let search = $state('');
  let full = $state(false);
  let hadNativeFullscreen = false;
  let svg = $state<SVGSVGElement>(null!);
  let map = $state<HTMLDivElement>(null!);
  let fullscreenButton: HTMLButtonElement;
  let moved = false;
  let pointerType = 'mouse';
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: {
    x: number;
    y: number;
    distance: number;
    viewport: typeof viewport;
  } | null = null;
  const matches = $derived(regions.filter((region) => region.fullName.includes(search.trim())));
  const listed = $derived(search.trim() ? matches : visited);
  const href = (region: ChinaRegion) => '/visited/regions/' + region.id;

  function reset() {
    viewport = { x: 0, y: 0, w: layout.width, h: layout.height };
    hovered = null;
    selected = null;
  }
  function bounded(view: typeof viewport) {
    return {
      ...view,
      x: Math.max(-35, Math.min(layout.width - view.w + 35, view.x)),
      y: Math.max(-35, Math.min(layout.height - view.h + 35, view.y)),
    };
  }
  function zoom(factor: number) {
    const w = Math.max(260, Math.min(layout.width, viewport.w * factor));
    const h = (w * layout.height) / layout.width;
    viewport = bounded({
      x: viewport.x + (viewport.w - w) / 2,
      y: viewport.y + (viewport.h - h) / 2,
      w,
      h,
    });
    hovered = null;
  }
  function metrics() {
    const [a, b = a] = [...pointers.values()];
    return {
      x: (a!.x + b!.x) / 2,
      y: (a!.y + b!.y) / 2,
      distance: Math.hypot(a!.x - b!.x, a!.y - b!.y),
    };
  }
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    pointerType = event.pointerType;
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = { ...metrics(), viewport: { ...viewport } };
    (event.target as Element).setPointerCapture(event.pointerId);
    hovered = null;
  }
  function move(event: PointerEvent) {
    pointer = {
      x: Math.max(12, Math.min(event.clientX + 18, window.innerWidth - 282)),
      y: Math.max(12, Math.min(event.clientY + 18, window.innerHeight - 205)),
    };
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = metrics();
    const dx = now.x - gesture.x,
      dy = now.y - gesture.y;
    if (Math.hypot(dx, dy) > 5 || pointers.size > 1) {
      moved = true;
      dragging = true;
      hovered = null;
    }
    if (!moved) return;
    const box = svg.getBoundingClientRect();
    const ratio = Math.min(box.width / gesture.viewport.w, box.height / gesture.viewport.h);
    const scale = gesture.distance > 0 && now.distance > 0 ? gesture.distance / now.distance : 1;
    const w = Math.max(260, Math.min(layout.width, gesture.viewport.w * scale));
    const h = (w * layout.height) / layout.width;
    viewport = bounded({
      x: gesture.viewport.x - dx / ratio + (gesture.viewport.w - w) / 2,
      y: gesture.viewport.y - dy / ratio + (gesture.viewport.h - h) / 2,
      w,
      h,
    });
  }
  function up(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (event.type === 'pointercancel') moved = true;
    gesture = pointers.size ? { ...metrics(), viewport: { ...viewport } } : null;
    if (!pointers.size) dragging = false;
  }
  function choose(region: ChinaRegion, keyboard = false) {
    hovered = null;
    if (stats[region.id] && (keyboard || (pointerType !== 'touch' && window.innerWidth > 700))) {
      selected = null;
      void goto(href(region));
    } else selected = region;
  }
  function focus(event: FocusEvent, region: ChinaRegion) {
    const box = (event.target as Element).getBoundingClientRect();
    pointer = {
      x: Math.max(12, Math.min(box.right + 12, window.innerWidth - 282)),
      y: Math.max(12, Math.min(box.top, window.innerHeight - 205)),
    };
    hovered = region;
  }
  function key(event: KeyboardEvent) {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (delta[event.key]) {
      event.preventDefault();
      const [x, y] = delta[event.key]!;
      viewport = bounded({
        ...viewport,
        x: viewport.x + x * viewport.w * 0.1,
        y: viewport.y + y * viewport.h * 0.1,
      });
    } else if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      zoom(event.key === '-' ? 1.4 : 0.7);
    } else if (event.key === 'Escape') {
      selected = null;
      hovered = null;
    }
  }
  async function fullscreen() {
    full = !full;
    if (!full) return;
    try {
      await map.requestFullscreen?.();
      if (!full && document.fullscreenElement === map) await document.exitFullscreen();
    } catch {
      // Keep the viewport layout when native fullscreen is unsupported or denied.
    }
    await tick();
    if (full) fullscreenButton?.focus({ preventScroll: true });
  }
  function containFullscreenFocus(event: KeyboardEvent) {
    if (!full || event.key !== 'Tab') return;
    const controls = [...map.querySelectorAll<HTMLElement | SVGElement>(
      'a[href],button:not(:disabled),[tabindex]:not([tabindex="-1"])',
    )].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const first = controls[0], last = controls.at(-1);
    const outside = !map.contains(document.activeElement);
    if (event.shiftKey && (outside || document.activeElement === first)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (outside || document.activeElement === last)) {
      event.preventDefault();
      first?.focus();
    }
  }
  $effect(() => {
    if (!full) return;
    const target = map;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      if (document.fullscreenElement === target) void document.exitFullscreen().catch(() => {});
      if (fullscreenButton?.isConnected) fullscreenButton.focus({ preventScroll: true });
    };
  });
</script>

<svelte:document onfullscreenchange={() => {
  if (document.fullscreenElement === map) hadNativeFullscreen = true;
  else if (hadNativeFullscreen) { hadNativeFullscreen = false; full = false; }
}} />
<svelte:window onkeydown={(event) => {
  containFullscreenFocus(event);
  if (event.key === 'Escape') full = false;
}} />

    <div class="china-map" class:dragging class:fullscreen={full} bind:this={map}>
      <div class="tools">
        <button onclick={() => zoom(0.7)} aria-label={'放大' + countryName + '地图'} title="放大">＋</button>
        <button onclick={() => zoom(1.4)} aria-label={'缩小' + countryName + '地图'} title="缩小">−</button>
        <button onclick={reset} class="reset">全图</button>
        <button bind:this={fullscreenButton} onclick={fullscreen} aria-label={full ? '退出' + countryName + '地图全屏' : '全屏' + countryName + '地图'} aria-pressed={full} title={full ? '退出全屏（Esc）' : '全屏'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={full ? 'M3 8h5V3M16 3v5h5M8 21v-5H3M21 16h-5v5' : 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5'} /></svg></button>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (Keyboard-operated map: arrows pan; +/- zoom; tab selects regions.) -->
      <svg class="province-map" bind:this={svg} viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`} role="application" aria-label={countryName + '省级地区足迹地图，方向键平移，加减号缩放'} tabindex="0" onkeydown={key} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
        {#each regions as region}
          <path d={region.path} class="province" class:visited={!!stats[region.id]} class:chosen={selected?.id === region.id} class:muted={!!search.trim() && !matches.includes(region)} role="button" tabindex="0" aria-label={`${region.name}，${stats[region.id] ? `${stats[region.id]!.count} 张照片，查看照片地图` : '尚未留下照片'}`}
            onclick={(event) => { if (!moved || event.detail === 0) choose(region, event.detail === 0); }}
            onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choose(region, true); } }}
            onfocus={(event) => focus(event, region)} onblur={() => hovered = null}
            onpointerenter={(event) => { if (event.pointerType === 'mouse' && !dragging) hovered = region; }} onpointerleave={() => hovered = null} />
        {/each}
        {#each regions as region}
          <text x={region.label[0]} y={region.label[1]} text-anchor="middle" dominant-baseline="central" font-size={(region.fontSize ?? 18) * 1.3} class:ink={!!stats[region.id]} class:muted={!!search.trim() && !matches.includes(region)}>
            {#each region.lines ?? [region.name] as line, index}<tspan x={region.label[0]} dy={index ? (region.fontSize ?? 18) * 1.3 : region.lines ? -(region.fontSize ?? 18) * .65 : 0}>{line}</tspan>{/each}
          </text>
        {/each}
        {#each layout.waters as water}<text x={water.label[0]} y={water.label[1]} text-anchor="middle" class="water">{water.name}</text>{/each}
      </svg>
      <div class="map-bottom"><MapLegend /><span class="map-scale">{Math.round(layout.width / viewport.w * 100)}%</span></div>
      {#if hovered && !dragging && !selected}<aside class="tooltip" style:left={`${pointer.x}px`} style:top={`${pointer.y}px`}>{@render summary(hovered)}</aside>{/if}
      {#if selected}
        <aside class="selection" aria-label="省级地区摘要" aria-live="polite">
          <button class="close" onclick={() => selected = null} aria-label="关闭地区摘要">×</button>
          {@render summary(selected)}
          {#if stats[selected.id]}<a class="enter" href={href(selected)}>查看照片地图 <span aria-hidden="true">→</span></a>{/if}
        </aside>
      {/if}
    </div>
    <p class="note">抽象示意 · 非真实地理比例</p>
    <section class="memories">
      <div class="list-heading"><h2>沿途的记忆</h2><div class="location-search"><SearchField label="查找省级地区" placeholder="查找省份" clearLabel="清除省份搜索" bind:value={search} /></div></div>
      <div class="region-list">
        {#each listed as region}
          {#if stats[region.id]}<a href={href(region)}><strong>{region.name}</strong><span>{stats[region.id]!.visits.length} 段记录 · {stats[region.id]!.count} 张照片</span></a>
          {:else}<button class="unvisited-row" onclick={() => { selected = region; map.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}><strong>{region.name}</strong><span>尚未留下照片</span></button>{/if}
        {/each}
      </div>
      {#if !listed.length}<p class="no-results">{search.trim() ? '没有找到这个地区，试试省份简称或全称。' : '尚未留下可公开展示省份位置的照片。'}</p>{/if}
    </section>

{#snippet summary(region: ChinaRegion)}
  <p class="summary-eyebrow">{region.fullName}</p><h2>{region.name}</h2>
  {#if stats[region.id]}{@const regionStats = stats[region.id]!}
    <p class="summary-count">{regionStats.visits.length} 段记录 <span>·</span> {regionStats.count} 张照片</p>
    <p class="summary-date">{period(regionStats)}</p>
  {:else}<p class="summary-count">尚未留下照片</p>{/if}
{/snippet}

<style>
  .china-map {
    position: relative;
    height: clamp(420px, 48vw, 730px);
    border: 1px solid #dbe2df;
    border-radius: 5px;
    background: #edf3f3;
    overflow: hidden;
    cursor: grab;
  }
  .china-map.dragging {
    cursor: grabbing;
  }
  .china-map:fullscreen,
  .china-map.fullscreen {
    position: fixed;
    inset: 0;
    z-index: 60;
    margin: 0;
    width: 100vw;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
  .province-map {
    width: 100%;
    height: 100%;
    user-select: none;
    touch-action: none;
  }
  .province {
    fill: #fffdf7;
    stroke: #748a83;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    outline: none;
    cursor: pointer;
    transition:
      fill 0.15s,
      opacity 0.15s;
  }
  .province.visited {
    fill: #dfac59;
  }
  .province:hover,
  .province:focus-visible,
  .province.chosen {
    fill: #e8ede4;
    stroke: #3e5c48;
    stroke-width: 2;
  }
  .province.visited:hover,
  .province.visited:focus-visible,
  .province.visited.chosen {
    fill: #c98632;
  }
  text {
    pointer-events: none;
    fill: #515e56;
    font-family: system-ui, sans-serif;
    font-weight: 500;
  }
  text.ink {
    fill: #42321c;
  }
  text.water {
    fill: #9bb0b2;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 3px;
  }
  .muted {
    opacity: 0.32;
  }
  .tools {
    position: absolute;
    top: 18px;
    right: 18px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .tools button {
    width: 36px;
    height: 36px;
    padding: 0;
    background: #fffdf9;
    color: #516b5a;
    border: 1px solid #d6dfd8;
    border-radius: 4px;
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 21px;
  }
  .tools button:hover {
    background: #e9eee5;
  }
  .tools .reset {
    width: 48px;
    font-size: 12px;
  }
  .tools svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
  }
  .map-bottom {
    position: absolute;
    bottom: 15px;
    left: 20px;
    right: 20px;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
    font-size: 11px;
    color: #82998f;
  }
  .map-scale {
    font-variant-numeric: tabular-nums;
  }
  .note { color: #7b8178; font-size: 11px; line-height: 1.8; }
  .location-search { width: 260px; max-width: 45%; }
  .memories {
    margin: 40px 0;
  }
  .list-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }
  .list-heading h2 {
    font-size: 19px;
    font-weight: 500;
    margin: 0;
  }
  .region-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, 220px);
    gap: 26px 32px;
    margin-top: 24px;
  }
  .region-list a,
  .unvisited-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 4px 0;
    text-decoration: none;
    color: inherit;
    border: 0;
    background: transparent;
    cursor: pointer;
    font: inherit;
  }
  .region-list strong {
    line-height: 1.5;
    font-size: 16px;
    font-weight: 500;
  }
  .region-list span {
    line-height: 1.6;
    font-size: 12px;
    color: #899183;
  }
  .region-list a:hover strong {
    color: #638058;
  }
  .unvisited-row strong {
    color: #83917e;
  }
  .no-results {
    color: #85917f;
    font-size: 13px;
    margin-top: 24px;
  }
  .tooltip,
  .selection {
    padding: 21px 23px;
    background: #fffdf7;
    border: 1px solid #dae1d4;
    border-radius: 6px;
    box-shadow: 0 7px 28px #283e3318;
    color: #425a48;
    cursor: default;
  }
  .tooltip {
    position: fixed;
    width: 260px;
    box-sizing: border-box;
    pointer-events: none;
    z-index: 40;
  }
  .summary-eyebrow {
    color: #94a08b;
    font-size: 10px;
    margin: 0 0 8px;
  }
  .tooltip h2,
  .selection h2 {
    font-size: 24px;
    font-weight: 500;
    margin: 0 0 12px;
  }
  .summary-count {
    font-size: 13px;
    margin: 0 0 9px;
  }
  .summary-count span {
    margin: 0 5px;
    color: #b1bbaa;
  }
  .summary-date {
    color: #9ba38f;
    font-size: 10px;
    margin: 0;
  }
  .selection {
    position: absolute;
    bottom: 38px;
    right: 20px;
    width: 270px;
    max-width: calc(100% - 36px);
    box-sizing: border-box;
    z-index: 3;
  }
  .close {
    float: right;
    border: 0;
    background: none;
    padding: 0 0 8px 12px;
    font-size: 22px;
    color: #7e8d78;
    cursor: pointer;
    line-height: 1;
  }
  .enter {
    display: flex;
    justify-content: space-between;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid #e4e8dc;
    text-decoration: none;
    font-size: 13px;
    color: #3e6049;
  }
  @media (max-width: 700px) {
    .china-map {
      margin: 0 -10px;
      height: 390px;
      border-radius: 4px;
    }
    .tools {
      top: 12px;
      right: 12px;
      gap: 3px;
    }
    .tools button {
      width: 32px;
      height: 32px;
      font-size: 19px;
    }
    .tools .reset {
      width: 39px;
    }
    .memories {
      margin-top: 30px;
    }
    .list-heading {
      gap: 20px;
    }
    .list-heading h2 {
      font-size: 17px;
      white-space: nowrap;
    }
    .region-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 25px 24px;
      margin-top: 24px;
    }
    .region-list strong {
      font-size: 15px;
    }
    .region-list span {
      font-size: 11px;
    }
    .selection {
      position: fixed;
      bottom: max(16px, env(safe-area-inset-bottom));
      left: 16px;
      right: 16px;
      width: auto;
      max-width: none;
      z-index: 50;
      padding: 20px 22px;
    }
    .tooltip {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .province {
      transition: none;
    }
  }
</style>
