<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { tick, untrack } from 'svelte';
  let dialog: HTMLDialogElement;
  async function edit(p: (typeof data.places)[number]) {
    message = '';
    editing = { ...p };
    aliases = p.customAliases.join('\n');
    targets = [];
    targetSearch = '';
    await tick();
    dialog.showModal();
  }
  import MapAdminFrame from '$lib/MapAdminFrame.svelte';
  let { data } = $props();
  let busy = $state(false),
    message = $state(''),
    failed = $state(false),
    tab = $state(untrack(() => data.view));
  type ReviewFilter = 'country' | 'region' | 'city' | 'restricted' | 'all';
  let reviewFilter = $state<ReviewFilter>(untrack(() =>
    ['country', 'region', 'city', 'restricted', 'all'].includes(data.review) ? data.review as ReviewFilter :
    data.photos.some(p => p.reviewCategory === 'country') ? 'country'
      : data.photos.some(p => p.reviewCategory === 'region') ? 'region' : 'city'));
  const reviewLabels: Record<ReviewFilter, string> = {
    country: '国家未识别', region: '省级地区待核对', city: '城镇待完善',
    restricted: '受公开设置限制', all: '全部',
  };
  let photoQuery = $state('');
  let selected = $state<string[]>([]), mapAsset = $state('');
  let placeQuery = $state(''), placeSearchAsset = $state('');
  let placeResults = $state<typeof data.places>([]), placeSearching = $state(false);
  let placeRequest = 0;
  const pending = $derived(data.photos.filter(p => p.needsReview));
  const countryPending = $derived(pending.filter(p => p.reviewCategory === 'country'));
  const regionPending = $derived(pending.filter(p => p.reviewCategory === 'region'));
  const cityPending = $derived(pending.filter(p => p.reviewCategory === 'city'));
  const restricted = $derived(data.photos.filter(p => p.privacyRestricted));
  const inReviewFilter = (p: (typeof data.photos)[number]) => reviewFilter === 'all' || (reviewFilter === 'restricted' ? p.privacyRestricted : p.reviewCategory === reviewFilter);
  const visiblePhotos = $derived(data.photos.filter(p => inReviewFilter(p) &&
    [p.filename, p.city, p.state, p.regionName, ...p.places.map(v => v.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(photoQuery.trim().toLocaleLowerCase())));
  const selectedPhotos = $derived(data.photos.filter(p => selected.includes(p.asset_id)));
  const samePosition = (a: (typeof data.photos)[number], b: (typeof data.photos)[number]) => a.latitude === b.latitude && a.longitude === b.longitude;
  async function searchPhotoPlaces(asset: string) {
    const request = ++placeRequest;
    placeSearchAsset = asset;
    placeResults = [];
    placeSearching = true;
    try {
      const response = await fetch('/api/places?q=' + encodeURIComponent(placeQuery));
      if (!response.ok) throw new Error('地点搜索失败，请重试。');
      const result = await response.json();
      if (request === placeRequest) placeResults = result.places;
    } catch (e) { if (request === placeRequest) { message = (e as Error).message; failed = true; } }
    finally { if (request === placeRequest) placeSearching = false; }
  }
  function selection(photo: (typeof data.photos)[number]) {
    return selected.includes(photo.asset_id) ? selectedPhotos : [photo];
  }
  function reviewMap(photo: (typeof data.photos)[number]) {
    const lat = photo.latitude!, lng = photo.longitude!;
    return data.publicOrigin + '/map-preview#lat=' + lat + '&lng=' + lng;
  }
  let editing = $state<(typeof data.places)[number] | null>(null),
    aliases = $state('');
  let targetSearch = $state(''),
    targets = $state<typeof data.places>([]);
  let targetTimer: ReturnType<typeof setTimeout>;
  import { onDestroy } from 'svelte';
  onDestroy(() => clearTimeout(targetTimer));
  let searchGeneration = 0;
  function findTarget() {
    clearTimeout(targetTimer);
    const generation = ++searchGeneration;
    targetTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/places?q=' + encodeURIComponent(targetSearch));
        if (r.ok) {
          const result = await r.json();
          if (generation === searchGeneration) targets = result.places;
        }
      } catch {
        message = '地点检索失败，请重试。';
      }
    }, 250);
  }
  async function save(input: Record<string, unknown>) {
    busy = true;
    message = '';
    failed = false;
    try {
      const r = await fetch('/api/place-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message);
      await invalidateAll();
      dialog?.close();
      editing = null;
      selected = [];
      message = '地点资料已更新，前台归属已同步生效。';
    } catch (e) {
      failed = true;
      message = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>地点管理 · Gallery</title></svelte:head>
<MapAdminFrame active="places" user={data.user} publicOrigin={data.publicOrigin}>
  <section class="map-admin places-admin">
    <h1>地点管理</h1>
    <p>
      统一中文名称、英文名称与别名。GPS 由 Immich
      管理，位置改变后旧的人工归属自动失效。省级地区由边界数据判断，城镇由来源地名和邻近坐标共同核对。人工归属与边界判断冲突时会提示重新核对。
    </p>
    {#if message}<p role="status" class="notice" class:error={failed}>{message}</p>{/if}
    <nav class="tabs">
      <button class:chosen={tab === 'dictionary'} onclick={() => (tab = 'dictionary')}>地点词典</button
      ><button class:chosen={tab === 'photos'} onclick={() => (tab = 'photos')}
        >照片归属 · {pending.length} 待核对</button
      >
    </nav>
    {#if tab === 'dictionary'}
      <form class="search" method="GET">
        <input name="q" aria-label="搜索地点词典" placeholder="搜索中文、英文或别名" value={data.q} /><button
          >搜索词典</button
        ><a href="/places">已使用地点</a>
      </form>
      <p>{data.q ? '最多显示 60 个匹配地点。' : '显示照片已使用及人工维护的地点；可搜索完整词典。'}</p>
      <div class="dictionary">
        {#each data.places as p}<article>
            <div>
              <strong>{p.name}</strong>
              <p>{p.path} · {p.english}</p>
              {#if p.canonicalId}<small>已合并到同一地点</small>{/if}
            </div>
            <button onclick={() => edit(p)}>编辑</button>
          </article>{/each}
      </div>
    {:else}
      <div class="review-toolbar">
        <div class="tabs" aria-label="照片归属筛选">
          <button class:chosen={reviewFilter === 'country'} aria-pressed={reviewFilter === 'country'} onclick={() => { reviewFilter = 'country'; selected = []; }}>国家未识别 {countryPending.length}</button>
          <button class:chosen={reviewFilter === 'region'} aria-pressed={reviewFilter === 'region'} onclick={() => { reviewFilter = 'region'; selected = []; }}>省级地区待核对 {regionPending.length}</button>
          <button class:chosen={reviewFilter === 'city'} aria-pressed={reviewFilter === 'city'} onclick={() => { reviewFilter = 'city'; selected = []; }}>城镇待完善 {cityPending.length}</button>
          <button class:chosen={reviewFilter === 'restricted'} aria-pressed={reviewFilter === 'restricted'} onclick={() => { reviewFilter = 'restricted'; selected = []; }}>受公开设置限制 {restricted.length}</button>
          <button class:chosen={reviewFilter === 'all'} aria-pressed={reviewFilter === 'all'} onclick={() => { reviewFilter = 'all'; selected = []; }}>全部 {data.photos.length}</button>
        </div>
        <input aria-label="搜索归属照片" placeholder="搜索文件名或地点" bind:value={photoQuery} />
      </div>
      <p>当前显示 {visiblePhotos.length} 张{reviewFilter === 'all' ? '有 GPS 的照片' : `${reviewLabels[reviewFilter]}的照片`}。可以直接确认国家或省级地区；相同坐标的照片可一起确认。</p>
      {#if reviewFilter === 'country'}<p class="country-warning">请优先确认这些照片的国家归属。候选国家尚未生效，需要你手动确认。</p>
      {:else if reviewFilter === 'region'}<p class="field-hint">这些照片的中国省级归属尚不可靠，或人工归属与边界判断冲突。可直接选择省级地区，无需先选择城镇。</p>
      {:else if reviewFilter === 'city'}<p class="field-hint">这些照片仅城镇名称待完善，不影响已确认的国家和省级地区统计。</p>
      {:else if reviewFilter === 'restricted'}<p class="field-hint">这些照片的省级位置受当前公开设置限制。此处可维护归属，但不会额外公开省份；需要在相册或照片中调整位置公开方式并发布。此分类与归属待核对分别统计。</p>{/if}
      {#if selected.length}<p role="status">已选择 {selected.length} 张同坐标照片；在其中任意一张选择地点并确认，即可一并保存。<button onclick={() => selected = []}>取消选择</button></p>{/if}
      <div class="place-photo-list">
        {#each visiblePhotos as photo (photo.asset_id)}<article class="photo-review">
            <img
              src={`/media/source/${photo.asset_id}?variant=thumbnail`}
              alt={photo.filename}
              loading="lazy"
            />
            <div>
              <label class="review-select"><input type="checkbox" checked={selected.includes(photo.asset_id)}
                disabled={busy || (!!selectedPhotos[0] && !samePosition(photo, selectedPhotos[0]))}
                onchange={(e) => selected = e.currentTarget.checked ? [...selected, photo.asset_id] : selected.filter(id => id !== photo.asset_id)} />
                <strong>{photo.filename}</strong></label>
              <p class="review-status" class:pending={photo.needsReview} class:country-missing={photo.reviewCategory === 'country'}>{#if photo.reviewCategory === 'country'}<strong>国家未识别 · 需人工确认</strong>{:else if photo.reviewCategory === 'region'}<strong>{photo.regionConflict ? '省级归属冲突 · 需重新核对' : '省级地区待核对'}</strong>{:else if photo.reviewCategory === 'city'}<strong>城镇待完善</strong>{/if}{photo.reviewReason}</p>
              {#if photo.privacyRestricted}<p class="privacy-note">受位置公开设置限制：当前不会用于省级地图。</p>{/if}
              {#if data.photos.filter(p => samePosition(p, photo) && inReviewFilter(p)).length > 1}
                <button class="text-button" disabled={busy} onclick={() => selected = data.photos.filter(p => samePosition(p, photo) && inReviewFilter(p)).map(p => p.asset_id)}>选择此坐标的 {data.photos.filter(p => samePosition(p, photo) && inReviewFilter(p)).length} 张照片</button>
              {/if}
              <p>
                {photo.places.map((p) => p.name).join(' / ') || '国家待核对'}{photo.manualConfirmed
                  ? ' · 人工校正'
                  : ''}
              </p>
              <small>Immich：{[photo.state, photo.city].filter(Boolean).join(' / ') || '未填写地名'}</small>
              <p class="coordinates">GPS：{photo.latitude?.toFixed(6)}, {photo.longitude?.toFixed(6)}
                <button class="text-button" aria-expanded={mapAsset === photo.asset_id} onclick={() => mapAsset = mapAsset === photo.asset_id ? '' : photo.asset_id}>查看坐标地图</button>
              </p>
              {#if mapAsset === photo.asset_id}
                <iframe title={`${photo.filename} 的拍摄坐标地图`} src={reviewMap(photo)} class="review-map" referrerpolicy="no-referrer"></iframe>
                <p><a href={`https://www.openstreetmap.org/?mlat=${photo.latitude}&mlon=${photo.longitude}#map=15/${photo.latitude}/${photo.longitude}`} target="_blank" rel="noreferrer">在 OpenStreetMap 打开地图</a> · 地图仅用于核对 GPS，候选地名不会改动坐标。</p>
              {/if}
              <form class="place-search" onsubmit={(e) => { e.preventDefault(); void searchPhotoPlaces(photo.asset_id); }}>
                <input aria-label={`搜索 ${photo.filename} 的归属地点`} placeholder="搜索其它地点（中文、英文或别名）" maxlength="120"
                  value={placeSearchAsset === photo.asset_id ? placeQuery : ''} oninput={(e) => { placeSearchAsset = photo.asset_id; placeQuery = e.currentTarget.value; placeResults = []; ++placeRequest; placeSearching = false; }} />
                <button disabled={busy || (placeSearchAsset === photo.asset_id && placeSearching)}>搜索地点</button>
              </form>
              <form
                onsubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void save({
                    assets: selection(photo).map(p => ({ asset: p.asset_id, latitude: p.latitude, longitude: p.longitude, version: p.version ?? '0' })),
                    place: form.get('place'),
                  });
                }}
              >
                <label
                  >校正到地点<select name="place" aria-label={`校正 ${photo.filename} 的地点`} required
                    ><option value="">选择确认过的地点</option>{#if photo.country}<option value={`country:${photo.country}`}>{photo.countryName}（只确认国家）</option>{/if}{#if photo.regionCandidates.length}<optgroup label="省级地区（无需选择城镇）">{#each photo.regionCandidates as p}<option value={p.id}>{p.name}（只确认省级地区）</option>{/each}</optgroup>{/if}{#each photo.candidates as p}<option
                        value={p.id}>{p.name} · {p.corroborated ? '来源地名吻合 · 待确认 · ' : ''}距城镇中心约 {p.distance}km</option
                      >{/each}{#each [...new Map([...data.places, ...(placeSearchAsset === photo.asset_id ? placeResults : [])].map(p => [p.id,p])).values()].filter((p) => p.country === photo.country && p.kind !== 'country' && !photo.candidates.some((c) => c.id === p.id) && !photo.regionCandidates.some((c) => c.id === p.id)) as p}<option
                        value={p.id}>{p.path}</option
                      >{/each}</select
                  ></label
                ><button disabled={busy || !photo.country}>确认{selection(photo).length > 1 ? ` ${selection(photo).length} 张照片` : ''}归属</button>
              </form>
              <p>{photo.country ? '候选地名需你核对；可以只确认国家或省级地区。确认立即生效，公开范围仍遵循照片的位置设置。' : '暂未找到可靠国家候选，请先在 Immich 核对 GPS；系统不会强行归给最近国家。'}</p>
              {#if placeSearchAsset === photo.asset_id && placeQuery && !placeSearching && !placeResults.some(p => p.country === photo.country)}<p>没有可用的搜索结果，请使用候选或更换关键词。</p>{/if}
              {#if photo.manual_place}<button
                  disabled={busy}
                  onclick={() =>
                    save({
                      asset: photo.asset_id,
                      clear: true,
                      latitude: photo.latitude,
                      longitude: photo.longitude,
                      version: photo.version ?? '0',
                    })}>恢复自动判断</button
                >{/if}
            </div>
          </article>{:else}<p>{photoQuery ? '没有符合搜索条件的照片。' : reviewFilter === 'all' ? '暂无带 GPS 的照片。' : `没有${reviewLabels[reviewFilter]}的照片。`}</p>{/each}
      </div>
    {/if}
    <dialog bind:this={dialog} aria-label="编辑地点" class="place-editor" onclose={() => (editing = null)}>
      {#if editing}
        <h2>{editing.name}</h2>
        <p>{editing.path}</p>
        {#if failed && message}<p role="alert" class="notice error">{message}</p>{/if}
        <form
          onsubmit={(e) => {
            e.preventDefault();
            if (editing)
              void save({
                id: editing.sourceId,
                version: editing.version,
                nameZh: editing.nameZh,
                nameEn: editing.nameEn,
                canonicalId: editing.canonicalId,
                aliases: aliases
                  .split('\n')
                  .map((v) => v.trim())
                  .filter(Boolean),
              });
          }}
        >
          <p class="field-hint">留空沿用内置词典；填写后对所有相关照片统一生效。</p>
          <label
            >中文名称<input bind:value={editing.nameZh} placeholder={editing.name} maxlength="120" /></label
          ><label
            >英文名称<input
              bind:value={editing.nameEn}
              placeholder={editing.english}
              maxlength="120"
            /></label
          ><label>其它名称（每行一个）<textarea bind:value={aliases} rows="4"></textarea></label>
          <details>
            <summary>合并重复地点</summary>
            <p>仅允许合并同国家、同级的地点。照片与筛选统一使用目标地点；清除合并后恢复原地点。</p>
            <input
              placeholder="搜索合并目标"
              aria-label="搜索合并目标"
              bind:value={targetSearch}
              oninput={findTarget}
            /><select aria-label="合并到" bind:value={editing.canonicalId}
              ><option value="">保留为独立地点</option
              >{#if editing.canonicalId && !targets.some((t) => t.id === editing!.canonicalId)}<option
                  value={editing.canonicalId}>当前合并目标</option
                >{/if}{#each targets.filter((p) => p.kind === editing!.kind && p.country === editing!.country && p.id !== editing!.sourceId) as p}<option
                  value={p.id}>{p.path}</option
                >{/each}</select
            >
          </details>
          <div class="actions">
            <button disabled={busy}>保存并应用</button><button
              type="button"
              disabled={busy}
              onclick={() => dialog.close()}>取消</button
            >
          </div>
        </form>
      {/if}
    </dialog>
    <p class="attribution">
      地点数据：<a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · CC BY 4.0；国家边界沿用地图数据。城市名称可人工校正。
    </p>
  </section>
</MapAdminFrame>

<style>
  .review-toolbar { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  .review-toolbar .tabs { margin: 0; }
  .review-toolbar input { width: min(320px, 100%); }
  .review-select { display: flex; align-items: center; gap: 10px; }
  .review-status { font-size: 13px; }
  .photo-review .privacy-note { font-size: 12px; color: #68776f; background: #eff3ed; padding: 8px 10px; border-radius: 4px; }
  .country-warning, .review-status.country-missing { color: #9b422f; }
  .review-status strong { margin-bottom: 4px; }
  .review-status.pending:not(.country-missing) { color: #956025; }
  .photo-review .text-button { background: transparent; color: #36593e; padding: 4px 0; font-size: 13px; }
  .review-map { display: block; width: 100%; height: 260px; border: 1px solid #dce4d8; border-radius: 6px; }
  .photo-review .place-search input { flex: 1; min-width: 180px; }
  .places-admin {
    max-width: 1120px;
  }
  .tabs,
  .search,
  .actions {
    display: flex;
    gap: 12px;
    align-items: center;
    margin: 24px 0;
    flex-wrap: wrap;
  }
  .tabs button:not(.chosen) {
    background: #eaf0e5;
    color: #52684c;
  }
  .tabs button.chosen,
  .tabs button.chosen:hover {
    background: #36593e;
    color: white;
  }
  .search input {
    min-width: 180px;
    width: min(360px, 100%);
  }
  .field-hint {
    margin: 0;
    color: #73806b;
    font-size: 13px;
  }
  a {
    color: inherit;
  }
  .dictionary article {
    display: flex;
    gap: 24px;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #dce4d8;
    padding: 18px 0;
  }
  .dictionary p {
    margin: 8px 0;
  }
  .place-photo-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    margin-top: 24px;
  }
  .photo-review {
    min-width: 0;
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 24px;
    padding: 20px;
    background: white;
    border: 1px solid #dce4d8;
    border-radius: 8px;
  }
  .photo-review img {
    display: block;
    width: 180px;
    max-height: 160px;
    object-fit: contain;
  }
  .photo-review form {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-top: 16px;
    flex-wrap: wrap;
  }
  .photo-review > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .photo-review strong {
    display: block;
  }
  .photo-review button {
    white-space: nowrap;
  }
  .photo-review label {
    flex: 1 1 240px;
    min-width: 0;
  }
  .photo-review select {
    width: 100%;
  }
  label {
    display: grid;
    gap: 8px;
  }
  .place-editor::backdrop {
    background: #1d271e66;
  }
  .place-editor {
    border: 1px solid #d5ded1;
    box-sizing: border-box;
    width: min(560px, calc(100vw - 40px));
    max-height: 85dvh;
    overflow: auto;
    background: #f9fbf7;
    padding: 28px;
    border-radius: 12px;
    box-shadow: 0 15px 60px #14231030;
  }
  .place-editor form {
    display: grid;
    gap: 16px;
  }
  textarea {
    font: inherit;
    padding: 10px;
    border: 1px solid #d5ded1;
    border-radius: 4px;
  }
  .place-editor select {
    width: 100%;
    margin-top: 12px;
  }
  .attribution {
    margin-top: 40px;
  }
  @media (max-width: 700px) {
    .photo-review {
      grid-template-columns: 1fr;
    }
    .photo-review img {
      width: 100%;
      max-height: 230px;
    }
    .photo-review form {
      flex-wrap: wrap;
    }
    .place-editor {
      padding: 20px;
    }
  }
</style>
