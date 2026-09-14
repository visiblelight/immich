<script lang="ts">
  import { tick } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import MapAdminFrame from '$lib/MapAdminFrame.svelte';
  let { data } = $props();
  let search = $state(''),
    name = $state(''),
    busy = $state(false),
    message = $state(''),
    failed = $state(false);
  let dialog: HTMLDialogElement;
  async function editTag(tag: { id: string; name: string; active: boolean; version: string }) {
    editing = { ...tag };
    await tick();
    dialog.showModal();
  }
  let editing = $state<{ id: string; name: string; active: boolean; version: string } | null>(null);
  async function save(input: Record<string, unknown>) {
    busy = true;
    message = '';
    failed = false;
    try {
      const r = await fetch('/api/tag-save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message);
      await invalidateAll();
      dialog?.close();
      editing = null;
      name = '';
      message = '标签已更新。';
    } catch (e) {
      failed = true;
      message = e instanceof Error ? e.message : '保存失败';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>照片标签 · Gallery</title></svelte:head>
<MapAdminFrame active="tags" user={data.user} publicOrigin={data.publicOrigin}>
  <section class="map-admin tags-page">
    <h1>照片标签</h1>
    <p>为照片整理主题。标签在所有相册中统一使用；重命名会同步更新前台名称。</p>
    {#if message}<p class="notice" class:error={failed} role="status">{message}</p>{/if}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        void save({ name, active: true });
      }}
    >
      <label>新标签<input aria-label="新标签名称" bind:value={name} maxlength="60" required /></label><button
        disabled={busy || !name.trim()}>创建标签</button
      >
    </form>
    <label>检索标签<input placeholder="输入标签名称" bind:value={search} /></label>
    <div class="tag-list">
      {#each data.tags.filter((t) => t.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) as tag}
        <article>
          <div>
            <strong>{tag.name}</strong>{#if !tag.active}<span class="badge">已停用</span>{/if}
            <p>草稿 {tag.draftCount} 张 · 当前公开 {tag.publishedCount} 张</p>
          </div>
          <div class="actions">
            <button disabled={busy} onclick={() => editTag(tag)}>编辑</button>
            <button disabled={busy} onclick={() => save({ ...tag, active: !tag.active })}
              >{tag.active ? '停用' : '启用'}</button
            >
            {#if !tag.referenced}<button disabled={busy} onclick={() => save({ ...tag, remove: true })}>删除</button
              >{/if}
          </div>
        </article>
      {/each}
      {#if !data.tags.length}<p>还没有标签。也可以在照片编辑时创建。</p>{/if}
    </div>
    <dialog bind:this={dialog} class="edit-panel" onclose={() => (editing = null)}>
      {#if editing}<h2>编辑标签</h2>
        <form
          onsubmit={(e) => {
            e.preventDefault();
            if (editing) void save(editing);
          }}
        >
          <label>标签名称<input bind:value={editing.name} maxlength="60" required /></label><button disabled={busy}
            >保存名称</button
          ><button type="button" disabled={busy} onclick={() => dialog.close()}>取消</button>
        </form>{/if}
    </dialog>
  </section>
</MapAdminFrame>

<style>
  .tags-page {
    max-width: 980px;
  }
  .tags-page form {
    display: flex;
    gap: 12px;
    align-items: end;
    flex-wrap: wrap;
    margin: 24px 0;
  }
  .tags-page label {
    display: grid;
    gap: 8px;
  }
  .tag-list {
    margin-top: 20px;
  }
  .tag-list article {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 20px 0;
    border-bottom: 1px solid #dce4d8;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tag-list p {
    margin: 6px 0 0;
  }
  .badge {
    margin-left: 12px;
  }
  .edit-panel {
    width: min(600px, calc(100vw - 48px));
    box-sizing: border-box;
    background: #eef3e9;
    border: 1px solid #cad8c2;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 8px 32px #253a2020;
  }
  .edit-panel h2 {
    font-size: 18px;
  }
  .edit-panel form {
    margin: 12px 0 0;
  }
  @media (max-width: 600px) {
    .tag-list article {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
