<script lang="ts">
  import { tick } from 'svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import MapAdminFrame from '$lib/MapAdminFrame.svelte';
  import TagPicker from '$lib/TagPicker.svelte';
  import { MarkdownEditor } from '@gallery/ui';
  let { data } = $props();
  type Photo = (typeof data.photos)[number];
  let selected = $state<Photo[]>([]),
    busy = $state(false),
    message = $state(''),
    failed = $state(false);
  let dialog: HTMLDialogElement;
  let editing = $state<Photo[]>([]);
  let titleMode = $state('keep'),
    descriptionMode = $state('keep'),
    tagMode = $state('keep');
  let title = $state(''),
    description = $state(''),
    tags = $state<string[]>([]);
  const media = (p: Photo) => `/media/source/${p.asset}?variant=thumbnail`;
  function toggle(photo: Photo) {
    if (selected.some((p) => p.asset === photo.asset))
      selected = selected.filter((p) => p.asset !== photo.asset);
    else if (selected.length < 100) selected = [...selected, photo];
    else {
      message = '每批最多选择 100 张照片。';
      failed = true;
    }
  }
  function pageLink(page: number) {
    const params = new URLSearchParams(data.filters);
    params.set('page', String(page));
    return '/photos?' + params;
  }
  async function edit(photos: Photo[], single = false) {
    editing = [...photos];
    titleMode = single ? 'replace' : 'keep';
    descriptionMode = single ? 'replace' : 'keep';
    tagMode = single ? 'replace' : 'keep';
    title = single ? photos[0]!.title : '';
    description = single ? photos[0]!.description : '';
    tags = single ? [...photos[0]!.tags] : [];
    message = '';
    await tick();
    dialog.showModal();
  }
  async function api(action: string, body: unknown) {
    const response = await fetch('/api/' + action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '操作失败');
    return result;
  }
  async function createTag(name: string) {
    const result = await api('tag-save', { name, active: true });
    await invalidateAll();
    return result.id as string;
  }
  async function save(publish: boolean) {
    busy = true;
    message = '';
    failed = false;
    try {
      const result = await api('photos-edit', {
        photos: editing.map((p) => ({ asset: p.asset, version: p.version })),
        title: { mode: titleMode, value: title },
        description: { mode: descriptionMode, value: description },
        tags: { mode: tagMode, value: tags },
        publish,
      });
      await invalidateAll();
      selected = [];
      dialog.close();
      editing = [];
      message = `${result.count} 张照片${publish ? '已保存并发布' : '草稿已保存'}。`;
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '保存失败';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>全部相片 · Gallery</title></svelte:head>
<MapAdminFrame active="photos" user={data.user} publicOrigin={data.publicOrigin}>
  <section class="map-admin library">
    <header>
      <h1>全部相片 <small>{data.total}</small></h1>
      <p>同一照片只显示一次。标题、描述和标签在所有相册中共用；照片组仍使用自己的组说明。</p>
    </header>
    {#if message && !editing.length}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
    <form
      class="filters"
      onsubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams(
          Array.from(new FormData(event.currentTarget), ([key, value]) => [key, String(value)]),
        );
        void goto('/photos?' + params);
      }}
    >
      <input name="q" aria-label="检索全部相片" placeholder="标题、描述或文件名" value={data.filters.q} />
      <select name="album" aria-label="相册筛选" value={data.filters.album}
        ><option value="">全部相册</option>{#each data.albums as album}<option value={album.id}
            >{album.title}</option
          >{/each}</select
      >
      <select name="tag" aria-label="标签筛选" value={data.filters.tag}
        ><option value="">全部标签</option>{#each data.tags as tag}<option value={tag.id}>{tag.name}</option
          >{/each}</select
      >
      <select name="scope" aria-label="照片状态筛选" value={data.filters.scope}
        ><option value="">全部状态</option><option value="pending">待发布修改</option><option value="hidden"
          >仅文章可见</option
        ><option value="visible">用于图库展示</option></select
      >
      <button>筛选</button>
    </form>
    <div class="selection-bar">
      <span>已选 {selected.length} / 100</span><button
        type="button"
        onclick={() => {
          selected = [...new Map([...selected, ...data.photos].map((p) => [p.asset, p])).values()].slice(
            0,
            100,
          );
        }}>选择本页</button
      ><button disabled={!selected.length} onclick={() => (selected = [])}>取消选择</button><button
        disabled={!selected.length}
        onclick={() => edit(selected)}>批量编辑</button
      >
    </div>
    <div class="photo-library-grid">
      {#each data.photos as photo (photo.asset)}<article
          class:selected={selected.some((p) => p.asset === photo.asset)}
        >
          <div class="thumbnail">
            <button
              class="image-button"
              aria-label={`编辑 ${photo.title || photo.filename}`}
              onclick={() => edit([photo], true)}
              ><img src={media(photo)} alt={photo.title || photo.filename} loading="lazy" /></button
            ><input
              type="checkbox"
              aria-label={`选择 ${photo.filename}`}
              checked={selected.some((p) => p.asset === photo.asset)}
              onchange={() => toggle(photo)}
            />
          </div>
          <strong>{photo.title || photo.filename}</strong>
          <p class="description">{photo.description || '尚未填写描述'}</p>
          <div class="memberships">
            {#each photo.albums as album}<a href={'/albums?album=' + album.id}>{album.title}</a>{/each}
          </div>
          <div class="photo-tags">
            {#each photo.tags as id}<span>{data.tags.find((t) => t.id === id)?.name ?? '标签'}</span>{/each}
          </div>
          <div class="status">
            <span>{photo.hidden ? '仅文章可见' : ''}{photo.pending ? ' · 待发布' : ''}</span><button
              onclick={() => edit([photo], true)}>编辑</button
            >
          </div>
        </article>{/each}
    </div>
    {#if !data.photos.length}<p class="empty">没有符合条件的照片。</p>{/if}
    <nav class="pagination" aria-label="相片分页">
      <button disabled={data.page <= 1} onclick={() => goto(pageLink(data.page - 1))}>上一页</button><span
        >{data.page} / {Math.max(1, Math.ceil(data.total / 48))}</span
      ><button disabled={data.page * 48 >= data.total} onclick={() => goto(pageLink(data.page + 1))}
        >下一页</button
      >
    </nav>
  </section>
</MapAdminFrame>
<dialog
  bind:this={dialog}
  oncancel={(e) => {
    if (busy) e.preventDefault();
    else editing = [];
  }}
  aria-labelledby="batch-title"
>
  <header>
    <h2 id="batch-title">{editing.length === 1 ? '编辑照片资料' : `批量编辑 ${editing.length} 张照片`}</h2>
    <button
      aria-label="关闭照片编辑"
      disabled={busy}
      onclick={() => {
        dialog.close();
        editing = [];
      }}>×</button
    >
  </header>
  <div class="edit-body">
    <div class="selected-preview">
      {#each editing as photo}<figure>
          <img src={media(photo)} alt={photo.title || photo.filename} />
          <figcaption>{photo.title || photo.filename}</figcaption>
        </figure>{/each}
    </div>
    <p class="edit-note">
      只修改明确指定的字段；“替换”会让所选照片使用相同内容。资料在所有相册同步，来源相册未公开的照片不会因单独发布资料而公开。
    </p>
    {#if message}<p role="status" class:error={failed}>{message}</p>{/if}
    <label
      >标题<select aria-label="标题修改方式" bind:value={titleMode}
        ><option value="keep">保持不变</option><option value="replace">替换为</option><option value="clear"
          >清空标题</option
        ></select
      ></label
    >
    {#if titleMode === 'replace'}<input aria-label="照片标题" maxlength="200" bind:value={title} />{/if}
    <label
      >描述<select aria-label="描述修改方式" bind:value={descriptionMode}
        ><option value="keep">保持不变</option><option value="replace">替换为</option><option value="clear"
          >清空描述</option
        ></select
      ></label
    >
    {#if descriptionMode === 'replace'}<MarkdownEditor
        bind:value={description}
        label="照片描述"
        maxLength={50000}
      />{/if}
    <label
      >标签<select aria-label="标签修改方式" bind:value={tagMode}
        ><option value="keep">保持不变</option><option value="add">追加标签</option><option value="remove"
          >移除指定标签</option
        ><option value="replace">替换全部标签</option><option value="clear">清空标签</option></select
      ></label
    >
    {#if ['add', 'remove', 'replace'].includes(tagMode)}<TagPicker
        bind:value={tags}
        tags={data.tags}
        {createTag}
      />{/if}
  </div>
  <footer>
    <button disabled={busy} onclick={() => save(false)}>{busy ? '处理中…' : '保存草稿'}</button><button
      class="primary"
      disabled={busy}
      onclick={() => save(true)}>保存并发布照片资料</button
    >
  </footer>
</dialog>

<style>
  .library header p {
    margin-bottom: 24px;
  }
  h1 small {
    font-size: 15px;
    color: #7c8777;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0;
  }
  .filters input {
    flex: 1;
    min-width: 180px;
  }
  .filters select {
    max-width: 200px;
    padding-right: 28px;
  }
  .selection-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    background: #fafbf9;
    padding: 14px 0;
    z-index: 2;
  }
  .selection-bar span {
    margin-right: auto;
    font-size: 13px;
  }
  .photo-library-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 24px;
    margin-top: 12px;
  }
  article {
    min-width: 0;
    padding: 12px;
    border: 1px solid #e1e6dd;
    border-radius: 6px;
    background: white;
  }
  article.selected {
    border-color: #557a57;
    box-shadow: 0 0 0 1px #557a57;
  }
  .thumbnail {
    position: relative;
    margin-bottom: 12px;
  }
  .thumbnail input {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 20px !important;
    height: 20px;
  }
  .photo-library-grid .image-button {
    display: block;
    padding: 0;
    background: transparent;
    width: 100%;
  }
  img {
    display: block;
    object-fit: contain;
    width: 100%;
    aspect-ratio: 4/3;
  }
  strong {
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .description {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 3.6em;
  }
  .memberships,
  .photo-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    margin: 8px 0;
  }
  .memberships a {
    color: #486343;
  }
  .photo-tags span {
    background: #f0f3ed;
    border-radius: 3px;
    padding: 3px 6px;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    color: #76836e;
  }
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    margin: 28px 0;
  }
  dialog {
    width: min(880px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    padding: 0;
  }
  dialog header,
  dialog footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 24px;
    gap: 16px;
    background: white;
    position: sticky;
    z-index: 2;
  }
  dialog header {
    top: 0;
    border-bottom: 1px solid #e0e5dc;
  }
  dialog header h2 {
    font-size: 20px;
    margin: 0;
  }
  dialog footer {
    bottom: 0;
    border-top: 1px solid #e0e5dc;
    justify-content: flex-end;
  }
  .edit-body {
    padding: 24px;
    display: grid;
    gap: 16px;
  }
  .selected-preview {
    display: flex;
    gap: 14px;
    overflow-x: auto;
  }
  figure {
    margin: 0;
    flex: 0 0 160px;
  }
  figure:only-child {
    flex-basis: min(100%, 440px);
    margin: auto;
  }
  figcaption {
    font-size: 12px;
    color: #7c8777;
    margin-top: 8px;
    overflow-wrap: anywhere;
  }
  .edit-note {
    font-size: 13px;
    line-height: 1.8;
    color: #78836f;
  }
  .edit-body label {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    font-size: 14px;
  }
  .edit-body select,
  .edit-body input {
    border: 1px solid #d8e0d2;
    padding: 10px 30px 10px 12px;
    border-radius: 4px;
  }
  .edit-body select {
    appearance: none;
    background: white
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='m1 1 5 5 5-5' fill='none' stroke='%2378836f' stroke-width='1.5'/%3E%3C/svg%3E")
      no-repeat right 12px center;
  }
  .error {
    color: #963f2f;
  }
  @media (max-width: 600px) {
    .photo-library-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    article {
      padding: 8px;
    }
    .edit-body {
      padding: 16px;
    }
    .filters select {
      max-width: 100%;
    }
    .selection-bar {
      gap: 8px;
    }
    .selection-bar button {
      font-size: 12px;
    }
  }
</style>
