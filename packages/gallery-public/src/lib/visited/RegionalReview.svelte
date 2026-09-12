<script lang="ts">
  import { borders, countries, countryPath, mapSize, sampleVisits, seas, type ReviewCountry } from './regional-map';
  let svg: SVGSVGElement;
  let selected = $state<ReviewCountry | null>(null);
  let hovered = $state<ReviewCountry | null>(null);
  let mouse = $state({ x: 0, y: 0 });
  let viewport = $state({ x: 0, y: 0, w: mapSize.width, h: mapSize.height });
  let drag = $state(false);
  let pointers = new Map<number, { x: number; y: number }>();
  let gesture: { x: number; y: number; distance: number; viewport: typeof viewport } | null = null;
  let moved = false;
  const visitedCount = Object.keys(sampleVisits).length;
  const photoCount = Object.values(sampleVisits)
    .flat()
    .reduce((sum, visit) => sum + visit.count, 0);
  const total = (id: string) => (sampleVisits[id] ?? []).reduce((sum, visit) => sum + visit.count, 0);
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
    const w = Math.max(300, Math.min(mapSize.width, viewport.w * factor));
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
    const w = Math.max(300, Math.min(mapSize.width, gesture.viewport.w * scale));
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
  function choose(event: MouseEvent, country: ReviewCountry) {
    if (moved && event.detail !== 0) return;
    selected = country;
    hovered = null;
  }
  function focus(event: FocusEvent, country: ReviewCountry) {
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

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      selected = null;
      hovered = null;
    }
  }}
/>

<div class="review-page">
  <header>
    <a class="wordmark" href="/design">Gallery<span>影像与旅途</span></a>
    <nav aria-label="设计预览导航">
      <a href="/albums">相册</a><a href="/photos">相片</a><a class="active" aria-current="page" href="/design/visited"
        >去过</a
      ><a href="/about">关于</a>
    </nav>
    <span class="preview-badge">区域样稿 · 01</span>
  </header>

  <main>
    <div class="intro">
      <div>
        <p class="eyebrow">沿着照片，回望旅途</p>
        <h1>去过</h1>
        <p class="subtitle">把走过的地方，留在地图上。</p>
      </div>
      <div class="stats" aria-label="示例统计">
        <div><strong>{visitedCount}</strong><span>个国家</span></div>
        <div><strong>{photoCount}</strong><span>张照片</span></div>
        <small>示例数据</small>
      </div>
    </div>

    <div class="map-shell">
      <div class="map-topline">
        <span>黑海 · 高加索 · 中东</span><span class="legend"><i></i>去过 <i class="empty"></i>未去过</span>
      </div>
      <div class:drag class="map-area">
        <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions (The SVG is a custom pan/zoom application: arrows, +/- and focusable named country buttons provide keyboard equivalents.) -->
        <svg
          bind:this={svg}
          viewBox={viewBox()}
          role="application"
          aria-label="区域抽象地图，可使用方向键平移，加减键缩放，Tab 切换国家"
          tabindex="0"
          onpointerdown={pointerDown}
          onpointermove={pointerMove}
          onpointerup={pointerUp}
          onpointercancel={pointerUp}
          onkeydown={mapKey}
        >
          <title>原创区域地图样稿，颜色及到访数据均为虚构示例</title>
          <rect x="-5000" y="-5000" width="10000" height="10000" fill="var(--water)" />
          {#each countries as country (country.id)}
            <g
              role="button"
              tabindex="0"
              aria-label={`${country.name}，${sampleVisits[country.id] ? `示例中到访 ${sampleVisits[country.id]!.length} 次，${total(country.id)} 张照片` : '示例中尚未到访'}`}
              aria-pressed={selected?.id === country.id}
              aria-describedby={hovered?.id === country.id && !selected ? 'country-summary' : undefined}
              onpointerenter={(event) => {
                if (event.pointerType === 'mouse' && !pointers.size) hovered = country;
              }}
              onpointerleave={() => (hovered = null)}
              onfocus={(event) => focus(event, country)}
              onblur={() => (hovered = null)}
              onclick={(event) => choose(event, country)}
              onkeydown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  selected = country;
                  hovered = null;
                }
              }}
            >
              <path
                class="country"
                class:visited={!!sampleVisits[country.id]}
                class:chosen={selected?.id === country.id}
                d={countryPath(country)}
              />
              <text
                class="country-label"
                class:visited-label={!!sampleVisits[country.id]}
                x={country.label[0]}
                y={country.label[1]}
                style:font-size={`${country.size ?? 22}px`}
              >
                {#if country.lines}
                  {#each country.lines as line, i}<tspan
                      x={country.label[0]}
                      dy={i === 0 ? `${-(country.lines.length - 1) * 0.53}em` : '1.06em'}>{line}</tspan
                    >{/each}
                {:else}{country.name}{/if}
              </text>
            </g>
          {/each}
          <path class="boundaries" d={borders.map((edge) => `M${edge.a.join(',')}L${edge.b.join(',')}`).join('')} />
          {#each seas as sea}
            <g class="sea-label" transform={`translate(${sea.x},${sea.y}) rotate(${sea.angle ?? 0})`}>
              {#if sea.vertical}<text class="sea-name"
                  ><tspan x="0" dy="-12">里</tspan><tspan x="0" dy="28">海</tspan></text
                >
              {:else}<text class="sea-name">{sea.name}</text>{#if !sea.compact}<text class="sea-en" y="21"
                    >{sea.en}</text
                  >{/if}{/if}
            </g>
          {/each}
        </svg>

        <div class="map-controls" aria-label="地图操作">
          <button onclick={() => zoom(0.75)} disabled={viewport.w <= 300} aria-label="放大地图">＋</button>
          <span>{zoomPercent()}%</span>
          <button onclick={() => zoom(1.33)} disabled={viewport.w >= mapSize.width} aria-label="缩小地图">−</button>
          <button class="fit" onclick={reset} aria-label="查看整个区域">全图</button>
        </div>
        <button class="focus-region" onclick={focusCaucasus}>放大高加索 ↗</button>
        <span class="map-note">抽象示意 · 非地理比例</span>
      </div>
      <div class="map-caption">
        <span>拖动探索 · 双指或 ＋/− 缩放 · 点选国家查看记录</span><span>海域留白 / 共享边界</span>
      </div>
    </div>

    <div class="review-note">
      <span>这次看什么</span>
      <p>国家的相对位置、海域的留白，以及小国名称是否清楚。这里是区域裁切样稿，完整世界地图将在方向确认后展开。</p>
      <p>上色、日期和数量均为示例；真实照片与国家地图尚未接入。</p>
    </div>
  </main>

  {#if hovered && !selected && !drag}
    <div class="hover-card" id="country-summary" role="tooltip" style:left={`${mouse.x}px`} style:top={`${mouse.y}px`}>
      <span class="eyebrow">{sampleVisits[hovered.id] ? '走过的地方 · 示例' : '等待下一段旅途'}</span>
      <h2>{hovered.name}</h2>
      {#if sampleVisits[hovered.id]}
        <p>{sampleVisits[hovered.id]!.length} 次到访 <span>·</span> {total(hovered.id)} 张照片</p>
        {#each sampleVisits[hovered.id]! as visit}<div class="visit-mini">
            <span>{visit.start} — {visit.end}</span><b>{visit.count} 张</b>
          </div>{/each}
        <small>点击查看到访记录 ↗</small>
      {:else}<p>示例中尚无公开照片</p>{/if}
    </div>
  {/if}

  {#if selected}
    <aside class="country-panel" aria-label={`${selected.name}到访记录`}>
      <button class="close" onclick={() => (selected = null)} aria-label="关闭到访记录">×</button>
      <p class="eyebrow">去过的地方 / 示例</p>
      <h2>{selected.name}</h2>
      {#if sampleVisits[selected.id]}
        <p class="panel-summary">{sampleVisits[selected.id]!.length} 次到访<span>·</span>{total(selected.id)} 张照片</p>
        <div class="visits">
          {#each sampleVisits[selected.id]! as visit, i}<div class="visit">
              <i></i>
              <div>
                <small>第 {sampleVisits[selected.id]!.length - i} 次到访</small><strong
                  >{visit.start} — {visit.end}</strong
                ><span>{visit.count} 张照片</span>
              </div>
            </div>{/each}
        </div>
        <p class="inferred">日期根据照片拍摄时间整理</p>
        <button class="open-map" disabled>查看照片地图 <span>↗</span></button>
        <p class="pending">下一阶段接入真实地图与照片</p>
      {:else}<p class="empty-message">示例中尚无这个国家的公开照片。</p>{/if}
    </aside>
  {/if}
</div>

<style>
  :global(body) {
    margin: 0;
    background: #fafbf9;
    color: #273b35;
    font-family:
      Inter,
      -apple-system,
      BlinkMacSystemFont,
      'PingFang SC',
      'Microsoft YaHei',
      sans-serif;
  }
  :global(*) {
    box-sizing: border-box;
  }
  .review-page {
    --water: #eaf2f3;
    --ink: #273b35;
    --teal: #397768;
    --muted: #7e8d86;
  }
  button,
  a {
    -webkit-tap-highlight-color: transparent;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid #215d4f;
    outline-offset: 5px;
  }
  header {
    height: 92px;
    margin: 0 5vw;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #e5e9e4;
    gap: 24px;
  }
  .wordmark {
    font-family: Georgia, serif;
    font-size: 27px;
    letter-spacing: -1px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .wordmark span {
    font-family: system-ui, sans-serif;
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 2px;
  }
  nav {
    display: flex;
    align-self: stretch;
    align-items: center;
    gap: 36px;
    font-size: 14px;
  }
  nav a {
    height: 100%;
    display: grid;
    align-items: center;
    position: relative;
    color: #84918b;
  }
  nav .active {
    color: var(--ink);
  }
  nav .active:after {
    content: '';
    position: absolute;
    height: 2px;
    background: var(--teal);
    bottom: 0;
    width: 100%;
  }
  .preview-badge {
    border: 1px solid #dde5df;
    border-radius: 5px;
    padding: 6px 9px;
    font-size: 10px;
    color: #7b8a81;
    letter-spacing: 1px;
  }
  main {
    max-width: 1640px;
    margin: auto;
    padding: 38px 5vw 36px;
  }
  .intro {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 26px;
  }
  .eyebrow {
    margin: 0 0 8px;
    font-size: 10px;
    color: #7a8d82;
    letter-spacing: 2px;
  }
  h1 {
    font-size: 34px;
    font-weight: 500;
    letter-spacing: 4px;
    margin: 8px 0;
  }
  .subtitle {
    font-size: 12px;
    color: #87928b;
    margin: 8px 0 0;
  }
  .stats {
    display: flex;
    gap: 32px;
    align-items: center;
    position: relative;
    padding-bottom: 16px;
  }
  .stats div {
    display: flex;
    align-items: baseline;
    gap: 9px;
  }
  .stats strong {
    font-family: Georgia, serif;
    font-size: 34px;
    font-weight: 400;
  }
  .stats span {
    font-size: 11px;
    color: #84918b;
  }
  .stats small {
    position: absolute;
    right: 0;
    bottom: 0;
    font-size: 9px;
    color: #9aa59e;
  }
  .map-shell {
    border: 1px solid #dce6e2;
    border-radius: 12px;
    overflow: hidden;
    background: var(--water);
  }
  .map-topline {
    display: flex;
    justify-content: space-between;
    padding: 15px 22px;
    font-size: 11px;
    color: #71847e;
    border-bottom: 1px solid #dce6e2;
    background: #f4f8f7;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
  }
  .legend i {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: var(--teal);
  }
  .legend .empty {
    margin-left: 12px;
    background: #fff;
    border: 1px solid #aabbb2;
  }
  .map-area {
    position: relative;
    height: clamp(520px, 70vh, 900px);
    overflow: hidden;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
    cursor: grab;
  }
  .drag svg {
    cursor: grabbing;
  }
  svg:focus-visible {
    outline: 2px solid #397768;
    outline-offset: -3px;
  }
  .country {
    fill: #fffefb;
    transition: fill 150ms;
  }
  .country.visited {
    fill: var(--teal);
  }
  svg g[role='button'] {
    cursor: pointer;
    outline: none;
  }
  svg g[role='button']:hover .country,
  svg g[role='button']:focus-visible .country {
    fill: #e0e8dd;
  }
  svg g[role='button']:hover .visited,
  svg g[role='button']:focus-visible .visited,
  .country.chosen.visited {
    fill: #255e51;
  }
  .country.chosen {
    fill: #dbe6d8;
  }
  .country-label {
    text-anchor: middle;
    dominant-baseline: middle;
    fill: #51645b;
    pointer-events: none;
    font-weight: 450;
    letter-spacing: 0.5px;
  }
  .visited-label {
    fill: #fffef7;
  }
  .boundaries {
    fill: none;
    stroke: #93aaa0;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
    stroke-linejoin: round;
  }
  .sea-label {
    fill: #77949a;
    text-anchor: middle;
    pointer-events: none;
  }
  .sea-name {
    font-size: 18px;
    letter-spacing: 3px;
  }
  .sea-en {
    font-size: 8px;
    letter-spacing: 1.8px;
    opacity: 0.65;
  }
  .map-controls {
    position: absolute;
    right: 18px;
    bottom: 20px;
    display: flex;
    align-items: center;
    border: 1px solid #d4dfd9;
    background: #fffefbef;
    border-radius: 7px;
    box-shadow: 0 3px 12px #4c6f6310;
  }
  .map-controls button {
    background: none;
    border: 0;
    padding: 10px 13px;
    color: #35564a;
    font-size: 18px;
  }
  .map-controls button:disabled {
    opacity: 0.3;
  }
  .map-controls span {
    width: 42px;
    text-align: center;
    font-size: 10px;
    color: #809189;
  }
  .map-controls .fit {
    font-size: 11px;
    border-left: 1px solid #e2e9e4;
  }
  .focus-region {
    position: absolute;
    left: 18px;
    top: 18px;
    border: 1px solid #d6e2dc;
    background: #fffffff0;
    border-radius: 5px;
    padding: 10px 13px;
    font-size: 11px;
    color: #456456;
  }
  .map-note {
    position: absolute;
    left: 20px;
    bottom: 24px;
    font-size: 9px;
    color: #869a95;
    letter-spacing: 1px;
  }
  .map-caption {
    background: #f4f8f7;
    border-top: 1px solid #dce6e2;
    padding: 12px 22px;
    font-size: 10px;
    color: #7f9388;
    display: flex;
    justify-content: space-between;
  }
  .review-note {
    display: flex;
    align-items: baseline;
    gap: 18px;
    margin-top: 18px;
    font-size: 10px;
    color: #8e9b93;
    flex-wrap: wrap;
  }
  .review-note > span {
    color: #547362;
  }
  .review-note p {
    margin: 0;
    line-height: 1.7;
  }
  .hover-card {
    position: fixed;
    pointer-events: none;
    z-index: 10;
    background: #fffefa;
    width: 280px;
    padding: 20px;
    border: 1px solid #dfe6dc;
    border-radius: 9px;
    box-shadow: 0 12px 38px #294b3920;
  }
  h2 {
    font-size: 23px;
    font-weight: 500;
    margin: 10px 0;
    letter-spacing: 1px;
  }
  .hover-card p {
    font-size: 12px;
    color: #7a8a80;
    margin: 8px 0 15px;
  }
  .hover-card p span {
    padding: 0 6px;
  }
  .visit-mini {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    margin: 8px 0;
    color: #5c7365;
  }
  .visit-mini b {
    font-weight: 500;
  }
  .hover-card > small {
    display: block;
    font-size: 9px;
    color: #8b9b8f;
    border-top: 1px solid #ebeee7;
    margin-top: 15px;
    padding-top: 12px;
  }
  .country-panel {
    position: fixed;
    z-index: 20;
    right: 30px;
    top: 180px;
    width: 345px;
    background: #fffefb;
    border: 1px solid #dce5dc;
    border-radius: 12px;
    box-shadow: 0 14px 65px #284b3425;
    padding: 30px;
    max-height: calc(100dvh - 205px);
    overflow: auto;
  }
  .close {
    position: absolute;
    right: 15px;
    top: 12px;
    background: none;
    border: 0;
    color: #859489;
    font-size: 25px;
    width: 30px;
    height: 30px;
  }
  .panel-summary {
    font-size: 12px;
    color: #758a7a;
  }
  .panel-summary span {
    padding: 0 10px;
  }
  .visits {
    margin: 30px 0 18px;
  }
  .visit {
    display: flex;
    gap: 14px;
    position: relative;
    padding-bottom: 24px;
  }
  .visit:last-child {
    padding-bottom: 0;
  }
  .visit:before {
    content: '';
    position: absolute;
    left: 3px;
    top: 8px;
    bottom: 0;
    border-left: 1px solid #dde6dc;
  }
  .visit:last-child:before {
    display: none;
  }
  .visit i {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #6f9380;
    margin-top: 4px;
  }
  .visit div {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .visit small {
    font-size: 10px;
    color: #91a18f;
  }
  .visit strong {
    font-size: 12px;
    font-weight: 500;
  }
  .visit span {
    font-size: 11px;
    color: #6b8470;
  }
  .inferred,
  .pending {
    font-size: 9px;
    color: #97a18f;
  }
  .inferred {
    margin: 22px 0;
  }
  .open-map {
    width: 100%;
    display: flex;
    justify-content: space-between;
    background: #e6ebe1;
    border: 0;
    color: #8b9984;
    border-radius: 5px;
    padding: 13px 15px;
    font-size: 12px;
  }
  .pending {
    text-align: center;
    margin: 10px 0 0;
  }
  .empty-message {
    font-size: 13px;
    color: #849082;
    line-height: 1.8;
    margin-top: 25px;
  }
  @media (max-width: 720px) {
    header {
      height: 72px;
      margin: 0 20px;
      gap: 15px;
    }
    .wordmark {
      font-size: 23px;
    }
    .wordmark span,
    .preview-badge {
      display: none;
    }
    nav {
      gap: 22px;
      font-size: 12px;
    }
    main {
      padding: 26px 16px;
    }
    .intro {
      margin: 0 4px 24px;
    }
    .eyebrow {
      font-size: 9px;
    }
    h1 {
      font-size: 29px;
    }
    .subtitle {
      font-size: 10px;
    }
    .stats {
      gap: 15px;
    }
    .stats div {
      flex-direction: column;
      gap: 4px;
    }
    .stats strong {
      font-size: 25px;
    }
    .stats span {
      font-size: 10px;
    }
    .stats small {
      font-size: 8px;
    }
    .map-topline {
      padding: 13px 12px;
      font-size: 10px;
    }
    .legend {
      gap: 5px;
      font-size: 9px;
    }
    .legend .empty {
      margin-left: 6px;
    }
    .map-area {
      height: 64svh;
      min-height: 420px;
    }
    .map-caption {
      padding: 12px;
      font-size: 9px;
    }
    .map-caption span:last-child {
      display: none;
    }
    .focus-region {
      left: 12px;
      top: 12px;
      font-size: 10px;
    }
    .map-controls {
      right: 12px;
      bottom: 14px;
    }
    .map-note {
      left: 12px;
      bottom: 65px;
      font-size: 8px;
    }
    .review-note {
      display: block;
      margin: 18px 4px;
    }
    .review-note p {
      margin-top: 6px;
    }
    .hover-card {
      display: none;
    }
    .country-panel {
      top: auto;
      right: 10px;
      left: 10px;
      bottom: 10px;
      width: auto;
      max-height: 52dvh;
      border-radius: 16px;
      padding: 25px;
      padding-bottom: max(25px, env(safe-area-inset-bottom));
    }
    .country-panel h2 {
      font-size: 24px;
    }
    .visits {
      margin-top: 22px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .country {
      transition: none;
    }
  }
</style>
