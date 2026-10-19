<script lang="ts">
  import Frame from '$lib/visited/Frame.svelte';
  import Country from '$lib/visited/Country.svelte';
  import RegionMap from '$lib/visited/RegionMap.svelte';
  import VisitedHeading from '$lib/visited/VisitedHeading.svelte';
  let { data } = $props();
</script>

<svelte:head><title>{data.detail?.region.name ?? '中国'} · 去过 · {data.site.name}</title></svelte:head>
<Frame site={data.site} name={data.site.name}>
  {#if data.regional}
    <VisitedHeading scope="CN" count={data.regional.regions.length} total={data.regional.total} regionTotal={34} />
    <div class="region-context">
      <p>根据已公开照片的拍摄位置整理。
        {#if data.regional.restricted}{data.regional.restricted} 张照片仅公开到国家级。{/if}
        {#if data.regional.unassigned}{data.regional.unassigned} 张照片的省级地区待核对。{/if}
      </p>
      {#if data.regional.nationalCount}<a href="/visited/CN">查看全国照片地图</a>{/if}
    </div>
    <RegionMap summaries={data.regional.regions} />
  {:else if data.detail && data.maps}
    {#key `${data.detail.region.id}:${data.detail.visitId}:${data.initialScope}`}
      <Country country={data.detail.region} regionCountry={data.detail.countryCode}
        bounds={data.detail.bounds} providers={data.maps.providers} visitId={data.detail.visitId} initialScope={data.initialScope} />
    {/key}
  {/if}
</Frame>

<style>
  .region-context { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:8px 24px; margin:-8px 0 18px; font-size:12px; color:#7b8578; line-height:1.7; }
  p { margin:0; }
  a { color:#526d58; text-decoration:none; }
  a:hover { color:#304b36; }
</style>
