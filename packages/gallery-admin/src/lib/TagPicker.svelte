<script lang="ts">
  import type { PhotoTag } from '@gallery/core';
  let {
    value = $bindable([]),
    tags,
    createTag,
    label = '标签',
  }: {
    value?: string[];
    tags: (PhotoTag & { active: boolean })[];
    createTag: (name: string) => Promise<string>;
    label?: string;
  } = $props();
  let search = $state(''),
    busy = $state(false),
    message = $state('');
  let matches = $derived(
    tags
      .filter(
        (t) =>
          t.active && !value.includes(t.id) && t.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      )
      .slice(0, 30),
  );
  async function create() {
    if (busy || !search.trim()) return;
    busy = true;
    message = '';
    try {
      const id = await createTag(search.trim());
      value = [...new Set([...value, id])];
      search = '';
    } catch (e) {
      message = e instanceof Error ? e.message : '创建失败';
    } finally {
      busy = false;
    }
  }
</script>

<div class="tag-picker">
  <span class="label">{label}</span>
  <div class="chosen-tags">
    {#each value as id}<button
        type="button"
        class="tag-chip"
        aria-label={`移除标签 ${tags.find((t) => t.id === id)?.name ?? '已失效标签'}`}
        onclick={() => (value = value.filter((v) => v !== id))}
        >{tags.find((t) => t.id === id)?.name ?? '已失效标签'} ×</button
      >{/each}
    {#if !value.length}<span class="hint">尚未选择标签</span>{/if}
  </div>
  <input aria-label={`${label}搜索`} placeholder="搜索或创建标签" maxlength="60" bind:value={search} />
  <div class="options">
    {#each matches as tag}<button
        type="button"
        disabled={value.length >= 30}
        onclick={() => {
          value = [...value, tag.id];
          search = '';
        }}>＋ {tag.name}</button
      >{/each}
    {#if search.trim() && !tags.some((t) => t.name.toLocaleLowerCase() === search.trim().toLocaleLowerCase())}<button
        type="button"
        disabled={busy || value.length >= 30}
        onclick={create}>创建“{search.trim()}”</button
      >{/if}
  </div>
  {#if message}<p role="alert">{message}</p>{/if}
</div>

<style>
  .tag-picker {
    margin: 18px 0;
    min-width: 0;
  }
  .label {
    font-size: 13px;
    display: block;
    margin-bottom: 8px;
  }
  .chosen-tags,
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 8px 0;
  }
  .tag-picker button {
    font-size: 12px;
    padding: 6px 10px !important;
    white-space: normal;
    overflow-wrap: anywhere;
    border: 1px solid #d7e0d2;
    border-radius: 4px;
    background: #f1f5ed;
    color: #35543a;
  }
  .hint {
    color: #758070;
    font-size: 12px;
  }
  .tag-picker input {
    width: 100%;
    box-sizing: border-box;
  }
  .options {
    max-height: 140px;
    overflow: auto;
  }
  .tag-picker p {
    color: #963d29;
    font-size: 12px;
  }
</style>
