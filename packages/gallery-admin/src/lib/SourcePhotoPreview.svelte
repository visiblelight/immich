<script lang="ts">
  import { tick } from 'svelte';
  type Photo = { asset: string; title: string };
  let dialog: HTMLDialogElement;
  let photos = $state<Photo[]>([]);
  let index = $state(0);
  let failed = $state(false);
  let loading = $state(true);
  let current = $derived(photos[index]);
  export async function open(items: Photo[], start = 0) {
    photos = items;
    index = start;
    failed = false;
    loading = true;
    await tick();
    if (current && !dialog.open) dialog.showModal();
  }
  function move(offset: number) {
    const next = index + offset;
    if (next < 0 || next >= photos.length) return;
    index = next;
    failed = false;
    loading = true;
  }
</script>

<dialog
  bind:this={dialog}
  class="source-preview"
  aria-label="照片大图预览"
  onkeydown={(e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      move(e.key === 'ArrowLeft' ? -1 : 1);
    }
  }}
>
  {#if current}
    <header>
      <div><strong>{current.title}</strong><small>{index + 1} / {photos.length}</small></div>
      <button aria-label="关闭大图预览" onclick={() => dialog.close()}>×</button>
    </header>
    <div class="image-stage" aria-busy={loading}>
      {#key current.asset}
        <img
          src={`/media/source/${current.asset}?variant=preview`}
          alt={current.title}
          class:failed
          onload={() => (loading = false)}
          onerror={() => {
            failed = true;
            loading = false;
          }}
        />
      {/key}
      {#if failed}<p role="status">暂时无法读取大图，请检查网络或照片在 Immich 中是否仍可用。</p>
      {:else if loading}<p role="status">正在加载大图…</p>{/if}
      {#if photos.length > 1}
        <button class="previous" aria-label="上一张预览" disabled={index === 0} onclick={() => move(-1)}
          >‹</button
        >
        <button
          class="next"
          aria-label="下一张预览"
          disabled={index === photos.length - 1}
          onclick={() => move(1)}>›</button
        >
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .source-preview {
    width: min(1500px, calc(100vw - 32px));
    height: calc(100dvh - 32px);
    max-width: none;
    max-height: none;
    padding: 0;
    border: 0;
    border-radius: 12px;
    background: #171e1a;
    color: #f7faf6;
  }
  .source-preview::backdrop {
    background: #08100ddd;
  }
  header {
    height: 64px;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-sizing: border-box;
  }
  header div {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  small {
    color: #b5c0b9;
    white-space: nowrap;
  }
  .source-preview button {
    display: grid;
    place-items: center;
    padding: 0;
    width: 40px;
    height: 40px;
    border: 1px solid #ffffff35;
    background: #26352dd9;
    color: white;
    border-radius: 50%;
    font-size: 28px;
    line-height: 1;
    flex-shrink: 0;
  }
  .source-preview button:disabled {
    opacity: 0.3;
  }
  .source-preview button:focus-visible {
    outline: 2px solid white;
    outline-offset: 3px;
  }
  .image-stage {
    position: relative;
    height: calc(100% - 64px);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  img.failed {
    visibility: hidden;
  }
  .image-stage p {
    position: absolute;
    top: 45%;
    left: 15%;
    right: 15%;
    text-align: center;
    color: #d6e0d9;
  }
  .image-stage button {
    position: absolute;
    top: calc(50% - 20px);
  }
  .previous {
    left: 16px;
  }
  .next {
    right: 16px;
  }
  @media (max-width: 600px) {
    .source-preview {
      width: 100vw;
      height: 100dvh;
      border-radius: 0;
    }
    header {
      padding: 12px;
    }
    .previous {
      left: 8px;
    }
    .next {
      right: 8px;
    }
  }
</style>
