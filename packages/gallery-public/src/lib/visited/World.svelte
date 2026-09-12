<script lang="ts">
  import world from './world-map.json';
  import { goto } from '$app/navigation';
  import type { VisitedCountry } from '@gallery/core';
  let {
    countries: visited,
    total,
    unassigned = 0,
  }: { countries: VisitedCountry[]; total: number; unassigned?: number } = $props();
  type WorldCountry = (typeof world.countries)[number];
  const mapSize = world;
  let svg: SVGSVGElement;
  let selected = $state<WorldCountry | null>(null),
    hovered = $state<WorldCountry | null>(null);
  let mouse = $state({ x: 0, y: 0 }),
    viewport = $state({ x: 0, y: 0, w: world.width, h: world.height }),
    drag = $state(false);
  let pointers = new Map<number, { x: number; y: number }>(),
    gesture: { x: number; y: number; distance: number; viewport: typeof viewport } | null = null,
    moved = false,
    lastPointer = 'mouse';
  let stats = $derived(new Map(visited.map((c) => [c.id, c])));
  let search = $state('');
  const viewBox = () => `${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`;
  const zoomPercent = () => Math.round((mapSize.width / viewport.w) * 100);
  function reset() {
    viewport = { x: 0, y: 0, w: mapSize.width, h: mapSize.height };
    hovered = null;
  }
  function bounded(view: typeof viewport) {
    return {
      ...view,
      x: Math.max(-100, Math.min(mapSize.width - view.w + 100, view.x)),
      y: Math.max(-100, Math.min(mapSize.height - view.h + 100, view.y)),
    };
  }
  function zoom(factor: number) {
    const w = Math.max(180, Math.min(mapSize.width, viewport.w * factor));
    const h = (w * mapSize.height) / mapSize.width;
    viewport = bounded({ x: viewport.x + (viewport.w - w) / 2, y: viewport.y + (viewport.h - h) / 2, w, h });
    hovered = null;
  }
  function focusCaucasus() {
    viewport = { x: 390, y: 120, w: 540, h: 425 };
    hovered = null;
  }
  function metrics() {
    const points = [...pointers.values()];
    const a = points[0]!,
      b = points[1] ?? a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  function pointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    lastPointer = event.pointerType;
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = { ...metrics(), viewport: { ...viewport } };
    // Capture on the original country, so a stationary tap retains its click target.
    (event.target as Element).setPointerCapture(event.pointerId);
    hovered = null;
  }
  function pointerMove(event: PointerEvent) {
    mouse = {
      x: Math.min(event.clientX + 18, window.innerWidth - 292),
      y: Math.max(12, Math.min(event.clientY + 18, window.innerHeight - 235)),
    };
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const now = metrics();
    const dx = now.x - gesture.x,
      dy = now.y - gesture.y;
    if (Math.hypot(dx, dy) > 5 || pointers.size > 1) {
      moved = true;
      drag = true;
      hovered = null;
    }
    if (!moved) return;
    const bounds = svg.getBoundingClientRect();
    const ratio = Math.min(bounds.width / gesture.viewport.w, bounds.height / gesture.viewport.h);
    const scale = gesture.distance > 0 && now.distance > 0 ? gesture.distance / now.distance : 1;
    const w = Math.max(180, Math.min(mapSize.width, gesture.viewport.w * scale));
    const h = (w * mapSize.height) / mapSize.width;
    viewport = bounded({
      x: gesture.viewport.x - dx / ratio + (gesture.viewport.w - w) / 2,
      y: gesture.viewport.y - dy / ratio + (gesture.viewport.h - h) / 2,
      w,
      h,
    });
  }
  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (event.type === 'pointercancel') moved = true;
    gesture = pointers.size ? { ...metrics(), viewport: { ...viewport } } : null;
    if (!pointers.size) drag = false;
  }
  function choose(event: MouseEvent, country: WorldCountry) {
    if (moved && event.detail !== 0) return;
    if (!stats.has(country.id)) return;
    if (event.detail === 0 || lastPointer !== 'touch') {
      void goto(`/visited/${country.id}`);
      return;
    }
    selected = country;
    hovered = null;
  }
  function focus(event: FocusEvent, country: WorldCountry) {
    const box = (event.target as SVGElement).getBoundingClientRect();
    mouse = {
      x: Math.max(12, Math.min(box.right + 12, window.innerWidth - 292)),
      y: Math.max(12, Math.min(box.top, window.innerHeight - 235)),
    };
    hovered = country;
  }
  function mapKey(event: KeyboardEvent) {
    const shift = viewport.w * 0.1;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-shift, 0],
      ArrowRight: [shift, 0],
      ArrowUp: [0, -shift],
      ArrowDown: [0, shift],
    };
    if (delta[event.key]) {
      event.preventDefault();
      const [x, y] = delta[event.key]!;
      viewport = bounded({ ...viewport, x: viewport.x + x, y: viewport.y + y });
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoom(0.75);
    } else if (event.key === '-') {
      event.preventDefault();
      zoom(1.33);
    } else if (event.key === 'Escape') {
      selected = null;
      hovered = null;
    }
  }
</script>

<section class="heading">
  <div>
    <p class="eyebrow">PLACES & MEMORIES</p>
    <h1>去过</h1>
    <p>在世界上，留下几束光。</p>
  </div>
  <div class="numbers">
    <strong>{visited.length}</strong> 个国家 <span>·</span> <strong>{total}</strong> 张有公开位置的照片
  </div>
</section>
<div class="map" class:drag>
  <div class="tools">
    <button onclick={() => zoom(0.7)} aria-label="放大地图">＋</button><button
      onclick={() => zoom(1.4)}
      aria-label="缩小地图">−</button
    ><button onclick={reset}>全图</button><span>{zoomPercent()}%</span>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The SVG is a keyboard-operated pan and zoom application.) -->
  <svg
    bind:this={svg}
    viewBox={viewBox()}
    role="application"
    aria-label="世界足迹地图，方向键平移，加减号缩放"
    tabindex="0"
    onkeydown={mapKey}
    onpointerdown={pointerDown}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={pointerUp}
  >
    {#each world.countries as country}<path
        d={country.path}
        fill-rule="evenodd"
        class:visited={stats.has(country.id)}
        class:selected={selected?.id === country.id}
        role="button"
        tabindex={stats.has(country.id) ? 0 : -1}
        aria-label={`${country.name}，${stats.get(country.id)?.count ?? 0} 张照片`}
        onclick={(e) => choose(e, country)}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (stats.has(country.id)) void goto(`/visited/${country.id}`);
          }
        }}
        onfocus={(e) => focus(e, country)}
        onblur={() => (hovered = null)}
        onpointerenter={(e) => {
          if (e.pointerType === 'mouse' && !drag) hovered = country;
        }}
        onpointerleave={() => (hovered = null)}
      />{/each}
    <path d={world.borders} class="borders" />
    {#each world.countries as c}<text
        x={c.label[0]}
        y={c.label[1]}
        text-anchor="middle"
        dominant-baseline="central"
        font-size={c.size}
        class:ink={stats.has(c.id)}
        >{#each c.lines as line, i}<tspan
            x={c.label[0]}
            dy={i === 0 ? (-(c.lines.length - 1) * c.lineHeight) / 2 : c.lineHeight}>{line}</tspan
          >{/each}</text
      >{/each}
    {#each world.waters as sea}<text
        x={sea.label[0]}
        y={sea.label[1]}
        text-anchor="middle"
        class="water"
        font-size={sea.size}
        writing-mode={sea.vertical ? 'vertical-rl' : 'horizontal-tb'}>{sea.name}</text
      >{/each}
  </svg>
  <div class="legend"><i></i> 去过 <i class="empty"></i> 尚未留下照片 <span>拖动 · 双指缩放</span></div>
</div>
<p class="note">
  根据已公开照片的拍摄时间整理，日期不代表出入境记录。{#if unassigned}另有 {unassigned} 张照片的位置暂无法明确归属国家。{/if}
</p>
<section class="list">
  <div class="list-heading">
    <h2>沿途的记忆</h2>
    <input aria-label="查找去过的国家" placeholder="查找国家" bind:value={search} />
  </div>
  {#if !visited.length}<p>还没有可展示的足迹。发布允许公开位置的照片后，足迹会出现在这里。</p>{:else}<div
      class="country-list"
    >
      {#each visited.filter((c) => c.name.includes(search)) as c}<a href={`/visited/${c.id}`}
          ><strong>{c.name}</strong><span>{c.visits.length} 段记录 · {c.count} 张照片 →</span></a
        >{/each}
    </div>{/if}
</section>
{#snippet summary(c: WorldCountry)}<p class="eyebrow">{c.en}</p>
  <h2>{c.name}</h2>
  {#if stats.get(c.id)}{#each stats.get(c.id)!.visits as visit}<div class="visit">
        <span>{visit.label || (visit.start ? `${visit.start} — ${visit.end}` : '拍摄日期待确认')}</span><b
          >{visit.count} 张</b
        >
      </div>{/each}{:else}<p>尚未留下公开的照片</p>{/if}{/snippet}
{#if hovered && !drag && !selected}<aside class="tooltip" style:left={`${mouse.x}px`} style:top={`${mouse.y}px`}>
    {@render summary(hovered)}
  </aside>{/if}
{#if selected}<aside class="sheet" aria-label="国家到访摘要">
    <button class="close" onclick={() => (selected = null)} aria-label="关闭摘要">×</button>{@render summary(
      selected,
    )}<a class="enter" href={`/visited/${selected.id}`}>查看照片地图 →</a>
  </aside>{/if}

<style>
  .heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    margin: 34px 0 24px;
  }
  .heading h1 {
    font-size: 38px;
    font-weight: 500;
    margin: 8px 0;
  }
  .heading p {
    color: #71766c;
    margin: 8px 0;
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 2px;
    color: #7b8377;
  }
  .numbers {
    font-size: 12px;
    color: #71766c;
  }
  .numbers strong {
    font-size: 25px;
    color: #344e41;
    font-weight: 500;
  }
  .numbers span {
    margin: 0 15px;
  }
  .map {
    height: min(70vw, 690px);
    min-height: 340px;
    position: relative;
    background: #edf3f3;
    border: 1px solid #dbe2df;
    border-radius: 5px;
    overflow: hidden;
    cursor: grab;
  }
  .map.drag {
    cursor: grabbing;
  }
  svg {
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
  }
  path {
    fill: #fffdf7;
    outline: none;
  }
  path.visited {
    fill: #8fa99a;
    cursor: pointer;
  }
  path.visited:hover,
  path:focus,
  path.selected {
    fill: #637f6e;
  }
  .borders {
    fill: none;
    stroke: #748a83;
    stroke-width: 1;
    pointer-events: none;
    vector-effect: non-scaling-stroke;
  }
  text {
    pointer-events: none;
    fill: #515e56;
    font-family: system-ui, sans-serif;
  }
  .ink {
    fill: #203f30;
  }
  .water {
    fill: #91a8ac;
    letter-spacing: 2px;
  }
  .tools {
    position: absolute;
    right: 14px;
    top: 14px;
    display: flex;
    gap: 4px;
    align-items: center;
    z-index: 1;
  }
  .tools button {
    border: 1px solid #d7ded6;
    background: #fffdf8;
    min-width: 34px;
    height: 34px;
    border-radius: 3px;
    cursor: pointer;
  }
  .tools span {
    font-size: 10px;
    width: 38px;
    text-align: right;
    color: #6d817b;
  }
  .legend {
    position: absolute;
    bottom: 15px;
    left: 18px;
    font-size: 11px;
    color: #556d65;
    display: flex;
    gap: 7px;
    align-items: center;
    pointer-events: none;
  }
  .legend i {
    width: 11px;
    height: 11px;
    background: #8fa99a;
    border: 1px solid #83958b;
  }
  .legend .empty {
    background: #fffdf7;
    margin-left: 12px;
  }
  .legend span {
    margin-left: 20px;
  }
  .note {
    color: #7b8178;
    font-size: 11px;
    line-height: 1.8;
  }
  .list {
    margin: 40px 0;
  }
  .list-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .list h2 {
    font-size: 19px;
    font-weight: 500;
  }
  .list input {
    padding: 9px;
    border: 1px solid #d9ded5;
    background: transparent;
    border-radius: 3px;
    max-width: 40%;
  }
  .country-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0 30px;
  }
  .country-list a {
    display: flex;
    justify-content: space-between;
    padding: 18px 0;
    border-bottom: 1px solid #e0e4da;
    gap: 10px;
    color: inherit;
    text-decoration: none;
  }
  .country-list strong {
    font-weight: 500;
  }
  .country-list span {
    font-size: 11px;
    color: #7b8178;
  }
  .tooltip,
  .sheet {
    padding: 22px;
    background: #fffdf7;
    box-shadow: 0 6px 35px #263c3320;
    z-index: 30;
    border: 1px solid #dbe1d5;
    border-radius: 5px;
  }
  .tooltip {
    position: fixed;
    width: 250px;
    max-height: 220px;
    overflow: hidden;
    pointer-events: none;
  }
  .tooltip h2,
  .sheet h2 {
    font-weight: 500;
    font-size: 22px;
    margin: 10px 0 20px;
  }
  .visit {
    display: flex;
    justify-content: space-between;
    gap: 15px;
    font-size: 11px;
    line-height: 1.7;
    margin-top: 9px;
  }
  .visit b {
    white-space: nowrap;
    font-weight: 500;
  }
  .sheet {
    position: fixed;
    bottom: 18px;
    right: 24px;
    width: 310px;
    max-height: 55dvh;
    overflow: auto;
  }
  .close {
    float: right;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
  }
  .enter {
    display: block;
    background: #3c5948;
    color: white;
    text-align: center;
    padding: 12px;
    margin-top: 24px;
    text-decoration: none;
    border-radius: 3px;
  }
  @media (max-width: 700px) {
    .heading {
      display: block;
      margin-top: 24px;
    }
    .heading h1 {
      font-size: 30px;
    }
    .numbers {
      margin-top: 20px;
    }
    .map {
      height: 58dvh;
    }
    .country-list {
      grid-template-columns: 1fr;
    }
    .sheet {
      left: 12px;
      right: 12px;
      bottom: 12px;
      width: auto;
    }
    .legend span {
      display: none;
    }
    .tools {
      right: 8px;
      top: 8px;
    }
  }
</style>
