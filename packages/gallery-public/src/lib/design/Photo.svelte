<script lang="ts">
  import type { Photo } from './content';
  let {
    photo,
    cover = false,
    eager = false,
    sizes = '100vw',
    onclick,
  }: {
    photo: Photo;
    cover?: boolean;
    eager?: boolean;
    sizes?: string;
    onclick?: () => void;
  } = $props();
  let failed = $state(false);
</script>

{#snippet picture()}
  {#if failed}<span class="unavailable"><span>影像暂不可用</span><small>这段文字，仍然留在这里。</small></span>
  {:else}<img
      src={photo.src}
      width={photo.width}
      height={photo.height}
      alt={photo.alt}
      srcset={`${photo.src.replace('.jpg', '-small.jpg')} 800w, ${photo.src} ${photo.width}w`}
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
      {sizes}
      class:cover
      onerror={() => (failed = true)}
    />{/if}
{/snippet}
{#if onclick}<button class="photo-button" {onclick} aria-label={`查看照片：${photo.title}`}
    >{@render picture()}<span class="expand" aria-hidden="true">↗</span></button
  >
{:else}<div class="photo-static">{@render picture()}</div>{/if}

<style>
  .photo-button,
  .photo-static {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: #d9d9d0;
    color: inherit;
    overflow: hidden;
  }
  .photo-button {
    cursor: zoom-in;
  }
  .photo-button:focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 5px;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    transition: transform 0.6s;
  }
  img.cover {
    height: 100%;
    object-fit: cover;
    object-position: 50% 48%;
  }
  .expand {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    background: #fffdf5e8;
    color: #292b27;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .photo-button:hover .expand,
  .photo-button:focus-visible .expand {
    opacity: 1;
  }
  .unavailable {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 14px;
    background: #dfdfd8;
    color: #4c4f47;
    font: 16px/1.6 sans-serif;
  }
  .unavailable small {
    font-size: 13px;
  }
  @media (prefers-reduced-motion: reduce) {
    img,
    .expand {
      transition: none;
    }
  }
</style>
