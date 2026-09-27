<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { replaceState, goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import type { MapViewport, MapPhoto, PhotoCluster, VisitedCountry } from '@gallery/core';
  import { createPhotoMap, type Provider, type PhotoMap, type View } from './providers';
  let {
    country,
    bounds,
    providers,
    visitId,
  }: { country: VisitedCountry; bounds: MapViewport; providers: Provider[]; visitId: string | null } =
    $props();
  let container: HTMLDivElement, map: PhotoMap | undefined;
  let provider = $state(''),
    message = $state(''),
    loading = $state(true),
    photos = $state<MapPhoto[]>([]),
    total = $state(0),
    listPage = $state(1),
    showAllCountries = $state(false),
    selectedCluster = $state<PhotoCluster | null>(null),
    selectedPhotos = $state<MapPhoto[]>([]),
    selectedTotal = $state(0),
    selectedPage = $state(1),
    selectionLoading = $state(false),
    selectionError = $state(''),
    listLoading = $state(false);
  let controller: AbortController | undefined,
    listController: AbortController | undefined,
    revision = 0,
    alive = true,
    clusterViewport: MapViewport | undefined,
    selectionController: AbortController | undefined,
    selectionTrigger: HTMLElement | null = null,
    lastView: View;
  let selectionClose = $state<HTMLButtonElement>();
  let lastUrl = $state('');
  let timer: ReturnType<typeof setTimeout>;
  const names = { osm: 'OpenStreetMap', google: 'Google 地图', amap: '高德地图' };
  function initialView(): View {
    const q = new URLSearchParams(location.search);
    const values = ['lng', 'lat', 'zoom'].map((k) => (q.has(k) ? Number(q.get(k)) : NaN));
    if (
      values.every(Number.isFinite) &&
      Math.abs(values[0]!) <= 180 &&
      Math.abs(values[1]!) <= 85 &&
      values[2]! >= 0 &&
      values[2]! <= 19
    )
      return { longitude: values[0]!, latitude: values[1]!, zoom: values[2]! };
    const span = bounds.east >= bounds.west ? bounds.east - bounds.west : 360 + bounds.east - bounds.west;
    return {
      longitude: ((((bounds.west + span / 2 + 180) % 360) + 360) % 360) - 180,
      latitude: (bounds.north + bounds.south) / 2,
      zoom: Math.max(
        1,
        Math.min(12, Math.log2(280 / Math.max(span, (bounds.north - bounds.south) * 1.5, 0.05))),
      ),
    };
  }
  function remember(view: View) {
    const url = new URL(location.href);
    url.searchParams.set('lng', view.longitude.toFixed(5));
    url.searchParams.set('lat', view.latitude.toFixed(5));
    url.searchParams.set('zoom', view.zoom.toFixed(2));
    url.searchParams.set('provider', provider);
    if (showAllCountries) url.searchParams.set('scope', 'all');
    else url.searchParams.delete('scope');
    url.searchParams.set('language', mapLanguage);
    replaceState(url, route.state);
    lastUrl = url.pathname + url.search;
  }
  async function request(params: URLSearchParams, signal: AbortSignal) {
    if (showAllCountries) params.set('scope', 'all');
    else if (visitId) params.set('visit', visitId);
    const response = await fetch(`/api/visited/${country.id}?${params}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    return data as { clusters: PhotoCluster[]; photos: MapPhoto[]; total: number };
  }
  const rangeParams = (v: MapViewport) =>
    new URLSearchParams(Object.entries(v).map(([k, n]) => [k, String(n)]));
  async function refresh() {
    const current = map,
      seq = revision;
    if (!current) return;
    controller?.abort();
    const c = (controller = new AbortController());
    try {
      const [view, v] = await Promise.all([current.view(), current.viewport()]);
      if (!alive || seq !== revision || c.signal.aborted) return;
      lastView = view;
      remember(view);
      const data = await request(rangeParams(v), c.signal);
      if (seq !== revision || c.signal.aborted) return;
      await current.markers(data.clusters, (c) => void selectCluster(c, v));
      loading = false;
    } catch (e) {
      if (!c.signal.aborted && alive && seq === revision) {
        message = e instanceof Error ? e.message : '地图加载失败。';
        loading = false;
      }
    }
  }
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 160);
  }
  async function loadList(next = 1) {
    listController?.abort();
    const c = (listController = new AbortController());
    listLoading = true;
    const params = new URLSearchParams();
    params.set('page', String(next));
    try {
      const data = await request(params, c.signal);
      if (c.signal.aborted || !alive) return;
      photos = data.photos;
      total = data.total;
      listPage = next;
    } catch (e) {
      if (!c.signal.aborted) message = e instanceof Error ? e.message : '照片暂时无法加载。';
    } finally {
      if (!c.signal.aborted) listLoading = false;
    }
  }
  function photoHref(photo: MapPhoto) {
    return `/albums/${photo.albumSlug}/photos/${photo.id}?returnTo=${encodeURIComponent(lastUrl)}`;
  }
  function closeSelection(restoreFocus = true) {
    selectionController?.abort();
    selectedCluster = null;
    selectedPhotos = [];
    selectionError = '';
    if (restoreFocus && selectionTrigger?.isConnected) selectionTrigger.focus();
  }
  async function loadSelection(next = 1) {
    if (!selectedCluster || !clusterViewport) return;
    selectionController?.abort();
    const c = (selectionController = new AbortController());
    selectionLoading = true;
    selectionError = '';
    selectedPhotos = [];
    const params = rangeParams(clusterViewport);
    params.set('cluster', selectedCluster.id);
    params.set('page', String(next));
    try {
      const data = await request(params, c.signal);
      if (!alive || c.signal.aborted) return;
      selectedPhotos = data.photos;
      selectedTotal = data.total;
      selectedPage = next;
    } catch (e) {
      if (alive && !c.signal.aborted) selectionError = e instanceof Error ? e.message : '照片暂时无法加载。';
    } finally {
      if (!c.signal.aborted) selectionLoading = false;
    }
  }
  async function selectCluster(c: PhotoCluster, v: MapViewport) {
    if (c.count === 1) {
      void goto(photoHref(c.photo));
      return;
    }
    selectionTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    selectedCluster = c;
    selectedTotal = c.count;
    selectedPage = 1;
    clusterViewport = { ...v };
    void loadSelection();
    await tick();
    selectionClose?.focus({ preventScroll: true });
  }
  function changeScope(all: boolean) {
    showAllCountries = all;
    closeSelection(false);
    controller?.abort();
    photos = [];
    total = 0;
    if (lastView) remember(lastView);
    void refresh();
    void loadList();
  }
  let mapLanguage = $state<'en' | 'local'>('en');
  async function start(id: string) {
    const p = providers.find((p) => p.provider === id);
    if (!p) return;
    const seq = ++revision;
    controller?.abort();
    closeSelection(false);
    map?.destroy();
    map = undefined;
    provider = id;
    loading = true;
    message = '';
    const host = document.createElement('div');
    host.style.cssText = 'width:100%;height:100%';
    container.replaceChildren(host);
    try {
      const created = await createPhotoMap(
        host,
        p,
        lastView,
        changed,
        (m) => {
          if (alive && seq === revision) {
            message = m;
            loading = false;
          }
        },
        mapLanguage,
        photoHref,
      );
      if (!alive || seq !== revision) {
        created.destroy();
        return;
      }
      map = created;
      changed();
    } catch (e) {
      if (alive && seq === revision) {
        message = e instanceof Error ? e.message : '底图暂时无法加载。';
        loading = false;
      }
    }
  }
  onMount(() => {
    lastView = initialView();
    lastUrl = location.pathname + location.search;
    const q = new URLSearchParams(location.search);
    showAllCountries = q.get('scope') === 'all';
    mapLanguage = q.get('language') === 'local' ? 'local' : 'en';
    const p =
      providers.find((p) => p.provider === q.get('provider')) ??
      providers.find((p) => p.isDefault) ??
      providers[0];
    if (p) void start(p.provider);
    else {
      loading = false;
      message = '尚未配置可用底图。';
    }
    void loadList();
    return () => {
      alive = false;
      revision++;
      clearTimeout(timer);
      controller?.abort();
      listController?.abort();
      selectionController?.abort();
      map?.destroy();
    };
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && selectedCluster) {
      event.preventDefault();
      closeSelection();
    }
  }}
/>

<div class="heading">
  <div>
    <a href="/visited" class="back">← 世界足迹</a>
    <h1>{country.name}</h1>
    <p>{country.count} 张照片 · {country.visits.length} 段到访记录</p>
  </div>
  <div class="filters">
    <label
      >照片范围<select
        value={showAllCountries ? 'all' : 'country'}
        onchange={(e) => changeScope(e.currentTarget.value === 'all')}
        ><option value="country">当前国家</option><option value="all">所有国家</option></select
      ></label
    >
    <label
      >到访记录<select
        disabled={showAllCountries}
        title={showAllCountries ? '所有国家模式下不使用单国到访筛选' : undefined}
        value={showAllCountries ? '' : (visitId ?? '')}
        onchange={(e) => {
          location.href = `/visited/${country.id}${e.currentTarget.value ? `?visit=${encodeURIComponent(e.currentTarget.value)}` : ''}`;
        }}
        ><option value="">所有到访</option>{#each country.visits as v}<option value={v.id}
            >{v.label || (v.start ? `${v.start} — ${v.end}` : '日期待确认')} · {v.count} 张</option
          >{/each}</select
      ></label
    ><label
      >底图<select value={provider} onchange={(e) => void start(e.currentTarget.value)}
        >{#each providers as p}<option value={p.provider}>{names[p.provider]}</option>{/each}</select
      ></label
    >
    {#if provider === 'osm' && providers
        .find((p) => p.provider === provider)
        ?.tileUrl.split('?')[0]
        ?.endsWith('.json')}
      <label
        >地名<select bind:value={mapLanguage} onchange={() => void start(provider)}
          ><option value="en">英文优先</option><option value="local">当地语言</option></select
        ></label
      >
    {/if}
  </div>
</div>
<div class="map-wrap">
  <div class="map" bind:this={container}></div>
  {#if loading}<div class="loading" role="status">正在加载地图…</div>{/if}
  {#if selectedCluster}
    <section class="map-selection" aria-label="选中位置的照片" aria-busy={selectionLoading}>
      <header>
        <h2>此处的照片 <span>{selectedTotal}</span></h2>
        <button
          bind:this={selectionClose}
          class="selection-close"
          aria-label="关闭选片面板"
          onclick={() => closeSelection()}>×</button
        >
      </header>
      <div class="selection-scroll">
        {#if selectionLoading}<p role="status">正在读取照片…</p>
        {:else if selectionError}<p role="status">
            {selectionError} <button onclick={() => void loadSelection(selectedPage)}>重试</button>
          </p>
        {:else if !selectedPhotos.length}<p role="status">此处已没有可公开展示的照片，请重新选择地图标记。</p>
        {:else}<div class="selection-grid">
            {#each selectedPhotos as photo}<a
                href={photoHref(photo)}
                aria-label={`查看${photo.title}的详情${photo.albumTitle ? ` · ${photo.albumTitle}` : ''}`}
              >
                <img src={photo.thumbnail} alt={photo.title} loading="lazy" />
                {#if photo.title !== '照片'}<strong>{photo.title}</strong>{/if}
                <span
                  >{photo.albumTitle}{showAllCountries && photo.countryName
                    ? ` · ${photo.countryName}`
                    : ''}</span
                >
              </a>{/each}
          </div>{/if}
      </div>
      {#if selectedTotal > 48}<footer>
          <button
            disabled={selectionLoading || selectedPage === 1}
            onclick={() => void loadSelection(selectedPage - 1)}>上一页</button
          >
          <span>{selectedPage} / {Math.ceil(selectedTotal / 48)}</span>
          <button
            disabled={selectionLoading || selectedPage * 48 >= selectedTotal}
            onclick={() => void loadSelection(selectedPage + 1)}>下一页</button
          >
        </footer>{/if}
    </section>
  {/if}
</div>
{#if message}<p class="message" role="status">
    {message} <button onclick={() => void start(provider)}>重试</button>
  </p>{/if}
<div class="list-heading">
  <h2>{showAllCountries ? '所有国家的照片' : '这个国家的照片'} <span>{total}</span></h2>
</div>
{#if listLoading}<p role="status">正在读取照片…</p>{/if}
<div class="photos">
  {#each photos as photo}<a href={photoHref(photo)}
      ><img src={photo.thumbnail} alt={photo.title} loading="lazy" /><span>{photo.title}</span></a
    >{/each}
</div>
{#if total > 48}<div class="pagination">
    <button disabled={listLoading || listPage === 1} onclick={() => void loadList(listPage - 1)}
      >上一页</button
    ><span>{listPage} / {Math.ceil(total / 48)}</span><button
      disabled={listLoading || listPage * 48 >= total}
      onclick={() => void loadList(listPage + 1)}>下一页</button
    >
  </div>{/if}

<style>
  .map-selection {
    position: absolute;
    z-index: 3;
    top: 16px;
    right: 56px;
    width: min(350px, calc(100% - 76px));
    max-height: calc(100% - 64px);
    display: flex;
    flex-direction: column;
    background: #fffefa;
    border: 1px solid #dce1d7;
    border-radius: 8px;
    box-shadow: 0 6px 28px #18251c26;
    overflow: hidden;
  }
  .map-selection header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 10px 16px;
    gap: 12px;
  }
  .map-selection h2 {
    font-size: 14px;
    margin: 0;
  }
  .map-selection .selection-close {
    font-size: 23px;
    line-height: 1;
    border: 0;
    background: transparent;
    padding: 7px 10px;
  }
  .selection-scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    min-height: 0;
    padding: 0 14px 14px;
  }
  .selection-scroll p {
    font-size: 12px;
    line-height: 1.7;
  }
  .selection-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 10px;
  }
  .selection-grid a {
    text-decoration: none;
    color: #344d3d;
    min-width: 0;
  }
  .selection-grid img {
    width: 100%;
    aspect-ratio: 1.25;
    object-fit: cover;
    display: block;
    border-radius: 3px;
  }
  .selection-grid strong,
  .selection-grid span {
    display: block;
    font-size: 11px;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
  }
  .selection-grid span {
    color: #7b8578;
  }
  .map-selection footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    padding: 10px 14px;
    border-top: 1px solid #e7e9e2;
  }
  @media (max-width: 700px) {
    .map-selection {
      top: auto;
      bottom: 36px;
      left: 10px;
      right: 10px;
      width: auto;
      max-height: 58%;
    }
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
    margin: 28px 0 22px;
  }
  .back {
    font-size: 12px;
    color: #7b8578;
    text-decoration: none;
  }
  h1 {
    font-weight: 500;
    font-size: 25px;
    margin: 16px 0 8px;
  }
  .heading p {
    font-size: 12px;
    color: #7b8578;
  }
  .filters {
    display: flex;
    margin-left: auto;
    gap: 15px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 7px;
    color: #7b8578;
    font-size: 10px;
    letter-spacing: 1px;
  }
  select {
    max-width: 260px;
    padding: 10px;
    background: #fffef9;
    border: 1px solid #dce1d7;
    color: #344d3d;
    border-radius: 3px;
  }
  select:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .map-wrap {
    position: relative;
  }
  .map {
    height: 64dvh;
    min-height: 360px;
    background: #edf0e9;
    border-radius: 4px;
    overflow: hidden;
  }
  .loading {
    position: absolute;
    top: 12px;
    left: 12px;
    background: #fffdf7;
    padding: 10px 18px;
    font-size: 12px;
    border-radius: 3px;
    pointer-events: none;
  }
  .message {
    font-size: 12px;
    background: #f4eddb;
    padding: 12px;
  }
  .list-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 30px 0 18px;
  }
  h2 {
    font-size: 18px;
    font-weight: 500;
  }
  h2 span {
    font-size: 12px;
    color: #899380;
    margin-left: 8px;
  }
  button {
    border: 1px solid #d6dece;
    background: #fffdf7;
    padding: 8px 12px;
    color: #45603d;
    cursor: pointer;
    border-radius: 3px;
  }
  .photos {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 18px;
    margin-bottom: 30px;
  }
  .photos a {
    text-decoration: none;
    color: inherit;
    min-width: 0;
  }
  .photos img {
    width: 100%;
    aspect-ratio: 1.25;
    object-fit: cover;
    display: block;
    border-radius: 3px;
  }
  .photos span {
    font-size: 11px;
    display: block;
    margin-top: 8px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 20px;
  }
  .pagination span {
    font-size: 12px;
  }
  :global(.photo-map-pin) {
    position: relative;
    display: block;
    box-sizing: border-box;
    width: 55px;
    height: 56px;
    border: 3px solid white;
    border-radius: 7px;
    background: white;
    box-shadow: 0 2px 9px #0005;
    padding: 0;
    cursor: pointer;
  }
  :global(.photo-map-pin img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }
  :global(.photo-map-pin span) {
    position: absolute;
    right: -8px;
    top: -10px;
    background: #365441;
    color: white;
    border-radius: 12px;
    padding: 3px 6px;
    min-width: 14px;
    font: 11px system-ui;
    border: 2px solid white;
  }
  @media (max-width: 700px) {
    .heading {
      display: block;
    }
    .filters {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 20px;
      gap: 12px;
    }
    .filters label {
      min-width: 0;
    }
    select {
      max-width: 100%;
      width: 100%;
      font-size: 12px;
    }
    .map {
      height: 56dvh;
    }
    .photos {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
  }
</style>
