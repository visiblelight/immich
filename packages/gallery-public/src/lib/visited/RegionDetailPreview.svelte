<script lang="ts">
  import { onMount } from 'svelte';
  import { OSM_VECTOR_STYLE } from '@gallery/core';
  import { loadOsmStyle } from './map-style';

  let {
    region,
    sample,
    onBack,
  }: {
    region: { id: string; name: string; fullName: string };
    sample: {
      count: number;
      visits: number;
      period: string;
      cities: string[];
      center: [number, number];
    };
    onBack: () => void;
  } = $props();

  // Public city centres are illustration points, never a person's photo locations.
  const cityCenters: Record<string, [number, number]> = {
    北京: [116.4074, 39.9042],
    天津: [117.2008, 39.0842],
    上海: [121.4737, 31.2304],
    杭州: [120.1551, 30.2741],
    宁波: [121.5503, 29.8746],
    绍兴: [120.5821, 29.9971],
    南京: [118.7969, 32.0603],
    苏州: [120.5853, 31.2989],
    扬州: [119.4128, 32.3942],
    福州: [119.2965, 26.0745],
    厦门: [118.0894, 24.4798],
    泉州: [118.6757, 24.8741],
    漳州: [117.6471, 24.513],
    武夷山: [118.0353, 27.7566],
    广州: [113.2644, 23.1291],
    深圳: [114.0579, 22.5431],
    潮州: [116.6226, 23.6567],
    珠海: [113.5767, 22.2707],
    南昌: [115.8582, 28.6829],
    景德镇: [117.1784, 29.2687],
    上饶: [117.9434, 28.4549],
    婺源: [117.8619, 29.2481],
    青岛: [120.3826, 36.0671],
    济南: [117.1201, 36.6512],
    洛阳: [112.454, 34.6197],
    郑州: [113.6253, 34.7466],
    武汉: [114.3054, 30.5931],
    宜昌: [111.2865, 30.6919],
    成都: [104.0665, 30.5723],
    乐山: [103.7654, 29.5521],
    康定: [101.9571, 29.9984],
    九寨沟: [104.2438, 33.2521],
    重庆: [106.5516, 29.563],
    昆明: [102.8329, 24.8801],
    大理: [100.2676, 25.6065],
    丽江: [100.2278, 26.855],
    桂林: [110.2902, 25.2736],
    南宁: [108.3665, 22.817],
    阳朔: [110.4966, 24.7785],
    西安: [108.9398, 34.3416],
    延安: [109.4897, 36.5853],
    长沙: [112.9388, 28.2282],
    张家界: [110.4792, 29.1171],
    香港: [114.1694, 22.3193],
    澳门: [113.5439, 22.1987],
    台北: [121.5654, 25.033],
    花莲: [121.6015, 23.9872],
    台南: [120.227, 22.9997],
  };
  const points = $derived(
    sample.cities.slice(0, 3).map((name, index) => ({
      name,
      center: cityCenters[name] ?? sample.center,
      approximate: !cityCenters[name],
      count:
        Math.floor(sample.count / Math.min(sample.cities.length, 3)) +
        (index < sample.count % Math.min(sample.cities.length, 3) ? 1 : 0),
    })),
  );
  let selected = $state(0);
  const selectedPoint = $derived(points[selected]);
  let loading = $state(true);
  let message = $state('');
  let ready = $state(false);
  let container: HTMLDivElement;
  // The dynamically loaded browser SDK is confined to this preview component.
  type SDK = any;
  let map: SDK;
  let markers: SDK[] = [];
  let pins: HTMLButtonElement[] = [];
  let mounted = false;
  let revision = 0;
  let timeout: ReturnType<typeof setTimeout>;

  function choose(index: number, move = true) {
    selected = index;
    pins.forEach((pin, i) => {
      pin.classList.toggle('is-selected', index === i);
      pin.setAttribute('aria-pressed', String(index === i));
    });
    if (move && map && points[index])
      map.easeTo({
        center: points[index].center,
        zoom: Math.max(7, map.getZoom()),
        duration: 500,
      });
  }

  function framePoints() {
    if (!map) return;
    if (points.length < 2) {
      map.easeTo({ center: sample.center, zoom: 8, duration: 400 });
      return;
    }
    const lngs = points.map((point) => point.center[0]);
    const lats = points.map((point) => point.center[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: { top: 90, bottom: 90, left: 70, right: 70 },
        maxZoom: 8,
        duration: 400,
      },
    );
  }

  async function loadMap() {
    const current = ++revision;
    clearTimeout(timeout);
    markers.forEach((marker) => marker.remove());
    markers = [];
    pins = [];
    map?.remove();
    map = undefined;
    loading = true;
    ready = false;
    message = '';
    timeout = setTimeout(() => {
      if (mounted && current === revision && loading) {
        loading = false;
        message = '底图连接较慢，仍可选择下方示例地点；也可以重试加载。';
      }
    }, 15000);
    try {
      const base = '/vendor/maplibre-6.9.0/';
      if (!document.querySelector('link[data-gallery-maplibre]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = base + 'maplibre-gl.css';
        css.dataset.galleryMaplibre = '1';
        document.head.append(css);
      }
      const url = base + 'maplibre-gl.mjs';
      const sdk = await import(/* @vite-ignore */ url);
      const loaded = await loadOsmStyle(
        OSM_VECTOR_STYLE,
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
        'local',
        location.origin,
      );
      if (!mounted || current !== revision) return;
      let vector = loaded.vector;
      message = loaded.warning;
      map = new sdk.Map({
        container,
        center: sample.center,
        zoom: 6.5,
        maxZoom: 18,
        style: loaded.style,
        cooperativeGestures: true,
      });
      map.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => {
        if (!mounted || current !== revision) return;
        loading = false;
        ready = true;
        clearTimeout(timeout);
        framePoints();
      });
      map.on('error', () => {
        if (!mounted || current !== revision) return;
        if (vector) {
          vector = false;
          message = '矢量底图暂时不可用，正在切换标准底图。';
          map.setStyle(loaded.fallback);
        } else {
          loading = false;
          message = '底图暂时无法加载，示例地点仍可查看。';
          clearTimeout(timeout);
        }
      });
      markers = points.map((point, index) => {
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'region-preview-pin';
        pin.setAttribute('aria-label', `选择示例地点：${point.name}`);
        pin.textContent = String(index + 1);
        pin.onclick = () => choose(index);
        pins.push(pin);
        return new sdk.Marker({ element: pin, anchor: 'center' }).setLngLat(point.center).addTo(map);
      });
      choose(selected, false);
    } catch {
      if (!mounted || current !== revision) return;
      loading = false;
      message = '底图暂时无法加载，示例地点仍可查看。';
      clearTimeout(timeout);
    }
  }

  onMount(() => {
    mounted = true;
    void loadMap();
    const observer = new ResizeObserver(() => map?.resize());
    observer.observe(container);
    return () => {
      mounted = false;
      revision++;
      clearTimeout(timeout);
      observer.disconnect();
      markers.forEach((marker) => marker.remove());
      map?.remove();
    };
  });
</script>

<section class="region-detail" aria-label={`${region.name}地图交互样稿`}>
  <button class="back" type="button" onclick={onBack}>
    <span aria-hidden="true">←</span> 省份足迹
  </button>
  <header>
    <div>
      <p class="eyebrow">中国 · {region.fullName}</p>
      <h1>{region.name}</h1>
      <p class="stats">{sample.count} 张照片<span>·</span>{sample.visits} 段到访记录</p>
    </div>
    <p class="sample-note">交互样稿<span>以下数量与到访记录均为示例</span></p>
  </header>

  <div class="map-wrap" aria-busy={loading}>
    <div class="map" bind:this={container} aria-label={`${region.name}示例地点地图`}></div>
    {#if loading}<div class="loading" role="status"><span></span>正在加载底图</div>{/if}
    <div class="map-caption">示例地点 · 照片数据尚未接入</div>
    <button class="reset" type="button" onclick={framePoints} disabled={!ready} aria-label="查看全部示例地点">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" /></svg>
    </button>
  </div>
  {#if message}
    <div class="map-message" role="status"><p>{message}</p><button type="button" onclick={loadMap}>重试底图</button></div>
  {/if}

  <div class="example-summary">
    <nav aria-label="示例地点">
      {#each points as point, index}
        <button type="button" class:active={selected === index} aria-pressed={selected === index} onclick={() => choose(index)}>
          <span class="number">{index + 1}</span>{point.name}
        </button>
      {/each}
    </nav>
    <div class="place-summary" aria-live="polite">
      {#if selectedPoint}
        <h2>{selectedPoint.name}<span>示例</span></h2>
        <p>{selectedPoint.count} 张示例照片<span class="separator">·</span>{sample.period}</p>
        <p class="explanation">{selectedPoint.approximate ? '地图标记使用地区中心示意位置。' : '地图标记使用城市中心示意位置。'}确认样式后，这里将展示该地点的照片。</p>
      {/if}
    </div>
  </div>
</section>

<style>
  .region-detail {
    color: #2c3c32;
    padding: 8px 0 36px;
  }
  button {
    font: inherit;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    background: none;
    color: #71816f;
    padding: 8px 0;
    cursor: pointer;
    font-size: 14px;
  }
  .back:hover {
    color: #315b44;
  }
  header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    margin: 28px 0 30px;
  }
  .eyebrow {
    margin: 0 0 10px;
    color: #7a8776;
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  h1 {
    margin: 0;
    font-size: clamp(30px, 3.2vw, 44px);
    font-weight: 650;
    line-height: 1.2;
  }
  .stats {
    margin: 15px 0 0;
    color: #778373;
    font-size: 15px;
  }
  .stats span {
    margin: 0 9px;
  }
  .sample-note {
    flex-shrink: 0;
    text-align: right;
    color: #65795d;
    font-size: 12px;
    line-height: 1.8;
    margin: 0;
  }
  .sample-note span {
    display: block;
    color: #929c8d;
  }
  .map-wrap {
    position: relative;
    isolation: isolate;
    height: min(60vh, 640px);
    min-height: 360px;
    background: #ecefe5;
    overflow: hidden;
    border-radius: 3px;
  }
  .map {
    position: absolute;
    inset: 0;
  }
  .map-caption {
    position: absolute;
    top: 14px;
    left: 54px;
    color: #52634e;
    background: #fafbf6ee;
    padding: 8px 11px;
    border-radius: 3px;
    font-size: 11px;
    pointer-events: none;
  }
  .reset {
    display: grid;
    place-items: center;
    position: absolute;
    top: 14px;
    left: 14px;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #cfd7c8;
    color: #405c44;
    background: #fffffb;
    border-radius: 3px;
    cursor: pointer;
    box-shadow: 0 1px 4px #1f342817;
  }
  .reset:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .loading {
    position: absolute;
    inset: 0;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
    background: #edf0e5ed;
    color: #778472;
    font-size: 13px;
    pointer-events: none;
  }
  .loading span {
    width: 13px;
    height: 13px;
    border: 1.5px solid #c8d0bf;
    border-top-color: #628063;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .map-message {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    font-size: 12px;
    color: #7c806c;
  }
  .map-message p {
    margin: 0;
  }
  .map-message button {
    background: none;
    border: 0;
    padding: 8px 0;
    cursor: pointer;
    color: #386047;
    white-space: nowrap;
    font-size: 12px;
  }
  .example-summary {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 2fr;
    gap: 36px;
    margin-top: 25px;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px 10px;
  }
  nav button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #72816b;
    background: none;
    cursor: pointer;
    font-size: 13px;
  }
  nav button:hover {
    background: #edf1e7;
  }
  nav button.active {
    background: #e8eee1;
    color: #335d40;
  }
  .number {
    font-size: 11px;
    opacity: 0.6;
  }
  .place-summary {
    min-width: 0;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 18px;
    line-height: 1.5;
    font-weight: 600;
    margin: 0 0 6px;
  }
  h2 span {
    font-size: 10px;
    font-weight: 400;
    color: #8e9b85;
  }
  .place-summary p {
    color: #7b8973;
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
  }
  .separator {
    padding: 0 10px;
  }
  .place-summary .explanation {
    margin-top: 5px;
    color: #929b8a;
    font-size: 12px;
  }
  button:focus-visible {
    outline: 2px solid #54795b;
    outline-offset: 4px;
  }
  :global(.region-preview-pin) {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 3px solid #fafbf5;
    border-radius: 50%;
    background: #668567;
    color: #fff;
    box-shadow: 0 2px 8px #233d3833;
    font: 600 13px system-ui;
    cursor: pointer;
  }
  :global(.region-preview-pin:hover),
  :global(.region-preview-pin.is-selected) {
    background: #2e573e;
    box-shadow:
      0 0 0 4px #355f4524,
      0 2px 8px #233d3833;
  }
  :global(.region-preview-pin:focus-visible) {
    outline: 2px solid #2e573e;
    outline-offset: 4px;
  }
  @media (max-width: 600px) {
    header {
      display: block;
      margin-top: 18px;
      margin-bottom: 20px;
    }
    .sample-note {
      text-align: left;
      margin-top: 18px;
      font-size: 11px;
    }
    .sample-note span {
      display: inline;
      margin-left: 10px;
    }
    .map-wrap {
      height: 49vh;
      min-height: 330px;
    }
    .map-caption {
      top: auto;
      bottom: 34px;
      left: 10px;
      right: 10px;
      text-align: center;
      font-size: 10px;
    }
    .example-summary {
      grid-template-columns: minmax(0, 1fr);
      gap: 18px;
      margin-top: 18px;
    }
    nav {
      gap: 4px;
    }
    nav button {
      padding: 9px 11px;
    }
    .stats {
      font-size: 14px;
    }
    .place-summary .explanation {
      font-size: 11px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading span {
      animation: none;
    }
  }
</style>
