<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { tick } from 'svelte';
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
    tab = $state('dictionary');
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
      message = '地点资料已更新。';
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
      管理，位置改变后旧的人工归属自动失效。城市自动匹配由来源名称和邻近坐标共同核对，不代表行政边界测绘结果。
    </p>
    {#if message}<p role="status" class="notice" class:error={failed}>{message}</p>{/if}
    <nav class="tabs">
      <button class:chosen={tab === 'dictionary'} onclick={() => (tab = 'dictionary')}>地点词典</button
      ><button class:chosen={tab === 'photos'} onclick={() => (tab = 'photos')}
        >照片归属 · {data.photos.filter((p) => p.places.at(-1)?.kind !== 'city').length} 待核对</button
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
      <div class="photo-grid">
        {#each data.photos as photo}<article class="photo-review">
            <img
              src={`/media/source/${photo.asset_id}?variant=thumbnail`}
              alt={photo.filename}
              loading="lazy"
            />
            <div>
              <strong>{photo.filename}</strong>
              <p>
                {photo.places.map((p) => p.name).join(' / ') || '国家待核对'}{photo.manual_place
                  ? ' · 人工校正'
                  : ''}
              </p>
              <small>Immich：{[photo.state, photo.city].filter(Boolean).join(' / ') || '未填写地名'}</small>
              <form
                onsubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void save({
                    asset: photo.asset_id,
                    place: form.get('place'),
                    latitude: photo.latitude,
                    longitude: photo.longitude,
                    version: photo.version ?? '0',
                  });
                }}
              >
                <label
                  >校正到地点<select name="place" aria-label={`校正 ${photo.filename} 的地点`} required
                    ><option value="">选择确认过的地点</option>{#each photo.candidates as p}<option
                        value={p.id}>{p.name} · 距城镇中心约 {p.distance}km</option
                      >{/each}{#each data.places.filter((p) => p.country === photo.places[0]?.country && !photo.candidates.some((c) => c.id === p.id)) as p}<option
                        value={p.id}>{p.path}</option
                      >{/each}</select
                  ></label
                ><button disabled={busy}>确认归属</button>
              </form>
              <p>附近城镇只是候选；不确定时保留国家即可。需要其它地点可先在词典中搜索，再切回照片归属。</p>
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
          </article>{/each}
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
  .photo-grid {
    display: grid;
    gap: 20px;
    margin-top: 24px;
  }
  .photo-review {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 24px;
    padding: 20px;
    background: white;
    border: 1px solid #dce4d8;
    border-radius: 8px;
  }
  .photo-review img {
    width: 180px;
    max-height: 160px;
    object-fit: contain;
  }
  .photo-review form {
    display: flex;
    align-items: end;
    gap: 12px;
    margin-top: 16px;
  }
  .photo-review label {
    flex: 1;
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
