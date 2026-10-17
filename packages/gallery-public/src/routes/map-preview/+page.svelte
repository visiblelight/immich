<script lang="ts">
  import { onMount } from 'svelte';
  import { loadOsmStyle, MAP_FALLBACK_MESSAGE } from '$lib/visited/map-style';
  let container: HTMLDivElement;
  let message = $state('正在加载地图…');
  onMount(() => {
    let disposed = false, map: any;
    void (async () => {
      try {
        const params = new URLSearchParams(location.hash.slice(1));
        const latitude = Number(params.get('lat')), longitude = Number(params.get('lng'));
        if (!params.has('lat') || !params.has('lng') || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('坐标无效。');
        const moduleUrl = '/vendor/maplibre-6.9.0/maplibre-gl.mjs';
        const sdk = await import(/* @vite-ignore */ moduleUrl);
        const loaded = await loadOsmStyle('/vendor/osm-shortbread-v1/style.json', '© OpenStreetMap contributors', 'en', location.origin);
        if (disposed) return;
        let vector = loaded.vector;
        message = loaded.warning;
        map = new sdk.Map({ container, center: [longitude, latitude], zoom: 14, maxZoom: 19, style: loaded.style });
        new sdk.Marker({ color: '#36593e' }).setLngLat([longitude, latitude]).addTo(map);
        map.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-right');
        map.on('error', () => {
          if (vector) { vector = false; message = MAP_FALLBACK_MESSAGE; map.setStyle(loaded.fallback); }
          else message = '底图暂时不可用，请稍后重试或在外部地图中核对坐标。';
        });
      } catch { if (!disposed) message = '地图未能加载，请稍后重试或在外部地图中核对坐标。'; }
    })();
    return () => { disposed = true; map?.remove(); };
  });
</script>
<svelte:head>
  <title>坐标核对地图</title>
  <meta name="robots" content="noindex,nofollow" />
  <link rel="stylesheet" href="/vendor/maplibre-6.9.0/maplibre-gl.css" />
</svelte:head>
<div class="map" bind:this={container}></div>
{#if message}<p role="status">{message}</p>{/if}
<style>
  :global(body) { margin: 0; }
  .map { width: 100%; height: 100dvh; background: #eef1e9; }
  p { position: absolute; bottom: 26px; left: 12px; right: 12px; margin: 0; padding: 8px; background: #fffffff0; color: #36593e; font: 12px/1.5 sans-serif; pointer-events: none; }
</style>
