<script lang="ts">
  import type { DraftPhoto } from '@gallery/core';
  let {
    value = $bindable(''),
    groups,
  }: {
    value: string;
    groups: { id: string; title: string; visible: boolean; photos: DraftPhoto[] }[];
  } = $props();
  let dialog: HTMLDialogElement;
  let album = $state('');
  let query = $state('');
  let page = $state(0);
  let selected = $state('');
  const media = (asset: string) => `/media/source/${asset}?variant=thumbnail`;
  const photos = $derived(
    groups.flatMap((g) =>
      g.photos
        .filter((p) => !p.hiddenFromGallery)
        .map((photo, index) => ({
          photo,
          album: g.id,
          albumTitle: g.title,
          visible: g.visible,
          title: photo.title || `照片 ${index + 1}`,
        })),
    ),
  );
  const filtered = $derived(
    photos.filter(
      (p) =>
        (!album || p.album === album) &&
        (!query.trim() || `${p.title} ${p.albumTitle}`.toLowerCase().includes(query.trim().toLowerCase())),
    ),
  );
  function open() {
    selected = value;
    album = '';
    query = '';
    page = 0;
    dialog.showModal();
  }
</script>

<section class="cover-setting" aria-label="相册封面">
  {#if value}<button class="current-cover" onclick={open} aria-label="更换相册封面"
      ><img src={media(value)} alt="当前封面" /></button
    >{/if}
  <div>
    <strong>相册封面</strong>
    <div class="actions">
      <button onclick={open}>{value ? '更换封面' : '选择封面'}</button>{#if value}<button
          onclick={() => (value = '')}>移除封面</button
        >{/if}
    </div>
    <p>从本册或下级相册中选图，保存并发布后生效。来源未公开时，前台暂不展示该封面。</p>
  </div>
</section>

<dialog bind:this={dialog} aria-labelledby="album-cover-title">
  <header>
    <h2 id="album-cover-title">选择相册封面</h2>
    <button onclick={() => dialog.close()} aria-label="关闭封面选择">✕</button>
  </header>
  <div class="filters">
    <select aria-label="封面来源相册" bind:value={album} onchange={() => (page = 0)}
      ><option value="">本册及全部下级相册</option>{#each groups as g}<option value={g.id}>{g.title}</option
        >{/each}</select
    ><input
      aria-label="搜索封面照片"
      placeholder="搜索照片或相册名称"
      bind:value={query}
      oninput={() => (page = 0)}
    />
  </div>
  <div class="grid" aria-label="封面候选照片">
    {#each filtered.slice(page * 48, (page + 1) * 48) as p (`${p.album}:${p.photo.id}`)}<button
        class:selected={selected === p.photo.asset}
        aria-pressed={selected === p.photo.asset}
        onclick={() => (selected = p.photo.asset)}
      >
        <div class="image">
          <img src={media(p.photo.asset)} alt={p.title} loading="lazy" />{#if selected === p.photo.asset}<span
              class="chosen">✓ 已选</span
            >{/if}
        </div>
        <strong>{p.title}</strong><small>{p.albumTitle}{!p.visible ? ' · 来源待公开' : ''}</small>
      </button>{:else}<p class="empty">
        {query || album ? '没有符合条件的照片。' : '本册及下级相册暂无可用封面照片。'}
      </p>{/each}
  </div>
  <footer>
    <div class="paging">
      <span>{filtered.length} 张</span>{#if filtered.length > 48}<button
          disabled={page === 0}
          onclick={() => page--}>上一页</button
        ><span>{page + 1} / {Math.ceil(filtered.length / 48)}</span><button
          disabled={(page + 1) * 48 >= filtered.length}
          onclick={() => page++}>下一页</button
        >{/if}
    </div>
    <div class="actions">
      <button onclick={() => dialog.close()}>取消</button><button
        class="primary"
        disabled={!selected}
        onclick={() => {
          value = selected;
          dialog.close();
        }}>设为封面</button
      >
    </div>
  </footer>
</dialog>

<style>
  .cover-setting {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 0;
  }
  .cover-setting > div {
    min-width: 0;
  }
  .cover-setting strong {
    display: block;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .current-cover {
    padding: 0;
    border: 0;
    flex-shrink: 0;
    background: none;
  }
  .current-cover img {
    width: 96px;
    height: 72px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  .cover-setting p {
    font-size: 12px;
    color: #788574;
    margin: 8px 0 0;
    line-height: 1.6;
  }
  .actions,
  .paging {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  dialog {
    width: min(860px, calc(100vw - 32px));
    max-height: 86dvh;
    padding: 0;
    border: 1px solid #dce3d8;
    border-radius: 12px;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: #182b2266;
  }
  header,
  footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 18px 24px;
    flex-shrink: 0;
  }
  h2 {
    font-size: 19px;
    margin: 0;
  }
  .filters {
    display: flex;
    gap: 12px;
    padding: 0 24px 16px;
  }
  .filters > * {
    width: 50%;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 24px 20px;
    min-height: 0;
  }
  .grid button {
    text-align: left;
    padding: 8px;
    border: 1px solid #e0e5dc;
    background: #fff;
    border-radius: 7px;
    min-width: 0;
  }
  .grid button.selected {
    border-color: #45684e;
    background: #f1f5ed;
  }
  .image {
    position: relative;
  }
  .image img {
    display: block;
    width: 100%;
    aspect-ratio: 4/3;
    object-fit: contain;
  }
  .chosen {
    position: absolute;
    top: 6px;
    right: 6px;
    background: #365441;
    color: white;
    padding: 3px 7px;
    border-radius: 3px;
    font-size: 11px;
  }
  .grid strong,
  .grid small {
    display: block;
    overflow-wrap: anywhere;
    font-size: 12px;
    margin-top: 7px;
  }
  .grid small {
    color: #788574;
    font-weight: normal;
  }
  footer {
    border-top: 1px solid #e0e5dc;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .primary {
    background: #365441;
    color: white;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 30px 0;
    text-align: center;
    color: #788574;
  }
  @media (max-width: 600px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      padding: 4px 14px 16px;
    }
    header,
    footer {
      padding: 14px;
    }
    .filters {
      padding: 0 14px 12px;
      flex-direction: column;
    }
    .filters > * {
      width: 100%;
    }
    .cover-setting {
      align-items: start;
      gap: 12px;
    }
  }
</style>
