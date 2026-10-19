<script lang="ts">
  import Frame from '$lib/MapAdminFrame.svelte';
  import { SegmentedControl, SearchField } from '@gallery/ui';
  import { goto, invalidateAll } from '$app/navigation';
  import { tick } from 'svelte';
  let { data } = $props();
  type RecordItem = (typeof data.visits.records)[number];
  type Detail = {
    records: { id: string; start: string | null; end: string | null; label: string;
      manual: boolean; version: number; photoIds: string[] }[];
    photos: { id: string; thumbnail: string; date: string | null }[];
  };
  const records = $derived(data.visits.records);
  const scopeKey = $derived([data.scope, data.country, data.region, data.q, data.status, data.visits.page].join(':'));
  let selected = $state<string[]>([]), editing = $state(false), readonly = $state(false),
    id = $state<string | null>(null), version = $state(0),
    replace = $state<{ id: string; version: number }[]>([]), photoIds = $state<string[]>([]),
    start = $state(''), end = $state(''), label = $state(''), photoPage = $state(1),
    message = $state(''), busy = $state(false), failed = $state(false), loading = $state(false),
    detailError = $state(''), editorPhotos = $state<Detail['photos']>([]),
    editorRows = $state<RecordItem[]>([]), search = $state('');
  let detailController: AbortController | undefined;
  let editDialog = $state<HTMLDivElement>();
  const editorPlace = $derived(editorRows[0]);
  const selectedRecords = $derived(records.filter((v) => selected.includes(v.id)));
  const selectedPlace = $derived(selectedRecords[0]?.place);
  const visiblePhotos = $derived(readonly ? editorPhotos.filter((p) => photoIds.includes(p.id)) : editorPhotos);
  $effect(() => {
    void scopeKey;
    selected = [];
    search = data.q;
    editing = false;
    detailController?.abort();
    loading = false;
    return () => detailController?.abort();
  });
  function visitLink(v: RecordItem) {
    return `${data.publicOrigin}/visited/${v.region ? `regions/${v.region}` : v.country}?visit=${encodeURIComponent(v.id)}`;
  }
  function listLink(changes: Record<string, string>) {
    const params = new URLSearchParams({ scope: data.scope, q: data.q, status: data.status });
    if (data.scope === 'region') params.set('region', data.region);
    else params.set('country', data.country);
    for (const [key, value] of Object.entries(changes)) params.set(key, value);
    return `/visits?${params}`;
  }
  function filter(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) if (typeof value === 'string' && value) params.set(key, value);
    void goto(`/visits?${params}`, { keepFocus: true, noScroll: true });
  }
  function closeDialog() {
    if (busy) return;
    detailController?.abort();
    editing = false;
    loading = false;
  }
  async function editPhotos() {
    readonly = false;
    photoPage = 1;
    await tick();
    editDialog?.querySelector<HTMLInputElement>('input')?.focus();
  }
  function focusDialog(node: HTMLElement) {
    const prior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = [
        ...node.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]',
        ),
      ];
      const first = list[0],
        last = list.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    node.addEventListener('keydown', trap);
    return {
      destroy() {
        node.removeEventListener('keydown', trap);
        document.body.style.overflow = overflow;
        prior?.focus();
      },
    };
  }
  async function open(rows: RecordItem[], viewOnly = false) {
    if (!rows.length || rows.some((r) => r.invalid || r.place !== rows[0]!.place)) return;
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    editorRows = rows;
    readonly = viewOnly;
    editing = true;
    loading = true;
    detailError = '';
    message = '';
    editorPhotos = [];
    const first = rows[0]!;
    try {
      const params = new URLSearchParams({ country: first.country });
      if (first.region) params.set('region', first.region);
      const response = await fetch(`/api/visits?${params}`, { signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? '照片加载失败。');
      if (controller.signal.aborted) return;
      const detail = result as Detail;
      const current = detail.records.filter((v) => rows.some((r) => r.id === v.id));
      if (current.length !== rows.length || current.some((v) => v.version !== rows.find((r) => r.id === v.id)!.version))
        throw new Error('到访记录已变化，请关闭窗口并刷新列表。');
      id = current.length === 1 && current[0]!.manual ? current[0]!.id : null;
      version = current[0]?.version ?? 0;
      replace = id ? [] : current.filter((v) => v.manual).map((v) => ({ id: v.id, version: v.version }));
      photoIds = [...new Set(current.flatMap((v) => v.photoIds))];
      const dates = current.flatMap((v) => [v.start, v.end]).filter((d): d is string => !!d).sort();
      start = dates[0] ?? '';
      end = dates.at(-1) ?? '';
      label = current.length === 1 ? current[0]!.label : '';
      editorPhotos = detail.photos;
      photoPage = 1;
    } catch (error) {
      if (!controller.signal.aborted) detailError = error instanceof Error ? error.message : '照片加载失败，请重试。';
    } finally {
      if (!controller.signal.aborted) loading = false;
    }
  }
  async function post(action: string, payload: unknown) {
    const response = await fetch(`/api/${action}`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    return result;
  }
  async function save() {
    if (!editorPlace || readonly || loading || detailError) return;
    busy = true;
    try {
      await post('visit-save', { country: editorPlace.country, region: editorPlace.region || undefined,
        id, version, replace, photoIds, start, end, label });
      editing = false;
      selected = [];
      await invalidateAll();
      message = '到访记录已应用到前台。';
      failed = false;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '保存失败。';
    } finally { busy = false; }
  }
  async function reset(record: RecordItem) {
    busy = true;
    try {
      await post('visit-delete', { id: record.id, version: record.version, region: record.region || undefined });
      selected = [];
      await invalidateAll();
      message = record.invalid ? '已移除失效的人工校正。' : '已移除人工校正，按照当前公开照片重新整理。';
      failed = false;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '操作失败。';
    } finally { busy = false; }
  }
</script>

<svelte:head><title>到访记录 · Gallery 管理</title></svelte:head>
<Frame active="visits" user={data.user} publicOrigin={data.publicOrigin}>
  <div class="map-admin visits-page">
    <h1>到访记录</h1>
    <p>按公开照片的位置和当地拍摄日期整理到访，可调整名称、日期、合并或拆分记录。</p>
    <div class="scope-control"><SegmentedControl label="到访整理范围" value={data.scope} options={[
      { value: 'country', label: '国家到访', href: '/visits' },
      { value: 'region', label: '中国省级到访', href: '/visits?scope=region' },
    ]} /></div>
    <form class="toolbar" method="GET" action="/visits" onsubmit={filter}>
      <input type="hidden" name="scope" value={data.scope} />
      <div class="search-box"><SearchField name="q" bind:value={search} label="搜索到访记录" placeholder="搜索地点、到访名称" maxlength={200} /></div>
      <label class="filter-field">{data.scope === 'region' ? '省级地区' : '国家'}
        <select name={data.scope === 'region' ? 'region' : 'country'} value={data.scope === 'region' ? data.region : data.country}
          onchange={(e) => e.currentTarget.form?.requestSubmit()}>
          <option value="">{data.scope === 'region' ? '全部省级地区' : '全部国家'}</option>
          {#each data.visits.places as place}<option value={place.id}>{place.name} · {place.count} 段</option>{/each}
        </select>
      </label>
      <label class="filter-field">状态<select name="status" value={data.status} onchange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">全部状态</option><option value="auto">自动整理</option><option value="manual">人工整理</option>
        <option value="review">待核对</option><option value="invalid">已失效</option>
      </select></label>
      <button class="filter-submit">搜索</button>
      {#if data.q || data.country && data.scope === 'country' || data.region || data.status}<a class="text-link" href={data.scope === 'region' ? '/visits?scope=region' : '/visits'}>清除筛选</a>{/if}
    </form>
    <div class="list-summary">
      <p>共 <strong>{data.visits.activeTotal}</strong> 段到访 · {data.visits.placeCount} 个{data.scope === 'region' ? '省级地区' : '国家'}{#if data.q || data.status || data.region || data.scope === 'country' && data.country} · 当前筛选 {data.visits.total} 条{/if}</p>
      {#if data.visits.invalidTotal}<a class="text-link" href={listLink({ status: 'invalid', page: '1', q: '', country: '', region: '' })}>{data.visits.invalidTotal} 条失效校正</a>{/if}
    </div>
    {#if data.scope === 'region'}<p class="scope-note">省级到访独立整理，不影响国家到访记录。</p>{/if}
    {#if data.scope === 'region' && (data.visits.unassignedProvince || data.visits.restricted)}<p class="notice">
      {#if data.visits.unassignedProvince}{data.visits.unassignedProvince} 张照片省级归属待核对。{/if}
      {#if data.visits.restricted}{data.visits.restricted} 张照片受位置公开设置限制。{/if}
      <a href={data.visits.unassignedProvince ? '/places?view=photos&review=region' : '/places?view=photos&review=restricted'}>前往地点管理</a>
    </p>{/if}
    {#if data.scope === 'country' && data.visits.unassigned}<p class="notice">{data.visits.unassigned} 张公开位置照片未能可靠归属国家。<a href="/places?view=photos&review=country">前往核对</a></p>{/if}
    {#if message && !editing}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
    {#if selected.length}<div class="selection-bar">
      <span>已选 {selected.length} 段{selectedRecords[0]?.placeName}到访</span>
      <button disabled={selected.length < 2 || busy || loading} onclick={() => void open(selectedRecords)}>合并记录</button>
      <button class="quiet-button" onclick={() => selected = []}>取消选择</button>
      <span class="muted">只合并同一地点的到访</span>
    </div>{/if}
    <!-- The horizontally scrolling table must be keyboard-scrollable on narrow screens. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="table-wrap" tabindex="0" role="region" aria-label="到访记录表格">
      <table>
        <thead><tr><th class="selection-column"><span class="sr-only">选择</span></th><th>地点</th><th>到访名称</th><th>日期</th><th>照片</th><th>整理方式／状态</th><th>操作</th></tr></thead>
        <tbody>
          {#each records as v (v.id)}<tr class:invalid={v.invalid}>
            <td><input type="checkbox" aria-label={`选择${v.placeName} ${v.start ?? '日期待确认'}的到访`} bind:group={selected} value={v.id}
              disabled={v.invalid || busy || loading || !!selectedPlace && selectedPlace !== v.place} /></td>
            <td class="place-cell">{v.placeName}</td>
            <td class="name-cell">{v.invalid ? '失效的人工校正' : v.label || '未命名到访'}</td>
            <td class="date-cell">{v.invalid ? '—' : v.start ? v.start === v.end ? v.start : `${v.start} — ${v.end}` : '日期待确认'}</td>
            <td>{#if v.invalid}<span class="muted">0 张</span>{:else}<button class="text-button" disabled={busy || loading} onclick={() => void open([v], true)}>{v.count} 张</button>{/if}</td>
            <td><div class="record-status"><span>{v.manual ? '人工整理' : '自动整理'}</span>{#if v.invalid}<span class="status-note">已失效</span>{:else if v.needsReview}<span class="status-note">待核对</span>{/if}</div></td>
            <td><div class="row-actions">
              {#if !v.invalid}<button class="text-button" disabled={busy || loading} onclick={() => void open([v])}>编辑／拆分</button><a href={visitLink(v)} target="_blank" rel="noreferrer">查看前台</a>{/if}
              {#if v.manual}<button class="text-button muted" disabled={busy || loading} onclick={() => void reset(v)}>{v.invalid ? '移除失效校正' : '恢复自动整理'}</button>{/if}
            </div></td>
          </tr>{/each}
        </tbody>
      </table>
      {#if !records.length}<p class="empty">{data.visits.activeTotal || data.visits.invalidTotal ? '没有符合筛选条件的到访记录。' : '暂无可公开展示的到访记录。'}</p>{/if}
    </div>
    {#if data.visits.pages > 1}<nav class="pagination" aria-label="到访记录分页">
      {#if data.visits.page > 1}<a href={listLink({ page: String(data.visits.page - 1) })}>上一页</a>{:else}<span>上一页</span>{/if}
      <span>{data.visits.page} / {data.visits.pages}</span>
      {#if data.visits.page < data.visits.pages}<a href={listLink({ page: String(data.visits.page + 1) })}>下一页</a>{:else}<span>下一页</span>{/if}
    </nav>{/if}
    <p class="date-note">日期仅表示照片中的到访证据。待核对或已失效的记录可通过状态筛选集中处理。</p>
    {#if editing}<div class="shade">
        <div
          use:focusDialog
          bind:this={editDialog}
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-title"
          tabindex="-1"
          onkeydown={(e) => {
            if (e.key === 'Escape') closeDialog();
          }}
        >
          <div class="dialog-heading"><h2 id="edit-title">{readonly ? '到访照片' : '整理到访'} · {editorPlace?.placeName}</h2><button type="button" class="quiet-button" disabled={busy} onclick={closeDialog}>关闭</button></div>
          {#if loading}<p role="status">正在加载到访照片…</p>{:else if detailError}<p class="notice error" role="alert">{detailError}</p><button onclick={() => void open(editorRows, readonly)}>重新加载</button>{:else}
          {#if !readonly}<p>所选照片组成一段{editorPlace?.placeName}到访。取消选中的照片恢复自动整理；国家与省级记录分别保存。</p>{/if}
          {#if message}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
          <form
            onsubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {#if !readonly}<label class="field"
              >名称（可选）<input bind:value={label} maxlength="120" placeholder={data.scope === 'region' ? '例如：福建春日旅行' : '例如：格鲁吉亚秋日旅行'} /></label
            >
            <div class="dates">
              <label class="field">开始日期<input type="date" bind:value={start} /></label><label class="field"
                >结束日期<input type="date" bind:value={end} /></label
              >
            </div>
            <p>日期留空表示尚未确认。已选择 {photoIds.length} 张照片。</p>{:else}<p>共 {photoIds.length} 张照片</p>{/if}
            <div class="picker">
              {#each visiblePhotos.slice((photoPage - 1) * 36, photoPage * 36) as photo}<label
                  class:checked={photoIds.includes(photo.id)}
                  ><img src={`${data.publicOrigin}${photo.thumbnail}`} alt="到访照片" loading="lazy" /><span
                    >{#if !readonly}<input type="checkbox" bind:group={photoIds} value={photo.id} />{/if}{photo.date ?? '时间未知'}</span
                  ></label
                >{/each}
            </div>
            {#if visiblePhotos.length > 36}<div class="actions">
                <button type="button" disabled={photoPage === 1} onclick={() => photoPage--}>上一页</button><span
                  >{photoPage} / {Math.ceil(visiblePhotos.length / 36)}</span
                ><button
                  type="button"
                  disabled={photoPage * 36 >= visiblePhotos.length}
                  onclick={() => photoPage++}>下一页</button
                >
              </div>{/if}
            <div class="actions">
              {#if !readonly}<button disabled={busy || !photoIds.length}>{busy ? '保存中…' : '保存并应用'}</button>{:else}<button type="button" onclick={() => void editPhotos()}>编辑这段到访</button>{/if}<button
                type="button"
                disabled={busy}
                onclick={closeDialog}>{readonly ? '关闭' : '取消'}</button
              >
            </div>
          </form>{/if}
        </div>
      </div>{/if}
  </div></Frame
>

<style>
  .scope-control { width: fit-content; max-width: 100%; margin-top: 24px; }
  .toolbar { display: flex; align-items: end; flex-wrap: wrap; gap: 14px; margin: 28px 0 18px; }
  .search-box { flex: 1 1 220px; max-width: 360px; }
  .search-box :global(.search-field input) { padding: 8px 32px 8px 34px; height: 40px; }
  .search-box :global(button.clear-search) { background: transparent; color: #7c8875; padding: 0; }
  .filter-field { display: grid; gap: 6px; color: #71806c; }
  .filter-field select { min-width: 135px; height: 40px; }
  .toolbar .filter-submit { height: 40px; }
  .text-link { color: #4d6b50; font-size: 12px; text-decoration: none; padding: 10px 0; }
  .list-summary { display: flex; gap: 18px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .list-summary p { margin: 0; }
  .list-summary strong { color: #354c3b; font-weight: 550; }
  .scope-note { margin: 8px 0 0; }
  .table-wrap { margin-top: 18px; overflow-x: auto; border: 1px solid #dfe5da; border-radius: 8px; background: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
  th { background: #f1f4ee; color: #71806a; font-size: 12px; font-weight: 500; white-space: nowrap; }
  th, td { padding: 16px 14px; vertical-align: middle; }
  tbody tr + tr { border-top: 1px solid #e8ece3; }
  tbody tr:hover { background: #fafbf7; }
  .selection-column { width: 24px; }
  td input { margin: 0; accent-color: #49684a; }
  .place-cell { font-weight: 550; white-space: nowrap; }
  .name-cell { min-width: 100px; max-width: 240px; overflow-wrap: anywhere; }
  .date-cell { font-size: 12px; white-space: nowrap; color: #74816d; }
  .record-status { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; white-space: nowrap; font-size: 12px; color: #7a8572; }
  .status-note { background: #f5eee0; color: #866931; border-radius: 4px; padding: 2px 5px; font-size: 11px; }
  .row-actions { display: flex; flex-wrap: wrap; gap: 8px 14px; min-width: 150px; align-items: center; }
  .row-actions a, .visits-page button.text-button { color: #416746; font: inherit; font-size: 12px; white-space: nowrap; background: transparent; border: 0; padding: 3px 0; text-decoration: none; }
  .row-actions a:hover, .visits-page button.text-button:hover { color: #243d28; text-decoration: underline; }
  .visits-page button.muted, .muted { color: #899181; }
  .selection-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 16px; padding: 12px 16px; background: #edf2e8; border-radius: 6px; font-size: 12px; }
  .visits-page button.quiet-button { background: transparent; color: #65785f; border: 1px solid #dbe3d6; }
  .dialog-heading { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
  .dialog-heading h2 { font-size: 20px; }
  .pagination { display: flex; gap: 22px; justify-content: center; align-items: center; margin-top: 22px; font-size: 13px; color: #b1b9ab; }
  .pagination a { color: #416746; text-decoration: none; }
  .empty { padding: 32px; text-align: center; }
  .date-note { margin-top: 14px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .table-wrap:focus-visible { outline: 2px solid #8c9e84; outline-offset: 2px; }
  .actions {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-top: 20px;
  }
  .actions span {
    font-size: 12px;
  }
  .shade {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: #15271570;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
  }
  .dialog {
    background: #fff;
    max-width: 750px;
    width: 100%;
    max-height: 85dvh;
    overflow: auto;
    border-radius: 8px;
    padding: 28px;
    box-sizing: border-box;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 15px 0;
  }
  .dates {
    display: flex;
    gap: 20px;
  }
  .picker {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .picker label {
    border: 2px solid transparent;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
  }
  .picker label.checked {
    border-color: #547849;
    background: #f0f5e9;
  }
  .picker img {
    width: 100%;
    aspect-ratio: 1.2;
    object-fit: cover;
    display: block;
  }
  .picker span {
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 5px;
  }
  @media (max-width: 700px) {

    .dialog {
      padding: 18px;
    }
    .picker {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .dates {
      gap: 10px;
    }
    .dates label {
      min-width: 0;
    }
    .shade {
      padding: 10px;
    }
  }
</style>
