<script lang="ts">
  import { onMount } from 'svelte';
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
    cluster = $state<string | null>(null),
    listLoading = $state(false);
  let controller: AbortController | undefined,
    listController: AbortController | undefined,
    revision = 0,
    alive = true,
    viewport: MapViewport | undefined,
    clusterViewport: MapViewport | undefined,
    lastView: View;
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
    replaceState(url, route.state);
    lastUrl = url.pathname + url.search;
  }
  async function request(params: URLSearchParams, signal: AbortSignal) {
    if (visitId) params.set('visit', visitId);
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
      viewport = v;
      remember(view);
      const data = await request(rangeParams(v), c.signal);
      if (seq !== revision || c.signal.aborted) return;
      await current.markers(data.clusters, selectCluster);
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
  async function loadList(next = 1, selected: string | null = null, v?: MapViewport) {
    listController?.abort();
    const c = (listController = new AbortController());
    listLoading = true;
    cluster = selected;
    clusterViewport = v;
    const params = selected && v ? rangeParams(v) : new URLSearchParams();
    if (selected) params.set('cluster', selected);
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
  function selectCluster(c: PhotoCluster) {
    if (c.count === 1) {
      void goto(`/albums/${c.photo.albumSlug}/photos/${c.photo.id}?returnTo=${encodeURIComponent(lastUrl)}`);
      return;
    }
    void loadList(1, c.id, viewport);
    if (c.count > 1 && lastView.zoom < 16)
      void map?.move({ longitude: c.longitude, latitude: c.latitude, zoom: Math.min(18, lastView.zoom + 2) });
  }
  async function start(id: string) {
    const p = providers.find((p) => p.provider === id);
    if (!p) return;
    const seq = ++revision;
    controller?.abort();
    map?.destroy();
    map = undefined;
    provider = id;
    loading = true;
    message = '';
    const host = document.createElement('div');
    host.style.cssText = 'width:100%;height:100%';
    container.replaceChildren(host);
    try {
      const created = await createPhotoMap(host, p, lastView, changed, (m) => {
        if (alive && seq === revision) {
          message = m;
          loading = false;
        }
      });
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
      map?.destroy();
    };
  });
</script>

<div class="heading">
  <div>
    <a href="/visited" class="back">← 世界足迹</a>
    <h1>{country.name}</h1>
    <p>{country.count} 张照片 · {country.visits.length} 段到访记录</p>
  </div>
  <div class="filters">
    <label
      >到访记录<select
        value={visitId ?? ''}
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
  </div>
</div>
<div class="map-wrap">
  <div class="map" bind:this={container}></div>
  {#if loading}<div class="loading" role="status">正在加载地图…</div>{/if}
</div>
{#if message}<p class="message" role="status">
    {message} <button onclick={() => void start(provider)}>重试</button>
  </p>{/if}
<div class="list-heading">
  <h2>{cluster ? '选中位置的照片' : '这个国家的照片'} <span>{total}</span></h2>
  {#if cluster}<button onclick={() => void loadList()}>查看全部照片</button>{/if}
</div>
{#if listLoading}<p role="status">正在读取照片…</p>{/if}
<div class="photos">
  {#each photos as photo}<a
      href={`/albums/${photo.albumSlug}/photos/${photo.id}?returnTo=${encodeURIComponent(lastUrl)}`}
      ><img src={photo.thumbnail} alt={photo.title} loading="lazy" /><span>{photo.title}</span></a
    >{/each}
</div>
{#if total > 48}<div class="pagination">
    <button
      disabled={listLoading || listPage === 1}
      onclick={() => void loadList(listPage - 1, cluster, clusterViewport)}>上一页</button
    ><span>{listPage} / {Math.ceil(total / 48)}</span><button
      disabled={listLoading || listPage * 48 >= total}
      onclick={() => void loadList(listPage + 1, cluster, clusterViewport)}>下一页</button
    >
  </div>{/if}

<style>
  .heading {
    display: flex;
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
      margin-top: 20px;
      gap: 9px;
    }
    .filters label:first-child {
      flex: 1;
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
